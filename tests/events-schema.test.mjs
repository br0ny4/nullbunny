import test from "node:test";
import assert from "node:assert/strict";

import { toNbEventV1 } from "../packages/cli/dist/index.js";
import { runReconScan } from "../dist/recon/src/index.js";
import { runWebVulnScanFromEndpoints } from "../packages/web/dist/index.js";
import {
  NB_EVENT_TYPE_MAP,
  isNbEventV1Payload,
  normalizeNbEventType,
} from "../dist/core/src/events.js";

test("toNbEventV1 wraps scan events with unified schema", () => {
  const wrapped = toNbEventV1("scan", {
    type: "scan_start",
    scanId: "scan-1",
    total: 3,
  });

  assert.equal(wrapped.version, "1.0");
  assert.equal(wrapped.source, "scan");
  assert.equal(wrapped.eventType, "scan.scan_start");
  assert.equal(typeof wrapped.timestamp, "string");
  assert.deepEqual(wrapped.payload, {
    type: "scan_start",
    scanId: "scan-1",
    total: 3,
  });
});

test("toNbEventV1 normalizes recon and web event names", () => {
  const recon = toNbEventV1("recon", {
    type: "recon:port-progress",
    progress: { current: 1, total: 10 },
  });
  const web = toNbEventV1("web", {
    type: "vuln-scan:case-end",
    detected: true,
  });

  assert.equal(recon.eventType, "recon.port_progress");
  assert.equal(web.eventType, "web.case_end");
  assert.equal(recon.payload.type, "recon:port-progress");
  assert.equal(web.payload.type, "vuln-scan:case-end");
});

test("toNbEventV1 uses strict event type mapping and stable fallback", () => {
  const snapshot = [
    toNbEventV1("scan", { type: "scan_start" }).eventType,
    toNbEventV1("scan", { type: "case_end" }).eventType,
    toNbEventV1("recon", { type: "recon:port-progress" }).eventType,
    toNbEventV1("recon", { type: "port_progress" }).eventType,
    toNbEventV1("web", { type: "vuln-scan:case-start" }).eventType,
    toNbEventV1("web", { type: "case_end" }).eventType,
    toNbEventV1("web", { type: "web_scan_end" }).eventType,
    toNbEventV1("scan", { type: "custom-unknown" }).eventType,
  ];

  assert.deepEqual(snapshot, [
    "scan.scan_start",
    "scan.case_end",
    "recon.port_progress",
    "recon.port_progress",
    "web.case_start",
    "web.case_end",
    "web.web_scan_end",
    "scan.unknown",
  ]);
});

test("recon runtime events should satisfy core NB_EVENT v1 payload schema", async () => {
  const net = await import("node:net");
  const server = net.createServer(() => {});
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const port = address.port;

  const events = [];
  try {
    await runReconScan(
      {
        scanId: "recon-schema-1",
        target: "127.0.0.1",
        hosts: ["127.0.0.1"],
        ports: String(port),
        timeoutMs: 500,
      },
      {
        onEvent(event) {
          events.push(event);
        },
      },
    );
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }

  assert.ok(events.length > 0);
  for (const event of events) {
    assert.equal(
      isNbEventV1Payload(event),
      true,
      `invalid recon event payload: ${JSON.stringify(event)}`,
    );
  }
});

test("web vuln runtime events should satisfy core NB_EVENT v1 payload schema", async () => {
  const http = await import("node:http");
  const server = http.createServer((_, res) => {
    res.writeHead(200);
    res.end("ok");
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  const events = [];

  try {
    await runWebVulnScanFromEndpoints(
      "web-schema-1",
      "127.0.0.1",
      [{ method: "GET", url: `http://127.0.0.1:${port}/`, headers: [] }],
      [{ type: "xss" }],
      1000,
      {
        onEvent(event) {
          events.push(event);
        },
      },
    );
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }

  assert.ok(events.length > 0);
  for (const event of events) {
    assert.equal(
      isNbEventV1Payload(event),
      true,
      `invalid web event payload: ${JSON.stringify(event)}`,
    );
  }
});

test("core exports shared NB_EVENT mapping and normalization", () => {
  assert.equal(typeof NB_EVENT_TYPE_MAP.scan.scan_start, "string");
  assert.equal(NB_EVENT_TYPE_MAP.web["vuln-scan:case-end"], "web.case_end");
  assert.equal(normalizeNbEventType("scan", "scan_start"), "scan.scan_start");
  assert.equal(normalizeNbEventType("web", "vuln-scan:case-start"), "web.case_start");
  assert.equal(normalizeNbEventType("scan", "custom-unknown"), "scan.unknown");
});
