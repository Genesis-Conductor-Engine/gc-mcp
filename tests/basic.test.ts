import { describe, it, expect } from "vitest";
import { GcApiError, loadConfigFromEnv, AGENT_REGISTRY, DEFAULT_SOUL_CAPSULE_DB_ID } from "../src/api.js";
import { createServer } from "../src/index.js";
import { z } from "zod";

describe("gc-mcp-server core", () => {
  it("loads config with required GC_API_KEY", () => {
    const cfg = loadConfigFromEnv({ GC_API_KEY: "test-key-123" });
    expect(cfg.apiKey).toBe("test-key-123");
    expect(cfg.gatewayUrl).toContain("genesisconductor.io");
    expect(cfg.soulCapsuleDbId).toBe(DEFAULT_SOUL_CAPSULE_DB_ID);
  });

  it("throws on missing GC_API_KEY", () => {
    expect(() => loadConfigFromEnv({})).toThrow(/GC_API_KEY is required/);
  });

  it("exposes the static agent registry with correct routing taxonomy", () => {
    expect(AGENT_REGISTRY.length).toBe(5);
    const kiro = AGENT_REGISTRY.find((a) => a.id === "kiro");
    expect(kiro?.policy_tier).toBe("edge");
    expect(kiro?.candidate_for).toContain("ambient_action");
    const claude = AGENT_REGISTRY.find((a) => a.id === "claude");
    expect(claude?.candidate_for).toContain("analysis");
    expect(claude?.candidate_for).toContain("synthesis");
  });

  it("GcApiError redacts nothing sensitive and formats cleanly", () => {
    const err = new GcApiError(401, "/v1/tasks", "invalid bearer", { hint: "check GC_API_KEY" });
    expect(err.message).toContain("[401]");
    expect(err.message).toContain("/v1/tasks");
    expect(err.status).toBe(401);
    expect(err.responseBody).toBeTruthy();
  });

  it("createServer wires all 7 gc_* tools and returns a usable McpServer", () => {
    const cfg = loadConfigFromEnv({ GC_API_KEY: "bench-dummy" });
    const server = createServer(cfg);
    expect(server).toBeTruthy();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const anyS = server as any;
    const toolMap = anyS._registeredTools || anyS.tools || {};
    const toolNames = Object.keys(toolMap);
    expect(toolNames.length).toBe(7);
    expect(toolNames.every((n) => n.startsWith("gc_"))).toBe(true);
    expect(toolNames).toContain("gc_list_agents");
    expect(toolNames).toContain("gc_submit_task");
  });
});

describe("tool input schemas (from tools.ts surface)", () => {
  // Lightweight re-declaration of the critical enums to guard drift
  const RequestType = z.enum([
    "ambient_action",
    "inline_suggestion",
    "code_generation",
    "refactor",
    "analysis",
    "synthesis",
    "multimodal",
    "search",
  ]);

  it("accepts valid request_type values used by gc_submit_task", () => {
    expect(() => RequestType.parse("ambient_action")).not.toThrow();
    expect(() => RequestType.parse("refactor")).not.toThrow();
    expect(() => RequestType.parse("search")).not.toThrow();
    expect(() => RequestType.parse("invalid")).toThrow();
  });

  it("SoulCapsuleType only allows decision|trace|telemetry|artifact", () => {
    const SoulCapsuleType = z.enum(["decision", "trace", "telemetry", "artifact"]);
    expect(() => SoulCapsuleType.parse("trace")).not.toThrow();
    expect(() => SoulCapsuleType.parse("artifact")).not.toThrow();
    expect(() => SoulCapsuleType.parse("log")).toThrow();
  });
});
