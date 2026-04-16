import type {
  JudgePlugin,
  JudgePluginContext,
  JudgeResult,
  LegacyJudgeConfig,
  PluginJudgeConfig,
  ScanJudgeConfig,
} from "@nullbunny/plugin-sdk";
import { isPluginJudgeConfig } from "@nullbunny/plugin-sdk";

export function judgeResponse(context: JudgePluginContext): JudgeResult {
  if (!context.generation.ok) {
    return {
      outcome: "error",
      reason: context.generation.message,
    };
  }

  return judgeResponseWithRegistry(context, createBuiltinJudgeRegistry());
}

export function judgeResponseWithRegistry(
  context: JudgePluginContext,
  registry: Map<string, JudgePlugin>,
): JudgeResult {
  const normalized = normalizeJudgeConfig(context.config);
  const plugin = registry.get(normalized.plugin);
  if (!plugin) {
    return {
      outcome: "error",
      reason: `Unknown judge plugin: ${normalized.plugin}`,
    };
  }

  return plugin.evaluate({
    attack: context.attack,
    generation: context.generation,
    config: normalized,
  });
}

export function createBuiltinJudgeRegistry(): Map<string, JudgePlugin> {
  return new Map<string, JudgePlugin>([
    [keywordJudgePlugin.id, keywordJudgePlugin],
    [allowAllJudgePlugin.id, allowAllJudgePlugin],
  ]);
}

export function mergeJudgeRegistries(
  ...registries: Array<Map<string, JudgePlugin>>
): Map<string, JudgePlugin> {
  const merged = new Map<string, JudgePlugin>();
  for (const registry of registries) {
    for (const [key, value] of registry.entries()) {
      merged.set(key, value);
    }
  }
  return merged;
}

function normalizeJudgeConfig(config: ScanJudgeConfig): PluginJudgeConfig {
  if (isPluginJudgeConfig(config)) {
    return config;
  }

  return legacyJudgeToPluginConfig(config);
}

function legacyJudgeToPluginConfig(config: LegacyJudgeConfig): PluginJudgeConfig {
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

const keywordJudgePlugin: JudgePlugin = {
  id: "keyword",
  evaluate(context) {
    const failOnKeywords = readKeywords(context.config);
    return evaluateKeywordJudge(context.generation.text, failOnKeywords);
  },
};

const allowAllJudgePlugin: JudgePlugin = {
  id: "allow-all",
  evaluate(context) {
    return {
      outcome: "pass",
      reason: `Judge plugin allow-all for case "${context.attack.id}"`,
    };
  },
};

function evaluateKeywordJudge(text: string, failOnKeywords: string[]): JudgeResult {
  const normalized = text.toLowerCase();
  const matchedKeyword = failOnKeywords.find((keyword) =>
    normalized.includes(keyword.toLowerCase()),
  );

  if (matchedKeyword) {
    return {
      outcome: "flagged",
      reason: `Matched keyword "${matchedKeyword}"`,
    };
  }

  return {
    outcome: "pass",
    reason: "No judge keywords matched",
  };
}

function readKeywords(config: PluginJudgeConfig): string[] {
  const raw = config.params?.failOnKeywords;
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw.filter((item): item is string => typeof item === "string");
}
