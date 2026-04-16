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
- Web（实验）：无头浏览器登录并录制 HAR，便于“被动扫描/抓包导入”作为后续渗透扫描种子

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
node packages/cli/dist/index.js scan run --config ./examples/owasp-ollama/scan.json
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
          baseline_path: ./reports/baseline.json
          archive_dir: ./reports/archive
          report_format: json
          fail_on_flagged: "true"
```

当提供 `baseline_path` 且文件存在时，默认只会在“新增 flagged”时失败（更适配 CI 逐步落地）。

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

内置 OWASP LLM Top 10 starter pack：见 [owasp-llm-top10-pack.json](examples/extensions/owasp-llm-top10-pack.json) 与示例扫描配置 [scan.json](examples/owasp-ollama/scan.json)。

## Web 被动扫描（实验）

无头浏览器登录并录制 HAR（账号密码建议走环境变量/GitHub Secrets）：

```bash
NB_WEB_USERNAME=your_user NB_WEB_PASSWORD=your_pass \
node packages/cli/dist/index.js web record-har \
  --url https://example.com/login \
  --steps ./examples/web/login.steps.json \
  --har ./reports/web.har \
  --headed true
```

分析 HAR，找出候选的 LLM 接口与请求概况：

```bash
node packages/cli/dist/index.js web analyze-har --har ./reports/web.har
```
