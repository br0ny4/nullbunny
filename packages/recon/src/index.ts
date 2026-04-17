import { connect } from "node:net";
import { lookup } from "node:dns/promises";

export interface HostPort {
  host: string;
  port: number;
}

export interface TcpPortScanOptions {
  timeoutMs?: number;
  grabBanner?: boolean;
}

export interface TcpPortScanResult extends HostPort {
  open: boolean;
  error?: string;
  banner?: string;
}

export interface ReconScanConfig {
  scanId: string;
  target: string;
  hosts: string[];
  ports: string;
  timeoutMs?: number;
  grabBanner?: boolean;
  subdomains?: {
    domain: string;
    wordlist: string[];
  };
}

export interface ReconScanResult {
  scanId: string;
  target: string;
  summary: {
    targets: number;
    open: number;
  };
  results: TcpPortScanResult[];
}

export interface HostResolution {
  hostname: string;
  addresses: string[];
}

export function buildSubdomainCandidates(domain: string, prefixes: string[]): string[] {
  const normalizedDomain = domain.trim().replace(/\.$/, "");
  return prefixes
    .map((item) => item.trim())
    .filter(Boolean)
    .map((prefix) => `${prefix}.${normalizedDomain}`);
}

export async function resolveHostnames(hostnames: string[]): Promise<HostResolution[]> {
  const results = await Promise.all(
    hostnames.map(async (hostname) => {
      try {
        const records = await lookup(hostname, { all: true });
        const addresses = records.map((item) => item.address);
        return { hostname, addresses };
      } catch {
        return { hostname, addresses: [] };
      }
    }),
  );

  return results;
}

export async function runReconScan(config: ReconScanConfig): Promise<ReconScanResult> {
  const ports = parsePortSpec(config.ports);

  let hosts = [...config.hosts];
  if (config.subdomains) {
    const candidates = buildSubdomainCandidates(config.subdomains.domain, config.subdomains.wordlist);
    const resolved = await resolveHostnames(candidates);
    const validHosts = resolved.filter((item) => item.addresses.length > 0).map((item) => item.hostname);
    hosts = Array.from(new Set([...hosts, ...validHosts]));
  }

  const targets = hosts.flatMap((host) => ports.map((port) => ({ host, port })));
  const results = await scanTcpPorts(targets, {
    timeoutMs: config.timeoutMs,
    grabBanner: config.grabBanner,
  });
  const open = results.filter((item) => item.open).length;

  return {
    scanId: config.scanId,
    target: config.target,
    summary: { targets: results.length, open },
    results,
  };
}

export function parsePortSpec(spec: string): number[] {
  const parts = spec
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  const ports = new Set<number>();
  for (const part of parts) {
    const rangeMatch = /^(\d+)\s*-\s*(\d+)$/.exec(part);
    if (rangeMatch) {
      const start = Number(rangeMatch[1]);
      const end = Number(rangeMatch[2]);
      if (!Number.isFinite(start) || !Number.isFinite(end)) {
        continue;
      }
      const lo = Math.min(start, end);
      const hi = Math.max(start, end);
      for (let port = lo; port <= hi; port += 1) {
        if (port >= 1 && port <= 65535) {
          ports.add(port);
        }
      }
      continue;
    }

    const single = Number(part);
    if (Number.isFinite(single) && single >= 1 && single <= 65535) {
      ports.add(single);
    }
  }

  return Array.from(ports).sort((a, b) => a - b);
}

export async function scanTcpPorts(
  targets: HostPort[],
  options: TcpPortScanOptions = {},
): Promise<TcpPortScanResult[]> {
  const timeoutMs = options.timeoutMs ?? 2000;
  const grabBanner = options.grabBanner ?? false;

  const results = await Promise.all(
    targets.map(async (target) => {
      const open = await isTcpPortOpen(target.host, target.port, timeoutMs, grabBanner);
      return { ...target, ...open };
    }),
  );

  return results;
}

async function isTcpPortOpen(
  host: string,
  port: number,
  timeoutMs: number,
  grabBanner = false,
): Promise<{ open: boolean; error?: string; banner?: string }> {
  return new Promise((resolve) => {
    const socket = connect({ host, port });
    let banner = "";

    const timeout = setTimeout(() => {
      socket.destroy();
      resolve(banner ? { open: true, banner: banner.trim() } : { open: false, error: "timeout" });
    }, timeoutMs);

    socket.on("connect", () => {
      if (!grabBanner) {
        clearTimeout(timeout);
        socket.destroy();
        resolve({ open: true });
        return;
      }

      socket.write("HEAD / HTTP/1.0\r\n\r\n");
    });

    socket.on("data", (data: Buffer) => {
      if (grabBanner) {
        banner += data.toString("utf-8");
        if (banner.length > 512) {
          clearTimeout(timeout);
          socket.destroy();
          resolve({ open: true, banner: banner.slice(0, 512).trim() });
        }
      }
    });

    socket.on("end", () => {
      clearTimeout(timeout);
      resolve({ open: true, banner: banner ? banner.trim() : undefined });
    });

    socket.on("error", (err: Error) => {
      clearTimeout(timeout);
      socket.destroy();
      resolve(banner ? { open: true, banner: banner.trim() } : { open: false, error: err.message });
    });
  });
}
