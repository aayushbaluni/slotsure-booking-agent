# SlotSure — Technical note

Target: 2 pages. Outline per build spec §13; fill in after Phases 1–4.

## 1. What I built
A booking agent for my own freelance practice: a prospective client describes a project and
books a demo discovery call, through a booking API I built and deployed. Demo boundary: no real
calendar, no notifications, demo-only bookings.

## 2. How it fits together
_Architecture diagram → architecture.md._ One booking core owns every rule; the adapter Phase 1
proved serves the agent; REST serves the dashboard and tests. The API, not the model, owns facts.
Ports & adapters keep integrations loosely coupled (architecture.md §7).

## 3. Key decisions
Exclusion constraint over app-level locks (+ savepoints for multi-resource attempts); `write_state`
to separate known failure from unknown outcome; quote-then-confirm instead of slot holds; quote ID
as the replay key, checked before expiry; reset generation; derived manage codes with throttling,
not lockout; `say` strings for a small model; server-side date resolution; capabilities served as
data so the agent can't overclaim.

## 4. Validation
Tests by layer; the race result; eval pass rate across three runs; links to `agent/evals/results.md`
and the demo video.

## 5. Where I hit Agentplace's limits
Only what Phase 1 observed (docs/platform-findings.md), each as "what I needed / what happened /
how I'd build it in the platform". The confirmation gap goes here if there is no model-proof
confirmation.

## 6. What I'd change for production
_Implemented_ vs _planned_: real calendar sync (CalendarPort → Google/Outlook), client
verification beyond a manage code, slot holds for busy times, rescheduling as one operation,
indicative estimates from approved pricing rules, key rotation with versioned keys, notifications
with consent (NotifierPort), alerting on error/conflict rates, retention policy.
