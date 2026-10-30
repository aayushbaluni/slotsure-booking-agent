import { useState } from "react";
import { useBookings } from "../hooks.js";
import { istDateTime, relative } from "../lib.js";
import { Card, StatusBadge } from "../ui.js";

export function Bookings() {
  const { data: bookings = [] } = useBookings();
  const [filter, setFilter] = useState<"ALL" | "CONFIRMED" | "CANCELLED">("ALL");
  const rows = bookings.filter((b) => filter === "ALL" || b.status === filter);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-[22px] font-semibold text-text-primary">Bookings</h1>
        <div className="flex gap-1">
          {(["ALL", "CONFIRMED", "CANCELLED"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-sm px-3 py-1 text-[12px] uppercase tracking-wide ${f === filter ? "bg-surface-3 text-text-primary" : "text-text-secondary hover:bg-surface-2"}`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>
      <Card className="!p-0">
        <table className="w-full text-left text-[13px]">
          <thead className="bg-surface-2 text-[12px] uppercase tracking-wide text-text-secondary">
            <tr>
              {["Reference", "Service", "Start (IST)", "Type", "Status", "Created"].map((h) => (
                <th key={h} className="px-4 py-2 font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-6 text-center text-text-muted">No bookings.</td></tr>
            )}
            {rows.map((b) => (
              <tr key={b.reference} className="border-t border-subtle hover:bg-surface-2">
                <td className="px-4 py-2 font-mono text-text-primary">{b.reference}</td>
                <td className="px-4 py-2 text-text-secondary">{b.serviceName}</td>
                <td className="px-4 py-2 font-mono text-text-secondary">{istDateTime(b.startsAt)}</td>
                <td className="px-4 py-2 text-text-secondary">{b.projectType}</td>
                <td className="px-4 py-2">
                  <StatusBadge token={b.status === "CONFIRMED" ? "created" : "cancelled"} label={b.status} />
                </td>
                <td className="px-4 py-2 text-text-muted">{relative(b.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
