# @nullbunny/action-app

Task-oriented runner for NullBunny scans with archive output.

## GitHub Action

This folder also contains a GitHub Action definition at `action.yml`:

```yaml
- uses: <owner>/<repo>/apps/action@main
  with:
    config: ./examples/basic-ollama/scan.json
    archive_dir: ./reports/archive
    report_format: json
    fail_on_flagged: "true"
```

## Usage

Build the workspace first:

```bash
pnpm build
```

Run the action entrypoint:

```bash
node apps/action/dist/index.js --config ./examples/basic-ollama/scan.json --archive-dir ./reports/archive
```
