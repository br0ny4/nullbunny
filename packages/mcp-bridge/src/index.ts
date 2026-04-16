// Temporary until workspace dependencies are installed in this environment.
// @ts-ignore
import { readFile, readdir, stat } from "node:fs/promises";
// Temporary until workspace dependencies are installed in this environment.
// @ts-ignore
import { extname, join } from "node:path";
import type {
  AttackPlugin,
  ExternalJudgePluginManifest,
  ExternalPluginManifest,
  JudgePlugin,
} from "@nullbunny/plugin-sdk";
import { isExternalPluginManifest } from "@nullbunny/plugin-sdk";

export interface BridgeRegistry {
  manifests: ExternalPluginManifest[];
  attackRegistry: Map<string, AttackPlugin>;
  judgeRegistry: Map<string, JudgePlugin>;
}

export async function loadBridgeRegistry(
  manifestPaths: string[],
): Promise<BridgeRegistry> {
  const files = await expandManifestPaths(manifestPaths);
  const manifests: ExternalPluginManifest[] = [];

  for (const filePath of files) {
    const content = await readFile(filePath, "utf8");
    const parsed = JSON.parse(content) as unknown;
    if (!isExternalPluginManifest(parsed)) {
      throw new Error(`Invalid bridge manifest: ${filePath}`);
    }
    manifests.push(parsed);
  }

  return {
    manifests,
    attackRegistry: createAttackRegistry(manifests),
    judgeRegistry: createJudgeRegistry(manifests),
  };
}

async function expandManifestPaths(paths: string[]): Promise<string[]> {
  const resolved: string[] = [];

  for (const candidate of paths) {
    const candidateStat = await stat(candidate);
    if (candidateStat.isDirectory()) {
      const entries = await readdir(candidate);
      for (const entry of entries) {
        if (extname(entry) === ".json") {
          resolved.push(join(candidate, entry));
        }
      }
      continue;
    }

    resolved.push(candidate);
  }

  return resolved;
}

function createAttackRegistry(
  manifests: ExternalPluginManifest[],
): Map<string, AttackPlugin> {
  const registry = new Map<string, AttackPlugin>();

  for (const manifest of manifests) {
    for (const attack of manifest.attacks ?? []) {
      registry.set(attack.id, {
        id: attack.id,
        generate({ config }) {
          const count = config.count ?? 1;
          const cases = [];
          for (let index = 0; index < count; index += 1) {
            cases.push({
              id:
                config.overrides?.id ??
                `${attack.id.replace(/\//g, "-")}-${String(index + 1).padStart(3, "0")}`,
              category: config.overrides?.category ?? attack.category,
              prompt: config.overrides?.prompt ?? attack.prompt,
            });
          }
          return cases;
        },
      });
    }
  }

  return registry;
}

function createJudgeRegistry(
  manifests: ExternalPluginManifest[],
): Map<string, JudgePlugin> {
  const registry = new Map<string, JudgePlugin>();

  for (const manifest of manifests) {
    for (const judge of manifest.judges ?? []) {
      registry.set(judge.id, {
        id: judge.id,
        evaluate(context) {
          return evaluateExternalJudge(judge, context.generation.text);
        },
      });
    }
  }

  return registry;
}

function evaluateExternalJudge(
  judge: ExternalJudgePluginManifest,
  text: string,
): { outcome: "pass" | "flagged"; reason: string } {
  if (judge.mode === "allow-all") {
    return {
      outcome: "pass",
      reason: `Bridge judge ${judge.id} allowed response`,
    };
  }

  const normalized = text.toLowerCase();
  const matchedKeyword = (judge.failOnKeywords ?? []).find((keyword) =>
    normalized.includes(keyword.toLowerCase()),
  );

  if (matchedKeyword) {
    return {
      outcome: "flagged",
      reason: `Bridge judge ${judge.id} matched "${matchedKeyword}"`,
    };
  }

  return {
    outcome: "pass",
    reason: `Bridge judge ${judge.id} found no keyword match`,
  };
}
