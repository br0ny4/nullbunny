// Temporary until workspace dependencies are installed in this environment.
// @ts-ignore
import { readFile } from "node:fs/promises";
// Temporary until workspace dependencies are installed in this environment.
// @ts-ignore
import { dirname, resolve } from "node:path";
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
  type ScanAttackEntry,
  type ScanJudgeConfig,
  type ScanOutcome,
} from "@nullbunny/plugin-sdk";
import { createProvider, type ProviderConfig, type ProviderHealthStatus } from "@nullbunny/providers";
export * from "./events.js";

export interface ScanSnapshot {
  version: "1.0";
  createdAt: string;
  configPath: string;
  config: ScanConfig;
}

export function createScanSnapshot(
  config: ScanConfig,
  configPath: string,
): ScanSnapshot {
  return {
    version: "1.0",
    createdAt: new Date().toISOString(),
    configPath,
    config,
  };
}

export async function loadScanSnapshot(
  snapshotPath: string,
): Promise<ScanSnapshot> {
  const content = await readFile(snapshotPath, "utf8");
  const parsed = JSON.parse(content) as unknown;

  if (!isRecord(parsed)) {
    throw new Error("Invalid snapshot: must be a JSON object");
  }

  if (parsed.version !== "1.0") {
    throw new Error(
      `Unsupported snapshot version: ${String(parsed.version)}`,
    );
  }

  if (!isRecord(parsed.config)) {
    throw new Error("Invalid snapshot: missing or invalid config");
  }

  return {
    version: parsed.version as "1.0",
    createdAt: typeof parsed.createdAt === "string" ? parsed.createdAt : "",
    configPath:
      typeof parsed.configPath === "string" ? parsed.configPath : "",
    config: parsed.config as ScanConfig,
  };
}

export interface ScanConfig {
  id: string;
  target: string;
  provider: ProviderConfig;
  attacks: ScanAttackEntry[];
  judge: ScanJudgeConfig;
  bridge?: {
    manifestPaths: string[];
  };
}

export interface ScanCaseResult {
  caseId: string;
  category: string;
  prompt: string;
  response: string;
  outcome: ScanOutcome;
  reason: string;
  latencyMs: number;
}

export interface ScanRunResult {
  scanId: string;
  target: string;
  provider: ProviderHealthStatus;
  summary: {
    total: number;
    passed: number;
    flagged: number;
    errors: number;
  };
  cases: ScanCaseResult[];
}

export type ScanRunEvent =
  | { type: "scan_start"; scanId: string; target: string; total: number }
  | { type: "case_start"; scanId: string; target: string; index: number; total: number; caseId: string; category: string }
  | { type: "case_end"; scanId: string; target: string; index: number; total: number; caseId: string; outcome: ScanOutcome; latencyMs: number }
  | { type: "scan_end"; scanId: string; target: string; total: number; passed: number; flagged: number; errors: number };

export interface RunScanOptions {
  onEvent?: (event: ScanRunEvent) => void;
}

export async function loadScanConfig(filePath: string): Promise<ScanConfig> {
  const content = await readFile(filePath, "utf8");
  const interpolated = interpolateEnvVars(content);
  const parsed = JSON.parse(interpolated) as unknown;
  if (!isScanConfig(parsed)) {
    throw new Error("Invalid scan config");
  }

  return normalizeScanConfigPaths(parsed, filePath);
}

export async function runScan(
  config: ScanConfig,
  options?: RunScanOptions,
): Promise<ScanRunResult> {
  const provider = createProvider(config.provider);
  const providerStatus = await provider.healthCheck();

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

  options?.onEvent?.({
    type: "scan_start",
    scanId: config.id,
    target: config.target,
    total: attacks.length,
  });

  if (!providerStatus.ok) {
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
        reason: `Provider preflight failed: ${providerStatus.message}`,
        latencyMs: providerStatus.latencyMs,
      })),
    };
  }

  const judgeConfig = normalizeJudgeConfig(config.judge);
  const cases: ScanCaseResult[] = [];

  for (const [index, attack] of attacks.entries()) {
    options?.onEvent?.({
      type: "case_start",
      scanId: config.id,
      target: config.target,
      index: index + 1,
      total: attacks.length,
      caseId: attack.id,
      category: attack.category,
    });

    const generation = await provider.generate(attack.prompt);
    const judged = judgeResponseWithRegistry(
      {
        attack,
        generation,
        config: judgeConfig,
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

    options?.onEvent?.({
      type: "case_end",
      scanId: config.id,
      target: config.target,
      index: index + 1,
      total: attacks.length,
      caseId: attack.id,
      outcome: judged.outcome,
      latencyMs: generation.latencyMs,
    });
  }

  const result: ScanRunResult = {
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

  options?.onEvent?.({
    type: "scan_end",
    scanId: result.scanId,
    target: result.target,
    total: result.summary.total,
    passed: result.summary.passed,
    flagged: result.summary.flagged,
    errors: result.summary.errors,
  });

  return result;
}

export function formatScanRun(result: ScanRunResult): string {
  const lines = [
    `scan: ${result.scanId}`,
    `target: ${result.target}`,
    `provider: ${result.provider.providerType} (${result.provider.providerId})`,
    `provider-status: ${result.provider.ok ? "ready" : "failed"}`,
    `summary: total=${result.summary.total} pass=${result.summary.passed} flagged=${result.summary.flagged} error=${result.summary.errors}`,
    "",
  ];

  for (const item of result.cases) {
    lines.push(
      `[${item.outcome.toUpperCase()}] ${item.caseId} (${item.category}) - ${item.reason}`,
    );
  }

  return lines.join("\n");
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

async function loadOptionalBridgeRegistry(config: ScanConfig) {
  if (!config.bridge || config.bridge.manifestPaths.length === 0) {
    return {
      manifests: [],
      attackRegistry: new Map(),
      judgeRegistry: new Map(),
    };
  }

  return loadBridgeRegistry(config.bridge.manifestPaths);
}

function normalizeScanConfigPaths(config: ScanConfig, filePath: string): ScanConfig {
  if (!config.bridge) {
    return config;
  }

  const configDir = dirname(filePath);
  return {
    ...config,
    bridge: {
      manifestPaths: config.bridge.manifestPaths.map((entry) =>
        resolve(configDir, entry),
      ),
    },
  };
}

function isScanConfig(value: unknown): value is ScanConfig {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.id === "string" &&
    typeof value.target === "string" &&
    isProviderConfig(value.provider) &&
    Array.isArray(value.attacks) &&
    value.attacks.every(isAttackEntry) &&
    isJudgeConfig(value.judge) &&
    isBridgeConfig(value.bridge)
  );
}

function isAttackEntry(value: unknown): value is ScanAttackEntry {
  return isScanAttackCase(value) || isRegisteredAttackConfig(value);
}

function isJudgeConfig(value: unknown): value is ScanJudgeConfig {
  return isPluginJudgeConfig(value) || isLegacyJudgeConfig(value);
}

function isBridgeConfig(
  value: unknown,
): value is { manifestPaths: string[] } | undefined {
  if (value === undefined) {
    return true;
  }

  return (
    isRecord(value) &&
    Array.isArray(value.manifestPaths) &&
    value.manifestPaths.every((item) => typeof item === "string")
  );
}

function isProviderConfig(value: unknown): value is ProviderConfig {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    ["ollama", "openai-compatible", "anthropic", "deepseek", "gemini", "azure-openai", "siliconflow", "groq", "together", "mistral", "openrouter", "alibaba", "volcengine", "tencent", "perplexity", "xai", "cohere"].includes(value.type as string) &&
    typeof value.baseUrl === "string" &&
    (value.model === undefined || typeof value.model === "string") &&
    (value.apiKey === undefined || typeof value.apiKey === "string") &&
    (value.timeoutMs === undefined || typeof value.timeoutMs === "number")
  );
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === "object" && value !== null;
}

// ── Policy Center ──

export interface WhitelistEntry {
  caseId: string;
  reason: string;
  expiresAt: string; // ISO 8601
}

export interface PolicyThresholds {
  critical: number;
  high: number;
  medium: number;
  low: number;
}

export interface ScanPolicy {
  id: string;
  label: string;
  thresholds: PolicyThresholds;
  whitelist: WhitelistEntry[];
  businessLine: string;
}

export interface PolicyVerdict {
  passed: boolean;
  reasons: string[];
}

export interface AppliedScanResult extends ScanRunResult {
  verdict: PolicyVerdict;
  whitelistedCaseIds: string[];
}

export function createScanPolicy(opts: {
  id: string;
  label?: string;
  thresholds: PolicyThresholds;
  whitelist?: WhitelistEntry[];
  businessLine?: string;
}): ScanPolicy {
  return {
    id: opts.id,
    label: opts.label ?? opts.id,
    thresholds: opts.thresholds,
    whitelist: opts.whitelist ?? [],
    businessLine: opts.businessLine ?? "default",
  };
}

export function isWhitelistExpired(entry: WhitelistEntry): boolean {
  return new Date(entry.expiresAt).getTime() <= Date.now();
}

export function applyScanPolicy(
  result: ScanRunResult,
  policy: ScanPolicy,
): AppliedScanResult {
  const now = Date.now();
  const whitelistedIds: string[] = [];

  const cases = result.cases.map((c) => {
    const entry = policy.whitelist.find((w) => w.caseId === c.caseId);

    if (entry && new Date(entry.expiresAt).getTime() > now) {
      whitelistedIds.push(c.caseId);
      return {
        ...c,
        outcome: "pass" as ScanOutcome,
        reason: `whitelisted: ${entry.reason} (expires ${entry.expiresAt})`,
      };
    }

    return c;
  });

  const flagged = cases.filter((c) => c.outcome === "flagged").length;
  const reasons: string[] = [];

  if (flagged > policy.thresholds.critical) {
    reasons.push(`${flagged} flagged cases exceed threshold critical=${policy.thresholds.critical}`);
  } else {
    reasons.push(`flagged=${flagged} within threshold`);
  }

  return {
    ...result,
    summary: {
      ...result.summary,
      flagged,
      passed: result.summary.total - flagged - result.summary.errors,
    },
    cases,
    verdict: {
      passed: flagged <= policy.thresholds.critical,
      reasons,
    },
    whitelistedCaseIds: whitelistedIds,
  };
}

export async function loadScanPolicy(
  filePath: string,
): Promise<ScanPolicy> {
  const content = await readFile(filePath, "utf8");
  const parsed = JSON.parse(content) as unknown;

  if (!isRecord(parsed)) {
    throw new Error("Invalid scan policy: must be a JSON object");
  }

  if (typeof parsed.id !== "string" || parsed.id.trim().length === 0) {
    throw new Error("Invalid scan policy: missing or empty id");
  }

  const thresholds = parsed.thresholds;
  if (
    !isRecord(thresholds) ||
    typeof thresholds.critical !== "number" ||
    typeof thresholds.high !== "number" ||
    typeof thresholds.medium !== "number" ||
    typeof thresholds.low !== "number"
  ) {
    throw new Error(
      "Invalid scan policy: thresholds must have critical/high/medium/low numbers",
    );
  }

  if (
    thresholds.critical < 0 ||
    thresholds.high < 0 ||
    thresholds.medium < 0 ||
    thresholds.low < 0
  ) {
    throw new Error("Invalid scan policy: thresholds cannot be negative");
  }

  const whitelist: WhitelistEntry[] = [];
  if (Array.isArray(parsed.whitelist)) {
    for (const entry of parsed.whitelist) {
      if (
        isRecord(entry) &&
        typeof entry.caseId === "string" &&
        typeof entry.reason === "string" &&
        typeof entry.expiresAt === "string"
      ) {
        whitelist.push({
          caseId: entry.caseId,
          reason: entry.reason,
          expiresAt: entry.expiresAt,
        });
      }
    }
  }

  return {
    id: parsed.id as string,
    label:
      typeof parsed.label === "string" && parsed.label.trim().length > 0
        ? parsed.label
        : (parsed.id as string),
    thresholds: {
      critical: thresholds.critical as number,
      high: thresholds.high as number,
      medium: thresholds.medium as number,
      low: thresholds.low as number,
    },
    whitelist,
    businessLine:
      typeof parsed.businessLine === "string"
        ? parsed.businessLine
        : "default",
  };
}

function interpolateEnvVars(text: string): string {
  return text.replace(/\$\{([A-Za-z0-9_]+)\}/g, (full, key: string) => {
    const resolved = process.env[key];
    return resolved === undefined ? full : resolved;
  });
}
