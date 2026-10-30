import { createHmac, timingSafeEqual } from "node:crypto";
import type { QuotePayload, TokenSignerPort } from "@slotsure/shared/ports";
import { SlotSureError } from "@slotsure/shared";

/**
 * Quote token = base64url(canonicalJSON(payload)) + "." + base64url(HMAC-SHA256).
 * Verify checks the signature with a constant-time compare. Expiry/version/generation are
 * business checks done in the core, NOT here (replays must bypass them — build spec §5).
 */
export class HmacSha256Signer implements TokenSignerPort {
  constructor(private readonly secret: string) {}

  sign(payload: QuotePayload): string {
    const body = b64url(canonical(payload));
    return `${body}.${b64url(this.mac(body))}`;
  }

  verify(token: string): QuotePayload {
    const [body, sig] = token.split(".");
    if (!body || !sig) throw new SlotSureError("QUOTE_INVALID", "Please restart from the available times.");
    const expected = b64url(this.mac(body));
    if (!constantTimeEqual(sig, expected))
      throw new SlotSureError("QUOTE_INVALID", "Please restart from the available times.");
    try {
      return JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as QuotePayload;
    } catch {
      throw new SlotSureError("QUOTE_INVALID", "Please restart from the available times.");
    }
  }

  private mac(body: string): Buffer {
    return createHmac("sha256", this.secret).update(body).digest();
  }
}

/** stable key order so the same payload always signs identically. */
function canonical(p: QuotePayload): string {
  const keys = Object.keys(p).sort() as (keyof QuotePayload)[];
  return JSON.stringify(Object.fromEntries(keys.map((k) => [k, p[k]])));
}
const b64url = (b: Buffer | string): string => Buffer.from(b).toString("base64url");
function constantTimeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}
