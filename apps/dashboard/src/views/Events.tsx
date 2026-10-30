import { useEvents } from "../hooks.js";
import { relative, tokenForEvent } from "../lib.js";
import { Card, StatusBadge } from "../ui.js";

const statusVar = (t: string) => `var(--color-status-${t})`;

export function Events() {
  const { data: events = [] } = useEvents();

  return (
    <div className="space-y-4">
      <h1 className="text-[22px] font-semibold text-text-primary">Events</h1>
      <Card className="!p-0">
        <ul>
          {events.length === 0 && <li className="px-5 py-6 text-text-muted">No events yet.</li>}
          {events.map((e, i) => {
            const token = tokenForEvent(e.type);
            return (
              <li
                key={`${e.requestId}-${i}`}
                className="flex items-center gap-4 border-b border-subtle px-5 py-2.5 last:border-0"
                style={{ borderLeft: `2px solid ${statusVar(token)}` }}
              >
                <StatusBadge token={token} label={e.type} />
                <button
                  onClick={() => navigator.clipboard?.writeText(e.requestId)}
                  title="copy request id"
                  className="font-mono text-[12px] text-text-muted hover:text-text-secondary"
                >
                  {e.requestId}
                </button>
                <span className="ml-auto text-[12px] text-text-muted">{relative(e.createdAt)}</span>
              </li>
            );
          })}
        </ul>
      </Card>
    </div>
  );
}
