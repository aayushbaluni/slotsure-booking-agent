import { useBookings } from "../hooks.js";
import { istTime } from "../lib.js";
import { Card, DemoBadge } from "../ui.js";
import type { BookingRow } from "../api.js";

const IST = "Asia/Kolkata";
const dayKey = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: IST, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
const dayLabel = (iso: string) => new Intl.DateTimeFormat("en-GB", { timeZone: IST, weekday: "short", day: "2-digit", month: "short" }).format(new Date(iso));

export function Schedule() {
  const { data: bookings = [], isLoading } = useBookings();

  // next 7 IST days
  const days: string[] = [];
  const now = new Date();
  for (let i = 0; i < 7; i++) days.push(dayKey(new Date(now.getTime() + i * 864e5).toISOString()));
  const byDay = new Map<string, BookingRow[]>();
  for (const b of bookings) {
    const k = dayKey(b.startsAt);
    if (!byDay.has(k)) byDay.set(k, []);
    byDay.get(k)!.push(b);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-[22px] font-semibold text-text-primary">Schedule · Ayush</h1>
        <DemoBadge />
      </div>
      {isLoading && <p className="text-text-muted">Loading…</p>}
      <div className="grid gap-3">
        {days.map((d) => {
          const items = (byDay.get(d) ?? []).sort((a, b) => a.startsAt.localeCompare(b.startsAt));
          return (
            <Card key={d} className="!p-0">
              <div className="flex items-center gap-3 border-b border-subtle px-5 py-2">
                <span className="font-mono text-[13px] text-text-secondary">{dayLabel(`${d}T12:00:00+05:30`)}</span>
                <span className="text-[12px] text-text-muted">{items.length ? `${items.length} booked` : "free"}</span>
              </div>
              <div className="flex flex-wrap gap-2 p-4">
                {items.length === 0 && <span className="text-[13px] text-text-muted">—</span>}
                {items.map((b) => (
                  <div
                    key={b.reference}
                    className="rounded-sm border border-subtle bg-surface-2 px-3 py-2"
                    style={b.status === "CANCELLED" ? { opacity: 0.55 } : undefined}
                  >
                    <div className="flex items-center gap-2">
                      <span className="h-3 w-1 rounded-full" style={{ background: "var(--color-status-created)" }} />
                      <span className={`font-mono text-[14px] text-text-primary ${b.status === "CANCELLED" ? "line-through" : ""}`}>{istTime(b.startsAt)}</span>
                    </div>
                    <div className="mt-1 text-[12px] text-text-secondary">{b.serviceName} · {b.projectType}</div>
                    <div className="font-mono text-[11px] text-text-muted">{b.reference}</div>
                  </div>
                ))}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
