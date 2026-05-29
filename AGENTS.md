# AGENTS.md — gc-mcp-server

This repo is the canonical implementation of the Genesis Conductor universal MCP server.

## Quick commands (after clone)
```bash
npm install
npm run build
npm test
npm run bench:local          # exercises all 7 tools (local error surfaces + list_agents)
npm run inspect              # MCP Inspector smoke test
```

## Baremetal / diamondnode
SSH alias `diamondnode` (192.168.1.228, GTX 1650) is the authoritative real-hardware validation surface.
- `rsync` tree → `~/gc-mcp` on target
- Run the same `npm run bench:local` there for "real diamondnode GTX 1650" provenance reports

## Key artifacts for agents
- `llms.txt` — optimized for LLM ingestion / GEO
- `landing/index.html` — self-contained marketing + demo surface (Tailwind CDN)
- `.claude/skills/gc-connect/` + `gc-connect.skill` — Claude marketplace / skill ready
- `smithery.json` — registry manifest for smithery-mcp-orchestrator style systems
- `scripts/bench.ts` — the capability harness (direct handler invocation, structuredContent validation, full provenance)
- `HANDOFF.jsonl` + bench reports — Phase 6 provenance + real numbers

## Compliance invariant
Any non-trivial write path must be followed (in the calling agent) by `gc_write_soul_capsule(type="trace", session_id, source, payload)`.

ORCID `0009-0008-8389-1297` is the canonical author.

## Visibility / traction
- GitHub topics: mcp, eu-ai-act, claude-desktop, soul-capsule, etc.
- Prioritize llms.txt + excellent README + real bench data for LLM crawlers and human trust.
- Companion skill (gc-connect) should be kept in sync with tool surface changes.

Update this file when architecture, deployment, or agent-facing contracts change.
