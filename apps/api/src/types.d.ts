import "fastify";
import type { RequestContext } from "@slotsure/shared/ports";

declare module "fastify" {
  interface FastifyRequest {
    /** per-request id + hashed client key, set by the request-context plugin. */
    slotsureCtx: RequestContext;
  }
}
