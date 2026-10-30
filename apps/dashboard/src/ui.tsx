import type { ReactNode } from "react";
import { EVENT_GLYPH } from "./lib.js";

type StatusToken = "created" | "replayed" | "conflict" | "failed" | "cancelled";

// Reference the design tokens by CSS var (defined in tokens.css) so status colors stay in the
// single source of truth and don't depend on dynamically-built Tailwind class names.
const statusVar = (t: StatusToken) => `var(--color-status-${t})`;

export function Card({ title, children, className = "" }: { title?: string; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-md border border-subtle bg-surface-1 ${className}`}>
      {title && <h2 className="border-b border-subtle px-5 py-3 text-[13px] font-medium uppercase tracking-wide text-text-secondary">{title}</h2>}
      <div className="p-5">{children}</div>
    </section>
  );
}

export function StatusBadge({ token, label }: { token: StatusToken; label: string }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 font-mono text-[12px]"
      style={{ color: statusVar(token), backgroundColor: `color-mix(in srgb, ${statusVar(token)} 16%, transparent)` }}
    >
      <span aria-hidden>{EVENT_GLYPH[token]}</span>
      {label}
    </span>
  );
}

export function DemoBadge() {
  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium"
      style={{ color: "var(--color-demo-badge)", border: "1px solid color-mix(in srgb, var(--color-demo-badge) 50%, transparent)" }}
    >
      DEMO — not a real booking
    </span>
  );
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div>
      <div className="font-mono text-[28px] leading-tight text-text-primary">{value}</div>
      <div className="text-[13px] uppercase tracking-wide text-text-secondary">{label}</div>
      {hint && <div className="mt-0.5 text-[12px] text-text-muted">{hint}</div>}
    </div>
  );
}
