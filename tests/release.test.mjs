import test from "node:test";
import assert from "node:assert/strict";

import { runCli } from "../packages/cli/dist/index.js";
import { buildArchiveFilePath } from "../dist/packages/reporters/src/index.js";

test("buildArchiveFilePath uses timestamp and sanitized scan id", () => {
  const result = {
    scanId: "scan demo/01",
  };

  const archivePath = buildArchiveFilePath(
    result,
    "./reports/archive",
    "json",
    new Date(2026, 3, 16, 9, 10, 30),
  );

  assert.equal(
    archivePath,
    "./reports/archive/20260416-091030-scan-demo-01.json",
  );
});

test("runCli returns help output without arguments", async () => {
  const outputLines = [];
  const originalLog = console.log;
  console.log = (...args) => {
    outputLines.push(args.join(" "));
  };

  try {
    const result = await runCli([]);
    assert.equal(result.exitCode, 0);
    assert.match(result.output, /NullBunny CLI/);
    assert.match(result.output, /action run/);
    assert.match(result.output, /recon scan/);
    assert.equal(outputLines.length, 1);
  } finally {
    console.log = originalLog;
  }
});
