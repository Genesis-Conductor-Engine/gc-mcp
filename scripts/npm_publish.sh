#!/usr/bin/env bash
# gc-mcp — npm publish (P2)
# Prereq: npm login complete, @kovach-enterprises org exists, build_and_test.sh passed
set -euo pipefail
cd ~/gc-workers/gc-mcp

echo "[1/5] Verifying logged in"
npm whoami

echo "[2/5] Verifying clean working tree"
git status --porcelain | grep -q . && { echo "Working tree dirty — commit or stash first"; exit 1; } || true

echo "[3/5] Verifying tag"
VER=$(node -e 'console.log(require("./package.json").version)')
echo "Version to publish: $VER"
git tag "v$VER" 2>/dev/null || echo "Tag v$VER already exists (idempotent)"

echo "[4/5] Dry run"
npm publish --access public --dry-run

read -r -p "[5/5] Proceed with real publish? (y/N) " confirm
[ "$confirm" = "y" ] || { echo "Aborted."; exit 0; }
npm publish --access public

git push origin "v$VER" 2>/dev/null || echo "(skip tag push; configure remote if needed)"

echo ""
echo "✅ Published @kovach-enterprises/gc-mcp-server@$VER"
echo "Verify: https://www.npmjs.com/package/@kovach-enterprises/gc-mcp-server"
echo ""
echo "Next: settle proof on-chain via genesis-conductor:settle_proof"
echo "  task_id: hybrid-1778417409914-vjp8p3meu"
echo "  proof_hash: <sha256 of dist/stdio.js + dist/http.js>"
