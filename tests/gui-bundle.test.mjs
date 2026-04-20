import test from "node:test";
import assert from "node:assert/strict";
import { readdir } from "node:fs/promises";
import { join } from "node:path";

test("GUI build splits JavaScript into multiple chunks", async () => {
  const assetsDir = join(process.cwd(), "apps/gui/dist/assets");
  const assetNames = await readdir(assetsDir);
  const jsAssets = assetNames.filter((fileName) => fileName.endsWith(".js"));

  assert.ok(
    jsAssets.length > 1,
    `Expected multiple JS chunks in ${assetsDir}, found: ${jsAssets.join(", ") || "none"}`,
  );
});
