# NullBunny

[![CI](https://github.com/br0ny4/nullbunny/actions/workflows/ci.yml/badge.svg)](https://github.com/br0ny4/nullbunny/actions/workflows/ci.yml)
![License](https://img.shields.io/badge/license-MIT-green)

NullBunny 是一个 Node.js/TypeScript 的综合性红队自动化渗透测试框架，覆盖 LLM 安全、Web 漏洞、CI 安全门禁等场景，可用于本地自测或 CI Gate。

> 🤖 本项目由 [Trae](https://www.trae.ai/) + AI 全程自动化编写，从架构设计、代码实现到测试验证均由 AI 驱动完成。

## ✨ 亮点

NullBunny 在传统 Web 渗透测试的基础上，**率先深度覆盖 AI 应用安全**：

- **LLM 红队扫描** — 内置 OWASP LLM Top 10 攻击包，支持 Prompt Injection、敏感数据泄露、越权等自动化检测
- **RAG 上下文污染** — 独家 RAG Context Poisoning 攻击包（18 用例 / 5 大类），覆盖文档注入、检索操纵、嵌入混淆、来源伪造
- **Agentic AI 攻击** — 独家 Agentic AI 攻击包（21 用例 / 5 大类），覆盖工具滥用、权限提升、数据窃取、安全绕过
- **AI 黑盒渗透** — 从 HAR 流量自动识别 LLM 接口，注入攻击 payload 并判定响应，无需源码
- **多模型 Provider** — Ollama / OpenAI-compatible / Anthropic (Claude) / DeepSeek / 硅基流动 等开箱即用

## 功能

- **Scans**：按配置文件批量执行攻击用例并进行判定（judge）
- **Web Vuln Scan**：传统 Web 漏洞探测（XXE / XSS / SQLi / SSRF / Path Traversal / CMDi / 文件上传），基于 HAR 端点自动注入 payload
- **Web 被动扫描**：无头浏览器登录并录制 HAR，AI 黑盒扫描
- **Providers**：支持 Ollama、OpenAI-compatible、Anthropic (Claude)、DeepSeek 端点
- **Reports**：输出 JSON / Markdown / SARIF 报告（SARIF 可直接导入 GitHub Code Scanning）
- **Extensions**：通过 manifest 加载外部攻击/判定插件包（方便社区贡献）
- **Attack Packs**：内置 OWASP LLM Top 10、RAG 上下文污染、Agentic AI 攻击包
- **GitHub Action**：在 PR/Push 时运行扫描并归档报告，支持 Baseline 增量策略

## 功能与路线图 (TODO)

NullBunny 致力于打造一个"开箱即用"且"适配企业 CI"的综合性红队自动化渗透测试框架。以下是我们的功能完成情况与演进计划：

### 🟢 已完成 (Done)
- **核心扫描引擎**
  - [x] 基于 JSON 的扫描配置驱动 (`scan.json`)
  - [x] 支持多种判定规则 (Keyword / Allow-all)
  - [x] 多种格式的报告输出 (JSON / Markdown / SARIF)
  - [x] 扫描配置支持 `${ENV_VAR}` 环境变量插值（安全传递 API Key）
- **LLM / AI 安全（🌟 亮点）**
  - [x] OWASP LLM Top 10 攻击包（10 类攻击，中英双语）
  - [x] RAG 上下文污染攻击包（18 用例 / 5 大类：文档注入、检索操纵、上下文溢出、嵌入混淆、来源伪造）
  - [x] Agentic AI 攻击包（21 用例 / 5 大类：工具滥用、权限提升、数据窃取、提示注入、安全绕过）
  - [x] AI 黑盒扫描：从 HAR 自动识别 LLM 接口并注入攻击
  - [x] 自定义 API 形态检测（prompt / query / message 字段）
  - [x] 自动生成可复现的 curl（默认脱敏 header）
- **多模型 Provider**
  - [x] 支持本地 Ollama 接口连通性测试与生成
  - [x] 支持 OpenAI 兼容接口（含硅基流动等国内平台）
  - [x] 支持 Anthropic (Claude) Messages API 原生接口
  - [x] 支持 DeepSeek API 原生接口
- **Web 渗透测试**
  - [x] 基于无头浏览器 (Playwright) 的自动化登录与会话保持
  - [x] 自动录制 HAR 流量包以供离线分析
  - [x] XXE (XML External Entity) 检测
  - [x] XSS (Cross-Site Scripting) 反射型检测
  - [x] SQLi (SQL Injection) 错误/时间/布尔盲注检测
  - [x] SSRF (Server-Side Request Forgery) 检测
  - [x] Path Traversal 路径穿越检测
  - [x] CMDi (Command Injection) 命令注入检测
  - [x] 文件上传漏洞检测
  - [x] 反序列化漏洞检测
  - [x] 自动对 GET 端点尝试 POST + 多种 Content-Type 注入
  - [x] Web 爬虫模式（自动发现端点，无需 HAR）
- **扩展与生态**
  - [x] 插件化架构 (Plugin SDK)
  - [x] 通过 MCP Bridge 动态加载外部攻击/判定 Manifest
- **CI / CD 工程化**
  - [x] GitHub Action 封装 (`apps/action`)
  - [x] Baseline 增量扫描策略 (只对"新增风险"阻断流水线)
  - [x] SARIF 报告可直接导入 GitHub Code Scanning
  - [x] 项目自身的完整自动化测试与类型检查

### 🟡 开发中 (In Progress)
- **Web AI 黑盒扫描器增强**
  - [ ] 更强的"端点识别/参数推断"（适配非 OpenAI-compatible 形态）
- **分发与安装体验**
  - [ ] npm 全局包发布 (`npm install -g nullbunny`)
  - [ ] 提供跨平台的单文件安装脚本 (macOS/Linux/Windows)

### ⚪ 计划中 (Planned)
- **更多商业大模型原生支持**
  - [ ] Gemini API 原生支持
  - [ ] Azure OpenAI 原生支持
- **高级漏洞检测**
  - [x] 反序列化漏洞检测
- **进阶 Web 渗透**
  - [ ] 支持抓取 Chrome DevTools / mitmproxy 导出的第三方 HAR
  - [ ] Web 漏洞扫描支持更多注入点（Cookie、自定义 Header）
  - [x] Web 漏洞扫描支持爬虫模式（自动发现端点）
  - [ ] 认证绕过 / 权限提升自动化检测
- **基础设施安全**
  - [x] TCP 端口扫描与服务连通性探测
  - [x] 服务识别与 Banner 抓取
  - [x] 子域名枚举与字典解析
  - [x] 常见中间件默认配置检测（Tomcat, Spring Boot, Redis 等）

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
node packages/cli/dist/index.js providers test --provider deepseek --model deepseek-chat
```

运行 LLM 安全扫描：

```bash
node packages/cli/dist/index.js scan run --config ./examples/basic-ollama/scan.json
node packages/cli/dist/index.js scan run --config ./examples/basic-openai-compatible/scan.json
node packages/cli/dist/index.js scan run --config ./examples/basic-anthropic/scan.json
node packages/cli/dist/index.js scan run --config ./examples/basic-deepseek/scan.json
node packages/cli/dist/index.js scan run --config ./examples/owasp-ollama/scan.json
node packages/cli/dist/index.js scan run --config ./examples/rag-ollama/scan.json
```

运行资产发现（子域名枚举、端口扫描与中间件探测）：

```bash
node packages/cli/dist/index.js recon scan \
  --hosts 127.0.0.1 \
  --ports 22,80,443,6379,8080 \
  --subdomains example.com \
  --wordlist www,api,admin \
  --banner true \
  --detect-middleware true \
  --output ./reports/recon.json
```

运行 Web 漏洞扫描：

```bash
node packages/cli/dist/index.js web vuln-scan --config ./examples/web-vuln-scan/scan.json --output ./reports/vuln-scan.json
node packages/cli/dist/index.js web vuln-scan --config ./examples/web-vuln-scan/scan.json --report-format markdown --output ./reports/vuln-scan.md
node packages/cli/dist/index.js web vuln-scan --config ./examples/web-vuln-scan/scan.json --report-format sarif --output ./reports/vuln-scan.sarif.json
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

Agentic AI 攻击包：见 [agentic-ai-pack.json](examples/extensions/agentic-ai-pack.json) 与示例扫描配置 [scan.json](examples/agentic-ollama/scan.json)。

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

使用 HAR 进行 AI 黑盒扫描（示例配置在 `examples/web-scan/scan.json`）：

```bash
node packages/cli/dist/index.js web scan --config ./examples/web-scan/scan.json --output ./reports/web-scan.json
```

### Web 漏洞扫描（实验）

基于 HAR 中发现的端点，自动注入传统 Web 漏洞 payload 并检测：

```bash
node packages/cli/dist/index.js web vuln-scan --config ./examples/web-vuln-scan/scan.json --output ./reports/vuln-scan.json
node packages/cli/dist/index.js web vuln-scan --config ./examples/web-vuln-scan/scan.json --report-format markdown --output ./reports/vuln-scan.md
node packages/cli/dist/index.js web vuln-scan --config ./examples/web-vuln-scan/scan.json --report-format sarif --output ./reports/vuln-scan.sarif.json
```

支持的漏洞类型：XXE、XSS、SQLi、SSRF、Path Traversal、CMDi、文件上传。扫描器会自动对 GET 端点尝试 POST + 多种 Content-Type 注入。

### Web 爬虫模式（实验）

自动爬取目标网站，发现端点（链接和表单），无需手动录制 HAR：

```bash
node packages/cli/dist/index.js web crawl --url https://example.com --max-depth 2 --max-pages 20 --output ./reports/crawl.json
```

爬虫参数说明：
- `--url`：起始 URL（必填）
- `--max-depth`：最大爬取深度，默认 2
- `--max-pages`：最大爬取页面数，默认 20
- `--same-origin`：是否仅爬取同源链接，默认 true（设为 false 可跨域）
- `--timeout-ms`：页面加载超时时间
- `--output`：输出文件路径

一键爬取 + 漏洞扫描（无需 HAR 文件）：

```bash
node packages/cli/dist/index.js web vuln-scan --crawl-url https://example.com --vulns xxe,xss,sqli --output ./reports/vuln-scan.json
node packages/cli/dist/index.js web vuln-scan --crawl-url https://example.com --vulns xxe,xss,sqli,ssrf,path-traversal,cmdi,file-upload --max-depth 3 --max-pages 50
```
