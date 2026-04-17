import { writeFileSync } from "node:fs";

const targetUrl = process.argv[2];
const vulnTypes = (process.argv[3] ?? "xxe,xss,sqli,ssrf,path-traversal").split(",");
const outputPath = process.argv[4] ?? "./reports/vuln-scan.json";

const config = {
  id: "ci-web-vuln-scan",
  target: targetUrl,
  harPath: "./target.har",
  vulns: vulnTypes.filter(Boolean).map((t) => ({ type: t.trim() })),
  timeoutMs: 15000,
};

writeFileSync(outputPath, JSON.stringify(config, null, 2), "utf8");
