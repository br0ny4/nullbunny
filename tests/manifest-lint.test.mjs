import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import assert from "node:assert";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, "..");

// Dynamic import — will fail in RED phase before lintManifest exists
let lintManifest;

async function loadLint() {
  // TS build outputs to dist/ via tsconfig.base.json outDir
  const pluginSdkPath = resolve(rootDir, "dist/plugin-sdk/src/index.js");
  ({ lintManifest } = await import(pluginSdkPath));
}

describe("lintManifest — structural rules", () => {
  it("passes for a valid minimal manifest", async () => {
    await loadLint();
    const result = lintManifest({
      id: "test-pack",
      label: "Test Pack",
      attacks: [
        { id: "test/case-1", category: "test-category", prompt: "Hello?" },
      ],
    });
    assert.strictEqual(result.passed, true);
    assert.deepStrictEqual(result.errors, []);
  });

  it("fails when attack id is missing category prefix (no slash)", async () => {
    await loadLint();
    const result = lintManifest({
      id: "test-pack",
      attacks: [
        { id: "no-slash", category: "test-category", prompt: "Hello?" },
      ],
    });
    assert.strictEqual(result.passed, false);
    assert.ok(
      result.errors.some((e) => e.includes("attack id") && e.includes("/")),
      `expected error about missing slash, got: ${JSON.stringify(result.errors)}`,
    );
  });

  it("fails when attack has empty id", async () => {
    await loadLint();
    const result = lintManifest({
      id: "test-pack",
      attacks: [
        { id: "", category: "test-category", prompt: "Hello?" },
      ],
    });
    assert.strictEqual(result.passed, false);
    assert.ok(result.errors.some((e) => e.includes("empty")));
  });

  it("fails when attack has empty prompt", async () => {
    await loadLint();
    const result = lintManifest({
      id: "test-pack",
      attacks: [
        { id: "test/case-1", category: "test-cat", prompt: "" },
      ],
    });
    assert.strictEqual(result.passed, false);
    assert.ok(
      result.errors.some((e) => e.includes("empty") && e.includes("prompt")),
    );
  });

  it("fails on duplicate attack IDs", async () => {
    await loadLint();
    const result = lintManifest({
      id: "test-pack",
      attacks: [
        { id: "test/case-1", category: "a", prompt: "A" },
        { id: "test/case-1", category: "b", prompt: "B" },
      ],
    });
    assert.strictEqual(result.passed, false);
    assert.ok(result.errors.some((e) => e.includes("duplicate")));
  });

  it("fails on duplicate judge IDs", async () => {
    await loadLint();
    const result = lintManifest({
      id: "test-pack",
      judges: [
        { id: "j1", mode: "keyword", failOnKeywords: ["secret"] },
        { id: "j1", mode: "keyword", failOnKeywords: ["password"] },
      ],
    });
    assert.strictEqual(result.passed, false);
    assert.ok(
      result.errors.some((e) => e.includes("duplicate") && e.includes("judge")),
    );
  });

  it("fails when keyword judge has empty failOnKeywords", async () => {
    await loadLint();
    const result = lintManifest({
      id: "test-pack",
      judges: [
        { id: "j1", mode: "keyword", failOnKeywords: [] },
      ],
    });
    assert.strictEqual(result.passed, false);
    assert.ok(
      result.errors.some(
        (e) => e.includes("failOnKeywords") && e.includes("empty"),
      ),
    );
  });

  it("passes for allow-all judge without failOnKeywords", async () => {
    await loadLint();
    const result = lintManifest({
      id: "test-pack",
      judges: [{ id: "j1", mode: "allow-all" }],
    });
    assert.strictEqual(result.passed, true);
  });

  it("fails when manifest id is empty", async () => {
    await loadLint();
    const result = lintManifest({ id: "", attacks: [] });
    assert.strictEqual(result.passed, false);
    assert.ok(result.errors.some((e) => e.includes("manifest id")));
  });
});

describe("existing attack packs pass lint", () => {
  const packPaths = [
    "examples/extensions/community-pack.json",
    "examples/extensions/owasp-llm-top10-pack.json",
    "examples/extensions/rag-context-poisoning-pack.json",
    "examples/extensions/agentic-ai-pack.json",
  ];

  for (const packPath of packPaths) {
    it(`passes lint for ${packPath}`, async () => {
      await loadLint();
      const raw = await readFile(resolve(rootDir, packPath), "utf8");
      const manifest = JSON.parse(raw);
      const result = lintManifest(manifest);
      if (!result.passed) {
        console.error(`Lint errors for ${packPath}:`, result.errors);
      }
      assert.strictEqual(
        result.passed,
        true,
        `Lint failed for ${packPath}: ${result.errors.join("; ")}`,
      );
    });
  }
});
