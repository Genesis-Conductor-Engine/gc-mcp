#!/usr/bin/env bash
# gc-mcp — Wire stdio into local MCP clients
# Run on macOS host (diamondnode). For Linux/Windows, paths differ — see comments.
set -euo pipefail

# Required env (export before running):
: "${GC_API_KEY:?Set GC_API_KEY before running}"
: "${GC_NOTION_BRIDGE_URL:?Set GC_NOTION_BRIDGE_URL=https://notion-bridge.iholt.workers.dev}"
: "${GC_NOTION_BRIDGE_AUTH:?Set GC_NOTION_BRIDGE_AUTH=$GATEWAY_AUTH_SECRET}"

# ──────────────────────────────────────────────────────────────────────────────
# 1) Claude Desktop
# ──────────────────────────────────────────────────────────────────────────────
CD_CFG="${HOME}/Library/Application Support/Claude/claude_desktop_config.json"
# Linux: ~/.config/Claude/claude_desktop_config.json
# Windows: %APPDATA%/Claude/claude_desktop_config.json

echo "[1/3] Patching Claude Desktop config at $CD_CFG"
mkdir -p "$(dirname "$CD_CFG")"
if [ ! -f "$CD_CFG" ]; then echo '{}' > "$CD_CFG"; fi

python3 - "$CD_CFG" <<PY
import json, sys, os
path = sys.argv[1]
with open(path) as f:
    cfg = json.load(f)
cfg.setdefault("mcpServers", {})["gc"] = {
    "command": "gc-mcp",
    "env": {
        "GC_API_KEY": os.environ["GC_API_KEY"],
        "GC_NOTION_BRIDGE_URL": os.environ["GC_NOTION_BRIDGE_URL"],
        "GC_NOTION_BRIDGE_AUTH": os.environ["GC_NOTION_BRIDGE_AUTH"],
    },
}
with open(path, "w") as f:
    json.dump(cfg, f, indent=2)
print("Claude Desktop config patched.")
PY

# ──────────────────────────────────────────────────────────────────────────────
# 2) Cursor
# ──────────────────────────────────────────────────────────────────────────────
CURSOR_CFG="${HOME}/.cursor/mcp.json"
echo "[2/3] Patching Cursor config at $CURSOR_CFG"
mkdir -p "$(dirname "$CURSOR_CFG")"
if [ ! -f "$CURSOR_CFG" ]; then echo '{}' > "$CURSOR_CFG"; fi

python3 - "$CURSOR_CFG" <<PY
import json, sys, os
path = sys.argv[1]
with open(path) as f:
    cfg = json.load(f)
cfg.setdefault("mcpServers", {})["gc"] = {
    "command": "gc-mcp",
    "env": {
        "GC_API_KEY": os.environ["GC_API_KEY"],
        "GC_NOTION_BRIDGE_URL": os.environ["GC_NOTION_BRIDGE_URL"],
        "GC_NOTION_BRIDGE_AUTH": os.environ["GC_NOTION_BRIDGE_AUTH"],
    },
}
with open(path, "w") as f:
    json.dump(cfg, f, indent=2)
print("Cursor config patched.")
PY

# ──────────────────────────────────────────────────────────────────────────────
# 3) Continue (VS Code / JetBrains)
# ──────────────────────────────────────────────────────────────────────────────
CONTINUE_CFG="${HOME}/.continue/config.json"
echo "[3/3] Patching Continue config at $CONTINUE_CFG"
mkdir -p "$(dirname "$CONTINUE_CFG")"
if [ ! -f "$CONTINUE_CFG" ]; then echo '{}' > "$CONTINUE_CFG"; fi

python3 - "$CONTINUE_CFG" <<PY
import json, sys, os
path = sys.argv[1]
with open(path) as f:
    cfg = json.load(f)
cfg.setdefault("mcpServers", []).append({
    "name": "gc",
    "command": "gc-mcp",
    "env": {
        "GC_API_KEY": os.environ["GC_API_KEY"],
        "GC_NOTION_BRIDGE_URL": os.environ["GC_NOTION_BRIDGE_URL"],
        "GC_NOTION_BRIDGE_AUTH": os.environ["GC_NOTION_BRIDGE_AUTH"],
    },
})
with open(path, "w") as f:
    json.dump(cfg, f, indent=2)
print("Continue config patched.")
PY

echo ""
echo "✅ All 3 MCP clients wired."
echo "Restart Claude Desktop / Cursor / Continue to pick up the gc_* tools."
echo "Verify: in any of them, ask 'list gc agents' → should return kiro/codex/claude/gemini/copilot."
