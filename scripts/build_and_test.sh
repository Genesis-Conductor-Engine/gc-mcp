#!/usr/bin/env bash
# gc-mcp — Build, typecheck, smoke-test
# Usage: cd ~/gc-workers && bash build_and_test.sh
set -euo pipefail

echo "[1/5] Extracting gc-mcp.tar.gz"
tar -xzf gc-mcp.tar.gz
cd gc-mcp

echo "[2/5] Installing dependencies"
npm install

echo "[3/5] TypeScript build"
npm run build

echo "[4/5] Type check (strict)"
npx tsc --noEmit

echo "[5/5] MCP Inspector smoke test"
echo "Starting inspector — verify all 7 gc_* tools are listed, then Ctrl+C."
npx @modelcontextprotocol/inspector node dist/stdio.js

echo ""
echo "✅ Build and test complete."
echo "Next: configure env and run deploy_cf_worker.sh or wire_mcp_clients.sh"
