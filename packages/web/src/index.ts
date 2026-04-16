import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { chromium, type Page } from "playwright";

export type WebStep =
  | { action: "goto"; url: string }
  | { action: "click"; selector: string }
  | { action: "type"; selector: string; text: string; clear?: boolean }
  | { action: "press"; selector: string; key: string }
  | { action: "wait"; ms: number }
  | { action: "waitForNavigation" }
  | { action: "waitForSelector"; selector: string; timeoutMs?: number };

export interface RecordHarOptions {
  url: string;
  harPath: string;
  stepsPath?: string;
  headed?: boolean;
  harContent?: "omit" | "embed";
  finalWaitMs?: number;
}

export interface AnalyzeHarResult {
  totalRequests: number;
  uniqueRequests: number;
  hosts: Array<{ host: string; count: number }>;
  methods: Array<{ method: string; count: number }>;
  candidateLlms: Array<{ url: string; reason: string }>;
}

export async function recordHar(options: RecordHarOptions): Promise<void> {
  const browser = await chromium.launch({ headless: options.headed ? false : true });
  const context = await browser.newContext({
    recordHar: {
      path: options.harPath,
      content: options.harContent ?? "omit",
    },
  });

  const page = await context.newPage();
  await page.goto(options.url, { waitUntil: "domcontentloaded" });

  if (options.stepsPath) {
    const steps = await loadSteps(options.stepsPath);
    await runSteps(page, steps);
  }

  if (options.finalWaitMs && options.finalWaitMs > 0) {
    await page.waitForTimeout(options.finalWaitMs);
  }

  await context.close();
  await browser.close();
}

export async function analyzeHar(harPath: string): Promise<AnalyzeHarResult> {
  const content = await readFile(harPath, "utf8");
  const parsed = JSON.parse(content) as any;
  const entries: any[] = parsed?.log?.entries ?? [];

  const requestKeys = new Set<string>();
  const hostCounts = new Map<string, number>();
  const methodCounts = new Map<string, number>();
  const candidateLlms: Array<{ url: string; reason: string }> = [];

  for (const entry of entries) {
    const req = entry?.request;
    if (!req?.url || !req?.method) {
      continue;
    }

    const method = String(req.method).toUpperCase();
    const url = String(req.url);

    methodCounts.set(method, (methodCounts.get(method) ?? 0) + 1);

    const host = safeHost(url);
    if (host) {
      hostCounts.set(host, (hostCounts.get(host) ?? 0) + 1);
    }

    const key = `${method} ${url}`;
    requestKeys.add(key);

    const llmReason = inferLlmEndpoint(url, req);
    if (llmReason) {
      candidateLlms.push({ url, reason: llmReason });
    }
  }

  return {
    totalRequests: entries.length,
    uniqueRequests: requestKeys.size,
    hosts: toSortedHostCounts(hostCounts),
    methods: toSortedMethodCounts(methodCounts),
    candidateLlms: dedupeCandidates(candidateLlms),
  };
}

export async function writeAnalyzeResult(
  result: AnalyzeHarResult,
  outputPath: string,
): Promise<void> {
  const abs = resolve(outputPath);
  await mkdir(dirname(abs), { recursive: true });
  await writeFile(abs, JSON.stringify(result, null, 2), "utf8");
}

async function loadSteps(filePath: string): Promise<WebStep[]> {
  const content = await readFile(filePath, "utf8");
  const parsed = JSON.parse(content) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error("Invalid steps file");
  }
  return parsed as WebStep[];
}

async function runSteps(page: Page, steps: WebStep[]): Promise<void> {
  for (const step of steps) {
    await runStep(page, step);
  }
}

async function runStep(page: Page, step: WebStep): Promise<void> {
  if (step.action === "goto") {
    await page.goto(step.url, { waitUntil: "domcontentloaded" });
    return;
  }

  if (step.action === "click") {
    await page.click(step.selector);
    return;
  }

  if (step.action === "type") {
    const value = interpolateEnv(step.text);
    if (step.clear) {
      await page.fill(step.selector, value);
      return;
    }
    await page.type(step.selector, value);
    return;
  }

  if (step.action === "press") {
    await page.press(step.selector, step.key);
    return;
  }

  if (step.action === "wait") {
    await page.waitForTimeout(step.ms);
    return;
  }

  if (step.action === "waitForNavigation") {
    await page.waitForNavigation({ waitUntil: "domcontentloaded" });
    return;
  }

  if (step.action === "waitForSelector") {
    await page.waitForSelector(step.selector, {
      timeout: step.timeoutMs,
    });
    return;
  }

  const exhaustive: never = step;
  throw new Error(`Unsupported step: ${JSON.stringify(exhaustive)}`);
}

function interpolateEnv(value: string): string {
  return value.replace(/\$\{([A-Z0-9_]+)\}/g, (full, key: string) => {
    const resolved = process.env[key];
    return resolved === undefined ? full : resolved;
  });
}

function safeHost(url: string): string | undefined {
  try {
    return new URL(url).host;
  } catch {
    return undefined;
  }
}

function inferLlmEndpoint(url: string, request: any): string | undefined {
  if (url.includes("/v1/chat/completions") || url.includes("/chat/completions")) {
    return "openai-compatible path";
  }

  if (url.includes("/v1/completions")) {
    return "openai-compatible completions path";
  }

  const contentType = getHeader(request?.headers, "content-type");
  if (contentType && contentType.includes("application/json")) {
    const text = request?.postData?.text;
    if (typeof text === "string") {
      try {
        const parsed = JSON.parse(text) as any;
        if (Array.isArray(parsed?.messages) && typeof parsed?.model === "string") {
          return "openai-compatible request shape";
        }
      } catch {
        return undefined;
      }
    }
  }

  return undefined;
}

function getHeader(
  headers: Array<{ name: string; value: string }> | undefined,
  name: string,
): string | undefined {
  if (!headers) {
    return undefined;
  }
  const key = name.toLowerCase();
  const header = headers.find((item) => String(item.name).toLowerCase() === key);
  return header ? String(header.value) : undefined;
}

function toSortedHostCounts(
  map: Map<string, number>,
): Array<{ host: string; count: number }> {
  return Array.from(map.entries())
    .map(([host, count]) => ({ host, count }))
    .sort((a, b) => b.count - a.count);
}

function toSortedMethodCounts(
  map: Map<string, number>,
): Array<{ method: string; count: number }> {
  return Array.from(map.entries())
    .map(([method, count]) => ({ method, count }))
    .sort((a, b) => b.count - a.count);
}

function dedupeCandidates(
  items: Array<{ url: string; reason: string }>,
): Array<{ url: string; reason: string }> {
  const seen = new Set<string>();
  const out: Array<{ url: string; reason: string }> = [];
  for (const item of items) {
    const key = `${item.url}::${item.reason}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push(item);
  }
  return out;
}
