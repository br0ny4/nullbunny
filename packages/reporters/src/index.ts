import type { ScanRunResult } from "@nullbunny/core";
import type { WebVulnScanResult } from "@nullbunny/web";
import type { ReconScanResult } from "@nullbunny/recon";

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

export function renderReconReport(
  result: ReconScanResult,
  format: ReportFormat = "json",
): string {
  if (format === "markdown") {
    return renderReconMarkdown(result);
  }

  if (format === "sarif") {
    return renderReconSarif(result);
  }

  return JSON.stringify(result, null, 2);
}

function renderReconMarkdown(result: ReconScanResult): string {
  const lines = [
    `# NullBunny Recon Report`,
    ``,
    `- Scan ID: ${result.scanId}`,
    `- Target: ${result.target}`,
    `- Summary: targets=${result.summary.targets} open=${result.summary.open}`,
    ``,
    `## Findings`,
  ];

  for (const item of result.results) {
    if (item.open) {
      lines.push(`- **${item.host}:${item.port}** is OPEN`);
      if (item.banner) {
        const linesOfBanner = item.banner.split("\\n");
        lines.push(`  - Banner: \`${linesOfBanner[0]}\``);
      }
    }
  }

  if (result.findings && result.findings.length > 0) {
    lines.push(``, `## Middleware Findings`);
    for (const f of result.findings) {
      lines.push(`- [${f.severity.toUpperCase()}] ${f.service} on ${f.host}:${f.port} - ${f.finding}`);
    }
  }

  return lines.join("\n");
}

function renderReconSarif(result: ReconScanResult): string {
  const rules = [
    {
      id: "open-port",
      shortDescription: { text: "Open TCP Port" },
    },
    {
      id: "middleware-finding",
      shortDescription: { text: "Middleware Configuration Issue" },
    },
  ];

  const severityToLevel: Record<string, string> = {
    critical: "error",
    high: "error",
    medium: "warning",
    low: "note",
    info: "note",
  };

  const sarifResults = result.results
    .filter((r) => r.open)
    .map((r) => ({
      ruleId: "open-port",
      level: "note",
      message: {
        text: `Port ${r.port} is open on ${r.host}${r.banner ? `\\nBanner: ${r.banner}` : ""}`,
      },
      locations: [
        {
          physicalLocation: {
            artifactLocation: { uri: `tcp://${r.host}:${r.port}` },
          },
        },
      ],
    }));

  if (result.findings) {
    for (const f of result.findings) {
      sarifResults.push({
        ruleId: "middleware-finding",
        level: severityToLevel[f.severity] ?? "note",
        message: {
          text: `[${f.service}] ${f.finding}`,
        },
        locations: [
          {
            physicalLocation: {
              artifactLocation: { uri: `tcp://${f.host}:${f.port}` },
            },
          },
        ],
      });
    }
  }

  const sarif = {
    $schema:
      "https://docs.oasis-open.org/sarif/sarif/v2.1.0/errata01/os/schemas/sarif-schema-2.1.0.json",
    version: "2.1.0",
    runs: [
      {
        tool: {
          driver: {
            name: "NullBunny Recon",
            version: "0.1.0",
            informationUri: "https://github.com/br0ny4/nullbunny",
            rules,
          },
        },
        results: sarifResults,
      },
    ],
  };

  return JSON.stringify(sarif, null, 2);
}

export function renderWebVulnScanReport(
  result: WebVulnScanResult,
  format: ReportFormat = "json",
): string {
  if (format === "markdown") {
    return renderWebVulnScanMarkdown(result);
  }

  if (format === "sarif") {
    return renderWebVulnScanSarif(result);
  }

  return JSON.stringify(result, null, 2);
}

function renderWebVulnScanMarkdown(result: WebVulnScanResult): string {
  const lines = [
    `# NullBunny Web Vulnerability Scan Report`,
    ``,
    `- Scan ID: ${result.scanId}`,
    `- Target: ${result.target}`,
    `- Summary: total=${result.summary.total} critical=${result.summary.critical} high=${result.summary.high} medium=${result.summary.medium} low=${result.summary.low} info=${result.summary.info}`,
    ``,
    `## Findings`,
  ];

  for (const finding of result.findings) {
    lines.push(
      `- [${finding.severity.toUpperCase()}] ${finding.vulnType} on ${finding.method} ${finding.url}`,
      `  - Payload: ${finding.payload}`,
      `  - Evidence: ${finding.evidence}`,
      `  - Confirmed: ${finding.confirmed}`,
    );
  }

  return lines.join("\n");
}

function renderWebVulnScanSarif(result: WebVulnScanResult): string {
  const vulnTypes = [...new Set(result.findings.map((f) => f.vulnType))];

  const rules = vulnTypes.map((vulnType) => ({
    id: vulnType,
    shortDescription: { text: vulnType },
  }));

  const severityToLevel: Record<string, string> = {
    critical: "error",
    high: "error",
    medium: "warning",
    low: "note",
    info: "note",
  };

  const results = result.findings.map((f) => ({
    ruleId: f.vulnType,
    level: severityToLevel[f.severity] ?? "note",
    message: { text: f.evidence },
    locations: [
      {
        physicalLocation: {
          artifactLocation: { uri: f.url },
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
