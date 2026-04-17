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
  runScan,
} from "@nullbunny/core";
// Temporary source import while the workspace package build pipeline is still minimal.
// @ts-ignore
import { renderReport, type ReportFormat } from "@nullbunny/reporters";
// Temporary source import while the workspace package build pipeline is still minimal.
// @ts-ignore
import {
  createProvider,
  formatHealthCheck,
  type ProviderConfig,
} from "@nullbunny/providers";

export interface CliResult {
  exitCode: number;
  output: string;
}

export function createCli() {
  return {
    name: "nullbunny",
    run: runCli,
  };
}

export async function runCli(
  argv: string[] = process.argv.slice(2),
): Promise<CliResult> {
  const [group, command, ...rest] = argv;

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

  if (group === "scan" && command === "run") {
    const flags = parseFlags(rest);
    const configPath = readRequiredFlag(flags, "config");
    const baselinePath = readStringFlag(flags, "baseline");
    const config = await loadScanConfig(configPath);
    const result = await runScan(config);
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

    const { loadWebScanConfig, runWebScan } = await import("@nullbunny/web");
    const config = await loadWebScanConfig(configPath);
    const result = await runWebScan(config);
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
    const result = await runWebVulnScan(config);
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

  const output = helpText();
  console.log(output);
  return { exitCode: 0, output };
}

function buildProviderConfig(
  flags: Record<string, string | boolean>,
): ProviderConfig {
  const provider = readRequiredFlag(flags, "provider");
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

function helpText(): string {
  return [
    "NullBunny CLI",
    "",
    "Commands:",
    "  node packages/cli/dist/index.js providers test --provider ollama --model qwen2.5:7b",
    "  node packages/cli/dist/index.js providers test --provider openai-compatible --base-url http://127.0.0.1:8000/v1 --model local-model",
    "  node packages/cli/dist/index.js providers test --provider anthropic --model claude-sonnet-4-20250514",
    "  node packages/cli/dist/index.js providers test --provider deepseek --model deepseek-chat",
    "  node packages/cli/dist/index.js scan run --config ./examples/basic-ollama/scan.json",
    "  node packages/cli/dist/index.js scan run --config ./examples/basic-ollama/scan.json --output ./reports/basic.json",
    "  node packages/cli/dist/index.js scan run --config ./examples/basic-ollama/scan.json --report-format markdown --output ./reports/basic.md",
    "  node packages/cli/dist/index.js scan run --config ./examples/basic-ollama/scan.json --report-format sarif --output ./reports/basic.sarif.json",
    "  node packages/cli/dist/index.js scan run --config ./examples/basic-ollama/scan.json --baseline ./reports/baseline.json",
    "  node packages/cli/dist/index.js action run --config ./examples/basic-ollama/scan.json --archive-dir ./reports/archive",
    "  node packages/cli/dist/index.js web record-har --url https://example.com/login --har ./reports/web.har --steps ./examples/web/login.steps.json",
    "  NB_WEB_USERNAME=xxx NB_WEB_PASSWORD=yyy node packages/cli/dist/index.js web record-har --url https://example.com/login --har ./reports/web.har --steps ./examples/web/login.steps.json --headed true",
    "  node packages/cli/dist/index.js web analyze-har --har ./reports/web.har",
    "  node packages/cli/dist/index.js web scan --config ./examples/web-scan/scan.json --output ./reports/web-scan.json",
    "  node packages/cli/dist/index.js web scan --config ./examples/web-scan/scan.json --baseline ./reports/web-baseline.json",
    "  node packages/cli/dist/index.js web crawl --url https://example.com --max-depth 2 --max-pages 20 --output ./reports/crawl.json",
    "  node packages/cli/dist/index.js web vuln-scan --config ./examples/web-vuln-scan/scan.json --output ./reports/vuln-scan.json",
    "  node packages/cli/dist/index.js web vuln-scan --config ./examples/web-vuln-scan/scan.json --report-format sarif --output ./reports/vuln-scan.sarif.json",
    "  node packages/cli/dist/index.js web vuln-scan --crawl-url https://example.com --vulns xxe,xss,sqli --output ./reports/vuln-scan.json",
  ].join("\\n");
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
