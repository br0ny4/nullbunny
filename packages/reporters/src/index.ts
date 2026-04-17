import type { ScanRunResult } from "@nullbunny/core";

export type ReportFormat = "json" | "markdown" | "sarif";

export function renderReport(
  result: ScanRunResult,
  format: ReportFormat = "json",
): string {
  if (format === "markdown") {
    return renderMarkdownReport(result);
  }

  if (format === "sarif") {
    return renderSarifReport(result);
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
  const extension =
    format === "markdown" ? "md" : format === "sarif" ? "sarif.json" : "json";
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

function renderSarifReport(result: ScanRunResult): string {
  const categories = [...new Set(result.cases.map((c) => c.category))];

  const rules = categories.map((category) => ({
    id: category,
    shortDescription: { text: category },
  }));

  const results = result.cases.map((c) => ({
    ruleId: c.category,
    level: c.outcome === "flagged" ? "error" : "note",
    message: { text: c.reason },
    locations: [
      {
        physicalLocation: {
          artifactLocation: { uri: result.target },
        },
      },
    ],
  }));

  const sarif = {
    $schema:
      "https://docs.oasis-open.org/sarif/sarif/v2.1.0/errata01/os/schemas/sarif-schema-2.1.0.json",
    version: "2.1.0",
    runs: [
      {
        tool: {
          driver: {
            name: "NullBunny",
            version: "0.1.0",
            informationUri: "https://github.com/br0ny4/nullbunny",
            rules,
          },
        },
        results,
      },
    ],
  };

  return JSON.stringify(sarif, null, 2);
}
