import fp from "fastify-plugin";
import { ZodError } from "zod";
import { SlotSureError, ERROR_META, type ErrorBody } from "@slotsure/shared";

/**
 * Turns every thrown error into the error envelope (build spec §5) and wraps every successful
 * handler return into the success envelope. Keeps `say` present on every response, sets
 * write_state, and never leaks a stack trace. The core throws SlotSureError; Zod failures map to
 * VALIDATION_ERROR; anything else is INTERNAL with write_state "unknown".
 */
export default fp(async (app) => {
  // Success envelopes are built explicitly by the REST adapter (envelope()). This handler only
  // turns thrown errors into error envelopes, keeping `say` + write_state on every failure.
  app.setErrorHandler((err, req, reply) => {
    const requestId = req.slotsureCtx?.requestId ?? "";
    const business_now = new Date().toISOString();

    if (err instanceof SlotSureError) {
      const meta = err.meta;
      const error: ErrorBody = {
        code: err.code,
        retryable: meta.retryable,
        write_state: meta.writeState,
        ...(err.detail?.fields ? { fields: err.detail.fields as string[] } : {}),
        ...(err.detail?.alternatives ? { alternatives: err.detail.alternatives as ErrorBody["alternatives"] } : {}),
      };
      reply.code(meta.http).send({ ok: false, error, say: err.say, business_now, request_id: requestId });
      return;
    }

    if (err instanceof ZodError) {
      const fields = err.issues.map((i) => i.path.join("."));
      reply.code(ERROR_META.VALIDATION_ERROR.http).send({
        ok: false,
        error: { code: "VALIDATION_ERROR", retryable: false, write_state: "none", fields },
        say: "I need one detail fixed before I can continue.",
        business_now,
        request_id: requestId,
      });
      return;
    }

    // Fastify's own client errors (malformed JSON body, wrong content-type, payload too large)
    // carry a 4xx statusCode. These never reached the core, so nothing was written: surface them
    // as VALIDATION_ERROR with write_state "none", never as INTERNAL/"unknown".
    const status = (err as { statusCode?: number }).statusCode;
    if (typeof status === "number" && status >= 400 && status < 500) {
      reply.code(status).send({
        ok: false,
        error: { code: "VALIDATION_ERROR", retryable: false, write_state: "none" },
        say: "That request didn't look right — could you try again?",
        business_now,
        request_id: requestId,
      });
      return;
    }

    req.log.error({ err, requestId }, "unhandled error");
    reply.code(500).send({
      ok: false,
      error: { code: "INTERNAL", retryable: true, write_state: "unknown" },
      say: "I couldn't verify whether that completed.",
      business_now,
      request_id: requestId,
    });
  });
});
