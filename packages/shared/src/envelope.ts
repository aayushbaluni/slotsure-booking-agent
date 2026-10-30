import { z } from "zod";
import { ErrorCode } from "./errors.js";

/**
 * The response envelope (build spec §5). Every success and every error share this shape
 * and always carry a `say`: one plain sentence the agent relays as-is.
 */

export const AlternativeSlot = z.object({
  start: z.string(), // ISO with offset
  display: z.string(),
});
export type AlternativeSlot = z.infer<typeof AlternativeSlot>;

export const ErrorBody = z.object({
  code: ErrorCode,
  retryable: z.boolean(),
  write_state: z.enum(["none", "unknown"]),
  fields: z.array(z.string()).optional(),
  alternatives: z.array(AlternativeSlot).optional(),
});
export type ErrorBody = z.infer<typeof ErrorBody>;

export const SuccessEnvelope = <T extends z.ZodTypeAny>(data: T) =>
  z.object({
    ok: z.literal(true),
    data,
    say: z.string(),
    business_now: z.string(),
    request_id: z.string(),
  });

export const ErrorEnvelope = z.object({
  ok: z.literal(false),
  error: ErrorBody,
  say: z.string(),
  business_now: z.string(),
  request_id: z.string(),
});
export type ErrorEnvelope = z.infer<typeof ErrorEnvelope>;

export type SuccessEnvelope<T> = {
  ok: true;
  data: T;
  say: string;
  business_now: string;
  request_id: string;
};

export type Envelope<T> = SuccessEnvelope<T> | ErrorEnvelope;

/**
 * What a core method returns: the typed payload, the one-sentence `say` the agent relays, and
 * business_now (server time in the business zone). The driving adapter adds `ok` + `request_id`
 * to form the envelope. Keeping `say` in the core means the correct sentence is authored once,
 * next to the logic that knows the outcome.
 */
export interface CoreResult<T> {
  data: T;
  say: string;
  business_now: string;
}
