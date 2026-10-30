/** IST formatting + event/status → design-token mapping (design-system.md §2). */

const IST = "Asia/Kolkata";

export function istDateTime(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: IST,
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(iso));
}

export function istTime(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: IST, hour: "numeric", minute: "2-digit", hour12: true }).format(new Date(iso));
}

export function istClock(d: Date): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: IST, hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(d);
}

export function relative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.round(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.round(m / 60)}h ago`;
}

/** maps a BookingEvent.type (or booking status) to a semantic status token name. */
export function tokenForEvent(type: string): "created" | "replayed" | "conflict" | "failed" | "cancelled" {
  switch (type) {
    case "created":
      return "created";
    case "replayed":
      return "replayed";
    case "conflict_rejected":
      return "conflict";
    case "cancelled":
    case "cancel_replayed":
      return "cancelled";
    case "lookup_denied":
      return "failed";
    default:
      return "replayed";
  }
}

export const EVENT_GLYPH: Record<string, string> = {
  created: "✓",
  replayed: "⟳",
  conflict: "⚠",
  failed: "✕",
  cancelled: "–",
};
