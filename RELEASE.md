# Release Notes

## Version 0.1.0

This release completes the first end-to-end NullBunny workflow:

- provider connectivity checks for `ollama` and `openai-compatible`
- `scan run` execution from JSON config
- built-in attack and judge plugin registration
- JSON and Markdown report output
- archive-first `action run` workflow
- manifest-based external extension loading through `mcp-bridge`
- runnable production entrypoints at `packages/cli/dist/index.js` and `apps/action/dist/index.js`

## Release Checklist

Run the validation flow from the repo root:

```bash
pnpm install
pnpm build
pnpm typecheck
pnpm test
node packages/cli/dist/index.js action run --config ./examples/basic-ollama/scan.json --archive-dir ./reports/archive-built
```

Optional pack verification:

```bash
mkdir -p .artifacts
pnpm --filter @nullbunny/cli pack --pack-destination .artifacts
pnpm --filter @nullbunny/action-app pack --pack-destination .artifacts
```

## Distribution Scope

- `@nullbunny/cli` is the primary runnable entrypoint
- `@nullbunny/action-app` is the task-focused runner entrypoint
- the remaining workspace packages stay internal for now
