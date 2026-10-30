import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { CodeDeriverPort } from "@slotsure/shared/ports";

/**
 * Manage code = first 30 bits of HMAC-SHA256(CODE_SECRET, quote_id) -> 6 Crockford base32
 * symbols (alphabet 0-9A-Z minus I L O U), ~1.07 billion codes (build spec §5). Because the
 * secret is fixed, a replay of the same quote re-derives the same code. Input is
 * case-insensitive and maps O->0, I/L->1.
 */
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"; // Crockford, no I L O U

export class CrockfordCodeDeriver implements CodeDeriverPort {
  constructor(private readonly secret: string) {}

  derive(quoteId: string): { code: string; hash: string } {
    const mac = createHmac("sha256", this.secret).update(quoteId).digest();
    // take 30 bits -> 6 x 5-bit symbols
    const bits = (mac.readUInt32BE(0) >>> 2) & 0x3fffffff; // top 30 bits
    let code = "";
    for (let i = 5; i >= 0; i--) code += ALPHABET[(bits >>> (i * 5)) & 0x1f];
    return { code, hash: this.hash(code) };
  }

  matches(input: string, hash: string): boolean {
    const normalized = normalize(input);
    const a = Buffer.from(this.hash(normalized));
    const b = Buffer.from(hash);
    return a.length === b.length && timingSafeEqual(a, b);
  }

  private hash(code: string): string {
    return createHash("sha256").update(code).digest("hex");
  }
}

function normalize(input: string): string {
  return input
    .toUpperCase()
    .replace(/O/g, "0")
    .replace(/[IL]/g, "1")
    .replace(/[^0-9A-Z]/g, "");
}
