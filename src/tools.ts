/**
 * Genesis Conductor MCP tool registrations.
 *
 * Each tool: Zod input schema, Zod output schema, structured-content response.
 * Tools are registered against the high-level `McpServer` from @modelcontextprotocol/sdk.
 *
 * Naming: every tool is prefixed `gc_` to avoid collision with future MCPs (Stripe, GitHub, Pareto).
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  AGENT_REGISTRY,
  GcApiError,
  type GcConfig,
  gatewayFetch,
  notionBridgePost,
  querySoulCapsules,
} from "./api.js";

/** Helper: convert any error into the {content, structuredContent, isError} shape. */
function toErrorResult(err: unknown) {
  const message =
    err instanceof GcApiError
      ? err.message
      : err instanceof Error
        ? err.message
        : String(err);
  return {
    content: [{ type: "text" as const, text: `Error: ${message}` }],
    structuredContent: { error: message },
    isError: true,
  };
}

/** Helper: success result with structured content. */
function toSuccessResult<T>(data: T) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
    structuredContent: data as Record<string, unknown>,
    isError: false,
  };
}

/* -------------------------------------------------------------------------- */
/* Schemas                                                                     */
/* -------------------------------------------------------------------------- */

const TaskEnvelopeInput = z.object({
  description: z.string().min(1).describe("Natural-language description of the task to execute."),
  request_type: z
    .enum([
      "ambient_action",
      "inline_suggestion",
      "code_generation",
      "refactor",
      "analysis",
      "synthesis",
      "multimodal",
      "search",
    ])
    .describe("Routing key. Determines candidate_agents at the gateway."),
  workspace_id: z.string().optional().describe("Optional workspace id (cached from a prior task in the same session)."),
  session_id: z.string().optional().describe("Optional session id for trace correlation."),
  metadata: z.record(z.unknown()).optional().describe("Free-form metadata; merged into TaskEnvelope.metadata."),
});

const SubmitTaskOutput = z.object({
  task_id: z.string(),
  job_id: z.string().optional(),
  workspace_id: z.string().optional(),
  agent_routed_to: z.string().optional(),
  status: z.string(),
});

const GetTaskInput = z.object({
  task_id: z.string().min(1).describe("Task id returned from gc_submit_task."),
});

const GetJobInput = z.object({
  job_id: z.string().min(1).describe("Job id (often returned alongside task_id from gc_submit_task)."),
});

const TaskStatusOutput = z.object({
  task_id: z.string(),
  status: z.string(),
  job_ids: z.array(z.string()).optional(),
  result: z.unknown().optional(),
  updated_at: z.string().optional(),
});

const SoulCapsuleType = z
  .enum(["decision", "trace", "telemetry", "artifact"])
  .describe("Capsule record type. 'decision' for S-ToT path picks; 'trace' for tool calls; 'telemetry' for run summaries; 'artifact' for emitted file references.");

const WriteCapsuleInput = z.object({
  type: SoulCapsuleType,
  session_id: z.string().min(1),
  trace_id: z.string().optional(),
  source: z.string().min(1).describe('Originating agent identifier, e.g. "claude-opus-4.7", "kiro", "codex".'),
  payload: z.record(z.unknown()).describe("Capsule body. Will be JSON-stringified into the page code block."),
  spec_anchor: z.string().optional().describe("Optional reference to source-of-truth document (URL or §-ref)."),
});

const WriteCapsuleOutput = z.object({
  success: z.boolean(),
  page_id: z.string().optional(),
  url: z.string().optional(),
});

const QueryCapsuleInput = z.object({
  session_id: z.string().optional(),
  trace_id: z.string().optional(),
  type: SoulCapsuleType.optional(),
  limit: z.number().int().positive().max(100).default(25),
});

const QueryCapsuleOutput = z.object({
  results: z.array(z.record(z.unknown())),
  count: z.number().int(),
});

const ListAgentsInput = z.object({});
const ListAgentsOutput = z.object({
  agents: z.array(
    z.object({
      id: z.string(),
      policy_tier: z.string(),
      candidate_for: z.array(z.string()),
    }),
  ),
});

const TelemetryInput = z.object({
  window: z.enum(["1h", "24h", "7d"]).default("24h"),
});

const TelemetryOutput = z.object({
  window: z.string(),
  task_count: z.number().int(),
  avg_latency_ms: z.number().optional(),
  eta_thermo: z.number().optional(),
  cost_usd: z.number().optional(),
  capsule_count: z.number().int().optional(),
});

/* -------------------------------------------------------------------------- */
/* Registration                                                                */
/* -------------------------------------------------------------------------- */

export function registerTools(server: McpServer, cfg: GcConfig): void {
  // -------- gc_submit_task ------------------------------------------------
  server.registerTool(
    "gc_submit_task",
    {
      title: "Submit task to Genesis Conductor",
      description:
        "Submit a TaskEnvelope to the Ambient Access Layer gateway. Returns task_id, job_id, workspace_id, and the agent the task was routed to. Use this whenever the user wants work to execute asynchronously via a specialized agent (kiro/codex/claude/gemini/copilot).",
      inputSchema: TaskEnvelopeInput.shape,
      outputSchema: SubmitTaskOutput.shape,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (input) => {
      try {
        const body = {
          description: input.description,
          request_type: input.request_type,
          workspace_id: input.workspace_id,
          session_id: input.session_id,
          metadata: input.metadata ?? {},
        };
        const data = await gatewayFetch<Record<string, unknown>>(cfg, "/v1/tasks", {
          method: "POST",
          body: JSON.stringify(body),
        });
        const parsed = SubmitTaskOutput.parse({
          task_id: data["task_id"] ?? data["id"],
          job_id: data["job_id"],
          workspace_id: data["workspace_id"],
          agent_routed_to: data["agent_routed_to"] ?? data["agent"],
          status: (data["status"] as string) ?? "submitted",
        });
        return toSuccessResult(parsed);
      } catch (err) {
        return toErrorResult(err);
      }
    },
  );

  // -------- gc_get_task_status -------------------------------------------
  server.registerTool(
    "gc_get_task_status",
    {
      title: "Get task status",
      description:
        "Poll a task by id. NOTE: as of 2026-05-09, the gateway's GET /v1/tasks/{id} returns stub data for some task ids (tracked in Kovach-Enterprises/ambient-access-layer issue #1). Treat results as best-effort until that fix lands.",
      inputSchema: GetTaskInput.shape,
      outputSchema: TaskStatusOutput.shape,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (input) => {
      try {
        const data = await gatewayFetch<Record<string, unknown>>(
          cfg,
          `/v1/tasks/${encodeURIComponent(input.task_id)}`,
        );
        const parsed = TaskStatusOutput.parse({
          task_id: input.task_id,
          status: (data["status"] as string) ?? "unknown",
          job_ids: data["job_ids"],
          result: data["result"],
          updated_at: data["updated_at"],
        });
        return toSuccessResult(parsed);
      } catch (err) {
        return toErrorResult(err);
      }
    },
  );

  // -------- gc_get_job_status --------------------------------------------
  server.registerTool(
    "gc_get_job_status",
    {
      title: "Get job status",
      description:
        "Poll a job by id. NOTE: known fabricated-data issue tracked in Kovach-Enterprises/ambient-access-layer; pre-fix release.",
      inputSchema: GetJobInput.shape,
      outputSchema: z.object({
        job_id: z.string(),
        task_id: z.string().optional(),
        status: z.string(),
        result: z.unknown().optional(),
      }).shape,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (input) => {
      try {
        const data = await gatewayFetch<Record<string, unknown>>(
          cfg,
          `/v1/jobs/${encodeURIComponent(input.job_id)}`,
        );
        return toSuccessResult({
          job_id: input.job_id,
          task_id: data["task_id"],
          status: (data["status"] as string) ?? "unknown",
          result: data["result"],
        });
      } catch (err) {
        return toErrorResult(err);
      }
    },
  );

  // -------- gc_write_soul_capsule ----------------------------------------
  server.registerTool(
    "gc_write_soul_capsule",
    {
      title: "Write Soul Capsule record",
      description:
        "Append a capsule (decision/trace/telemetry/artifact) to the Soul Capsule database via the notion-bridge Worker. Provides immutable WPP-aligned logging for EU AI Act traceability.",
      inputSchema: WriteCapsuleInput.shape,
      outputSchema: WriteCapsuleOutput.shape,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (input) => {
      try {
        const data = await notionBridgePost<Record<string, unknown>>(cfg, {
          action: input.type.toUpperCase(),
          session_id: input.session_id,
          trace_id: input.trace_id,
          source: input.source,
          payload: input.payload,
          spec_anchor: input.spec_anchor,
          ts: new Date().toISOString(),
        });
        const parsed = WriteCapsuleOutput.parse({
          success: Boolean(data["success"] ?? true),
          page_id: data["page_id"] as string | undefined,
          url: (data["url"] as string | undefined) ??
            (data["page_id"] ? `https://www.notion.so/${String(data["page_id"]).replace(/-/g, "")}` : undefined),
        });
        return toSuccessResult(parsed);
      } catch (err) {
        return toErrorResult(err);
      }
    },
  );

  // -------- gc_query_soul_capsule ----------------------------------------
  server.registerTool(
    "gc_query_soul_capsule",
    {
      title: "Query Soul Capsule records",
      description:
        "Query the Soul Capsule database by session_id / trace_id / type. Returns the matching records (capped at 100). Useful for reconstructing a session's decision trail.",
      inputSchema: QueryCapsuleInput.shape,
      outputSchema: QueryCapsuleOutput.shape,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (input) => {
      try {
        const data = (await querySoulCapsules(cfg, {
          sessionId: input.session_id,
          traceId: input.trace_id,
          type: input.type,
          limit: input.limit,
        })) as { results?: Record<string, unknown>[] };
        const results = data?.results ?? [];
        return toSuccessResult({ results, count: results.length });
      } catch (err) {
        return toErrorResult(err);
      }
    },
  );

  // -------- gc_list_agents -----------------------------------------------
  server.registerTool(
    "gc_list_agents",
    {
      title: "List registered agents",
      description:
        "List the registered agents in the Genesis Conductor routing table. Returns each agent's id, policy_tier (edge|swarm), and request_type candidacy. Use this before gc_submit_task to choose request_type intentionally.",
      inputSchema: ListAgentsInput.shape,
      outputSchema: ListAgentsOutput.shape,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async () => {
      const agents = AGENT_REGISTRY.map((a) => ({
        id: a.id,
        policy_tier: a.policy_tier,
        candidate_for: [...a.candidate_for],
      }));
      return toSuccessResult({ agents });
    },
  );

  // -------- gc_get_telemetry ---------------------------------------------
  server.registerTool(
    "gc_get_telemetry",
    {
      title: "Get recent telemetry",
      description:
        "Fetch a telemetry snapshot from the gateway: task count, average latency, η_thermo (Landauer-anchored efficiency), cost, capsule count. Window: 1h | 24h | 7d.",
      inputSchema: TelemetryInput.shape,
      outputSchema: TelemetryOutput.shape,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (input) => {
      try {
        const data = await gatewayFetch<Record<string, unknown>>(
          cfg,
          `/v1/telemetry?window=${input.window}`,
        );
        const parsed = TelemetryOutput.parse({
          window: input.window,
          task_count: Number(data["task_count"] ?? 0),
          avg_latency_ms:
            data["avg_latency_ms"] !== undefined ? Number(data["avg_latency_ms"]) : undefined,
          eta_thermo: data["eta_thermo"] !== undefined ? Number(data["eta_thermo"]) : undefined,
          cost_usd: data["cost_usd"] !== undefined ? Number(data["cost_usd"]) : undefined,
          capsule_count:
            data["capsule_count"] !== undefined ? Number(data["capsule_count"]) : undefined,
        });
        return toSuccessResult(parsed);
      } catch (err) {
        return toErrorResult(err);
      }
    },
  );
}
