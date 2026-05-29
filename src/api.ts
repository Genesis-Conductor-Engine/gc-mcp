/**
 * Genesis Conductor API client.
 *
 * Wraps:
 *  - Ambient Access Layer gateway: POST /v1/tasks, GET /v1/tasks/{id}, GET /v1/jobs/{id}
 *  - notion-bridge Worker: POST / (Soul Capsule capture)
 *  - Notion DB query (server-side rendering of capsule rows; query path is gateway-mediated)
 *
 * Auth:
 *  - GC_API_KEY → Bearer for gateway
 *  - GC_NOTION_BRIDGE_AUTH → Bearer for notion-bridge Worker (pairs to Worker GATEWAY_AUTH_SECRET)
 *
 * All errors are normalised to GcApiError so MCP tool handlers can return actionable messages.
 * Authorization headers are redacted from any error surface.
 */

export class GcApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly endpoint: string,
    message: string,
    public readonly responseBody?: unknown,
  ) {
    super(`[${status}] ${endpoint}: ${message}`);
    this.name = "GcApiError";
  }
}

export interface GcConfig {
  /** Ambient Access Layer base URL, e.g. "https://optimization-inversion.genesisconductor.io" */
  gatewayUrl: string;
  /** Bearer for the gateway. */
  apiKey: string;
  /** notion-bridge Worker URL, e.g. "https://notion-bridge.<sub>.workers.dev" */
  notionBridgeUrl?: string;
  /** Bearer for notion-bridge (pairs to Worker GATEWAY_AUTH_SECRET). */
  notionBridgeAuth?: string;
  /** Optional Notion database id for capsule reads (default: 21e416066ef1411084d1bbaf67af79d1). */
  soulCapsuleDbId?: string;
  /** Soft request timeout in ms. */
  timeoutMs?: number;
}

export const DEFAULT_SOUL_CAPSULE_DB_ID = "21e416066ef1411084d1bbaf67af79d1";

export function loadConfigFromEnv(env: Record<string, string | undefined> = process.env): GcConfig {
  const gatewayUrl = env.GC_GATEWAY_URL ?? "https://optimization-inversion.genesisconductor.io";
  const apiKey = env.GC_API_KEY;
  if (!apiKey) {
    throw new Error("GC_API_KEY is required (Bearer token for the Ambient Access Layer gateway).");
  }
  return {
    gatewayUrl,
    apiKey,
    notionBridgeUrl: env.GC_NOTION_BRIDGE_URL,
    notionBridgeAuth: env.GC_NOTION_BRIDGE_AUTH,
    soulCapsuleDbId: env.GC_SOUL_CAPSULE_DB_ID ?? DEFAULT_SOUL_CAPSULE_DB_ID,
    timeoutMs: env.GC_TIMEOUT_MS ? Number(env.GC_TIMEOUT_MS) : 15_000,
  };
}

/**
 * Build a fetch request to the gateway with Bearer auth and JSON content-type.
 * Returns parsed JSON or throws GcApiError. Authorization header is never logged.
 */
export async function gatewayFetch<T = unknown>(
  cfg: GcConfig,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const url = new URL(path, cfg.gatewayUrl).toString();
  const headers = new Headers(init.headers ?? {});
  headers.set("Authorization", `Bearer ${cfg.apiKey}`);
  headers.set("Accept", "application/json");
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), cfg.timeoutMs ?? 15_000);
  let response: Response;
  try {
    response = await fetch(url, { ...init, headers, signal: controller.signal });
  } catch (err) {
    throw new GcApiError(0, path, `network error: ${(err as Error).message}`);
  } finally {
    clearTimeout(timer);
  }

  const text = await response.text();
  let parsed: unknown = undefined;
  if (text.length > 0) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
  }

  if (!response.ok) {
    const message =
      (parsed && typeof parsed === "object" && "error" in parsed && typeof (parsed as { error: unknown }).error === "string"
        ? (parsed as { error: string }).error
        : undefined) ??
      (typeof parsed === "string" ? parsed : response.statusText);
    throw new GcApiError(response.status, path, message, parsed);
  }
  return parsed as T;
}

/**
 * Send a Soul Capsule record through the notion-bridge Worker.
 * The Worker writes a row in the Notion Soul Capsule DB and returns { success, page_id }.
 */
export async function notionBridgePost<T = unknown>(
  cfg: GcConfig,
  payload: Record<string, unknown>,
): Promise<T> {
  if (!cfg.notionBridgeUrl) {
    throw new GcApiError(
      0,
      "notion-bridge",
      "GC_NOTION_BRIDGE_URL is not configured. Set it to the deployed Worker URL.",
    );
  }
  if (!cfg.notionBridgeAuth) {
    throw new GcApiError(
      0,
      "notion-bridge",
      "GC_NOTION_BRIDGE_AUTH is not configured. Pairs with the Worker's GATEWAY_AUTH_SECRET.",
    );
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), cfg.timeoutMs ?? 15_000);
  let response: Response;
  try {
    response = await fetch(cfg.notionBridgeUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cfg.notionBridgeAuth}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } catch (err) {
    throw new GcApiError(0, "notion-bridge", `network error: ${(err as Error).message}`);
  } finally {
    clearTimeout(timer);
  }

  const text = await response.text();
  let parsed: unknown = undefined;
  if (text.length > 0) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
  }

  if (!response.ok) {
    const message =
      (parsed && typeof parsed === "object" && "error" in parsed && typeof (parsed as { error: unknown }).error === "string"
        ? (parsed as { error: string }).error
        : undefined) ??
      (typeof parsed === "string" ? parsed : response.statusText);
    throw new GcApiError(response.status, "notion-bridge", message, parsed);
  }
  return parsed as T;
}

/**
 * Server-rendered Soul Capsule query.
 *
 * The gateway exposes /v1/capsules?session_id=&trace_id=&type= as a thin Notion-DB-query proxy.
 * If the gateway has not yet shipped this endpoint, the tool returns a clear "not implemented"
 * error and points the caller at the manual Notion DB URL.
 */
export async function querySoulCapsules(
  cfg: GcConfig,
  filters: { sessionId?: string; traceId?: string; type?: string; limit?: number },
): Promise<unknown> {
  const params = new URLSearchParams();
  if (filters.sessionId) params.set("session_id", filters.sessionId);
  if (filters.traceId) params.set("trace_id", filters.traceId);
  if (filters.type) params.set("type", filters.type);
  params.set("limit", String(filters.limit ?? 25));
  return gatewayFetch(cfg, `/v1/capsules?${params.toString()}`);
}

/** Static agent registry. Mirror of the Ambient Access Layer routing table. */
export const AGENT_REGISTRY = [
  { id: "kiro", policy_tier: "edge", candidate_for: ["inline_suggestion", "ambient_action"] },
  { id: "codex", policy_tier: "swarm", candidate_for: ["code_generation", "refactor"] },
  { id: "claude", policy_tier: "swarm", candidate_for: ["analysis", "synthesis", "long_context"] },
  { id: "gemini", policy_tier: "swarm", candidate_for: ["multimodal", "search"] },
  { id: "copilot", policy_tier: "edge", candidate_for: ["inline_suggestion"] },
] as const;

export type AgentRecord = (typeof AGENT_REGISTRY)[number];
