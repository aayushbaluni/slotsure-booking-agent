import type { FastifyInstance, FastifyRequest } from "fastify";
import type { BookingPort, FaultPort, RateLimiterPort, RepositoryPort } from "@slotsure/shared/ports";
import { SlotSureError, type CoreResult } from "@slotsure/shared";
import { FindAvailabilityIn, QuoteIn, ConfirmIn, ManageIn, CancelIn } from "@slotsure/shared";

/**
 * REST adapter (driving) — /v1 (customer ops) and /admin (dashboard). Always built: the
 * dashboard and tests use it, and it also serves the agent if Phase 1 picks API integration.
 * Thin: validate with the shared Zod schema, call the core (BookingPort), wrap the CoreResult
 * into the envelope. Business rules live in the core.
 */
export interface RestDeps {
  core: BookingPort;
  repository: RepositoryPort;
  faults: FaultPort;
  limiter: RateLimiterPort;
  adminToken: string;
  faultsEnabled: boolean;
}

function envelope<T>(req: FastifyRequest, result: CoreResult<T>) {
  return {
    ok: true as const,
    data: result.data,
    say: result.say,
    business_now: result.business_now,
    request_id: req.slotsureCtx.requestId,
  };
}

export async function registerRest(app: FastifyInstance, deps: RestDeps): Promise<void> {
  const { core } = deps;

  app.get("/healthz", async () => ({ ok: true }));
  app.get("/readyz", async () => ({ ok: true })); // TODO(Phase 3+): DB reachable + migrations applied

  app.register(
    async (v1) => {
      // per-IP rate limiting (build spec §8): reads vs writes buckets, keyed by hashed client key.
      v1.addHook("onRequest", async (req) => {
        const bucket = req.method === "GET" ? "reads" : "writes";
        const { allowed } = await deps.limiter.take(bucket, req.slotsureCtx.clientKey);
        if (!allowed) throw new SlotSureError("RATE_LIMITED", "Just a moment — please try again shortly.");
      });

      v1.get("/business", async (req) => envelope(req, await core.getBusinessInfo()));
      v1.get("/services", async (req) => envelope(req, await core.listServices()));
      v1.get("/availability", async (req) => envelope(req, await core.findAvailability(FindAvailabilityIn.parse(req.query))));
      v1.post("/quotes", async (req) => envelope(req, await core.quote(QuoteIn.parse(req.body))));
      v1.post("/bookings", async (req) => envelope(req, await core.confirm(ConfirmIn.parse(req.body), req.slotsureCtx)));

      v1.get("/bookings/:reference", async (req) => {
        const { reference } = req.params as { reference: string };
        const input = ManageIn.parse({ reference, manage_code: (req.query as { manage_code?: string }).manage_code });
        return envelope(req, await core.getBooking(input, req.slotsureCtx));
      });

      v1.post("/bookings/:reference/cancel", async (req) => {
        const { reference } = req.params as { reference: string };
        const input = CancelIn.parse({ ...(req.body as object), reference });
        return envelope(req, await core.cancel(input, req.slotsureCtx));
      });
    },
    { prefix: "/v1" },
  );

  // /admin is a separate scoped plugin enforcing ADMIN_TOKEN, never exposed to the agent.
  await app.register(import("../../plugins/admin.js"), {
    prefix: "/admin",
    adminToken: deps.adminToken,
    faultsEnabled: deps.faultsEnabled,
    faults: deps.faults,
    repository: deps.repository,
  });
}
