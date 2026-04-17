import { test } from "node:test";
import assert from "node:assert/strict";

import {
  buildSubdomainCandidates,
  parsePortSpec,
  resolveHostnames,
  runReconScan,
  scanTcpPorts,
} from "../dist/recon/src/index.js";

test("parsePortSpec expands ranges and de-duplicates", () => {
  assert.deepEqual(parsePortSpec("80,443,8000-8002,443"), [80, 443, 8000, 8001, 8002]);
});

test("scanTcpPorts detects open local port", async () => {
  const net = await import("node:net");
  const server = net.createServer(() => {});
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.equal(typeof address, "object");
  const port = address.port;

  const results = await scanTcpPorts([{ host: "127.0.0.1", port }], { timeoutMs: 500 });
  assert.equal(results.length, 1);
  assert.equal(results[0].open, true);

  await new Promise((resolve) => server.close(resolve));
});

test("scanTcpPorts grabs banner if requested", async () => {
  const net = await import("node:net");
  const server = net.createServer((socket) => {
    socket.write("HTTP/1.1 200 OK\r\nServer: CustomBanner\r\n\r\n");
    setTimeout(() => socket.destroy(), 10);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const port = address.port;

  const results = await scanTcpPorts([{ host: "127.0.0.1", port }], { timeoutMs: 500, grabBanner: true });
  assert.equal(results.length, 1);
  assert.equal(results[0].open, true);
  assert.ok(results[0].banner?.includes("Server: CustomBanner"));

  await new Promise((resolve) => server.close(resolve));
});

test("buildSubdomainCandidates combines domain and prefixes", () => {
  assert.deepEqual(buildSubdomainCandidates("example.com", ["www", "api"]), [
    "www.example.com",
    "api.example.com",
  ]);
});

test("resolveHostnames resolves localhost", async () => {
  const result = await resolveHostnames(["localhost"]);
  assert.equal(result.length, 1);
  assert.equal(result[0].hostname, "localhost");
  assert.ok(result[0].addresses.length > 0);
});

test("runReconScan scans hosts and ports", async () => {
  const net = await import("node:net");
  const server = net.createServer(() => {});
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.equal(typeof address, "object");
  const port = address.port;

  const result = await runReconScan({
    scanId: "test-recon",
    target: "local",
    hosts: ["127.0.0.1"],
    ports: String(port),
    timeoutMs: 500,
  });

  assert.equal(result.summary.targets, 1);
  assert.equal(result.summary.open, 1);
  assert.equal(result.results[0].open, true);

  await new Promise((resolve) => server.close(resolve));
});
