import test from "node:test";
import assert from "node:assert/strict";

import { toNbEventV1 } from "../packages/cli/dist/index.js";

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
  assert.equal(web.eventType, "web.vuln_scan_case_end");
  assert.equal(recon.payload.type, "recon:port-progress");
  assert.equal(web.payload.type, "vuln-scan:case-end");
});
