import { useState } from "react";

/**
 * Dashboard shell — four views (Schedule, Bookings, Events, Controls) per build spec §9, styled
 * strictly from design-system.md tokens via semantic Tailwind classes (no raw hex). This is the
 * command-center scaffold; views land in Phase 4.
 */
const TABS = ["Schedule", "Bookings", "Events", "Controls"] as const;
type Tab = (typeof TABS)[number];

export function App() {
  const [tab, setTab] = useState<Tab>("Schedule");

  return (
    <div className="min-h-full bg-bg text-text-primary">
      <header className="flex items-center justify-between border-b border-border-subtle bg-surface-1 px-5 py-3">
        <span className="font-mono text-sm uppercase tracking-wide text-text-primary">SlotSure</span>
        <span className="flex items-center gap-2 text-text-secondary">
          <span className="h-2 w-2 rounded-full bg-accent" aria-hidden /> live
        </span>
      </header>

      <nav className="flex gap-6 border-b border-border-subtle bg-surface-1 px-5">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={
              "border-b-2 py-3 text-[13px] font-medium uppercase tracking-wide " +
              (t === tab ? "border-accent text-text-primary" : "border-transparent text-text-secondary")
            }
          >
            {t}
          </button>
        ))}
      </nav>

      <main className="p-6">
        <p className="text-text-secondary">
          {tab} view — scaffold. Components (ScheduleLane, DataTable, EventRow, RaceButton,
          FaultControl) land in Phase 4. See design-system.md §5.
        </p>
      </main>
    </div>
  );
}
