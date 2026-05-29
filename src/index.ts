/**
 * Server factory. Both stdio and HTTP entrypoints construct an McpServer the same way.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { type GcConfig } from "./api.js";
import { registerTools } from "./tools.js";

export function createServer(cfg: GcConfig): McpServer {
  const server = new McpServer(
    {
      name: "gc-mcp-server",
      version: "0.1.0",
    },
    {
      capabilities: {
        tools: {},
      },
      instructions:
        "Genesis Conductor MCP server. Exposes 7 tools (gc_*) wrapping the Ambient Access Layer gateway, the Soul Capsule database (via notion-bridge Worker), and the agent routing table. " +
        "When submitting tasks, prefer gc_list_agents first to choose request_type intentionally. " +
        "When you do anything significant, follow up with gc_write_soul_capsule(type='trace') to maintain WPP / EU AI Act traceability.",
    },
  );

  registerTools(server, cfg);

  return server;
}

export { type GcConfig, loadConfigFromEnv } from "./api.js";
