import { timingSafeEqual } from "node:crypto";
import type { FastifyPluginAsync } from "fastify";
import type { FaultPort, RepositoryPort } from "@slotsure/shared/ports";
import { FaultsIn } from "@slotsure/shared";

/**
 * Admin-scoped routes (dashboard only): bookings, events, reset, faults. Guarded by a separate
 * ADMIN_TOKEN that is NEVER sent to the agent connection (build spec §5, §9).
 *
 * A PLAIN (encapsulated) plugin on purpose — NOT fastify-plugin — so the admin-token onRequest
 * hook stays scoped to these routes and never leaks onto /healthz or /v1.
 */
interface AdminOpts {
  adminToken: string;
  faultsEnabled: boolean;
  faults: FaultPort;
  repository: RepositoryPort;
}

const admin: FastifyPluginAsync<AdminOpts> = async (app, opts) => {
  app.addHook("onRequest", async (req, reply) => {
    const header = req.headers.authorization ?? "";
    const expected = `Bearer ${opts.adminToken}`;
    const ok = header.length === expected.length && timingSafeEqual(Buffer.from(header), Buffer.from(expected));
    if (!ok) await reply.code(401).send({ ok: false, error: { code: "UNAUTHORIZED" }, say: "Admin token required." });
  });

  app.get("/bookings", async () => ({ ok: true, data: { bookings: await opts.repository.listBookings() } }));

  app.get("/events", async (req) => {
    const limit = Number((req.query as { limit?: string }).limit ?? 100);
    return { ok: true, data: { events: await opts.repository.listEvents(Number.isFinite(limit) ? limit : 100) } };
  });

  app.post("/reset", async () => {
    const { generation } = await opts.repository.resetDemo();
    return { ok: true, data: { reset: true, generation }, say: "Demo reset: bookings cleared and generation bumped." };
  });

  app.put("/faults", async (req, reply) => {
    if (!opts.faultsEnabled) {
      await reply.code(409).send({ ok: false, error: { code: "FAULTS_DISABLED" }, say: "Fault injection is disabled on this environment." });
      return;
    }
    const f = FaultsIn.parse(req.body);
    opts.faults.set(f.mode, f.tools, f.ttl_s);
    return { ok: true, data: { mode: f.mode, tools: f.tools, ttl_s: f.ttl_s } };
  });
};

export default admin;
