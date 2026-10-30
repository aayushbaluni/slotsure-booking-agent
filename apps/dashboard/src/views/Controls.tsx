import { useEffect, useState } from "react";
import { useStatus, useAdminMutations } from "../hooks.js";
import { Card, Stat } from "../ui.js";
import type { FaultMode } from "../api.js";

const FAULTS: { mode: FaultMode; label: string }[] = [
  { mode: "none", label: "None" },
  { mode: "latency", label: "Latency" },
  { mode: "error_503", label: "503" },
  { mode: "fail_after_commit", label: "Fail after commit" },
];

export function Controls() {
  const { data: status } = useStatus();
  const { reset, setFault, runRace } = useAdminMutations();
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const fault = status?.fault.mode ?? "none";
  const remaining = status?.fault.expiresAt ? Math.max(0, Math.round((status.fault.expiresAt - Date.now()) / 1000)) : 0;

  return (
    <div className="space-y-4">
      <h1 className="text-[22px] font-semibold text-text-primary">Controls</h1>

      <Card title="Demo state">
        <div className="grid grid-cols-3 gap-6">
          <Stat label="Demo capacity" value={`${status?.activeBookings ?? "–"}/${status?.capacity ?? 200}`} hint="active demo bookings" />
          <Stat label="Reset generation" value={status?.generation ?? "–"} hint="bumped by every reset" />
          <Stat label="Fault mode" value={fault === "none" ? "none" : fault} hint={remaining > 0 ? `expires in ${remaining}s` : "no fault armed"} />
        </div>
      </Card>

      <Card title="Fault injection">
        {status && !status.faultsEnabled ? (
          <p className="text-text-muted">Fault injection is disabled on this environment (FAULTS_ENABLED=false).</p>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            {FAULTS.map((f) => (
              <button
                key={f.mode}
                onClick={() => setFault.mutate(f.mode)}
                className={`rounded-sm border px-3 py-1.5 text-[13px] ${f.mode === fault ? "border-strong text-text-primary" : "border-subtle text-text-secondary hover:bg-surface-2"}`}
                style={f.mode === fault && f.mode !== "none" ? { color: "var(--color-status-conflict)", borderColor: "var(--color-status-conflict)" } : undefined}
              >
                {f.label}
              </button>
            ))}
            {remaining > 0 && (
              <span className="ml-2 font-mono text-[12px]" style={{ color: "var(--color-status-conflict)" }}>
                armed · {remaining}s
              </span>
            )}
          </div>
        )}
      </Card>

      <Card title="Concurrency demo">
        <div className="flex items-center gap-4">
          <button
            onClick={() => runRace.mutate()}
            disabled={runRace.isPending}
            className="rounded-md px-4 py-2 font-medium disabled:opacity-60"
            style={{ background: "var(--color-accent-base)", color: "var(--color-accent-on)", boxShadow: "0 0 0 1px var(--color-accent-base), 0 0 16px -4px var(--color-accent-base)" }}
          >
            {runRace.isPending ? "Racing…" : "▸ Run the race"}
          </button>
          {runRace.data && (
            <div className="font-mono text-[15px]">
              <span style={{ color: "var(--color-status-created)" }}>{runRace.data.created} created</span>
              <span className="text-text-muted"> · </span>
              <span style={{ color: "var(--color-status-conflict)" }}>{runRace.data.rejected} rejected</span>
              <span className="ml-2 text-text-muted">@ {runRace.data.display}</span>
            </div>
          )}
          {runRace.isError && <span style={{ color: "var(--color-status-failed)" }}>No free slot — reset first.</span>}
        </div>
        <p className="mt-2 text-[12px] text-text-muted">Fires 10 parallel confirms at one slot. Exactly one wins — the exclusion constraint rejects the rest.</p>
      </Card>

      <Card title="Reset">
        <button onClick={() => reset.mutate()} disabled={reset.isPending} className="rounded-sm border border-strong px-4 py-2 text-text-primary hover:bg-surface-2 disabled:opacity-60">
          {reset.isPending ? "Resetting…" : "Reset demo to seed"}
        </button>
        <p className="mt-2 text-[12px] text-text-muted">Clears bookings and events, bumps the reset generation. Pre-reset quotes can no longer book.</p>
      </Card>
    </div>
  );
}
