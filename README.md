# NullBunny

[![CI](https://github.com/br0ny4/nullbunny/actions/workflows/ci.yml/badge.svg)](https://github.com/br0ny4/nullbunny/actions/workflows/ci.yml)
![License](https://img.shields.io/badge/license-MIT-green)

NullBunny 是一个 Node.js/TypeScript 的综合性红队自动化渗透测试框架，覆盖 LLM 安全、Web 漏洞、CI 安全门禁等场景，可用于本地自测或 CI Gate。

> 🤖 本项目由 [Trae](https://www.trae.ai/) + AI 全程自动化编写，从架构设计、代码实现到测试验证均由 AI 驱动完成。

## ✨ 亮点

NullBunny 在传统 Web 渗透测试的基础上，**率先深度覆盖 AI 应用安全**：

- **LLM 红队扫描** — 内置 OWASP LLM Top 10 攻击包，支持 Prompt Injection、潜伏式多轮越狱、敏感数据泄露、越权等自动化检测
- **RAG 上下文污染** — 独家 RAG Context Poisoning 攻击包（18 用例 / 5 大类），覆盖文档注入、检索操纵、嵌入混淆、来源伪造、RAG 投毒
- **Agentic AI 攻击** — 独家 Agentic AI 攻击包（21 用例 / 5 大类），覆盖工具滥用、权限提升、数据窃取、安全绕过
- **AI 黑盒渗透** — 从 HAR 流量自动识别 LLM 接口，注入攻击 payload 并判定响应，无需源码
- **多模型 Provider** — 原生支持 Ollama / OpenAI-compatible / Anthropic / DeepSeek / Gemini / Azure OpenAI / SiliconFlow / Groq / Together / Mistral / OpenRouter / Alibaba / Volcengine / Tencent / Perplexity / xAI / Cohere 等 17 种 Provider 开箱即用

## 功能

- **Web GUI**：提供极客风的现代化控制台，直观展示扫描进度、性能指标和历史报告，并支持可视化配置大模型 API Key
- **Scans**：按配置文件批量执行攻击用例并进行判定（judge）
- **Web Vuln Scan**：传统 Web 漏洞探测（XXE / XSS / SQLi / SSRF / Path Traversal / CMDi / 文件上传 / IDOR 越权），基于 HAR 端点自动注入 payload
- **Web 被动扫描**：无头浏览器登录并录制 HAR，AI 黑盒扫描
- **Providers**：原生接入支持 17 种 LLM 提供商（Ollama, OpenAI-compatible, Anthropic, DeepSeek, Gemini, Azure OpenAI, SiliconFlow, Groq, Together, Mistral, OpenRouter, Alibaba, Volcengine, Tencent, Perplexity, xAI, Cohere）
- **Reports**：输出 JSON / Markdown / SARIF 报告（SARIF 可直接导入 GitHub Code Scanning）
- **Extensions**：通过 manifest 加载外部攻击/判定插件包（方便社区贡献）
- **Attack Packs**：内置 OWASP LLM Top 10、RAG 上下文污染、Agentic AI 攻击包
- **GitHub Action**：在 PR/Push 时运行扫描并归档报告，支持 Baseline 增量策略

## 终极目标与演进策略

NullBunny 的终极目标是成为一个 **开箱即用、可持续演进、可直接接入企业 CI/CD 的 AI + Web 红队自动化框架**。  
不仅要“能扫”，还要做到：
- 对研发友好：默认配置可快速起步，低学习成本
- 对安全团队友好：结果可复现、可追踪、可基线化治理
- 对企业平台友好：可标准化接入 GitHub/GitLab/Jenkins 等流水线
- 对生态友好：攻击包、判定器、Provider、MCP 能独立扩展

## 当前能力快照 (2026)

### 核心能力（已可用）
- [x] 扫描引擎：JSON 配置驱动、判定规则、JSON/Markdown/SARIF 报告
- [x] AI 安全：OWASP LLM Top 10 + RAG 上下文污染 + Agentic AI 攻击包
- [x] Web 安全：HAR 录制/分析、黑盒扫描、XXE/XSS/SQLi/SSRF/Path Traversal/CMDi/文件上传
- [x] 资产发现：子域枚举、端口扫描、Banner 与中间件识别
- [x] GUI 控制台：任务编排、实时日志/指标、报告查看、Marketplace 扩展
- [x] 工程集成：GitHub Action、Baseline 增量阻断、SARIF 对接 Code Scanning
- [x] 生态扩展：Manifest 插件机制 + MCP 服务化能力

### 在途优化（短期）
- [ ] Web AI 黑盒扫描的端点识别与参数推断增强（适配更多非标准 API）
- [ ] 发布体验优化（`npm -g` + 跨平台安装脚本）

## 长期可持续 TODO 路线图

> 参考 GitHub 优秀安全项目（如 Nuclei、Trivy、Semgrep、OWASP ZAP）的长期演进经验：  
> **规则先行、结果可治理、发布可回滚、生态可共建、质量可量化**。

案例仓库（用于对标功能演进与工程治理）：
- Nuclei: https://github.com/projectdiscovery/nuclei
- Trivy: https://github.com/aquasecurity/trivy
- Semgrep: https://github.com/semgrep/semgrep
- OWASP ZAP: https://github.com/zaproxy/zaproxy

### Phase 1（0-3 个月）稳定性与可用性优先
- [ ] **核心引擎稳定化**：统一 `scan/web/recon` 事件模型，沉淀 `NB_EVENT` v1 schema（含版本号与兼容策略）
- [ ] **规则质量门禁**：为攻击包新增 lint + 回归测试语料，避免“规则更新即引入噪音”
- [ ] **GUI 性能优化**：Dashboard 图表组件级懒加载、路由高亮、最小前端测试基建（Vitest + RTL）
- [ ] **CI 可信度增强**：新增“结果可重放”命令（基于输入快照复跑），保证审计可复现
- [ ] **发布工程化**：建立 changelog/release notes 模板，固定每两周小版本节奏

### Phase 2（3-6 个月）企业接入与策略治理
- [ ] **策略中心**：支持按业务线配置风险阈值、白名单、豁免过期时间（exception TTL）
- [ ] **多环境基线**：支持 `dev/staging/prod` 独立 baseline，减少跨环境误报干扰
- [ ] **报告治理增强**：报告加入“修复建议 + 证据链 + 复测建议”三段式结构
- [ ] **平台集成拓展**：补齐 GitLab CI/Jenkins 模板与文档，对齐企业落地路径
- [ ] **凭据与密钥安全**：Provider 配置支持本地加密存储和 Secret 扫描联动

### Phase 3（6-12 个月）生态化与标准化
- [ ] **规则生态市场**：建立官方/社区规则分层与签名校验机制（可信分发）
- [ ] **插件开发者体验**：发布 `Plugin SDK` 模板仓库、示例测试夹具、版本兼容矩阵
- [ ] **MCP 深度集成**：完善“扫描即服务”能力，支持多 Agent 编排和任务租户隔离
- [ ] **标准映射**：将发现项映射到 CWE/OWASP ASVS/LLM Top 10，提升合规可读性
- [ ] **性能基准体系**：建立公开 benchmark（扫描耗时、误报率、规则覆盖率）并持续发布趋势

## 可持续执行机制（避免 TODO 失效）

- [ ] **双周迭代**：每 2 周滚动更新路线图状态（Done/In Progress/Blocked）
- [ ] **版本纪律**：遵循 SemVer，破坏性变更必须附迁移指南
- [ ] **质量闸门**：新增功能必须同时满足类型检查、单测、关键 E2E 冒烟
- [ ] **文档即交付**：功能合入必须同步 README + 示例配置 + CI 用例
- [ ] **数据化决策**：以误报率、扫描耗时、CI 阻断准确率作为优先级依据

## 发布与变更管理

- 变更记录：`CHANGELOG.md`
- 发布模板：`.github/release_template.md`
- 发布流程：`docs/release-process.md`（默认双周迭代）

## 快速开始（本地）

### 🖥️ 启动 Web GUI 控制台

```bash
pnpm install
pnpm build
node packages/cli/dist/index.js web gui
```

启动后即可在浏览器中访问：**[http://localhost:3001](http://localhost:3001)** 体验可视化的渗透测试流程！

GUI 运行时会在本地创建与维护这些目录/文件（便于排障与归档）：
- 任务与日志：`.data/gui/tasks.json`
- GUI 设置（含 Marketplace 启用的 manifest 列表）：`.data/gui/settings.json`
- 报告目录（Reports 页面会从这里读取并支持查看/下载）：`./reports`

GUI 的实时更新通过 WebSocket 通道实现：
- WebSocket：`ws://localhost:3001/ws`（浏览器侧会自动连）
- 兼容事件流：`GET /api/tasks/:id/events`（SSE）

### 💻 CLI 命令行使用

**安装与构建：**

```bash
pnpm install
pnpm build
pnpm typecheck
pnpm test
```

**查看支持的 Provider：**

```bash
node packages/cli/dist/index.js providers list
```

**Provider 连通性检查：**

```bash
node packages/cli/dist/index.js providers test --provider ollama --model qwen2.5:7b
node packages/cli/dist/index.js providers test --provider gemini --model gemini-2.0-flash
node packages/cli/dist/index.js providers test --provider azure-openai --base-url https://my-resource.openai.azure.com --model gpt-4o
node packages/cli/dist/index.js providers test --provider openai-compatible --base-url http://127.0.0.1:8000/v1 --model local-model
node packages/cli/dist/index.js providers test --provider siliconflow --model deepseek-ai/DeepSeek-V3
node packages/cli/dist/index.js providers test --provider groq --model llama3-8b-8192
node packages/cli/dist/index.js providers test --provider alibaba --model qwen-max
```

`providers list` 会输出每个 Provider 的默认 `baseUrl` 以及对应的 API Key 环境变量，便于在本地和 CI 中快速对照配置。

运行 LLM 安全扫描：

```bash
node packages/cli/dist/index.js scan run --config ./examples/basic-ollama/scan.json
node packages/cli/dist/index.js scan run --config ./examples/basic-ollama/scan.json --json-events true
node packages/cli/dist/index.js scan run --config ./examples/basic-openai-compatible/scan.json
node packages/cli/dist/index.js scan run --config ./examples/basic-anthropic/scan.json
node packages/cli/dist/index.js scan run --config ./examples/basic-deepseek/scan.json
node packages/cli/dist/index.js scan run --config ./examples/owasp-ollama/scan.json
node packages/cli/dist/index.js scan run --config ./examples/rag-ollama/scan.json
```

`--json-events true` 会把结构化事件按单行输出打印出来（前缀为 `NB_EVENT`），可用于 GUI / CI / 其他 Agent 消费进度与结果。  
当前统一为 `NB_EVENT v1` 包裹结构（`version/source/eventType/timestamp/payload`），并在 `compat.rawType` 中保留历史事件类型用于兼容：

```bash
node packages/cli/dist/index.js scan run --config ./examples/basic-ollama/scan.json --json-events true | grep '^NB_EVENT '
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
  --json-events true \
  --output ./reports/recon.json
```

运行 Web 漏洞扫描：

```bash
node packages/cli/dist/index.js web vuln-scan --config ./examples/web-vuln-scan/scan.json --output ./reports/vuln-scan.json
node packages/cli/dist/index.js web vuln-scan --config ./examples/web-vuln-scan/scan.json --report-format markdown --output ./reports/vuln-scan.md
node packages/cli/dist/index.js web vuln-scan --config ./examples/web-vuln-scan/scan.json --report-format sarif --output ./reports/vuln-scan.sarif.json
node packages/cli/dist/index.js web vuln-scan --config ./examples/web-vuln-scan/scan.json --json-events true --output ./reports/vuln-scan.json
node packages/cli/dist/index.js web scan --config ./examples/web-scan/scan.json --json-events true --output ./reports/web-scan.json
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

### Marketplace（GUI 扩展市场）

Web GUI 内置 Marketplace 页面，会扫描本地 manifest 并提供启用/禁用开关：
- 默认扫描目录：`examples/extensions`
- 可追加扫描目录：在 `.data/gui/settings.json` 中配置 `pluginDirs: string[]`
- 启用的 manifest 列表：`.data/gui/settings.json` 中 `enabledManifests: string[]`

当你在 GUI 中发起 LLM 扫描任务时，GUI server 会把 `enabledManifests` 自动注入到运行时 config 的 `bridge.manifestPaths`（写入临时 config 后执行 CLI），从而做到“在市场启用插件 → 下一次扫描立即生效”。

Marketplace 后端 API：
- `GET /api/plugins`
- `POST /api/plugins/enable` body: `{ "path": "<manifestPath>" }`
- `POST /api/plugins/disable` body: `{ "path": "<manifestPath>" }`

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
- `--same-origin`：是否仅爬取同源链接，默认 true（设为 false 可跨域），取值 true/false
- `--timeout-ms`：页面加载超时时间
- `--output`：输出文件路径

一键爬取 + 漏洞扫描（无需 HAR 文件）：

```bash
node packages/cli/dist/index.js web vuln-scan --crawl-url https://example.com --vulns xxe,xss,sqli --output ./reports/vuln-scan.json
node packages/cli/dist/index.js web vuln-scan --crawl-url https://example.com --vulns xxe,xss,sqli,ssrf,path-traversal,cmdi,file-upload --max-depth 3 --max-pages 50
```
