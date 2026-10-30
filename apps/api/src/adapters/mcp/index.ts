import type { BookingPort } from "@slotsure/shared/ports";

/**
 * MCP adapter (driving) — Streamable HTTP at /mcp, 7 tools mapped 1:1 to the core (BookingPort).
 * BUILT ONLY IF Phase 1 shows Agentplace needs MCP (build spec §3). Tool descriptions carry the
 * rule set (build spec §6) because weak models read them at call time. Same envelopes as REST.
 *
 * Kept as a stub so the structure exists; wire the @modelcontextprotocol/sdk server here once
 * Phase 1 confirms the connection type.
 */
export interface McpDeps {
  core: BookingPort;
}

export async function createMcpHandler(_deps: McpDeps): Promise<unknown> {
  throw new Error("NotImplemented: MCP adapter — build only if Phase 1 requires it (docs/platform-findings.md)");
}
