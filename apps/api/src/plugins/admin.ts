import { timingSafeEqual } from "node:crypto";
import type { FastifyPluginAsync } from "fastify";
import type { BookingPort, FaultPort, RepositoryPort } from "@slotsure/shared/ports";
import { FaultsIn } from "@slotsure/shared";

/**
 * Admin-scoped routes (dashboard only): status, bookings, events, reset, faults, run-race.
 * Guarded by a separate ADMIN_TOKEN that is NEVER sent to the agent connection (spec §5, §9).
 * A PLAIN (encapsulated) plugin — NOT fastify-plugin — so the admin-token hook stays scoped here.
 */
const DEMO_CAPACITY = 200;

interface AdminOpts {
  adminToken: string;
  faultsEnabled: boolean;
  faults: FaultPort;
  repository: RepositoryPort;
  core: BookingPort;
}

const admin: FastifyPluginAsync<AdminOpts> = async (app, opts) => {
  app.addHook("onRequest", async (req, reply) => {
    const header = req.headers.authorization ?? "";
    const expected = `Bearer ${opts.adminToken}`;
    const ok = header.length === expected.length && timingSafeEqual(Buffer.from(header), Buffer.from(expected));
    if (!ok) await reply.code(401).send({ ok: false, error: { code: "UNAUTHORIZED" }, say: "Admin token required." });
  });

  app.get("/status", async () => ({
    ok: true,
    data: {
      fault: opts.faults.status(),
      faultsEnabled: opts.faultsEnabled,
      activeBookings: await opts.repository.countActiveBookings(),
      capacity: DEMO_CAPACITY,
      generation: await opts.repository.currentGeneration(),
    },
  }));

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

  // Fires N parallel confirms, each with its own quote, at one free slot — the concurrency
  // guarantee made visible in two seconds (build spec §9). Exactly 1 should win.
  app.post("/run-race", async (req, reply) => {
    const N = 10;
    const avail = await opts.core.findAvailability({ service: "discovery-call", date: "tomorrow", limit: 1 });
    const slot = avail.data.slots[0];
    if (!slot) {
      await reply.code(409).send({ ok: false, error: { code: "NO_SLOT" }, say: "No free slot to race on — reset the demo first." });
      return;
    }
    const tokens = await Promise.all(
      Array.from({ length: N }, async () => (await opts.core.quote({ service: "discovery-call", start: slot.start })).data.quote_token),
    );
    const outcomes = await Promise.allSettled(
      tokens.map((quote_token, i) =>
        opts.core.confirm(
          { quote_token, customer_name: "Racer", project_type: "other", project_brief: `Concurrency demo booking number ${i}.`, customer_confirmed: true },
          req.slotsureCtx,
        ),
      ),
    );
    const created = outcomes.filter((o) => o.status === "fulfilled").length;
    const rejected = N - created;
    return { ok: true, data: { created, rejected, display: slot.display }, say: `${created} created, ${rejected} rejected with SLOT_UNAVAILABLE.` };
  });
};

export default admin;
