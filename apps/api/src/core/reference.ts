import { randomInt } from "node:crypto";

/**
 * Booking reference: "SB-XXXXX" where X is Crockford base32 (no I L O U). Random, unique-checked
 * by the DB (Booking.reference is @unique). Distinct from the manage code (which is derived from
 * the quote id so replays re-derive it).
 */
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

export function generateReference(): string {
  let body = "";
  for (let i = 0; i < 5; i++) body += ALPHABET[randomInt(ALPHABET.length)];
  return `SB-${body}`;
}
