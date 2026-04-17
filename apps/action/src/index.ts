declare const process: {
  argv: string[];
  env: Record<string, string | undefined>;
  exitCode?: number;
};

// Temporary until workspace dependencies are installed in this environment.
// @ts-ignore
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
// Temporary until workspace dependencies are installed in this environment.
// @ts-ignore
import { dirname } from "node:path";
import { formatScanRun, loadScanConfig, runScan, type ScanRunResult } from "@nullbunny/core";
import {
  buildArchiveFilePath,
  renderReport,
  type ReportFormat,
} from "@nullbunny/reporters";

export interface ActionRunOptions {
  configPath: string;
  archiveDir?: string;
  reportFormat?: ReportFormat;
}

export interface ActionRunResult {
  scan: ScanRunResult;
  consoleOutput: string;
  archivePath: string;
  exitCode: number;
}

export async function runAction(
  options: ActionRunOptions,
): Promise<ActionRunResult> {
  const config = await loadScanConfig(options.configPath);
  const result = await runScan(config);
  const consoleOutput = formatScanRun(result);
  const reportFormat = options.reportFormat ?? "json";
  const archiveDir = options.archiveDir ?? "./reports/archive";
  const archivePath = buildArchiveFilePath(result, archiveDir, reportFormat);

  await writeTextFile(archivePath, renderReport(result, reportFormat));

  return {
    scan: result,
    consoleOutput,
    archivePath,
    exitCode: deriveExitCode(result),
  };
}

async function writeTextFile(filePath: string, content: string): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, content, "utf8");
}

function deriveExitCode(result: ScanRunResult): number {
  if (!result.provider.ok || result.summary.errors > 0) {
    return 1;
  }

  if (result.summary.flagged > 0) {
    return 2;
  }

  return 0;
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

function readStringFlag(
  flags: Record<string, string | boolean>,
  key: string,
): string | undefined {
  const value = flags[key];
  return typeof value === "string" ? value : undefined;
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

const isDirectExecution = process.argv[1]
  ? new URL(import.meta.url).pathname === process.argv[1]
  : false;

if (isDirectExecution) {
  const shouldRunGitHubAction = process.env.GITHUB_ACTIONS === "true";
  const runner = shouldRunGitHubAction ? runGitHubAction : runCommandLine;
  runner()
    .then((exitCode) => {
      process.exitCode = exitCode;
    })
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : "Unknown action error");
      process.exitCode = 1;
    });
}

async function runCommandLine(): Promise<number> {
  const flags = parseFlags(process.argv.slice(2));
  const result = await runAction({
    configPath: readRequiredFlag(flags, "config"),
    archiveDir: readStringFlag(flags, "archive-dir"),
    reportFormat: readReportFormat(flags),
  });
  console.log(`${result.consoleOutput}\narchive: ${result.archivePath}`);
  return result.exitCode;
}

async function runGitHubAction(): Promise<number> {
  const configPath = readRequiredInput("config");
  const baselinePath = readOptionalInput("baseline_path");
  const archiveDir = readOptionalInput("archive_dir");
  const reportFormat = readOptionalInput("report_format");
  const outputPath = readOptionalInput("output");
  const failOnFlagged = readOptionalInput("fail_on_flagged") !== "false";

  const resolvedFormat: ReportFormat =
    reportFormat === "markdown" ? "markdown" : reportFormat === "sarif" ? "sarif" : "json";

  const actionResult = await runAction({
    configPath,
    archiveDir,
    reportFormat: resolvedFormat,
  });

  const baseline = await readBaselineReport(baselinePath);
  const newFlaggedIds = deriveNewFlaggedCaseIds(actionResult.scan, baseline);

  if (outputPath) {
    await writeTextFile(
      outputPath,
      renderReport(actionResult.scan, resolvedFormat),
    );
  }

  const summaryLine = `total=${actionResult.scan.summary.total} pass=${actionResult.scan.summary.passed} flagged=${actionResult.scan.summary.flagged} error=${actionResult.scan.summary.errors}`;

  await writeGitHubOutput("archive_path", actionResult.archivePath);
  await writeGitHubOutput("exit_code", String(actionResult.exitCode));
  await writeGitHubOutput("summary", summaryLine);
  await writeGitHubOutput("new_flagged", String(newFlaggedIds.length));

  await writeGitHubStepSummary(
    [
      "## NullBunny Scan",
      "",
      `- scan: ${actionResult.scan.scanId}`,
      `- target: ${actionResult.scan.target}`,
      `- provider: ${actionResult.scan.provider.providerType} (${actionResult.scan.provider.providerId})`,
      `- provider-status: ${actionResult.scan.provider.ok ? "ready" : "failed"}`,
      `- summary: ${summaryLine}`,
      baselinePath ? `- baseline: ${baselinePath}` : `- baseline: (none)`,
      `- new-flagged: ${String(newFlaggedIds.length)}`,
      `- archive: ${actionResult.archivePath}`,
      "",
      "```",
      actionResult.consoleOutput,
      "```",
      "",
    ].join("\n"),
  );

  if (!actionResult.scan.provider.ok || actionResult.scan.summary.errors > 0) {
    console.error(`${actionResult.consoleOutput}\narchive: ${actionResult.archivePath}`);
    return 1;
  }

  const shouldFailOnFlagged = (baseline ? newFlaggedIds.length > 0 : actionResult.scan.summary.flagged > 0) && failOnFlagged;
  if (shouldFailOnFlagged) {
    console.error(`${actionResult.consoleOutput}\narchive: ${actionResult.archivePath}`);
    return 2;
  }

  console.log(`${actionResult.consoleOutput}\narchive: ${actionResult.archivePath}`);
  return 0;
}

function readRequiredInput(name: string): string {
  const value = readOptionalInput(name);
  if (!value) {
    throw new Error(`Missing required input: ${name}`);
  }
  return value;
}

function readOptionalInput(name: string): string | undefined {
  return process.env[`INPUT_${name.toUpperCase()}`];
}

async function writeGitHubOutput(key: string, value: string): Promise<void> {
  const outputPath = process.env.GITHUB_OUTPUT;
  if (!outputPath) {
    return;
  }

  await appendFile(outputPath, `${key}=${value}\n`, "utf8");
}

async function writeGitHubStepSummary(content: string): Promise<void> {
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (!summaryPath) {
    return;
  }

  await appendFile(summaryPath, content, "utf8");
}

async function readBaselineReport(
  baselinePath: string | undefined,
): Promise<ScanRunResult | undefined> {
  if (!baselinePath) {
    return undefined;
  }

  try {
    const content = await readFile(baselinePath, "utf8");
    const parsed = JSON.parse(content) as ScanRunResult;
    if (!parsed || !Array.isArray(parsed.cases)) {
      return undefined;
    }
    return parsed;
  } catch {
    return undefined;
  }
}

function deriveNewFlaggedCaseIds(
  current: ScanRunResult,
  baseline: ScanRunResult | undefined,
): string[] {
  if (!baseline) {
    return [];
  }

  const baselineFlagged = new Set(
    baseline.cases.filter((item) => item.outcome === "flagged").map((item) => item.caseId),
  );
  return current.cases
    .filter((item) => item.outcome === "flagged")
    .map((item) => item.caseId)
    .filter((id) => !baselineFlagged.has(id));
}
