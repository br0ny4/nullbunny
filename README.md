# NullBunny

[![CI](https://github.com/br0ny4/nullbunny/actions/workflows/ci.yml/badge.svg)](https://github.com/br0ny4/nullbunny/actions/workflows/ci.yml)
![License](https://img.shields.io/badge/license-MIT-green)

NullBunny 是一个 Node.js/TypeScript 的 LLM 红队自动化扫描框架，面向 LLM、Agent、RAG 场景，可用于本地自测或 CI Gate。

## 功能

- Providers：支持本地 Ollama、OpenAI-compatible、Anthropic (Claude) 端点
- Scans：按配置文件批量执行攻击用例并进行判定（judge）
- Reports：输出 JSON / Markdown / SARIF 报告（SARIF 可直接导入 GitHub Code Scanning）
- Extensions：通过 manifest 加载外部攻击/判定插件包（方便社区贡献）
- Attack Packs：内置 OWASP LLM Top 10、RAG 上下文污染攻击包
- GitHub Action：在 PR/Push 时运行扫描并归档报告
- Web（实验）：无头浏览器登录并录制 HAR，便于"被动扫描/抓包导入"作为后续渗透扫描种子

## 功能与路线图 (TODO)

NullBunny 致力于打造一个“开箱即用”且“适配企业 CI”的 AI 应用安全扫描与渗透测试工具。以下是我们的功能完成情况与演进计划：

### 🟢 已完成 (Done)
- **核心扫描引擎**
  - [x] 基于 JSON 的扫描配置驱动 (`scan.json`)
  - [x] 支持多种判定规则 (Keyword / Allow-all)
  - [x] 多种格式的报告输出 (JSON / Markdown / SARIF)
- **多模型支持**
  - [x] 支持本地 Ollama 接口连通性测试与生成
  - [x] 支持 OpenAI 兼容接口 (OpenAI-compatible)
  - [x] 支持 Anthropic (Claude) Messages API 原生接口
- **扩展与生态**
  - [x] 插件化架构 (Plugin SDK)
  - [x] 通过 MCP Bridge 动态加载外部攻击/判定 Manifest
  - [x] 提供 OWASP LLM Top 10 Starter Pack 基础包
  - [x] 提供 RAG 上下文污染 (Context Poisoning) 攻击包
- **CI / CD 工程化**
  - [x] GitHub Action 封装 (`apps/action`)
  - [x] Baseline 增量扫描策略 (只对"新增风险"阻断流水线)
  - [x] SARIF 报告可直接导入 GitHub Code Scanning
  - [x] 项目自身的完整自动化测试与类型检查
- **Web 渗透辅助 (实验性)**
  - [x] 基于无头浏览器 (Playwright) 的自动化登录与会话保持
  - [x] 自动录制 HAR 流量包以供离线分析

### 🟡 开发中 (In Progress)
- **Web AI 黑盒扫描器 (`web scan`)**
  - [x] 从 HAR 自动识别候选的 OpenAI-compatible 请求并重放
  - [x] 基于 attack pack 对候选对话接口执行注入请求并判定
  - [ ] 更强的"端点识别/参数推断"（适配非 OpenAI-compatible 形态）
  - [x] 自动生成可复现的 curl（默认脱敏 header）
- **分发与安装体验**
  - [ ] npm 全局包发布 (`npm install -g nullbunny`)
  - [ ] 提供跨平台的单文件安装脚本 (macOS/Linux/Windows)

### ⚪ 计划中 (Planned)
- **更多商业大模型原生支持**
  - [ ] Gemini API 原生支持
  - [ ] Azure OpenAI 原生支持
  - [ ] DeepSeek API 原生支持
- **高级漏洞检测与报告**
  - [ ] Agentic AI 专属攻击包 (Tool Abuse / 越权执行)
- **进阶 Web 渗透**
  - [ ] 支持抓取 Chrome DevTools / mitmproxy 导出的第三方 HAR
  - [ ] 扩展至传统高危 Web 漏洞探测 (XSS/SQLi) 的轻量级扫描辅助

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
node packages/cli/dist/index.js providers test --provider anthropic --model claude-sonnet-4-20250514
```

运行扫描：

```bash
node packages/cli/dist/index.js scan run --config ./examples/basic-ollama/scan.json
node packages/cli/dist/index.js scan run --config ./examples/basic-openai-compatible/scan.json
node packages/cli/dist/index.js scan run --config ./examples/basic-anthropic/scan.json
node packages/cli/dist/index.js scan run --config ./examples/owasp-ollama/scan.json
node packages/cli/dist/index.js scan run --config ./examples/rag-ollama/scan.json
```

写出报告：

```bash
node packages/cli/dist/index.js scan run --config ./examples/basic-ollama/scan.json --output ./reports/basic.json
node packages/cli/dist/index.js scan run --config ./examples/basic-ollama/scan.json --report-format markdown --output ./reports/basic.md
node packages/cli/dist/index.js scan run --config ./examples/basic-ollama/scan.json --report-format sarif --output ./reports/basic.sarif.json
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

当提供 `baseline_path` 且文件存在时，默认只会在"新增 flagged"时失败（更适配 CI 逐步落地）。

### SARIF + GitHub Code Scanning

生成 SARIF 报告并上传到 GitHub Code Scanning，可在仓库 Security 标签页直接查看扫描结果：

```yaml
name: nullbunny-sarif
on:
  push:

jobs:
  scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: br0ny4/nullbunny/apps/action@main
        with:
          config: ./examples/basic-ollama/scan.json
          report_format: sarif
          output: ./reports/results.sarif.json

      - uses: github/codeql-action/upload-sarif@v3
        with:
          sarif_file: ./reports/results.sarif.json
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

内置 OWASP LLM Top 10 starter pack：见 [owasp-llm-top10-pack.json](examples/extensions/owasp-llm-top10-pack.json) 与示例扫描配置 [scan.json](examples/owasp-ollama/scan.json)。

RAG 上下文污染攻击包：见 [rag-context-poisoning-pack.json](examples/extensions/rag-context-poisoning-pack.json) 与示例扫描配置 [scan.json](examples/rag-ollama/scan.json)。

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

使用 HAR 进行黑盒扫描（示例配置在 `examples/web-scan/scan.json`）：

```bash
node packages/cli/dist/index.js web scan --config ./examples/web-scan/scan.json --output ./reports/web-scan.json
```
