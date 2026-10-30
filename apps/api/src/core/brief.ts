import { ProjectBrief } from "@slotsure/shared";
import { SlotSureError } from "@slotsure/shared";

/**
 * Brief validation — 10–500 chars, rejects anything that looks like an email or phone number
 * (build spec §8 privacy rule). The Zod schema in @slotsure/shared is the single definition;
 * this wraps it so the core raises a domain error with a `say` the agent can relay.
 */
export function validateBrief(raw: string): string {
  const parsed = ProjectBrief.safeParse(raw);
  if (!parsed.success) {
    throw new SlotSureError(
      "VALIDATION_ERROR",
      "Could you share a short summary without any phone number or email?",
      { fields: ["project_brief"], reason: parsed.error.issues[0]?.message },
    );
  }
  return parsed.data;
}
