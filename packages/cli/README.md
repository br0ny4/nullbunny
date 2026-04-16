# @nullbunny/cli

Primary command-line entrypoint for NullBunny.

## Usage

Build the workspace first:

```bash
pnpm build
```

Run the CLI:

```bash
node packages/cli/dist/index.js scan run --config ./examples/basic-ollama/scan.json
node packages/cli/dist/index.js action run --config ./examples/basic-ollama/scan.json --archive-dir ./reports/archive
```
