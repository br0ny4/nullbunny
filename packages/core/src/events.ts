export type NbEventSource = "scan" | "recon" | "web";

export interface NbEventProgress {
  current: number;
  total: number;
}

export const NB_EVENT_TYPE_MAP: Record<NbEventSource, Record<string, string>> = {
  scan: {
    scan_start: "scan.scan_start",
    case_start: "scan.case_start",
    case_end: "scan.case_end",
    scan_end: "scan.scan_end",
  },
  recon: {
    "recon:subdomain-progress": "recon.subdomain_progress",
    subdomain_progress: "recon.subdomain_progress",
    "recon:port-progress": "recon.port_progress",
    port_progress: "recon.port_progress",
  },
  web: {
    "vuln-scan:case-start": "web.case_start",
    case_start: "web.case_start",
    "vuln-scan:case-end": "web.case_end",
    case_end: "web.case_end",
    web_scan_start: "web.web_scan_start",
    web_scan_end: "web.web_scan_end",
  },
};

export interface NbEventV1Payload {
  type: string;
  scanId: string;
  target: string;
  progress?: NbEventProgress;
  [key: string]: unknown;
}

export function normalizeNbEventType(source: NbEventSource, rawType: string): string {
  const normalizedRawType = rawType.trim().toLowerCase();
  const mapped = NB_EVENT_TYPE_MAP[source][normalizedRawType];
  if (mapped) {
    return mapped;
  }

  return `${source}.unknown`;
}

export function isNbEventV1Payload(value: unknown): value is NbEventV1Payload {
  if (!isRecord(value)) {
    return false;
  }
  if (typeof value.type !== "string" || value.type.length === 0) {
    return false;
  }
  if (typeof value.scanId !== "string" || value.scanId.length === 0) {
    return false;
  }
  if (typeof value.target !== "string" || value.target.length === 0) {
    return false;
  }
  if (value.progress === undefined) {
    return true;
  }

  if (!isRecord(value.progress)) {
    return false;
  }
  const current = value.progress.current;
  const total = value.progress.total;
  if (typeof current !== "number" || !Number.isFinite(current)) {
    return false;
  }
  if (typeof total !== "number" || !Number.isFinite(total)) {
    return false;
  }
  if (current < 0 || total < 0 || current > total) {
    return false;
  }

  return true;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
