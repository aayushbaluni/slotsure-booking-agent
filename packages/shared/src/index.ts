/**
 * @slotsure/shared — the single contract boundary.
 *
 * Everything that crosses a module boundary (envelopes, error codes, request/response
 * schemas, and the domain ports) is defined here exactly once. The core, both adapters
 * and the dashboard all import from this package, so a drift fails type-check.
 */
export * from "./envelope.js";
export * from "./errors.js";
export * from "./schemas/index.js";
export * from "./ports/index.js";
