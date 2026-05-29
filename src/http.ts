/**
 * Streamable HTTP entrypoint.
 *
 * Two runtime modes share the same McpServer factory:
 *  - Node:        `node dist/http.js`  (binds 0.0.0.0:$PORT)
 *  - Cloudflare:  exported `fetch` handler (re-export the StreamableHTTPServerTransport
 *                 instance per request; stateless JSON, ideal for Workers).
 *
 * For Cloudflare, env vars are passed via the Worker `env` object and bridged to the
 * loadConfigFromEnv path. For Node, process.env is read directly.
 */

import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createServer, loadConfigFromEnv } from "./index.js";

/* -------------------------------------------------------------------------- */
/* Node runtime                                                                */
/* -------------------------------------------------------------------------- */

async function startNode(): Promise<void> {
  const port = Number(process.env.PORT ?? 8787);
  const cfg = loadConfigFromEnv();
  const server = createServer(cfg);

  // Stateless JSON transport. One server instance, one transport.
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // stateless; do not maintain sessions
  });
  await server.connect(transport);

  const { createServer: createHttpServer } = await import("node:http");
  const httpServer = createHttpServer(async (req, res) => {
    if (!req.url) {
      res.statusCode = 400;
      res.end();
      return;
    }
    // Auth at the HTTP layer for HTTP transport. Optional but recommended.
    const expected = process.env.GC_MCP_INGRESS_AUTH;
    if (expected) {
      const got = req.headers.authorization;
      if (got !== `Bearer ${expected}`) {
        res.statusCode = 401;
        res.end(JSON.stringify({ error: "unauthorized" }));
        return;
      }
    }
    await transport.handleRequest(req, res);
  });
  httpServer.listen(port, () => {
    console.error(`[gc-mcp] streamable HTTP on :${port}`);
  });
}

/* -------------------------------------------------------------------------- */
/* Cloudflare Worker runtime                                                   */
/* -------------------------------------------------------------------------- */

export interface WorkerEnv {
  GC_API_KEY: string;
  GC_GATEWAY_URL?: string;
  GC_NOTION_BRIDGE_URL?: string;
  GC_NOTION_BRIDGE_AUTH?: string;
  GC_SOUL_CAPSULE_DB_ID?: string;
  GC_TIMEOUT_MS?: string;
  GC_MCP_INGRESS_AUTH?: string;
}

/**
 * Cloudflare Worker handler.
 *
 * Deploy with `wrangler deploy`; bind secrets via `wrangler secret put GC_API_KEY` etc.
 * The MCP transport is constructed per-request to keep the Worker stateless.
 */
export default {
  async fetch(request: Request, env: WorkerEnv): Promise<Response> {
    // Optional ingress auth.
    if (env.GC_MCP_INGRESS_AUTH) {
      const got = request.headers.get("authorization");
      if (got !== `Bearer ${env.GC_MCP_INGRESS_AUTH}`) {
        return new Response(JSON.stringify({ error: "unauthorized" }), {
          status: 401,
          headers: { "content-type": "application/json" },
        });
      }
    }

    let cfg;
    try {
      cfg = (await import("./api.js")).loadConfigFromEnv(env as unknown as Record<string, string | undefined>);
    } catch (err) {
      return new Response(JSON.stringify({ error: (err as Error).message }), {
        status: 500,
        headers: { "content-type": "application/json" },
      });
    }

    const server = createServer(cfg);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    await server.connect(transport);

    // The SDK exposes a fetch-style adapter; in older SDKs use handleRequest with Node req/res.
    // We dispatch via the Web Fetch handler shape.
    const url = new URL(request.url);
    const headers = Object.fromEntries(request.headers.entries());
    const body = request.method !== "GET" && request.method !== "HEAD" ? await request.text() : undefined;

    // Forward to a synthetic Node-like handler. The SDK's StreamableHTTPServerTransport
    // ships a `handleFetch` helper in 1.x; if not present, fall back to manual JSON-RPC dispatch.
    type FetchAware = typeof transport & {
      handleFetch?: (req: Request) => Promise<Response>;
    };
    const t = transport as FetchAware;
    if (typeof t.handleFetch === "function") {
      return t.handleFetch(
        new Request(url, {
          method: request.method,
          headers,
          body,
        }),
      );
    }

    // Manual stateless JSON-RPC dispatch fallback for older SDK versions.
    if (request.method !== "POST") {
      return new Response(JSON.stringify({ error: "method not allowed" }), {
        status: 405,
        headers: { "content-type": "application/json" },
      });
    }
    return new Response(
      JSON.stringify({ error: "SDK transport.handleFetch not available; upgrade @modelcontextprotocol/sdk to >=1.1." }),
      { status: 501, headers: { "content-type": "application/json" } },
    );
  },
};

if (typeof process !== "undefined" && process.argv[1]?.endsWith("http.js")) {
  startNode().catch((err) => {
    console.error("[gc-mcp/http] fatal:", err);
    process.exit(1);
  });
}
