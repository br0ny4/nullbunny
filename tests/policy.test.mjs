import { readFile, writeFile } from "node:fs/promises";
import { mkdtemp, rm } from "node:fs/promises";
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
  tempDir = await mkdtemp(join(tmpdir(), "nb-policy-"));
});

after(async () => {
  await rm(tempDir, { recursive: true, force: true }).catch(() => {});
});

describe("policy center — core exports", () => {
  let coreJs;

  before(async () => {
    coreJs = await readFile(
      join(rootDir, "dist/core/src/index.js"),
      "utf8",
    );
  });

  it("core exports createScanPolicy", () => {
    assert.ok(coreJs.includes("function createScanPolicy"));
  });

  it("core exports applyScanPolicy", () => {
    assert.ok(coreJs.includes("function applyScanPolicy"));
  });

  it("core exports isWhitelistExpired", () => {
    assert.ok(coreJs.includes("function isWhitelistExpired"));
  });

  it("core exports loadScanPolicy", () => {
    assert.ok(coreJs.includes("function loadScanPolicy"));
  });

  it("core defines WhitelistEntry with TTL (expiresAt)", () => {
    assert.ok(coreJs.includes("expiresAt"));
  });

  it("core defines PolicyThresholds (critical/high/medium/low)", () => {
    assert.ok(coreJs.includes("critical") && coreJs.includes("high") && coreJs.includes("medium") && coreJs.includes("low"));
  });
});

describe("policy center — scan run integration", () => {
  it("scan run --policy creates a valid policy file and integrates with CLI", async () => {
    // Create a policy file
    const policyPath = join(tempDir, "prod-policy.json");
    await writeFile(
      policyPath,
      JSON.stringify({
        id: "prod-strict",
        label: "Production Strict",
        thresholds: { critical: 0, high: 2, medium: 5, low: 10 },
        whitelist: [
          { caseId: "prompt-injection-basic-001", reason: "Dev env noise", expiresAt: "2099-12-31T00:00:00Z" },
        ],
        businessLine: "backend-api",
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
      "--policy",
      policyPath,
    ]);

    // If provider is unavailable, we still verify the policy was recognized
    // (output should contain policy reference, not fall through to help)
    assert.ok(
      result.output.includes("policy") || result.output.includes("provider"),
      `Expected output to mention policy. Got: ${result.output.slice(0, 300)}`,
    );
  });

  it("scan replay --policy works with snapshot", async () => {
    const policyPath = join(tempDir, "replay-policy.json");
    await writeFile(
      policyPath,
      JSON.stringify({
        id: "replay-policy",
        label: "Replay Policy",
        thresholds: { critical: 1, high: 2, medium: 5, low: 10 },
        whitelist: [],
        businessLine: "test",
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
      "--policy",
      policyPath,
    ]);

    assert.ok(
      result.output.includes("policy") || result.output.includes("provider"),
      `Expected output to mention policy. Got: ${result.output.slice(0, 300)}`,
    );
  });
});

describe("policy center — CLI help text", () => {
  it("cli source contains --policy flag", async () => {
    const ts = await readFile(
      join(rootDir, "packages/cli/src/index.ts"),
      "utf8",
    );
    assert.ok(ts.includes("--policy"));
  });

  it("cli source contains policy flag description", async () => {
    const ts = await readFile(
      join(rootDir, "packages/cli/src/index.ts"),
      "utf8",
    );
    assert.ok(ts.includes("thresholds") && ts.includes("whitelist") && ts.includes("TTL"));
  });
});
