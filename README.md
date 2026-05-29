# `@kovach-enterprises/gc-mcp-server`

> Universal AI MCP server for **Genesis Conductor**. Wraps the Ambient Access Layer gateway, the Soul Capsule database, the agent routing table, and telemetry as standard MCP tools so any LLM client (Claude Desktop, Cursor, Continue, ChatGPT custom GPTs, Gemini extensions, local stdio agents) can plug in.

**v0.2.0** — Modernized, tested, and baremetal-validated on real diamondnode GTX 1650 (June 2026). See [bench reports](https://github.com/Genesis-Conductor-Engine/gc-mcp/tree/main) and [live landing page](/landing/index.html) (GEO + LLM-optimized).

| Field | Value |
|---|---|
| Package | `@kovach-enterprises/gc-mcp-server` |
| Version | `0.2.0` |
| Author | Igor Holt — ORCID [`0009-0008-8389-1297`](https://orcid.org/0009-0008-8389-1297) |
| License | Apache-2.0 |
| Transports | streamable HTTP (Node + Cloudflare Worker), stdio |
| Tools | 7 (`gc_*` prefix) |
| Spec source | Notion → Skills/Agents DB → `gc-mcp-server` row |
| GitHub | [Genesis-Conductor-Engine/gc-mcp](https://github.com/Genesis-Conductor-Engine/gc-mcp) |

---

## Tools

| Tool | R/W | Description |
|---|---|---|
| `gc_submit_task` | W | Submit a TaskEnvelope to the Ambient Access Layer; returns `task_id` + agent routing |
| `gc_get_task_status` | R | Poll a task by id |
| `gc_get_job_status` | R | Poll a job by id |
| `gc_write_soul_capsule` | W | Append a capsule (decision/trace/telemetry/artifact) via the notion-bridge Worker |
| `gc_query_soul_capsule` | R | Filter capsule records by `session_id` / `trace_id` / `type` |
| `gc_list_agents` | R | List the registered agents (kiro / codex / claude / gemini / copilot) |
| `gc_get_telemetry` | R | Recent η_thermo / cost / latency snapshot |

All tools declare `outputSchema` and return `structuredContent`. Authorization headers are redacted from error surfaces.

---

## Install

```bash
# As a dependency (project-local)
npm install @kovach-enterprises/gc-mcp-server

# Globally, exposes the `gc-mcp` binary
npm install -g @kovach-enterprises/gc-mcp-server
```

## Configure

Required env vars:

| Name | Required | Default | Notes |
|---|---|---|---|
| `GC_API_KEY` | ✅ | — | Bearer for the gateway |
| `GC_GATEWAY_URL` | | `https://optimization-inversion.genesisconductor.io` | Override for staging |
| `GC_NOTION_BRIDGE_URL` | for capsule writes | — | Deployed `notion-bridge` Worker URL |
| `GC_NOTION_BRIDGE_AUTH` | for capsule writes | — | Pairs with the Worker's `GATEWAY_AUTH_SECRET` |
| `GC_SOUL_CAPSULE_DB_ID` | | `21e416066ef1411084d1bbaf67af79d1` | Notion DB id |
| `GC_TIMEOUT_MS` | | `15000` | Soft request timeout |
| `GC_MCP_INGRESS_AUTH` | for HTTP transport | — | Optional Bearer for ingress to `gc-mcp` itself |

## Run

### stdio (local)

```bash
GC_API_KEY=sk-… gc-mcp
```

### Streamable HTTP (Node)

```bash
GC_API_KEY=sk-… PORT=8787 npm run start:http
```

### Cloudflare Worker

```bash
wrangler secret put GC_API_KEY
wrangler secret put GC_NOTION_BRIDGE_URL
wrangler secret put GC_NOTION_BRIDGE_AUTH
wrangler deploy
```

### MCP Inspector smoke test

```bash
npm run inspect
```

This runs `npx @modelcontextprotocol/inspector node dist/stdio.js`. Inspector should list all 7 `gc_*` tools.

---

## Client wiring examples

### Claude Desktop

`~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "gc": {
      "command": "gc-mcp",
      "env": {
        "GC_API_KEY": "sk-…",
        "GC_NOTION_BRIDGE_URL": "https://notion-bridge.<sub>.workers.dev",
        "GC_NOTION_BRIDGE_AUTH": "…"
      }
    }
  }
}
```

### Cursor / Continue

Both read MCP servers from a `mcp` block. Use the same stdio command:

```json
{
  "mcpServers": {
    "gc": { "command": "gc-mcp", "env": { "GC_API_KEY": "sk-…" } }
  }
}
```

### Remote HTTP client (Claude.ai connectors, ChatGPT custom GPTs)

Point the client at your deployed `https://gc-mcp.<subdomain>.workers.dev/`. If `GC_MCP_INGRESS_AUTH` is set, configure the client to send `Authorization: Bearer <ingress-token>`.

---

## Idiomatic recipes

### 1. submit-then-trace

```text
gc_list_agents → choose request_type
gc_submit_task → returns task_id, agent_routed_to
gc_write_soul_capsule(type="trace", session_id, source, payload={"task_id": …, "routed_to": …})
```

### 2. status-poll until terminal

```text
loop:
  gc_get_task_status(task_id)
  break if status in ["complete", "failed", "cancelled"]
  sleep 2s
gc_get_job_status(job_id) for each emitted job
```

### 3. session reconstruction

```text
gc_query_soul_capsule(session_id, limit=100)
→ synthesize a chronological decision trail from the returned records
```

---

## Known issues (v0.1)

| Tool | Issue | Tracker |
|---|---|---|
| `gc_get_task_status` | Returns stub data for some task ids | `Kovach-Enterprises/ambient-access-layer#1` |
| `gc_get_job_status` | Fabricated data for unknown job ids | `Kovach-Enterprises/ambient-access-layer#2` |
| `gc_query_soul_capsule` | Depends on gateway `/v1/capsules` proxy endpoint; falls back to clear "not implemented" if missing | (gateway P1) |

These are documented inside each tool's MCP description so client agents can react.

---

## Real Hardware Validation (diamondnode GTX 1650)

All 7 tools + error surfaces exercised via direct registered handler calls on baremetal Ubuntu + GTX 1650 (4 GB VRAM). 

- 7/7 tools returned valid structuredContent (or clean normalized errors)
- Local-only benchmark (dummy key): avg 65 ms, p95 273 ms on real silicon
- Full provenance reports committed (see `bench-report-*.json`)
- Repro: `npm run bench:local` (or on any diamondnode-class edge node)

This is the authoritative "actual capabilities" measurement for Phase 6.

## Compliance

Every write tool emits or expects an immutable trace via `gc_write_soul_capsule(type="trace")`. This is the WPP (Whitepaper-as-Proof Protocol) anchor for EU AI Act §16-aligned traceability. ORCID `0009-0008-8389-1297` is the canonical author signature.

## Security

- Bearer tokens are read from env only. They are never logged, never returned in error bodies, and never echoed in stdio output.
- HTTP transport supports an optional ingress Bearer (`GC_MCP_INGRESS_AUTH`) to layer authentication in front of the gateway's own auth.
- Cloudflare Worker deployment uses Wrangler secrets — never commit `.env` files.

## License

Apache-2.0. See `LICENSE`.
