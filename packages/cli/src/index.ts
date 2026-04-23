declare const process: {
  argv: string[];
  env: Record<string, string | undefined>;
  exitCode?: number;
};

// Temporary until workspace dependencies are installed in this environment.
// @ts-ignore
import { mkdir, readFile, writeFile } from "node:fs/promises";
// Temporary until workspace dependencies are installed in this environment.
// @ts-ignore
import { dirname } from "node:path";
// Temporary source import while the workspace package build pipeline is still minimal.
// @ts-ignore
import { runAction } from "@nullbunny/action-app";
// Temporary source import while the workspace package build pipeline is still minimal.
// @ts-ignore
import {
  formatScanRun,
  loadScanConfig,
  normalizeNbEventType,
  runScan,
  type NbEventSource,
} from "@nullbunny/core";
// Temporary source import while the workspace package build pipeline is still minimal.
// @ts-ignore
import { renderReport, type ReportFormat } from "@nullbunny/reporters";
// Temporary source import while the workspace package build pipeline is still minimal.
// @ts-ignore
import {
  createProvider,
  formatHealthCheck,
  listSupportedProviders,
  type ProviderConfig,
  type ProviderType,
} from "@nullbunny/providers";
import { runReconScan } from "@nullbunny/recon";

export interface CliResult {
  exitCode: number;
  output: string;
}

export type { NbEventSource } from "@nullbunny/core";

export interface NbEventV1 {
  version: "1.0";
  source: NbEventSource;
  eventType: string;
  timestamp: string;
  payload: Record<string, unknown>;
  compat: {
    rawType: string;
  };
}

export function createCli() {
  return {
    name: "nullbunny",
    run: runCli,
  };
}

export function toNbEventV1(
  source: NbEventSource,
  rawEvent: unknown,
): NbEventV1 {
  const payload = isRecord(rawEvent)
    ? (rawEvent as Record<string, unknown>)
    : { value: rawEvent };
  const rawType = typeof payload.type === "string" ? payload.type : "event";
  const eventType = normalizeNbEventType(source, rawType);

  return {
    version: "1.0",
    source,
    eventType,
    timestamp: new Date().toISOString(),
    payload,
    compat: {
      rawType,
    },
  };
}

export async function runCli(
  argv: string[] = process.argv.slice(2),
): Promise<CliResult> {
  const [group, command, ...rest] = argv;

  if (group === "mcp" && command === "start") {
    const { startMcpServer } = await import("@nullbunny/mcp-server");
    await startMcpServer();
    return { exitCode: 0, output: "MCP server running" };
  }

  if (group === "providers" && command === "test") {
    const flags = parseFlags(rest);
    const config = buildProviderConfig(flags);
    const status = await createProvider(config).healthCheck();
    const output = formatHealthCheck(status);

    if (status.ok) {
      console.log(output);
      return { exitCode: 0, output };
    }

    console.error(output);
    return { exitCode: 1, output };
  }

  if (group === "providers" && command === "list") {
    const output = formatProviderCatalog();
    console.log(output);
    return { exitCode: 0, output };
  }

  if (group === "scan" && command === "run") {
    const flags = parseFlags(rest);
    const configPath = readRequiredFlag(flags, "config");
    const baselinePath = readStringFlag(flags, "baseline");
    const jsonEvents =
      flags["json-events"] === true || flags["json-events"] === "true";
    const config = await loadScanConfig(configPath);
    const result = await runScan(
      config,
      jsonEvents
        ? {
            onEvent(event) {
              emitNbEvent("scan", event);
            },
          }
        : undefined,
    );
    const output = formatScanRun(result);
    const reportFormat = readReportFormat(flags);
    const outputPath = readStringFlag(flags, "output");

    if (outputPath) {
      await writeReportFile(outputPath, renderReport(result, reportFormat));
    }

    if (result.summary.errors > 0 || result.provider.ok === false) {
      console.error(output);
      return { exitCode: 1, output };
    }

    const newFlagged = await countNewFlagged(result as any, baselinePath);
    if (baselinePath) {
      const baselineLine = `baseline: ${baselinePath} new-flagged=${newFlagged}`;
      console.log(`${output}\n${baselineLine}`);
      return { exitCode: newFlagged > 0 ? 2 : 0, output: `${output}\n${baselineLine}` };
    }

    console.log(output);
    return { exitCode: result.summary.flagged > 0 ? 2 : 0, output };
  }

  if (group === "action" && command === "run") {
    const flags = parseFlags(rest);
    const configPath = readRequiredFlag(flags, "config");
    const archiveDir = readStringFlag(flags, "archive-dir");
    const reportFormat = readReportFormat(flags);
    const actionResult = await runAction({
      configPath,
      archiveDir,
      reportFormat,
    });

    const archiveMessage = `${actionResult.consoleOutput}\narchive: ${actionResult.archivePath}`;
    if (actionResult.exitCode > 0) {
      console.error(archiveMessage);
      return { exitCode: actionResult.exitCode, output: archiveMessage };
    }

    console.log(archiveMessage);
    return { exitCode: actionResult.exitCode, output: archiveMessage };
  }

  if (group === "recon" && command === "scan") {
    const flags = parseFlags(rest);
    const hostsValue = readStringFlag(flags, "hosts") ?? "127.0.0.1";
    const portsValue = readRequiredFlag(flags, "ports");
    const timeoutValue = readStringFlag(flags, "timeout-ms");
    const timeoutMs = timeoutValue ? Number.parseInt(timeoutValue, 10) : 2000;
    const grabBanner = readStringFlag(flags, "banner") === "true";
    const detectMiddleware = readStringFlag(flags, "detect-middleware") === "true";
    const subdomainsDomain = readStringFlag(flags, "subdomains");
    const wordlistValue = readStringFlag(flags, "wordlist");
    const outputPath = readStringFlag(flags, "output");
    const reportFormat = readReportFormat(flags);

    const jsonEvents = flags["json-events"] === true || flags["json-events"] === "true";
    const onEvent = jsonEvents ? (event: any) => emitNbEvent("recon", event) : undefined;

    const hosts = hostsValue
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);

    let subdomains: { domain: string; wordlist: string[] } | undefined;
    if (subdomainsDomain) {
      const wordlist = wordlistValue
        ? wordlistValue.split(",").map((w) => w.trim()).filter(Boolean)
        : ["www", "api", "dev", "test", "staging", "admin", "mail", "blog"];
      subdomains = { domain: subdomainsDomain, wordlist };
    }

    const result = await runReconScan({
      scanId: `recon-${Date.now()}`,
      target: hosts.join(","),
      hosts,
      ports: portsValue,
      timeoutMs,
      grabBanner,
      detectMiddleware,
      subdomains,
    }, { onEvent });

    const output = JSON.stringify(result, null, 2);

    if (outputPath) {
      const { renderReconReport } = await import("@nullbunny/reporters");
      await writeReportFile(outputPath, renderReconReport(result, reportFormat));
    }

    console.log(output);
    return { exitCode: result.summary.open > 0 ? 2 : 0, output };
  }

  if (group === "web" && command === "record-har") {
    const flags = parseFlags(rest);
    const url = readRequiredFlag(flags, "url");
    const harPath = readRequiredFlag(flags, "har");
    const stepsPath = readStringFlag(flags, "steps");
    const headed = readStringFlag(flags, "headed") === "true";
    const finalWaitValue = readStringFlag(flags, "final-wait-ms");
    const finalWaitMs = finalWaitValue ? Number.parseInt(finalWaitValue, 10) : undefined;

    const { recordHar } = await import("@nullbunny/web");
    await recordHar({
      url,
      harPath,
      stepsPath,
      headed,
      finalWaitMs,
    });

    const output = `har: ${harPath}`;
    console.log(output);
    return { exitCode: 0, output };
  }

  if (group === "web" && command === "analyze-har") {
    const flags = parseFlags(rest);
    const harPath = readRequiredFlag(flags, "har");
    const { analyzeHar } = await import("@nullbunny/web");
    const result = await analyzeHar(harPath);
    const output = JSON.stringify(result, null, 2);
    console.log(output);
    return { exitCode: 0, output };
  }

  if (group === "web" && command === "scan") {
    const flags = parseFlags(rest);
    const configPath = readRequiredFlag(flags, "config");
    const baselinePath = readStringFlag(flags, "baseline");
    const reportFormat = readReportFormat(flags);
    const outputPath = readStringFlag(flags, "output");
    const jsonEvents = flags["json-events"] === true || flags["json-events"] === "true";

    const { loadWebScanConfig, runWebScan } = await import("@nullbunny/web");
    const config = await loadWebScanConfig(configPath);
    if (jsonEvents) {
      emitNbEvent("web", {
        type: "web_scan_start",
        scanId: config.id,
        target: config.target,
      });
    }
    const result = await runWebScan(config);
    if (jsonEvents) {
      emitNbEvent("web", {
        type: "web_scan_end",
        scanId: result.scanId,
        target: result.target,
        summary: result.summary,
      });
    }
    const output = formatScanRun(result as any);

    if (outputPath) {
      await writeReportFile(outputPath, renderReport(result as any, reportFormat));
    }

    if (result.summary.errors > 0 || result.provider.ok === false) {
      console.error(output);
      return { exitCode: 1, output };
    }

    const newFlagged = await countNewFlagged(result as any, baselinePath);
    if (baselinePath) {
      const baselineLine = `baseline: ${baselinePath} new-flagged=${newFlagged}`;
      console.log(`${output}\n${baselineLine}`);
      return { exitCode: newFlagged > 0 ? 2 : 0, output: `${output}\n${baselineLine}` };
    }

    console.log(output);
    return { exitCode: result.summary.flagged > 0 ? 2 : 0, output };
  }

  if (group === "web" && command === "crawl") {
    const flags = parseFlags(rest);
    const url = readRequiredFlag(flags, "url");
    const maxDepthValue = readStringFlag(flags, "max-depth");
    const maxDepth = maxDepthValue ? Number.parseInt(maxDepthValue, 10) : 2;
    const maxPagesValue = readStringFlag(flags, "max-pages");
    const maxPages = maxPagesValue ? Number.parseInt(maxPagesValue, 10) : 20;
    const sameOriginValue = readStringFlag(flags, "same-origin");
    const sameOriginOnly = sameOriginValue !== "false";
    const timeoutValue = readStringFlag(flags, "timeout-ms");
    const timeoutMs = timeoutValue ? Number.parseInt(timeoutValue, 10) : undefined;
    const outputPath = readStringFlag(flags, "output");

    const { crawlWebsite } = await import("@nullbunny/web");
    const result = await crawlWebsite({
      id: `crawl-${Date.now()}`,
      target: new URL(url).host,
      startUrl: url,
      maxDepth,
      maxPages,
      sameOriginOnly,
      timeoutMs,
    });

    const output = JSON.stringify(result, null, 2);

    if (outputPath) {
      await writeReportFile(outputPath, output);
    }

    console.log(output);
    return { exitCode: 0, output };
  }

  if (group === "web" && command === "vuln-scan") {
    const flags = parseFlags(rest);
    const crawlUrl = readStringFlag(flags, "crawl-url");
    const reportFormat = readReportFormat(flags);
    const outputPath = readStringFlag(flags, "output");
    const jsonEvents = flags["json-events"] === true || flags["json-events"] === "true";

    const onEvent = jsonEvents ? (event: any) => emitNbEvent("web", event) : undefined;

    if (crawlUrl) {
      const vulnsValue = readStringFlag(flags, "vulns");
      const vulnTypes = vulnsValue ? vulnsValue.split(",").map((v) => v.trim()) : ["xxe", "xss", "sqli", "ssrf", "path-traversal", "cmdi", "file-upload"];
      const maxDepthValue = readStringFlag(flags, "max-depth");
      const maxDepth = maxDepthValue ? Number.parseInt(maxDepthValue, 10) : 2;
      const maxPagesValue = readStringFlag(flags, "max-pages");
      const maxPages = maxPagesValue ? Number.parseInt(maxPagesValue, 10) : 20;
      const timeoutValue = readStringFlag(flags, "timeout-ms");
      const timeoutMs = timeoutValue ? Number.parseInt(timeoutValue, 10) : undefined;

      const { crawlWebsite, crawlToHarEndpoints, runWebVulnScanFromEndpoints } = await import("@nullbunny/web");
      const crawlResult = await crawlWebsite({
        id: `crawl-${Date.now()}`,
        target: new URL(crawlUrl).host,
        startUrl: crawlUrl,
        maxDepth,
        maxPages,
        sameOriginOnly: true,
        timeoutMs,
      });

      const harEndpoints = crawlToHarEndpoints(crawlResult.endpoints);
      const vulns = vulnTypes.map((type) => ({ type } as import("@nullbunny/web").WebVulnScanEntry));
      const result = await runWebVulnScanFromEndpoints(
        crawlResult.id,
        crawlResult.target,
        harEndpoints,
        vulns,
        timeoutMs,
        { onEvent }
      );

      const output = JSON.stringify(result, null, 2);

      if (outputPath) {
        const { renderWebVulnScanReport } = await import("@nullbunny/reporters");
        await writeReportFile(outputPath, renderWebVulnScanReport(result, reportFormat));
      }

      if (result.summary.critical > 0 || result.summary.high > 0) {
        console.error(output);
        return { exitCode: 2, output };
      }

      console.log(output);
      return { exitCode: result.summary.total > 0 ? 1 : 0, output };
    }

    const configPath = readRequiredFlag(flags, "config");

    const { loadWebVulnScanConfig, runWebVulnScan } = await import("@nullbunny/web");
    const config = await loadWebVulnScanConfig(configPath);
    const result = await runWebVulnScan(config, { onEvent });
    const output = JSON.stringify(result, null, 2);

    if (outputPath) {
      const { renderWebVulnScanReport } = await import("@nullbunny/reporters");
      await writeReportFile(outputPath, renderWebVulnScanReport(result, reportFormat));
    }

    if (result.summary.critical > 0 || result.summary.high > 0) {
      console.error(output);
      return { exitCode: 2, output };
    }

    console.log(output);
    return { exitCode: result.summary.total > 0 ? 1 : 0, output };
  }

  if (group === "web" && command === "gui") {
    const { spawn } = await import("node:child_process");
    const { fileURLToPath } = await import("node:url");
    const { dirname, join } = await import("node:path");

    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    const rootDir = join(__dirname, "../../../");

    const serverPath = join(rootDir, "apps/gui/server/index.js");
    
    console.log("Starting NullBunny Web GUI on http://localhost:3001 ...");

    const serverProcess = spawn("node", [serverPath], {
      stdio: "inherit",
      cwd: join(rootDir, "apps/gui"),
      env: { ...process.env, PORT: "3001" }
    });

    await new Promise(() => {
      // Keep process alive
    });
    
    return { exitCode: 0, output: "GUI Closed" };
  }

  const output = helpText();
  console.log(output);
  return { exitCode: 0, output };
}

function buildProviderConfig(
  flags: Record<string, string | boolean>,
): ProviderConfig {
  const provider = readRequiredFlag(flags, "provider") as ProviderType;
  const model = readStringFlag(flags, "model");
  const timeoutValue = readStringFlag(flags, "timeout-ms");
  const timeoutMs = timeoutValue ? Number.parseInt(timeoutValue, 10) : undefined;

  if (provider === "ollama") {
    return {
      id: readStringFlag(flags, "id") ?? "ollama-local",
      type: "ollama",
      baseUrl:
        readStringFlag(flags, "base-url") ?? "http://127.0.0.1:11434",
      model,
      timeoutMs,
    };
  }

  if (provider === "openai-compatible") {
    return {
      id: readStringFlag(flags, "id") ?? "openai-compatible-local",
      type: "openai-compatible",
      baseUrl:
        readStringFlag(flags, "base-url") ?? "http://127.0.0.1:8000/v1",
      model,
      apiKey: readStringFlag(flags, "api-key") ?? process.env.OPENAI_API_KEY,
      timeoutMs,
    };
  }

  if (provider === "anthropic") {
    return {
      id: readStringFlag(flags, "id") ?? "anthropic",
      type: "anthropic",
      baseUrl:
        readStringFlag(flags, "base-url") ?? "https://api.anthropic.com",
      model,
      apiKey: readStringFlag(flags, "api-key") ?? process.env.ANTHROPIC_API_KEY,
      timeoutMs,
    };
  }

  if (provider === "deepseek") {
    return {
      id: readStringFlag(flags, "id") ?? "deepseek",
      type: "deepseek",
      baseUrl:
        readStringFlag(flags, "base-url") ?? "https://api.deepseek.com",
      model,
      apiKey: readStringFlag(flags, "api-key") ?? process.env.DEEPSEEK_API_KEY,
      timeoutMs,
    };
  }

  if (provider === "gemini") {
    return {
      id: readStringFlag(flags, "id") ?? "gemini",
      type: "gemini",
      baseUrl:
        readStringFlag(flags, "base-url") ?? "https://generativelanguage.googleapis.com",
      model,
      apiKey: readStringFlag(flags, "api-key") ?? process.env.GEMINI_API_KEY,
      timeoutMs,
    };
  }

  if (provider === "azure-openai") {
    return {
      id: readStringFlag(flags, "id") ?? "azure-openai",
      type: "azure-openai",
      baseUrl: readRequiredFlag(flags, "base-url"),
      model,
      apiKey: readStringFlag(flags, "api-key") ?? process.env.AZURE_OPENAI_API_KEY,
      timeoutMs,
    };
  }

  const standardProviders = new Map(
    listSupportedProviders()
      .filter((entry) => !["ollama", "openai-compatible", "anthropic", "deepseek", "gemini", "azure-openai"].includes(entry.type))
      .map((entry) => [entry.type, entry] as const),
  );

  if (standardProviders.has(provider)) {
    const pInfo = standardProviders.get(provider)!;
    return {
      id: readStringFlag(flags, "id") ?? provider,
      type: provider,
      baseUrl: readStringFlag(flags, "base-url") ?? pInfo.defaultBaseUrl,
      model,
      apiKey: pInfo.apiKeyEnv
        ? readStringFlag(flags, "api-key") ?? process.env[pInfo.apiKeyEnv]
        : readStringFlag(flags, "api-key"),
      timeoutMs,
    };
  }

  throw new Error(`Unsupported provider type: ${provider}`);
}

function parseFlags(args: string[]): Record<string, string | boolean> {
  const flags: Record<string, string | boolean> = {};

  for (let index = 0; index < args.length; index += 1) {
    const current = args[index];
    if (!current.startsWith("--")) {
      continue;
    }

    const key = current.slice(2);
    const next = args[index + 1];
    if (!next || next.startsWith("--")) {
      flags[key] = true;
      continue;
    }

    flags[key] = next;
    index += 1;
  }

  return flags;
}

function readRequiredFlag(
  flags: Record<string, string | boolean>,
  key: string,
): string {
  const value = readStringFlag(flags, key);
  if (!value) {
    throw new Error(`Missing required flag --${key}`);
  }

  return value;
}

function readStringFlag(
  flags: Record<string, string | boolean>,
  key: string,
): string | undefined {
  const value = flags[key];
  return typeof value === "string" ? value : undefined;
}

function readReportFormat(
  flags: Record<string, string | boolean>,
): ReportFormat {
  const value = readStringFlag(flags, "report-format");
  if (value === "markdown") {
    return "markdown";
  }

  if (value === "sarif") {
    return "sarif";
  }

  return "json";
}

async function writeReportFile(filePath: string, content: string): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, content, "utf8");
}

function emitNbEvent(source: NbEventSource, rawEvent: unknown): void {
  console.log(`NB_EVENT ${JSON.stringify(toNbEventV1(source, rawEvent))}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function helpText(): string {
  const providerTypes = listSupportedProviders().map((entry) => entry.type).join(", ");
  return [
    "NullBunny CLI",
    "",
    "Usage:",
    "  nullbunny <group> <command> [flags]",
    "",
    "Groups:",
    "  mcp         Start MCP Server",
    "  providers   Manage and test LLM providers",
    "  scan        Run LLM security scans",
    "  action      Run as GitHub Action",
    "  web         Run Web AI and Vulnerability Scans",
    "  recon       Run Infrastructure Reconnaissance",
    "",
    "Commands:",
    "  mcp start        Start the NullBunny MCP Server on stdio",
    "  providers list   List supported providers and default endpoints",
    "  providers test   Test provider connectivity and model availability",
    "  scan run         Execute an LLM security scan",
    "  action run       Execute GitHub Action workflow",
    "  web record-har   Record a web browsing session to HAR using Playwright",
    "  web analyze-har  Analyze a HAR file to discover LLM API endpoints",
    "  web scan         Execute a Web AI scan based on HAR endpoints",
    "  web crawl        Crawl a website to discover endpoints automatically",
    "  web vuln-scan    Execute a Web vulnerability scan based on config or crawled endpoints",
    "  web gui          Start the Web GUI interface for NullBunny",
    "  recon scan       Execute port scanning, subdomain enumeration and banner grabbing",
    "",
    "Flags (providers test):",
    `  --provider <name>        Provider type (${providerTypes})`,
    "  --model <name>           Model identifier to test",
    "  --base-url <url>         Provider API base URL (required for azure-openai)",
    "  --api-key <key>          Provider API key",
    "",
    "Flags (scan run / action run):",
    "  --config <path>          Path to scan.json config file",
    "  --baseline <path>        Path to previous scan report (for incremental scan)",
    "  --output <path>          Path to write the report file",
    "  --report-format <type>   Report format (json, markdown, sarif) (default: json)",
    "  --json-events <bool>     Emit structured JSON events prefixed with NB_EVENT (true/false)",
    "  --archive-dir <path>     Directory to store archived reports (action only)",
    "",
    "Flags (recon scan):",
    "  --hosts <ips>            Comma-separated IPs/Hostnames (default: 127.0.0.1)",
    "  --ports <ranges>         Comma-separated ports/ranges (e.g. 80,443,8000-8080)",
    "  --subdomains <domain>    Domain for subdomain enumeration",
    "  --wordlist <words>       Comma-separated prefixes for enumeration",
    "  --banner <bool>          Whether to grab service banners (true/false)",
    "  --detect-middleware <bool> Whether to detect default middleware configs (true/false)",
    "  --output <path>          Path to write the report file",
    "  --report-format <type>   Report format (json, markdown, sarif) (default: json)",
    "  --json-events <bool>     Emit structured JSON events prefixed with NB_EVENT (true/false)",
    "",
    "Flags (web record-har):",
    "  --url <url>              Target URL to start recording",
    "  --har <path>             Path to output HAR file",
    "  --steps <path>           Optional JSON file with Playwright interaction steps",
    "  --headed <bool>          Run browser in headed mode (true/false)",
    "  --final-wait-ms <ms>     Wait time before closing browser",
    "",
    "Flags (web analyze-har):",
    "  --har <path>             Path to input HAR file",
    "",
    "Flags (web scan):",
    "  --config <path>          Path to web-scan.json config file",
    "  --baseline <path>        Path to previous web scan report",
    "  --output <path>          Path to write the report file",
    "  --report-format <type>   Report format (json, markdown, sarif) (default: json)",
    "  --json-events <bool>     Emit structured JSON events prefixed with NB_EVENT (true/false)",
    "",
    "Flags (web crawl):",
    "  --url <url>              Target URL to start crawling",
    "  --max-depth <num>        Maximum crawl depth (default: 2)",
    "  --max-pages <num>        Maximum pages to crawl (default: 20)",
    "  --same-origin <bool>     Crawl same-origin only (true/false) (default: true)",
    "  --timeout-ms <ms>        Timeout for crawler",
    "  --output <path>          Path to write crawl result JSON",
    "",
    "Flags (web vuln-scan):",
    "  --config <path>          Path to web-vuln-scan.json config file",
    "  --crawl-url <url>        Crawl and scan immediately without config file",
    "  --vulns <types>          Comma-separated vulnerability types to test (e.g. xxe,xss,sqli)",
    "  --max-depth <num>        Maximum crawl depth if using --crawl-url",
    "  --max-pages <num>        Maximum pages to crawl if using --crawl-url",
    "  --timeout-ms <ms>        Timeout for requests",
    "  --output <path>          Path to write the report file",
    "  --report-format <type>   Report format (json, markdown, sarif) (default: json)",
    "  --json-events <bool>     Emit structured JSON events prefixed with NB_EVENT (true/false)",
    "",
    "Examples:",
    "  node packages/cli/dist/index.js web gui",
    "  node packages/cli/dist/index.js mcp start",
    "  node packages/cli/dist/index.js providers list",
    "  node packages/cli/dist/index.js providers test --provider ollama --model qwen2.5:7b",
    "  node packages/cli/dist/index.js providers test --provider gemini --model gemini-2.0-flash",
    "  node packages/cli/dist/index.js scan run --config ./examples/basic-ollama/scan.json",
    "  node packages/cli/dist/index.js scan run --config ./examples/basic-ollama/scan.json --report-format markdown --output ./reports/basic.md",
    "  node packages/cli/dist/index.js scan run --config ./examples/basic-ollama/scan.json --report-format sarif --output ./reports/basic.sarif.json",
    "  node packages/cli/dist/index.js scan run --config ./examples/basic-ollama/scan.json --baseline ./reports/baseline.json",
    "  node packages/cli/dist/index.js action run --config ./examples/basic-ollama/scan.json --archive-dir ./reports/archive",
    "  node packages/cli/dist/index.js recon scan --hosts example.com --ports 80,443 --subdomains example.com --wordlist www,api,admin --banner true --output ./reports/recon.json",
    "  node packages/cli/dist/index.js web record-har --url https://example.com/login --har ./reports/web.har --steps ./examples/web/login.steps.json",
    "  NB_WEB_USERNAME=xxx NB_WEB_PASSWORD=yyy node packages/cli/dist/index.js web record-har --url https://example.com/login --har ./reports/web.har --steps ./examples/web/login.steps.json --headed true",
    "  node packages/cli/dist/index.js web analyze-har --har ./reports/web.har",
    "  node packages/cli/dist/index.js web scan --config ./examples/web-scan/scan.json --output ./reports/web-scan.json",
    "  node packages/cli/dist/index.js web scan --config ./examples/web-scan/scan.json --baseline ./reports/web-baseline.json",
    "  node packages/cli/dist/index.js web crawl --url https://example.com --max-depth 2 --max-pages 20 --output ./reports/crawl.json",
    "  node packages/cli/dist/index.js web vuln-scan --config ./examples/web-vuln-scan/scan.json --output ./reports/vuln-scan.json",
    "  node packages/cli/dist/index.js web vuln-scan --config ./examples/web-vuln-scan/scan.json --report-format sarif --output ./reports/vuln-scan.sarif.json",
    "  node packages/cli/dist/index.js web vuln-scan --crawl-url https://example.com --vulns xxe,xss,sqli --output ./reports/vuln-scan.json",
  ].join("\n");
}

function formatProviderCatalog(): string {
  const lines = ["Supported providers:", ""];

  for (const provider of listSupportedProviders()) {
    lines.push(
      `- ${provider.type} | defaultBaseUrl: ${provider.defaultBaseUrl}${provider.apiKeyEnv ? ` | apiKeyEnv: ${provider.apiKeyEnv}` : ""}`,
    );
  }

  return lines.join("\n");
}

async function countNewFlagged(
  current: { cases?: Array<{ caseId: string; outcome: string }> },
  baselinePath: string | undefined,
): Promise<number> {
  if (!baselinePath) {
    return 0;
  }

  const baseline = await readBaselineReport(baselinePath);
  if (!baseline) {
    return 0;
  }

  const baselineFlagged = new Set(
    baseline.cases.filter((item) => item.outcome === "flagged").map((item) => item.caseId),
  );
  const currentFlagged = (current.cases ?? [])
    .filter((item) => item.outcome === "flagged")
    .map((item) => item.caseId);

  return currentFlagged.filter((id) => !baselineFlagged.has(id)).length;
}

async function readBaselineReport(
  filePath: string,
): Promise<{ cases: Array<{ caseId: string; outcome: string }> } | undefined> {
  try {
    const content = await readFile(filePath, "utf8");
    const parsed = JSON.parse(content) as any;
    if (!parsed || !Array.isArray(parsed.cases)) {
      return undefined;
    }
    return parsed;
  } catch {
    return undefined;
  }
}

const isDirectExecution = process.argv[1]
  ? new URL(import.meta.url).pathname === process.argv[1]
  : false;

if (isDirectExecution) {
  runCli()
    .then((result) => {
      process.exitCode = result.exitCode;
    })
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : "Unknown CLI error");
      process.exitCode = 1;
    });
}
