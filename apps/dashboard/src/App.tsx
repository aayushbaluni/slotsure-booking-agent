import { useEffect, useState } from "react";
import { getToken, setToken, clearToken, ApiError } from "./api.js";
import { useStatus } from "./hooks.js";
import { istClock } from "./lib.js";
import { Schedule } from "./views/Schedule.js";
import { Bookings } from "./views/Bookings.js";
import { Events } from "./views/Events.js";
import { Controls } from "./views/Controls.js";

const TABS = ["Schedule", "Bookings", "Events", "Controls"] as const;
type Tab = (typeof TABS)[number];

export function App() {
  const [token, setTok] = useState<string | null>(getToken());
  if (!token) return <TokenGate onSave={(t) => { setToken(t); setTok(t); }} />;
  return <Shell onUnauthorized={() => { clearToken(); setTok(null); }} />;
}

function TokenGate({ onSave }: { onSave: (t: string) => void }) {
  const [value, setValue] = useState("");
  return (
    <div className="flex min-h-full items-center justify-center bg-bg">
      <form
        onSubmit={(e) => { e.preventDefault(); if (value.trim()) onSave(value.trim()); }}
        className="w-80 rounded-md border border-subtle bg-surface-1 p-6"
      >
        <div className="mb-1 font-mono text-sm uppercase tracking-wide text-text-primary">SlotSure</div>
        <p className="mb-4 text-[13px] text-text-secondary">Enter the admin token to view the console.</p>
        <input
          type="password"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="ADMIN_TOKEN"
          className="mb-3 w-full rounded-sm border border-strong bg-bg px-3 py-2 font-mono text-[13px] text-text-primary outline-none focus:border-accent"
        />
        <button type="submit" className="w-full rounded-sm py-2 font-medium" style={{ background: "var(--color-accent-base)", color: "var(--color-accent-on)" }}>
          Open console
        </button>
      </form>
    </div>
  );
}

function Shell({ onUnauthorized }: { onUnauthorized: () => void }) {
  const [tab, setTab] = useState<Tab>("Schedule");
  const [clock, setClock] = useState(istClock(new Date()));
  const status = useStatus();

  useEffect(() => {
    const id = setInterval(() => setClock(istClock(new Date())), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (status.error instanceof ApiError && status.error.status === 401) onUnauthorized();
  }, [status.error, onUnauthorized]);

  return (
    <div className="min-h-full bg-bg text-text-primary">
      <header className="flex items-center justify-between border-b border-subtle bg-surface-1 px-5 py-3">
        <span className="font-mono text-sm uppercase tracking-wide">SlotSure</span>
        <span className="flex items-center gap-3 text-text-secondary">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 animate-pulse rounded-full" style={{ background: "var(--color-accent-base)" }} aria-hidden /> live
          </span>
          <span className="font-mono text-[13px]">IST {clock}</span>
        </span>
      </header>

      <nav className="flex gap-6 border-b border-subtle bg-surface-1 px-5">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`border-b-2 py-3 text-[13px] font-medium uppercase tracking-wide ${t === tab ? "text-text-primary" : "border-transparent text-text-secondary hover:text-text-primary"}`}
            style={t === tab ? { borderColor: "var(--color-accent-base)" } : undefined}
          >
            {t}
          </button>
        ))}
      </nav>

      <main className="mx-auto max-w-5xl p-6">
        {tab === "Schedule" && <Schedule />}
        {tab === "Bookings" && <Bookings />}
        {tab === "Events" && <Events />}
        {tab === "Controls" && <Controls />}
      </main>
    </div>
  );
}
