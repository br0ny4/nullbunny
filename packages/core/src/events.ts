export interface NbEventProgress {
  current: number;
  total: number;
}

export interface NbEventV1Payload {
  type: string;
  scanId: string;
  target: string;
  progress?: NbEventProgress;
  [key: string]: unknown;
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
