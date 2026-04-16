import type { ScanRunResult } from "@nullbunny/core";

export type ReportFormat = "json" | "markdown";

export function renderReport(
  result: ScanRunResult,
  format: ReportFormat = "json",
): string {
  if (format === "markdown") {
    return renderMarkdownReport(result);
  }

  return JSON.stringify(result, null, 2);
}

export function buildArchiveFilePath(
  result: ScanRunResult,
  archiveDir: string,
  format: ReportFormat,
  now: Date = new Date(),
): string {
  const stamp = formatTimestamp(now);
  const safeScanId = sanitizePathSegment(result.scanId);
  const extension = format === "markdown" ? "md" : "json";
  return `${archiveDir}/${stamp}-${safeScanId}.${extension}`;
}

function renderMarkdownReport(result: ScanRunResult): string {
  const lines = [
    `# NullBunny Report`,
    ``,
    `- Scan ID: ${result.scanId}`,
    `- Target: ${result.target}`,
    `- Provider: ${result.provider.providerType} (${result.provider.providerId})`,
    `- Provider Status: ${result.provider.ok ? "ready" : "failed"}`,
    `- Summary: total=${result.summary.total} pass=${result.summary.passed} flagged=${result.summary.flagged} error=${result.summary.errors}`,
    ``,
    `## Cases`,
  ];

  for (const item of result.cases) {
    lines.push(
      `- [${item.outcome.toUpperCase()}] ${item.caseId} (${item.category}) - ${item.reason}`,
    );
  }

  return lines.join("\n");
}

function formatTimestamp(now: Date): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  const seconds = String(now.getSeconds()).padStart(2, "0");
  return `${year}${month}${day}-${hours}${minutes}${seconds}`;
}

function sanitizePathSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
}
