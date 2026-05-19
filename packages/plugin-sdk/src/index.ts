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

export interface ManifestLintResult {
  passed: boolean;
  errors: string[];
}

export function lintManifest(manifest: unknown): ManifestLintResult {
  const errors: string[] = [];

  if (!isRecord(manifest)) {
    return { passed: false, errors: ["manifest must be a JSON object"] };
  }

  // Manifest id
  if (typeof manifest.id !== "string" || manifest.id.trim().length === 0) {
    errors.push("manifest id is empty or missing");
  }

  // Attack entries
  if (Array.isArray(manifest.attacks)) {
    lintAttacks(manifest.attacks, errors);
  }

  // Judge entries
  if (Array.isArray(manifest.judges)) {
    lintJudges(manifest.judges, errors);
  }

  return {
    passed: errors.length === 0,
    errors,
  };
}

function lintAttacks(attacks: unknown[], errors: string[]): void {
  const seenIds = new Set<string>();

  for (let i = 0; i < attacks.length; i++) {
    const attack = attacks[i];
    const prefix = `attacks[${i}]`;

    if (!isRecord(attack)) {
      errors.push(`${prefix}: must be an object`);
      continue;
    }

    // Check id
    const id = attack.id;
    if (typeof id !== "string" || id.trim().length === 0) {
      errors.push(`${prefix}: attack id is empty`);
    } else {
      // Check naming convention (must contain /)
      if (!id.includes("/")) {
        errors.push(`${prefix} (${id}): attack id must contain '/' as category/name separator`);
      }
      // Check duplicate
      if (seenIds.has(id)) {
        errors.push(`${prefix} (${id}): duplicate attack id`);
      }
      seenIds.add(id);
    }

    // Check category
    if (typeof attack.category !== "string" || attack.category.trim().length === 0) {
      errors.push(`${prefix} (${attack.id || "?"}): category is empty`);
    }

    // Check prompt
    if (typeof attack.prompt !== "string" || attack.prompt.trim().length === 0) {
      errors.push(`${prefix} (${attack.id || "?"}): prompt is empty`);
    }
  }
}

function lintJudges(judges: unknown[], errors: string[]): void {
  const seenIds = new Set<string>();

  for (let i = 0; i < judges.length; i++) {
    const judge = judges[i];
    const prefix = `judges[${i}]`;

    if (!isRecord(judge)) {
      errors.push(`${prefix}: must be an object`);
      continue;
    }

    // Check id
    const id = judge.id;
    if (typeof id !== "string" || id.trim().length === 0) {
      errors.push(`${prefix}: judge id is empty`);
    } else {
      if (seenIds.has(id)) {
        errors.push(`${prefix} (${id}): duplicate judge id`);
      }
      seenIds.add(id);
    }

    // Check mode-specific rules
    if (judge.mode === "keyword") {
      if (
        !Array.isArray(judge.failOnKeywords) ||
        judge.failOnKeywords.length === 0
      ) {
        errors.push(
          `${prefix} (${judge.id || "?"}): keyword judge must have non-empty failOnKeywords`,
        );
      }
    }
  }
}
