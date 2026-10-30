# Tool descriptions (what the model sees)

Tool descriptions carry as much of the rule set as the instructions, because weak models read
them at call time (build spec §6). The input/output contracts are the Zod schemas in
`packages/shared/src/schemas` — this file is the human-facing description layer.

| Tool | Description sentence that matters |
| --- | --- |
| `get_business_info` | "Verified capabilities, call hours and booking rules. Answer capability questions only from this." |
| `list_services` | "The active services with durations. Offer these; never invent one." |
| `find_availability` | "Pass the customer's own date words; the server resolves them in IST. Returns up to 3 free start times." |
| `quote_booking` | "Call before confirm_booking. Does not book. Returns a review to show the customer and a quote_token." |
| `confirm_booking` | "Books the appointment. Only call after the customer said yes to the review. customer_confirmed must be true. If unsure whether a call finished, call again with the same quote_token; it never books twice." |
| `get_booking` | "Look up a booking with its reference and manage code." |
| `cancel_booking` | "Cancels. Only call after the customer confirmed the cancellation. Safe to repeat." |
