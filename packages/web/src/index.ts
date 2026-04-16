import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { chromium, type Page } from "playwright";
import {
  createBuiltinAttackRegistry,
  mergeAttackRegistries,
  resolveAttackEntries,
} from "@nullbunny/attacks";
import { createBuiltinJudgeRegistry, judgeResponseWithRegistry, mergeJudgeRegistries } from "@nullbunny/judges";
import { loadBridgeRegistry } from "@nullbunny/mcp-bridge";
import {
  isLegacyJudgeConfig,
  isPluginJudgeConfig,
  isRegisteredAttackConfig,
  isScanAttackCase,
  type PluginJudgeConfig,
  type ScanAttackCase,
  type ScanAttackEntry,
  type ScanJudgeConfig,
  type ScanOutcome,
} from "@nullbunny/plugin-sdk";
import type { ProviderGenerateResult, ProviderHealthStatus } from "@nullbunny/providers";

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

export interface WebScanConfig {
  id: string;
  target: string;
  harPath: string;
  candidate?: {
    urlContains?: string;
  };
  bridge?: {
    manifestPaths: string[];
  };
  attacks: ScanAttackEntry[];
  judge: ScanJudgeConfig;
  timeoutMs?: number;
}

export interface WebScanCaseResult {
  caseId: string;
  category: string;
  prompt: string;
  response: string;
  outcome: ScanOutcome;
  reason: string;
  latencyMs: number;
}

export interface WebScanRunResult {
  scanId: string;
  target: string;
  provider: ProviderHealthStatus;
  summary: {
    total: number;
    passed: number;
    flagged: number;
    errors: number;
  };
  cases: WebScanCaseResult[];
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

export async function loadWebScanConfig(filePath: string): Promise<WebScanConfig> {
  const content = await readFile(filePath, "utf8");
  const parsed = JSON.parse(content) as unknown;
  if (!isWebScanConfig(parsed)) {
    throw new Error("Invalid web scan config");
  }
  return normalizeWebScanConfigPaths(parsed, filePath);
}

export async function runWebScan(config: WebScanConfig): Promise<WebScanRunResult> {
  const har = await readHar(config.harPath);
  const template = selectLlmRequestTemplate(har, config.candidate?.urlContains);
  const baseUrl = template ? new URL(template.url).origin : "unknown";

  const providerStatus: ProviderHealthStatus = {
    ok: Boolean(template),
    providerId: "web-har",
    providerType: "openai-compatible",
    baseUrl,
    model: template?.model,
    latencyMs: 0,
    message: template ? "HAR template ready" : "No LLM-like request found in HAR",
  };

  const bridgeRegistry = await loadOptionalBridgeRegistry(config);
  const attackRegistry = mergeAttackRegistries(
    createBuiltinAttackRegistry(),
    bridgeRegistry.attackRegistry,
  );
  const judgeRegistry = mergeJudgeRegistries(
    createBuiltinJudgeRegistry(),
    bridgeRegistry.judgeRegistry,
  );
  const attacks = resolveAttackEntries(config.attacks, attackRegistry);

  if (!template) {
    return {
      scanId: config.id,
      target: config.target,
      provider: providerStatus,
      summary: {
        total: attacks.length,
        passed: 0,
        flagged: 0,
        errors: attacks.length,
      },
      cases: attacks.map((attack) => ({
        caseId: attack.id,
        category: attack.category,
        prompt: attack.prompt,
        response: "",
        outcome: "error",
        reason: "No LLM-like request found in HAR",
        latencyMs: 0,
      })),
    };
  }

  const normalizedJudge = normalizeJudgeConfig(config.judge);
  const cases: WebScanCaseResult[] = [];

  for (const attack of attacks) {
    const generation = await sendInjectedOpenAICompatibleRequest(
      template,
      attack.prompt,
      config.timeoutMs ?? 15_000,
    );
    const judged = judgeResponseWithRegistry(
      {
        attack,
        generation,
        config: normalizedJudge,
      },
      judgeRegistry,
    );

    cases.push({
      caseId: attack.id,
      category: attack.category,
      prompt: attack.prompt,
      response: generation.ok ? generation.text : "",
      outcome: judged.outcome,
      reason: judged.reason,
      latencyMs: generation.latencyMs,
    });
  }

  return {
    scanId: config.id,
    target: config.target,
    provider: providerStatus,
    summary: {
      total: cases.length,
      passed: cases.filter((item) => item.outcome === "pass").length,
      flagged: cases.filter((item) => item.outcome === "flagged").length,
      errors: cases.filter((item) => item.outcome === "error").length,
    },
    cases,
  };
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

async function readHar(harPath: string): Promise<any> {
  const content = await readFile(harPath, "utf8");
  return JSON.parse(content) as any;
}

type HarRequest = {
  method: string;
  url: string;
  headers: Array<{ name: string; value: string }>;
  postData?: { text?: string };
};

type LlmRequestTemplate = {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
  model?: string;
};

function selectLlmRequestTemplate(
  har: any,
  urlContains?: string,
): LlmRequestTemplate | undefined {
  const entries: any[] = har?.log?.entries ?? [];

  for (const entry of entries) {
    const req = entry?.request as HarRequest | undefined;
    if (!req?.url || !req.method) {
      continue;
    }
    if (urlContains && !String(req.url).includes(urlContains)) {
      continue;
    }
    const reason = inferLlmEndpoint(String(req.url), req);
    if (!reason) {
      continue;
    }

    const body = parseJsonBody(req);
    if (!body) {
      continue;
    }
    if (!Array.isArray((body as any).messages)) {
      continue;
    }

    const headers = normalizeHeaders(req.headers);
    return {
      method: String(req.method).toUpperCase(),
      url: String(req.url),
      headers,
      body,
      model: typeof (body as any).model === "string" ? (body as any).model : undefined,
    };
  }

  return undefined;
}

function parseJsonBody(req: HarRequest): Record<string, unknown> | undefined {
  const text = req.postData?.text;
  if (typeof text !== "string" || text.length === 0) {
    return undefined;
  }
  try {
    const parsed = JSON.parse(text) as unknown;
    return isRecord(parsed) ? (parsed as Record<string, unknown>) : undefined;
  } catch {
    return undefined;
  }
}

function normalizeHeaders(headers: Array<{ name: string; value: string }>): Record<string, string> {
  const disallowed = new Set([
    "host",
    "content-length",
    "connection",
    "accept-encoding",
  ]);

  const out: Record<string, string> = {};
  for (const header of headers) {
    const key = String(header.name).toLowerCase();
    if (disallowed.has(key)) {
      continue;
    }
    out[key] = String(header.value);
  }

  if (!out["content-type"]) {
    out["content-type"] = "application/json";
  }

  return out;
}

async function sendInjectedOpenAICompatibleRequest(
  template: LlmRequestTemplate,
  prompt: string,
  timeoutMs: number,
): Promise<ProviderGenerateResult> {
  const startedAt = Date.now();
  const body = injectPromptIntoOpenAICompatibleBody(template.body, prompt);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(template.url, {
      method: template.method,
      headers: template.headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) {
      return {
        ok: false,
        providerId: "web-har",
        providerType: "openai-compatible",
        model: template.model,
        latencyMs: Date.now() - startedAt,
        text: "",
        message: `HTTP ${response.status}`,
      };
    }

    const parsed = (await response.json()) as unknown;
    const text = readOpenAICompatibleText(parsed);
    if (!text) {
      return {
        ok: false,
        providerId: "web-har",
        providerType: "openai-compatible",
        model: template.model,
        latencyMs: Date.now() - startedAt,
        text: "",
        message: "Invalid OpenAI-compatible response",
      };
    }

    return {
      ok: true,
      providerId: "web-har",
      providerType: "openai-compatible",
      model: template.model,
      latencyMs: Date.now() - startedAt,
      text,
      message: "Generation completed",
    };
  } catch (error) {
    return {
      ok: false,
      providerId: "web-har",
      providerType: "openai-compatible",
      model: template.model,
      latencyMs: Date.now() - startedAt,
      text: "",
      message: error instanceof Error ? error.message : "Unknown request error",
    };
  } finally {
    clearTimeout(timer);
  }
}

function injectPromptIntoOpenAICompatibleBody(
  original: Record<string, unknown>,
  prompt: string,
): Record<string, unknown> {
  const cloned: Record<string, unknown> = { ...original };
  if (cloned.stream !== undefined) {
    cloned.stream = false;
  }

  const messages = Array.isArray((cloned as any).messages) ? [...((cloned as any).messages as any[])] : [];
  const lastUserIndex = findLastUserMessageIndex(messages);
  if (lastUserIndex >= 0) {
    const msg = isRecord(messages[lastUserIndex]) ? { ...(messages[lastUserIndex] as any) } : {};
    msg.role = "user";
    msg.content = prompt;
    messages[lastUserIndex] = msg;
  } else {
    messages.push({ role: "user", content: prompt });
  }
  (cloned as any).messages = messages;
  return cloned;
}

function findLastUserMessageIndex(messages: any[]): number {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const msg = messages[index];
    if (isRecord(msg) && String((msg as any).role) === "user") {
      return index;
    }
  }
  return -1;
}

function readOpenAICompatibleText(body: unknown): string | undefined {
  if (!isRecord(body) || !Array.isArray((body as any).choices)) {
    return undefined;
  }
  for (const choice of (body as any).choices) {
    if (!isRecord(choice)) {
      continue;
    }
    if (typeof (choice as any).text === "string") {
      return (choice as any).text;
    }
    const message = (choice as any).message;
    if (isRecord(message) && typeof (message as any).content === "string") {
      return (message as any).content;
    }
  }
  return undefined;
}

function normalizeJudgeConfig(config: ScanJudgeConfig): PluginJudgeConfig {
  if (isPluginJudgeConfig(config)) {
    return config;
  }

  if (!isLegacyJudgeConfig(config)) {
    return { plugin: "allow-all" };
  }

  if (config.mode === "allow-all") {
    return { plugin: "allow-all" };
  }

  return {
    plugin: "keyword",
    params: {
      failOnKeywords: config.failOnKeywords,
    },
  };
}

async function loadOptionalBridgeRegistry(config: WebScanConfig) {
  if (!config.bridge || config.bridge.manifestPaths.length === 0) {
    return {
      manifests: [],
      attackRegistry: new Map(),
      judgeRegistry: new Map(),
    };
  }

  return loadBridgeRegistry(config.bridge.manifestPaths);
}

function normalizeWebScanConfigPaths(
  config: WebScanConfig,
  filePath: string,
): WebScanConfig {
  const configDir = dirname(filePath);
  const normalizedBridge = config.bridge
    ? {
        manifestPaths: config.bridge.manifestPaths.map((entry) =>
          resolve(configDir, entry),
        ),
      }
    : undefined;

  return {
    ...config,
    harPath: resolve(configDir, config.harPath),
    bridge: normalizedBridge,
  };
}

function isWebScanConfig(value: unknown): value is WebScanConfig {
  if (!isRecord(value)) {
    return false;
  }

  const candidate = (value as any).candidate;
  const candidateOk =
    candidate === undefined ||
    (isRecord(candidate) &&
      ((candidate as any).urlContains === undefined ||
        typeof (candidate as any).urlContains === "string"));

  const bridge = (value as any).bridge;
  const bridgeOk =
    bridge === undefined ||
    (isRecord(bridge) &&
      Array.isArray((bridge as any).manifestPaths) &&
      (bridge as any).manifestPaths.every((item: any) => typeof item === "string"));

  return (
    typeof (value as any).id === "string" &&
    typeof (value as any).target === "string" &&
    typeof (value as any).harPath === "string" &&
    candidateOk &&
    bridgeOk &&
    Array.isArray((value as any).attacks) &&
    (value as any).attacks.every((item: unknown) => isScanAttackCase(item) || isRegisteredAttackConfig(item)) &&
    ((value as any).judge !== undefined)
  );
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === "object" && value !== null;
}
