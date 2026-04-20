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

export async function loadScanConfig(filePath: string): Promise<ScanConfig> {
  const content = await readFile(filePath, "utf8");
  const interpolated = interpolateEnvVars(content);
  const parsed = JSON.parse(interpolated) as unknown;
  if (!isScanConfig(parsed)) {
    throw new Error("Invalid scan config");
  }

  return normalizeScanConfigPaths(parsed, filePath);
}

export async function runScan(config: ScanConfig): Promise<ScanRunResult> {
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

  for (const attack of attacks) {
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
    (value.type === "ollama" || value.type === "openai-compatible" || value.type === "anthropic" || value.type === "deepseek" || value.type === "gemini" || value.type === "azure-openai") &&
    typeof value.baseUrl === "string" &&
    (value.model === undefined || typeof value.model === "string") &&
    (value.apiKey === undefined || typeof value.apiKey === "string") &&
    (value.timeoutMs === undefined || typeof value.timeoutMs === "number")
  );
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === "object" && value !== null;
}

function interpolateEnvVars(text: string): string {
  return text.replace(/\$\{([A-Za-z0-9_]+)\}/g, (full, key: string) => {
    const resolved = process.env[key];
    return resolved === undefined ? full : resolved;
  });
}
