import { ulid } from "ulid";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { FastifyInstance } from "fastify";
import type { BookingPort, RequestContext } from "@slotsure/shared/ports";
import { SlotSureError, type CoreResult } from "@slotsure/shared";
import { FindAvailabilityIn, QuoteIn, ConfirmIn, ManageIn, CancelIn } from "@slotsure/shared";

/**
 * MCP adapter (driving) — the 7 operations as MCP tools over Streamable HTTP at /mcp, mapped 1:1
 * to the booking core (BookingPort). Built for the Phase 1 spike: Agentplace connects a custom
 * service as "a compatible MCP connection or an API integration" and documents no general custom
 * REST form, so MCP is the likely path. Same envelopes as REST; the core is untouched.
 *
 * Tool descriptions carry the rules a weak model reads at call time (build spec §6). Errors are
 * returned as normal tool content (never thrown) so the model always sees the `say` sentence and
 * the write_state, and can follow the outcome table.
 */
type ToolText = { content: { type: "text"; text: string }[] };

function ok<T>(r: CoreResult<T>): ToolText {
  return { content: [{ type: "text", text: JSON.stringify({ ok: true, data: r.data, say: r.say, business_now: r.business_now }) }] };
}
async function run<T>(fn: () => Promise<CoreResult<T>>): Promise<ToolText> {
  try {
    return ok(await fn());
  } catch (e) {
    if (e instanceof SlotSureError) {
      const m = e.meta;
      return {
        content: [{ type: "text", text: JSON.stringify({ ok: false, error: { code: e.code, retryable: m.retryable, write_state: m.writeState, ...(e.detail ?? {}) }, say: e.say }) }],
      };
    }
    throw e;
  }
}

const ctx = (): RequestContext => ({ requestId: `mcp_${ulid()}`, clientKey: "mcp" });

export function createMcpServer(core: BookingPort): McpServer {
  const server = new McpServer({ name: "slotsure", version: "0.1.0" });

  server.registerTool(
    "get_business_info",
    { description: "Ayush's verified capabilities, call hours and booking rules. Answer capability questions only from this." },
    async () => run(() => core.getBusinessInfo()),
  );
  server.registerTool(
    "list_services",
    { description: "The active services with durations. Offer these; never invent one." },
    async () => run(() => core.listServices()),
  );
  server.registerTool(
    "find_availability",
    {
      description: "Pass the customer's own date words (today/tomorrow/a weekday); the server resolves them in IST. Returns up to 3 free start times.",
      inputSchema: FindAvailabilityIn.shape,
    },
    async (args) => run(() => core.findAvailability(FindAvailabilityIn.parse(args))),
  );
  server.registerTool(
    "quote_booking",
    { description: "Call before confirm_booking. Does not book. Returns a review to show the customer and a quote_token.", inputSchema: QuoteIn.shape },
    async (args) => run(() => core.quote(QuoteIn.parse(args))),
  );
  server.registerTool(
    "confirm_booking",
    {
      description: "Books the appointment. Only call after the customer said yes to the review. customer_confirmed must be true. If unsure whether a call finished, call again with the SAME quote_token; it never books twice.",
      inputSchema: ConfirmIn.shape,
    },
    async (args) => run(() => core.confirm(ConfirmIn.parse(args), ctx())),
  );
  server.registerTool(
    "get_booking",
    { description: "Look up a booking with its reference and manage code.", inputSchema: ManageIn.shape },
    async (args) => run(() => core.getBooking(ManageIn.parse(args), ctx())),
  );
  server.registerTool(
    "cancel_booking",
    { description: "Cancels. Only call after the customer confirmed the cancellation. Safe to repeat.", inputSchema: CancelIn.shape },
    async (args) => run(() => core.cancel(CancelIn.parse(args), ctx())),
  );

  return server;
}

/**
 * Mounts the MCP server at POST /mcp in stateless Streamable HTTP mode (one transport per
 * request — simplest for a tool-only server). Bearer-authenticated with AGENT_API_KEY if set.
 */
export async function registerMcp(app: FastifyInstance, deps: { core: BookingPort; apiKey?: string }): Promise<void> {
  app.post("/mcp", async (req, reply) => {
    if (deps.apiKey && req.headers.authorization !== `Bearer ${deps.apiKey}`) {
      await reply.code(401).send({ jsonrpc: "2.0", error: { code: -32001, message: "unauthorized" }, id: null });
      return;
    }
    const server = createMcpServer(deps.core);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    reply.raw.on("close", () => {
      void transport.close();
      void server.close();
    });
    reply.hijack(); // we write to reply.raw directly; stop Fastify from sending its own response
    await server.connect(transport);
    await transport.handleRequest(req.raw, reply.raw, req.body);
  });
}
