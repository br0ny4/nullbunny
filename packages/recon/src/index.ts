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

export interface MiddlewareFinding {
  host: string;
  port: number;
  service: string;
  finding: string;
  severity: "critical" | "high" | "medium" | "low" | "info";
}

export interface ReconScanConfig {
  scanId: string;
  target: string;
  hosts: string[];
  ports: string;
  timeoutMs?: number;
  grabBanner?: boolean;
  detectMiddleware?: boolean;
  subdomains?: {
    domain: string;
    wordlist: string[];
  };
}

export interface ReconScanOptions {
  onEvent?: (event: any) => void;
}

export interface ReconScanResult {
  scanId: string;
  target: string;
  summary: {
    targets: number;
    open: number;
    findings?: number;
  };
  results: TcpPortScanResult[];
  findings?: MiddlewareFinding[];
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

export async function resolveHostnames(hostnames: string[], onEvent?: (e: any) => void): Promise<HostResolution[]> {
  let completed = 0;
  const results = await Promise.all(
    hostnames.map(async (hostname) => {
      try {
        const records = await lookup(hostname, { all: true });
        const addresses = records.map((item) => item.address);
        return { hostname, addresses };
      } catch {
        return { hostname, addresses: [] };
      } finally {
        completed++;
        onEvent?.({
          type: "recon:subdomain-progress",
          progress: { current: completed, total: hostnames.length },
        });
      }
    }),
  );

  return results;
}

export async function runReconScan(config: ReconScanConfig, options?: ReconScanOptions): Promise<ReconScanResult> {
  const ports = parsePortSpec(config.ports);

  let hosts = [...config.hosts];
  if (config.subdomains) {
    const candidates = buildSubdomainCandidates(config.subdomains.domain, config.subdomains.wordlist);
    const resolved = await resolveHostnames(candidates, options?.onEvent);
    const validHosts = resolved.filter((item) => item.addresses.length > 0).map((item) => item.hostname);
    hosts = Array.from(new Set([...hosts, ...validHosts]));
  }

  const targets = hosts.flatMap((host) => ports.map((port) => ({ host, port })));
  const results = await scanTcpPorts(targets, {
    timeoutMs: config.timeoutMs,
    grabBanner: config.grabBanner,
    onEvent: options?.onEvent,
  });
  const open = results.filter((item) => item.open).length;

  let findings: MiddlewareFinding[] | undefined;
  if (config.detectMiddleware) {
    findings = await detectMiddlewareConfigurations(results, config.timeoutMs);
  }

  return {
    scanId: config.scanId,
    target: config.target,
    summary: { targets: results.length, open, findings: findings?.length ?? 0 },
    results,
    findings,
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

export async function detectMiddlewareConfigurations(
  results: TcpPortScanResult[],
  timeoutMs = 3000,
): Promise<MiddlewareFinding[]> {
  const findings: MiddlewareFinding[] = [];
  const openResults = results.filter((r) => r.open);

  const checkHttp = async (
    host: string,
    port: number,
    path: string,
    service: string,
    expectedStatus: number,
    expectedContent?: string,
    severity: "critical" | "high" | "medium" | "low" | "info" = "high",
  ) => {
    const protocol = port === 443 || port === 8443 ? "https" : "http";
    const url = `${protocol}://${host}:${port}${path}`;
    try {
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), timeoutMs);
      const res = await fetch(url, { signal: ac.signal, redirect: "manual" });
      clearTimeout(timer);

      if (res.status === expectedStatus) {
        if (!expectedContent) {
          findings.push({ host, port, service, severity, finding: `Accessible ${service} at ${url}` });
          return;
        }
        const text = await res.text();
        if (text.includes(expectedContent)) {
          findings.push({ host, port, service, severity, finding: `Accessible ${service} at ${url}` });
        }
      }
    } catch {
      // ignore fetch errors
    }
  };

  const checkRedis = async (host: string, port: number) => {
    return new Promise<void>((resolve) => {
      const socket = connect({ host, port });
      let data = "";
      const timer = setTimeout(() => {
        socket.destroy();
        resolve();
      }, timeoutMs);

      socket.on("connect", () => {
        socket.write("INFO\\r\\n");
      });

      socket.on("data", (chunk: Buffer) => {
        data += chunk.toString("utf-8");
        if (data.includes("redis_version")) {
          findings.push({
            host,
            port,
            service: "Redis",
            severity: "critical",
            finding: `Unauthenticated Redis exposed at ${host}:${port}`,
          });
          clearTimeout(timer);
          socket.destroy();
          resolve();
        }
      });

      socket.on("error", () => {
        clearTimeout(timer);
        socket.destroy();
        resolve();
      });

      socket.on("end", () => {
        clearTimeout(timer);
        resolve();
      });
    });
  };

  const checks: Promise<void>[] = [];

  for (const r of openResults) {
    if (r.port === 6379) {
      checks.push(checkRedis(r.host, r.port));
    }

    if ([80, 443, 8080, 8443, 8000, 9000].includes(r.port)) {
      checks.push(checkHttp(r.host, r.port, "/actuator/env", "Spring Boot Actuator", 200, "java.version"));
      checks.push(checkHttp(r.host, r.port, "/manager/html", "Tomcat Manager", 401, undefined, "medium"));
      checks.push(checkHttp(r.host, r.port, "/manager/html", "Tomcat Manager Default", 200, "Tomcat Web Application Manager", "critical"));
      checks.push(checkHttp(r.host, r.port, "/server-status", "Apache Server Status", 200, "Apache Server Status"));
      checks.push(checkHttp(r.host, r.port, "/.git/config", "Git Repository Disclosure", 200, "[core]", "high"));
    }
  }

  await Promise.all(checks);
  return findings;
}

export async function scanTcpPorts(
  targets: HostPort[],
  options: TcpPortScanOptions & ReconScanOptions = {},
): Promise<TcpPortScanResult[]> {
  const timeoutMs = options.timeoutMs ?? 2000;
  const grabBanner = options.grabBanner ?? false;

  let completed = 0;
  const results = await Promise.all(
    targets.map(async (target) => {
      const open = await isTcpPortOpen(target.host, target.port, timeoutMs, grabBanner);
      completed++;
      options.onEvent?.({
        type: "recon:port-progress",
        progress: { current: completed, total: targets.length },
        host: target.host,
        port: target.port,
        open: open.open,
      });
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
