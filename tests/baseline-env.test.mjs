import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { it, before, after, describe } from "node:test";
import assert from "node:assert";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "..");

let tempDir;

before(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "nb-baseline-"));
});

after(async () => {
  await rm(tempDir, { recursive: true, force: true }).catch(() => {});
});

describe("multi-env baseline — core function", () => {
  let coreJs;

  before(async () => {
    coreJs = await readFile(join(rootDir, "dist/core/src/index.js"), "utf8");
  });

  it("core exports resolveEnvBaselinePath", () => {
    assert.ok(coreJs.includes("function resolveEnvBaselinePath"));
  });

  it("core exports countNewFlaggedWithEnv", () => {
    assert.ok(coreJs.includes("function countNewFlaggedWithEnv"));
  });
});

describe("multi-env baseline — CLI integration", () => {
  it("scan run accepts --env flag", async () => {
    // Create baseline dir with env-specific files
    const baselineDir = join(tempDir, "baselines");
    await (await import("node:fs/promises")).mkdir(baselineDir, { recursive: true });

    // Create dev baseline
    await writeFile(
      join(baselineDir, "dev.json"),
      JSON.stringify({
        scanId: "dev-baseline",
        target: "test",
        summary: { total: 2, passed: 1, flagged: 1 },
        cases: [
          { caseId: "prompt-injection-basic-001", outcome: "flagged" },
          { caseId: "data-exfiltration-basic-001", outcome: "pass" },
        ],
      }),
    );

    const { runCli } = await import(
      join(rootDir, "packages/cli/dist/index.js")
    );

    const result = await runCli([
      "scan",
      "run",
      "--config",
      join(rootDir, "examples/basic-ollama/scan.json"),
      "--baseline",
      baselineDir,
      "--env",
      "dev",
    ]);

    // Should not fall through to help
    assert.ok(
      !result.output.includes("NullBunny CLI") ||
        result.output.includes("baseline") ||
        result.output.includes("provider"),
      `Output should reference baseline or provider. Got: ${result.output.slice(0, 200)}`,
    );
  });

  it("scan replay accepts --env flag", async () => {
    const baselineDir = join(tempDir, "replay-baselines");
    await (await import("node:fs/promises")).mkdir(baselineDir, { recursive: true });

    await writeFile(
      join(baselineDir, "staging.json"),
      JSON.stringify({
        scanId: "staging-baseline",
        target: "test",
        summary: { total: 2, passed: 1, flagged: 1 },
        cases: [
          { caseId: "prompt-injection-basic-001", outcome: "flagged" },
          { caseId: "data-exfiltration-basic-001", outcome: "pass" },
        ],
      }),
    );

    const snapshotPath = join(tempDir, "replay-snap.json");
    await writeFile(
      snapshotPath,
      JSON.stringify({
        version: "1.0",
        createdAt: new Date().toISOString(),
        configPath: "test/scan.json",
        config: {
          id: "replay-test",
          target: "test-target",
          provider: { id: "ollama-local", type: "ollama", baseUrl: "http://127.0.0.1:11434", model: "qwen2.5:7b", timeoutMs: 5000 },
          attacks: [{ plugin: "prompt-injection/basic" }],
          judge: { plugin: "keyword", params: { failOnKeywords: ["secret"] } },
        },
      }),
    );

    const { runCli } = await import(
      join(rootDir, "packages/cli/dist/index.js")
    );

    const result = await runCli([
      "scan",
      "replay",
      "--snapshot",
      snapshotPath,
      "--baseline",
      baselineDir,
      "--env",
      "staging",
    ]);

    assert.ok(
      !result.output.includes("NullBunny CLI") ||
        result.output.includes("baseline") ||
        result.output.includes("provider"),
    );
  });

  it("--env without --baseline still works (graceful no-op)", async () => {
    const { runCli } = await import(
      join(rootDir, "packages/cli/dist/index.js")
    );

    const result = await runCli([
      "scan",
      "run",
      "--config",
      join(rootDir, "examples/basic-ollama/scan.json"),
      "--env",
      "prod",
    ]);

    // Should not crash
    assert.ok(typeof result.exitCode === "number");
  });
});

describe("multi-env baseline — help text", () => {
  it("cli source contains --env flag", async () => {
    const ts = await readFile(
      join(rootDir, "packages/cli/src/index.ts"),
      "utf8",
    );
    assert.ok(ts.includes("--env"));
  });

  it("cli source mentions dev/staging/prod environments", async () => {
    const ts = await readFile(
      join(rootDir, "packages/cli/src/index.ts"),
      "utf8",
    );
    assert.ok(ts.includes("dev") && ts.includes("staging") && ts.includes("prod"));
  });
});
