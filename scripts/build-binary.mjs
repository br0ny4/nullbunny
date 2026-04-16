import { build } from "esbuild";
import { mkdir, copyFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const target = process.argv[2];

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const configs = {
  cli: {
    entryPoints: ["packages/cli/src/index.ts"],
    outfile: "packages/cli/dist/index.js",
    typesInfile: "dist/packages/cli/src/index.d.ts",
    typesOutfile: "packages/cli/dist/index.d.ts",
    banner: "#!/usr/bin/env node",
    external: [
      "@nullbunny/web",
      "playwright",
      "playwright-core",
      "chromium-bidi",
      "chromium-bidi/*",
    ],
  },
  action: {
    entryPoints: ["apps/action/src/index.ts"],
    outfile: "apps/action/dist/index.js",
    typesInfile: "dist/apps/action/src/index.d.ts",
    typesOutfile: "apps/action/dist/index.d.ts",
    banner: "#!/usr/bin/env node",
    external: [],
  },
  web: {
    entryPoints: ["packages/web/src/index.ts"],
    outfile: "packages/web/dist/index.js",
    typesInfile: "dist/packages/web/src/index.d.ts",
    typesOutfile: "packages/web/dist/index.d.ts",
    banner: "",
    external: ["playwright", "playwright-core", "chromium-bidi", "chromium-bidi/*"],
  },
};

const config = configs[target];

if (!config) {
  throw new Error(`Unknown binary target: ${target}`);
}

await build({
  absWorkingDir: repoRoot,
  entryPoints: config.entryPoints,
  outfile: config.outfile,
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node20",
  sourcemap: true,
  external: config.external ?? [],
  banner: {
    js: config.banner,
  },
  tsconfig: resolve(repoRoot, "tsconfig.base.json"),
});

// `tsc` emits `.d.ts` to the repo-level `dist/` (per tsconfig.base.json outDir).
// Copy a stable `dist/index.d.ts` into each runnable package for packaging.
await mkdir(dirname(resolve(repoRoot, config.typesOutfile)), { recursive: true });
await copyFile(
  resolve(repoRoot, config.typesInfile),
  resolve(repoRoot, config.typesOutfile),
);
