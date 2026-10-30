import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";

/**
 * Phase 3 reliability, end-to-end over HTTP via fastify.inject against a REAL Postgres: fault
 * injection, reset-generation enforcement, manage-code throttle, admin-token scoping, and the
 * event log. Also serves as the REST adapter-contract check (every response is the envelope:
 * ok / say / business_now / request_id). Skips without DATABASE_URL.
 */
const url = process.env.DATABASE_URL;
const ADMIN = "y".repeat(48);

let app: FastifyInstance;

async function free(): Promise<string> {
  const r = await app.inject({ method: "GET", url: "/v1/availability?service=discovery&date=tomorrow&limit=1" });
  return JSON.parse(r.body).data.slots[0].start as string;
}
async function quote(start: string): Promise<string> {
  const r = await app.inject({ method: "POST", url: "/v1/quotes", payload: { service: "discovery", start } });
  return JSON.parse(r.body).data.quote_token as string;
}
function confirmPayload(token: string) {
  return { quote_token: token, customer_name: "Tester", project_type: "web_app", project_brief: "A compact booking tool with reminders and an admin view.", customer_confirmed: true };
}
async function setFault(mode: string) {
  return app.inject({ method: "PUT", url: "/admin/faults", headers: { authorization: `Bearer ${ADMIN}` }, payload: { mode, tools: ["confirm_booking"], ttl_s: 60 } });
}

describe.skipIf(!url)("phase 3: reliability over HTTP (real Postgres)", () => {
  beforeAll(async () => {
    process.env.AGENT_API_KEY ||= "a".repeat(48);
    process.env.ADMIN_TOKEN = ADMIN;
    process.env.QUOTE_SECRET ||= "q".repeat(40);
    process.env.CODE_SECRET ||= "c".repeat(40);
    process.env.BUSINESS_TZ ||= "Asia/Kolkata";
    process.env.DASHBOARD_ORIGIN ||= "http://localhost:5173";
    process.env.FAULTS_ENABLED = "true";
    const { buildServer } = await import("../../src/server.js");
    ({ app } = await buildServer());
    await app.ready();
    await app.inject({ method: "POST", url: "/admin/reset", headers: { authorization: `Bearer ${ADMIN}` } });
  });

  afterAll(async () => {
    await setFault("none");
    await app.close();
  });

  it("every response is the envelope (adapter contract)", async () => {
    const r = await app.inject({ method: "GET", url: "/v1/services" });
    const b = JSON.parse(r.body);
    expect(r.statusCode).toBe(200);
    expect(b.ok).toBe(true);
    for (const k of ["data", "say", "business_now", "request_id"]) expect(b).toHaveProperty(k);
    expect(r.headers["x-request-id"]).toBeTruthy();
  });

  it("happy path: quote -> confirm -> lookup -> cancel (E-01/E-09)", async () => {
    const tok = await quote(await free());
    const c = JSON.parse((await app.inject({ method: "POST", url: "/v1/bookings", payload: confirmPayload(tok) })).body);
    expect(c.ok).toBe(true);
    const ref = c.data.reference as string;
    const code = c.data.manage_code as string;
    const g = JSON.parse((await app.inject({ method: "GET", url: `/v1/bookings/${ref}?manage_code=${code}` })).body);
    expect(g.data.status).toBe("CONFIRMED");
    const x = JSON.parse((await app.inject({ method: "POST", url: `/v1/bookings/${ref}/cancel`, payload: { reference: ref, manage_code: code, customer_confirmed: true } })).body);
    expect(x.data.status).toBe("CANCELLED");
  });

  it("E-03: error_503 fault -> known failure, write_state none", async () => {
    await setFault("error_503");
    const tok = await quote(await free());
    const res = await app.inject({ method: "POST", url: "/v1/bookings", payload: confirmPayload(tok) });
    const b = JSON.parse(res.body);
    expect(res.statusCode).toBe(503);
    expect(b.error.code).toBe("UNAVAILABLE");
    expect(b.error.write_state).toBe("none");
    await setFault("none");
  });

  it("T-R1/E-08: fail_after_commit -> write_state unknown, retry same quote replays the one booking", async () => {
    await setFault("fail_after_commit");
    const start = await free();
    const tok = await quote(start);
    const first = await app.inject({ method: "POST", url: "/v1/bookings", payload: confirmPayload(tok) });
    const fb = JSON.parse(first.body);
    expect(first.statusCode).toBe(500);
    expect(fb.error.code).toBe("INTERNAL");
    expect(fb.error.write_state).toBe("unknown");

    await setFault("none"); // clear, then retry the SAME quote
    const retry = JSON.parse((await app.inject({ method: "POST", url: "/v1/bookings", payload: confirmPayload(tok) })).body);
    expect(retry.ok).toBe(true);
    expect(retry.data.replayed).toBe(true); // the committed booking is returned, not duplicated

    // the slot is taken exactly once: it must no longer be offered
    const after = JSON.parse((await app.inject({ method: "GET", url: "/v1/availability?service=discovery&date=tomorrow&limit=8" })).body);
    expect(after.data.slots.map((s: { start: string }) => s.start)).not.toContain(start);
  });

  it("T-R5: a quote issued before a reset cannot book after it (QUOTE_INVALID)", async () => {
    const tok = await quote(await free());
    await app.inject({ method: "POST", url: "/admin/reset", headers: { authorization: `Bearer ${ADMIN}` } });
    const res = await app.inject({ method: "POST", url: "/v1/bookings", payload: confirmPayload(tok) });
    const b = JSON.parse(res.body);
    expect(b.ok).toBe(false);
    expect(b.error.code).toBe("QUOTE_INVALID");
    expect(b.error.write_state).toBe("none");
  });

  it("S4: admin routes require the admin token", async () => {
    expect((await app.inject({ method: "GET", url: "/admin/bookings" })).statusCode).toBe(401);
    const ok = await app.inject({ method: "GET", url: "/admin/bookings", headers: { authorization: `Bearer ${ADMIN}` } });
    expect(ok.statusCode).toBe(200);
  });

  it("S2: manage-code failures throttle after 5/hour (never lock)", async () => {
    const ref = "SB-THROT";
    let lastCode = "";
    for (let i = 0; i < 6; i++) {
      const r = await app.inject({ method: "GET", url: `/v1/bookings/${ref}?manage_code=BADCOD` });
      lastCode = JSON.parse(r.body).error.code;
    }
    // first 5 -> BOOKING_NOT_FOUND; the 6th is throttled
    expect(lastCode).toBe("RATE_LIMITED");
  });

  it("admin /status reports fault, capacity and generation (dashboard)", async () => {
    const r = JSON.parse((await app.inject({ method: "GET", url: "/admin/status", headers: { authorization: `Bearer ${ADMIN}` } })).body);
    expect(r.ok).toBe(true);
    expect(r.data.capacity).toBe(200);
    expect(typeof r.data.activeBookings).toBe("number");
    expect(typeof r.data.generation).toBe("number");
    expect(r.data.fault).toHaveProperty("mode");
  });

  it("admin /run-race: 10 parallel confirms at one slot → exactly 1 created, 9 rejected", async () => {
    await setFault("none");
    const r = JSON.parse((await app.inject({ method: "POST", url: "/admin/run-race", headers: { authorization: `Bearer ${ADMIN}` } })).body);
    expect(r.ok).toBe(true);
    expect(r.data.created).toBe(1);
    expect(r.data.created + r.data.rejected).toBe(10);
  });

  it("event log records created and lookup_denied", async () => {
    // self-contained: create a booking so a 'created' event exists after the earlier reset
    await app.inject({ method: "POST", url: "/v1/bookings", payload: confirmPayload(await quote(await free())) });
    const r = JSON.parse((await app.inject({ method: "GET", url: "/admin/events?limit=200", headers: { authorization: `Bearer ${ADMIN}` } })).body);
    const types = new Set(r.data.events.map((e: { type: string }) => e.type));
    expect(types.has("created")).toBe(true);
    expect(types.has("lookup_denied")).toBe(true); // from the S2 throttle test
  });
});
