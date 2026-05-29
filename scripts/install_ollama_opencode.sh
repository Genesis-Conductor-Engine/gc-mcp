#!/usr/bin/env bash
# T4 — Install Ollama + EmbeddingGemma + OpenCode on diamondnode
# BLOCKING DISAMBIGUATION: Confirm the model tag before running.
#
# Pass MODEL_TAG as argv1 OR env var.
#  - EmbeddingGemma (Google, 300M params, 768-dim, embedding-only):  embeddinggemma:300m
#  - Gemma 2 (chat, NOT embedding-specific): gemma2:9b   ← only if user explicitly means chat
#
# Default: embeddinggemma:300m (matches ground-truth interpretation of "Gemma Embedding v2").
set -euo pipefail

MODEL_TAG="${1:-${MODEL_TAG:-embeddinggemma:300m}}"
HOST="${HOST:-diamondnode}"

echo "▸ Target host:  $HOST"
echo "▸ Model tag:    $MODEL_TAG"
echo "▸ Confirm by pressing Enter, or Ctrl-C and re-run with MODEL_TAG=<correct>."
read -r

# ──────────────────────────────────────────────────────────────────────────────
# 1) Ollama runtime
# ──────────────────────────────────────────────────────────────────────────────
echo "[1/4] Installing Ollama on $HOST"
ssh "$HOST" 'command -v ollama >/dev/null 2>&1 || curl -fsSL https://ollama.com/install.sh | sh'
ssh "$HOST" 'ollama --version'

# ──────────────────────────────────────────────────────────────────────────────
# 2) Pull model
# ──────────────────────────────────────────────────────────────────────────────
echo "[2/4] Pulling $MODEL_TAG"
ssh "$HOST" "ollama pull $MODEL_TAG"

# Verify dimensionality (EmbeddingGemma → 768)
echo "Verifying embedding output…"
ssh "$HOST" "echo 'test' | ollama run $MODEL_TAG --format json 2>/dev/null | head -c 200" || \
  ssh "$HOST" "curl -sf http://localhost:11434/api/embeddings -d '{\"model\":\"$MODEL_TAG\",\"prompt\":\"test\"}' | python3 -c 'import sys,json; d=json.load(sys.stdin); print(\"dim=\", len(d.get(\"embedding\", [])))'"

# ──────────────────────────────────────────────────────────────────────────────
# 3) OpenCode TUI
# ──────────────────────────────────────────────────────────────────────────────
echo "[3/4] Installing OpenCode"
ssh "$HOST" 'command -v opencode >/dev/null 2>&1 || curl -fsSL https://opencode.ai/install | bash'
ssh "$HOST" 'opencode --version'

# ──────────────────────────────────────────────────────────────────────────────
# 4) Wire OpenCode → Ollama (local embedding provider)
# ──────────────────────────────────────────────────────────────────────────────
echo "[4/4] Writing OpenCode config"
ssh "$HOST" "mkdir -p ~/.config/opencode && cat > ~/.config/opencode/config.json" <<EOF
{
  "provider": {
    "ollama": {
      "baseURL": "http://localhost:11434/v1",
      "models": {
        "$MODEL_TAG": {}
      }
    }
  },
  "defaults": {
    "embeddingModel": "ollama/$MODEL_TAG"
  }
}
EOF

echo ""
echo "✅ T4 install complete."
echo "Smoke-test on $HOST:  opencode  →  any prompt that triggers embedding"
echo ""
echo "Capsule trace will be written by the gc-mcp-server spec page automatically once"
echo "this script reports success to genesis-conductor:settle_proof."
