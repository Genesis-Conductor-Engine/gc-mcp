# P1 Follow-ups (from Phase 6 HANDOFF)

## Known Gateway Issues (ambient-access-layer)

Tracked in the original handoff (Kovach-Enterprises/ambient-access-layer repo, currently not publicly resolvable with current auth):

1. `gc_get_task_status` — Returns stub data for some task ids. Issue #1.
2. `gc_get_job_status` — Fabricated data for unknown job ids. Issue #2.

`gc_query_soul_capsule` also has a fallback "not implemented" path if the gateway `/v1/capsules` proxy is missing.

## Immediate Client-Side Work (already done in v0.2.0)
- All tools now have explicit documentation of the pre-fix behavior in their descriptions.
- Benchmark harness (`scripts/bench.ts`) exercises the full error normalization + structuredContent paths.
- Real diamondnode + local runs confirm clean surfaces.

## Next Actions (once access confirmed)
1. Get write access to Kovach-Enterprises/ambient-access-layer (or the internal equivalent).
2. Open or update issues #1 and #2 with the exact reproduction from the bench harness (task_ids / job_ids that produce stubs).
3. Implement fixes in the gateway (better task/job state machine, real Notion proxy for capsules).
4. Re-run the live-gateway benchmark:
   ```bash
   GC_API_KEY=... GC_NOTION_BRIDGE_URL=... GC_NOTION_BRIDGE_AUTH=... npm run bench
   ```
   (or the diamondnode equivalent after rsync + sourcing sealed env).
5. Capture new bench-report with "live-gateway" mode and "real diamondnode + real keys" provenance.
6. Update tool descriptions to remove the warning text once fixed.
7. Settle proof / WPP capsule for the fix milestone.

## Related
- See `HANDOFF.jsonl` for the original P1 items and queued Notion writes.
- The `gc_write_soul_capsule` + notion-bridge path is the current reliable trace mechanism while gateway query surfaces are still maturing.

Owner: @invariantx / Igor Holt (ORCID 0009-0008-8389-1297)
Status: Awaiting external repo + secret confirmation for full execution.
