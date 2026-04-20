import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { loadScanConfig, runScan } from "@nullbunny/core";
import { runReconScan } from "@nullbunny/recon";
import { runWebVulnScanFromEndpoints } from "@nullbunny/web";
import { createProvider } from "@nullbunny/providers";

export async function startMcpServer() {
  const server = new Server({
    name: "nullbunny-mcp-server",
    version: "0.1.0",
  }, {
    capabilities: {
      tools: {}
    }
  });

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        {
          name: "llm_security_scan",
          description: "Run an AI red team security scan against an LLM provider to test for jailbreaks, prompt injections, and other vulnerabilities.",
          inputSchema: {
            type: "object",
            properties: {
              configPath: { type: "string", description: "Path to the scan config JSON file" }
            },
            required: ["configPath"]
          }
        },
        {
          name: "web_vuln_scan",
          description: "Run a web vulnerability scan on given endpoints to test for XSS, SQLi, IDOR, etc.",
          inputSchema: {
            type: "object",
            properties: {
              scanId: { type: "string" },
              targetUrl: { type: "string" },
              endpoints: { 
                type: "array", 
                items: { 
                  type: "object",
                  properties: {
                    method: { type: "string" },
                    url: { type: "string" }
                  }
                } 
              },
              vulnTypes: {
                type: "array",
                items: { type: "string" }
              }
            },
            required: ["scanId", "targetUrl", "endpoints", "vulnTypes"]
          }
        },
        {
          name: "recon_scan",
          description: "Run an infrastructure reconnaissance scan including port scanning, banner grabbing, and subdomain enumeration.",
          inputSchema: {
            type: "object",
            properties: {
              target: { type: "string" },
              hosts: { type: "array", items: { type: "string" } },
              ports: { type: "string" },
              detectMiddleware: { type: "boolean" },
              grabBanner: { type: "boolean" }
            },
            required: ["target", "hosts", "ports"]
          }
        },
        {
          name: "provider_health_check",
          description: "Test connectivity and model availability for an LLM provider.",
          inputSchema: {
            type: "object",
            properties: {
              providerType: { type: "string" },
              baseUrl: { type: "string" },
              apiKey: { type: "string" },
              model: { type: "string" }
            },
            required: ["providerType", "baseUrl", "model"]
          }
        }
      ]
    };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      if (name === "llm_security_scan") {
        const configPath = args?.configPath as string;
        const config = await loadScanConfig(configPath);
        const result = await runScan(config);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }]
        };
      }

      if (name === "web_vuln_scan") {
        const scanId = args?.scanId as string;
        const targetUrl = args?.targetUrl as string;
        const endpoints = args?.endpoints as any[];
        const vulnTypes = args?.vulnTypes as string[];
        
        const mappedVulns = vulnTypes.map(t => ({ type: t as any }));
        const result = await runWebVulnScanFromEndpoints(scanId, targetUrl, endpoints, mappedVulns, 10000);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }]
        };
      }

      if (name === "recon_scan") {
        const target = args?.target as string;
        const hosts = args?.hosts as string[];
        const ports = args?.ports as string;
        const detectMiddleware = !!args?.detectMiddleware;
        const grabBanner = !!args?.grabBanner;

        const result = await runReconScan({
          scanId: `recon-${Date.now()}`,
          target,
          hosts,
          ports,
          detectMiddleware,
          grabBanner
        });
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }]
        };
      }

      if (name === "provider_health_check") {
        const providerType = args?.providerType as any;
        const baseUrl = args?.baseUrl as string;
        const apiKey = args?.apiKey as string | undefined;
        const model = args?.model as string;

        const provider = createProvider({
          id: "mcp-test",
          type: providerType,
          baseUrl,
          apiKey,
          model
        });

        const result = await provider.healthCheck();
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }]
        };
      }

      return {
        isError: true,
        content: [{ type: "text", text: `Unknown tool: ${name}` }]
      };
    } catch (error: any) {
      return {
        isError: true,
        content: [{ type: "text", text: error.message || "An error occurred" }]
      };
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("NullBunny MCP Server is running on stdio");
}