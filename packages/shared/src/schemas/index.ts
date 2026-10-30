import { z } from "zod";

/**
 * Input/output schemas for the 7 operations (build spec §5). Each operation exists as an
 * MCP tool and a REST route with identical inputs and outputs — these schemas are the
 * single definition both adapters and the dashboard validate against.
 */

// ---- domain enums ----
export const ProjectType = z.enum(["web_app", "api_integration", "ai_agent", "ecommerce", "other"]);
export type ProjectType = z.infer<typeof ProjectType>;

export const Timeline = z.enum(["asap", "1_3_months", "exploring"]);
export type Timeline = z.infer<typeof Timeline>;

export const BookingStatus = z.enum(["CONFIRMED", "CANCELLED"]);
export type BookingStatus = z.infer<typeof BookingStatus>;

export const PartOfDay = z.enum(["morning", "evening"]);

// ---- reusable value objects ----
export const CustomerName = z
  .string()
  .trim()
  .min(1)
  .max(40)
  .regex(/^[\p{L}\p{M} .'-]+$/u, "letters, marks, space and . - ' only");

const CONTACT_PATTERN = /(\b[\w.+-]+@[\w-]+\.[\w.-]+\b)|(\+?\d[\d ()-]{7,}\d)/;
export const ProjectBrief = z
  .string()
  .trim()
  .min(10)
  .max(500)
  .refine((s) => !CONTACT_PATTERN.test(s), "must not contain an email address or phone number");

// ---- get_business_info ----
export const ServiceSummary = z.object({
  id: z.string(),
  name: z.string(),
  durationMins: z.number().int(),
  description: z.string(),
});
export const BusinessInfo = z.object({
  name: z.string(),
  timezone: z.string(),
  capabilities: z.array(z.string()),
  callHours: z.array(z.object({ weekday: z.number().int(), windows: z.array(z.string()) })),
  closures: z.array(z.object({ date: z.string(), reason: z.string() })),
  bookingRules: z.object({
    minLeadMins: z.number().int(),
    maxDaysAhead: z.number().int(),
    slotStepMins: z.number().int(),
    cancelCutoffMins: z.number().int(),
  }),
  business_now: z.string(),
});

// ---- list_services ----
export const ListServicesOut = z.object({ services: z.array(ServiceSummary) });

// ---- find_availability ----
export const FindAvailabilityIn = z.object({
  service: z.string(), // id, name or alias; resolved server-side
  date: z.string(), // YYYY-MM-DD | today | tomorrow | weekday name
  part_of_day: PartOfDay.optional(),
  after: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .optional(),
  // coerce: availability is a GET, so `limit` arrives as a query string
  limit: z.coerce.number().int().min(1).max(8).default(3),
});
export const Slot = z.object({ start: z.string(), display: z.string() });
export const FindAvailabilityOut = z.object({
  service: z.object({ id: z.string(), name: z.string() }),
  resolved_date: z.string(),
  slots: z.array(Slot),
  next_available: Slot.optional(),
});

// ---- quote_booking ----
export const QuoteIn = z.object({
  service: z.string(),
  start: z.string(), // ISO with offset, copied from a slot
});
export const QuoteOut = z.object({
  quote_token: z.string(),
  review: z.object({
    service_name: z.string(),
    start: z.string(),
    display: z.string(),
    duration_mins: z.number().int(),
    price_paise: z.number().int(),
    is_demo: z.literal(true),
  }),
});

// ---- confirm_booking ----
export const ConfirmIn = z.object({
  quote_token: z.string(),
  customer_name: CustomerName,
  project_type: ProjectType,
  project_brief: ProjectBrief,
  timeline: Timeline.optional(),
  // boolean, not literal(true): a false value must surface as CONFIRMATION_REQUIRED from the
  // core, not as a schema VALIDATION_ERROR (build spec §5).
  customer_confirmed: z.boolean(),
});
export const BookingSummary = z.object({
  reference: z.string(),
  service_name: z.string(),
  start: z.string(),
  display: z.string(),
  duration_mins: z.number().int(),
  status: BookingStatus,
  is_demo: z.literal(true),
});
export const ConfirmOut = z.object({
  reference: z.string(),
  manage_code: z.string(),
  replayed: z.boolean(),
  booking: BookingSummary,
});

// ---- get_booking / cancel_booking ----
export const ManageIn = z.object({
  reference: z.string(),
  manage_code: z.string(),
});
export const CancelIn = ManageIn.extend({ customer_confirmed: z.boolean() });

// admin: PUT /admin/faults (demo/tests only)
export const FaultModeSchema = z.enum(["none", "latency", "error_503", "fail_after_commit"]);
export const FaultsIn = z.object({
  mode: FaultModeSchema,
  tools: z.array(z.string()).default(["confirm_booking"]),
  ttl_s: z.number().int().min(1).max(3600).default(600),
});
export type FaultsIn = z.infer<typeof FaultsIn>;
export const CancelOut = z.object({
  reference: z.string(),
  status: BookingStatus,
  already_cancelled: z.boolean(),
});

export type FindAvailabilityIn = z.infer<typeof FindAvailabilityIn>;
export type FindAvailabilityOut = z.infer<typeof FindAvailabilityOut>;
export type QuoteIn = z.infer<typeof QuoteIn>;
export type QuoteOut = z.infer<typeof QuoteOut>;
export type ConfirmIn = z.infer<typeof ConfirmIn>;
export type ConfirmOut = z.infer<typeof ConfirmOut>;
export type ManageIn = z.infer<typeof ManageIn>;
export type CancelIn = z.infer<typeof CancelIn>;
export type CancelOut = z.infer<typeof CancelOut>;
export type BookingSummary = z.infer<typeof BookingSummary>;
export type BusinessInfo = z.infer<typeof BusinessInfo>;
export type ListServicesOut = z.infer<typeof ListServicesOut>;
export type ServiceSummary = z.infer<typeof ServiceSummary>;
export type Slot = z.infer<typeof Slot>;
