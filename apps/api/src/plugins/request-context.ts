import { createHash } from "node:crypto";
import fp from "fastify-plugin";
import { ulid } from "ulid";

/**
 * Sets req.slotsureCtx: a request id (incoming x-request-id or generated `req_` + ULID) echoed
 * in every response and stored on BookingEvent, and a hashed client key (IP or platform session)
 * used for throttling. The raw IP is never logged (build spec §8).
 */
export default fp(async (app) => {
  // Set per-request in the hook below (a reference-type decorator default would be shared
  // across requests in Fastify v5). The module augmentation in types.d.ts types the property.
  app.addHook("onRequest", async (req, reply) => {
    const incoming = req.headers["x-request-id"];
    const requestId = typeof incoming === "string" && incoming ? incoming : `req_${ulid()}`;
    const sessionHeader = req.headers["x-session-id"];
    const rawKey = typeof sessionHeader === "string" && sessionHeader ? sessionHeader : (req.ip ?? "unknown");
    req.slotsureCtx = {
      requestId,
      clientKey: createHash("sha256").update(rawKey).digest("hex").slice(0, 24),
    };
    reply.header("x-request-id", requestId);
  });
});
