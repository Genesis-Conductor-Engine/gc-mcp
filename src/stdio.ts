#!/usr/bin/env node
/**
 * stdio entrypoint. Reads MCP frames from stdin, writes to stdout.
 *
 * Used by:
 *  - Claude Desktop (claude_desktop_config.json -> mcpServers.gc.command="gc-mcp")
 *  - Cursor / Continue (settings -> mcp -> stdio command)
 *  - Local research agents launching the binary directly
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer, loadConfigFromEnv } from "./index.js";

async function main(): Promise<void> {
  let cfg;
  try {
    cfg = loadConfigFromEnv();
  } catch (err) {
    console.error(`[gc-mcp] config error: ${(err as Error).message}`);
    process.exit(1);
  }

  const server = createServer(cfg);
  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Graceful shutdown.
  const shutdown = (signal: string) => {
    console.error(`[gc-mcp] received ${signal}, closing…`);
    server.close().finally(() => process.exit(0));
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

main().catch((err) => {
  console.error("[gc-mcp] fatal:", err);
  process.exit(1);
});
