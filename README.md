# NullBunny

[![CI](https://github.com/br0ny4/nullbunny/actions/workflows/ci.yml/badge.svg)](https://github.com/br0ny4/nullbunny/actions/workflows/ci.yml)
![License](https://img.shields.io/badge/license-MIT-green)

NullBunny 是一个 Node.js/TypeScript 的 LLM 红队自动化扫描框架，面向 LLM、Agent、RAG 场景，可用于本地自测或 CI Gate。

## 功能

- Providers：支持本地 Ollama 和 OpenAI-compatible 端点（也方便扩展到更多商业模型）
- Scans：按配置文件批量执行攻击用例并进行判定（judge）
- Reports：输出 JSON/Markdown 报告
- Extensions：通过 manifest 加载外部攻击/判定插件包（方便社区贡献）
- GitHub Action：在 PR/Push 时运行扫描并归档报告

## 快速开始（本地）

```bash
pnpm install
pnpm build
pnpm typecheck
pnpm test
```

Provider 连通性检查：

```bash
node packages/cli/dist/index.js providers test --provider ollama --model qwen2.5:7b
node packages/cli/dist/index.js providers test --provider openai-compatible --base-url http://127.0.0.1:8000/v1 --model local-model
```

运行扫描：

```bash
node packages/cli/dist/index.js scan run --config ./examples/basic-ollama/scan.json
node packages/cli/dist/index.js scan run --config ./examples/basic-openai-compatible/scan.json
```

写出报告：

```bash
node packages/cli/dist/index.js scan run --config ./examples/basic-ollama/scan.json --output ./reports/basic.json
node packages/cli/dist/index.js scan run --config ./examples/basic-ollama/scan.json --report-format markdown --output ./reports/basic.md
```

## GitHub Action

使用仓库内置 Action：`apps/action/action.yml`

```yaml
name: nullbunny-scan
on:
  pull_request:
  push:

jobs:
  scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: br0ny4/nullbunny/apps/action@main
        with:
          config: ./examples/basic-ollama/scan.json
          archive_dir: ./reports/archive
          report_format: json
          fail_on_flagged: "true"
```

## 扩展（manifest）

`scan.json` 可通过 `bridge.manifestPaths` 加载外部 manifest：

```json
{
  "bridge": {
    "manifestPaths": ["../extensions/community-pack.json"]
  }
}
```

示例外部 manifest：见 [community-pack.json](examples/extensions/community-pack.json)。
