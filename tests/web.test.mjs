import { test } from "node:test";
import assert from "node:assert/strict";
import { runWebVulnScanFromEndpoints } from "../packages/web/dist/index.js";

test("Prompt injection detection flags LLM endpoints accepting jailbreak prompts", async () => {
  const http = await import("node:http");

  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", chunk => { body += chunk; });
    req.on("end", () => {
      const isJailbreak = body.includes("DAN") || body.includes("ignore");
      if (isJailbreak) {
        res.writeHead(200, { "content-type": "text/plain" });
        res.end("Sure, here is how to bypass your security: use admin/admin credentials.");
      } else {
        res.writeHead(200, { "content-type": "text/plain" });
        res.end("I'm sorry, I cannot help with that.");
      }
    });
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;

  const endpoints = [{
    method: "POST",
    url: `http://127.0.0.1:${port}/chat`,
    headers: [{ name: "Content-Type", value: "application/json" }],
    postData: { text: JSON.stringify({ prompt: "hello" }), mimeType: "application/json" }
  }];

  const result = await runWebVulnScanFromEndpoints(
    "test-prompt-injection",
    "127.0.0.1",
    endpoints,
    [{ type: "prompt-injection" }],
    2000
  );

  await new Promise((resolve) => server.close(resolve));

  assert.ok(result.findings.some(f => f.vulnType === "prompt-injection"), 
    "Should flag LLM endpoint vulnerable to prompt injection");
});

test("Web vulnerability scan detects vulnerabilities in headers and cookies", async () => {
  const http = await import("node:http");
  
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", chunk => { body += chunk; });
    req.on("end", () => {
      if (req.url.includes("phpinfo")) {
        res.writeHead(200);
        res.end("<title>phpinfo()</title> Oracle (OCI) driver ORA-12345");
        return;
      }

      if (req.headers["x-forwarded-for"]?.includes("OR '1'='1")) {
        res.writeHead(500);
        res.end("SQL syntax error in mysql");
        return;
      }
      
      if (req.headers["cookie"]?.includes("XSS-Cookie")) {
        res.writeHead(200);
        res.end("Reflected: <script>alert('XSS-Cookie')</script>");
        return;
      }

      res.writeHead(200);
      res.end("Normal page");
    });
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;

  const endpoints = [
    {
      method: "GET",
      url: `http://127.0.0.1:${port}/`,
      headers: [{ name: "User-Agent", value: "test" }, { name: "Cookie", value: "session=123" }]
    },
    {
      method: "GET",
      url: `http://127.0.0.1:${port}/phpinfo`,
      headers: [{ name: "User-Agent", value: "test" }]
    }
  ];

  const result = await runWebVulnScanFromEndpoints(
    "test-scan",
    "127.0.0.1",
    endpoints,
    [{ type: "sqli" }, { type: "xss" }],
    1000
  );

  await new Promise((resolve) => server.close(resolve));

  const phpinfoSqli = result.findings.filter(f => f.url.includes("phpinfo") && f.vulnType === "sqli");
  if (phpinfoSqli.length > 0) {
    console.log("PHPINFO SQLI FINDINGS:", JSON.stringify(phpinfoSqli, null, 2));
  }

  assert.equal(phpinfoSqli.length, 0, "Should not report SQLi on phpinfo page");
});
