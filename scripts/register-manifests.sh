#!/usr/bin/env bash
# Register gc-mcp manifests for maximum visibility
# clawhub (skills) + smithery (MCP registry) + local .claude/ discovery
set -euo pipefail

echo "=== gc-mcp-server v0.2.0 Manifest Registration ==="
echo "This script prepares and (where possible) publishes the skill + MCP server manifests."
echo ""

echo "1) clawhub (OpenClaw / skill marketplace)"
echo "   Login if needed:"
echo "     clawhub login"
echo ""
echo "   Then publish the gc-connect skill (from repo root):"
echo "     clawhub publish .claude/skills/gc-connect --slug gc-connect --name 'gc-connect' --version 0.2.0 --tags 'mcp,genesis-conductor,eu-ai-act' --changelog 'Phase 6 build-out: v0.2.0 SDK modernization, diamondnode bench, live landing'"
echo ""

echo "2) smithery (MCP server registry)"
echo "   Login / auth as needed (OAuth flow):"
echo "     smithery mcp publish --name 'genesis-conductor-engine/gc-mcp-server' --from-build ."
echo "   Or (preferred after npm publish):"
echo "     smithery mcp publish @kovach-enterprises/gc-mcp-server"
echo ""

echo "3) Local / Claude discovery (already in repo)"
echo "   .claude/skills/gc-connect/manifest.json + gc-connect.skill"
echo "   Agents will auto-discover when the repo is in context or skill dir is symlinked."
echo ""

echo "4) GitHub + package.json (done)"
echo "   The 'mcp' block + keywords + topics already maximize GitHub/LLM discovery."
echo ""

echo "After running the publish steps above, the surface (landing + skill + MCP server) will be registered for adoption."
echo "See also: promo/X_THREAD.md for the coordinated launch post."
