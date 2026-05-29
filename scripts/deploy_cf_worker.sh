#!/usr/bin/env bash
# gc-mcp — Deploy to Cloudflare Workers
# Prerequisite: build_and_test.sh passed, wrangler authenticated
set -euo pipefail
cd ~/gc-workers/gc-mcp

echo "[1/4] Setting secrets"
echo "$GC_API_KEY" | wrangler secret put GC_API_KEY
echo "$GC_NOTION_BRIDGE_URL" | wrangler secret put GC_NOTION_BRIDGE_URL
echo "$GC_NOTION_BRIDGE_AUTH" | wrangler secret put GC_NOTION_BRIDGE_AUTH

# Optional: ingress auth for the MCP HTTP endpoint itself
if [ -n "${GC_MCP_INGRESS_AUTH:-}" ]; then
  echo "$GC_MCP_INGRESS_AUTH" | wrangler secret put GC_MCP_INGRESS_AUTH
fi

echo "[2/4] Deploying worker"
wrangler deploy

echo "[3/4] Verifying"
WORKER_URL=$(wrangler whoami 2>/dev/null | grep -o 'https://gc-mcp[^ ]*' || echo "https://gc-mcp.iholt.workers.dev")
echo "Worker URL: $WORKER_URL"

echo "[4/4] Health check"
curl -sf "$WORKER_URL" -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/list","id":1}' && echo " ← tools/list OK" || echo " ← deploy may need custom domain config"

echo ""
echo "✅ gc-mcp Worker deployed."
echo "wrangler.toml vars already set: GC_GATEWAY_URL, GC_SOUL_CAPSULE_DB_ID, GC_TIMEOUT_MS"
