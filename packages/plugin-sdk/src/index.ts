import type { ProviderGenerateResult } from "@nullbunny/providers";

export interface ScanAttackCase {
  id: string;
  category: string;
  prompt: string;
}

export interface RegisteredAttackConfig {
  plugin: string;
  count?: number;
  overrides?: Partial<ScanAttackCase>;
  params?: Record<string, unknown>;
}

export type ScanAttackEntry = ScanAttackCase | RegisteredAttackConfig;

export interface PluginJudgeConfig {
  plugin: string;
  params?: Record<string, unknown>;
}

export interface KeywordJudgeConfig {
  mode: "keyword";
  failOnKeywords: string[];
}

export interface AllowAllJudgeConfig {
  mode: "allow-all";
}

export type LegacyJudgeConfig = KeywordJudgeConfig | AllowAllJudgeConfig;
export type ScanJudgeConfig = PluginJudgeConfig | LegacyJudgeConfig;

export type ScanOutcome = "pass" | "flagged" | "error";

export interface JudgeResult {
  outcome: ScanOutcome;
  reason: string;
}

export interface AttackPluginContext {
  config: RegisteredAttackConfig;
}

export interface JudgePluginContext {
  attack: ScanAttackCase;
  generation: ProviderGenerateResult;
  config: PluginJudgeConfig;
}

export interface AttackPlugin {
  id: string;
  generate(context: AttackPluginContext): ScanAttackCase[];
}

export interface JudgePlugin {
  id: string;
  evaluate(context: JudgePluginContext): JudgeResult;
}

export interface ExternalAttackPluginManifest {
  id: string;
  category: string;
  prompt: string;
}

export interface ExternalJudgePluginManifest {
  id: string;
  mode: "keyword" | "allow-all";
  failOnKeywords?: string[];
}

export interface ExternalPluginManifest {
  id: string;
  label?: string;
  attacks?: ExternalAttackPluginManifest[];
  judges?: ExternalJudgePluginManifest[];
}

export function isRegisteredAttackConfig(
  value: unknown,
): value is RegisteredAttackConfig {
  return (
    isRecord(value) &&
    typeof value.plugin === "string" &&
    (value.count === undefined || typeof value.count === "number") &&
    (value.overrides === undefined || isRecord(value.overrides)) &&
    (value.params === undefined || isRecord(value.params))
  );
}

export function isScanAttackCase(value: unknown): value is ScanAttackCase {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.category === "string" &&
    typeof value.prompt === "string"
  );
}

export function isPluginJudgeConfig(value: unknown): value is PluginJudgeConfig {
  return (
    isRecord(value) &&
    typeof value.plugin === "string" &&
    (value.params === undefined || isRecord(value.params))
  );
}

export function isLegacyJudgeConfig(value: unknown): value is LegacyJudgeConfig {
  if (!isRecord(value)) {
    return false;
  }

  if (value.mode === "allow-all") {
    return true;
  }

  return (
    value.mode === "keyword" &&
    Array.isArray(value.failOnKeywords) &&
    value.failOnKeywords.every((item) => typeof item === "string")
  );
}

export function isExternalPluginManifest(
  value: unknown,
): value is ExternalPluginManifest {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    (value.label === undefined || typeof value.label === "string") &&
    (value.attacks === undefined ||
      (Array.isArray(value.attacks) &&
        value.attacks.every(isExternalAttackPluginManifest))) &&
    (value.judges === undefined ||
      (Array.isArray(value.judges) &&
        value.judges.every(isExternalJudgePluginManifest)))
  );
}

export function isExternalAttackPluginManifest(
  value: unknown,
): value is ExternalAttackPluginManifest {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.category === "string" &&
    typeof value.prompt === "string"
  );
}

export function isExternalJudgePluginManifest(
  value: unknown,
): value is ExternalJudgePluginManifest {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    (value.mode === "keyword" || value.mode === "allow-all") &&
    (value.failOnKeywords === undefined ||
      (Array.isArray(value.failOnKeywords) &&
        value.failOnKeywords.every((item) => typeof item === "string")))
  );
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === "object" && value !== null;
}
