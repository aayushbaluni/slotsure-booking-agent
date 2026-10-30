# SlotSure — Design System

**Codename: "Command-Center".** Dark-first operations console for the SlotSure admin
dashboard, extended later to the agent's adaptive page. Built to read as *award-winning
craft* — the restraint and density of Linear / Railway / Vercel dashboards — while serving
the demo's job: make backend truth (slots, bookings, events, the race) legible on video in
two seconds.

> **Explicitly not the BusinessNext brand.** No BusinessNext palette, logo, typeface or
> gradient. This is a standalone product identity.

Single source of truth: **`packages/shared/design/tokens.ts`**. Everything below is a token.
No component may hardcode a color, radius, shadow or font — enforced by lint (see §9).

---

## 1. Principles

1. **Surface, not chrome.** Depth comes from a few flat elevation steps on a near-black base,
   never from heavy borders or drop shadows. Content is the interface.
2. **One accent, earned.** A single electric-mint accent marks the primary action and "live"
   state. Everything else is neutral. Color is reserved for *meaning* (status), not decoration.
3. **Data is typographic.** References, codes, times and IDs are monospace; prose is sans.
   The eye should find `SB-7K2Q9` and `19:00 IST` instantly.
4. **Calm by default, loud on event.** The resting dashboard is quiet greys; a conflict or
   failure is the only thing that glows. Motion is used once, to confirm a state change.
5. **Accessible in the dark.** Every text/background pair meets WCAG AA (≥4.5:1 body,
   ≥3:1 large/UI). Focus is always visible. Status is never color-alone — it carries an icon/label.

---

## 2. Color tokens

Dark is the primary (and demo) theme. A light theme is defined for completeness; same token
names, different values, so components never branch on theme.

### Neutrals (dark theme)

| Token | Hex | Use |
| --- | --- | --- |
| `bg.base` | `#0B0E14` | app background (near-black, slight blue) |
| `bg.sunken` | `#070A0F` | wells, code areas, timeline gutter |
| `surface.1` | `#121722` | cards, nav bar |
| `surface.2` | `#1A2130` | raised card, popover, table header |
| `surface.3` | `#232C3D` | hover / active row |
| `border.subtle` | `#232A38` | hairlines, dividers |
| `border.strong` | `#334155` | input borders, focused card edge |
| `text.primary` | `#E8EDF5` | headings, values (15.8:1 on base) |
| `text.secondary`| `#9AA7BD` | labels, metadata (7.1:1) |
| `text.muted` | `#5E6B82` | disabled, placeholder (4.6:1) |

### Accent

| Token | Hex | Use |
| --- | --- | --- |
| `accent.base` | `#5EE6A8` | primary button, "live" dot, active nav, focus ring |
| `accent.hover` | `#7CF0BB` | hover state |
| `accent.dim` | `#1E3A30` | accent-tinted fill behind accent text/badges |
| `accent.on` | `#06231A` | text/icon placed *on* an accent surface |

### Semantic (map directly to BookingEvent types & write_state)

| Token | Hex | Meaning in SlotSure |
| --- | --- | --- |
| `status.created` / success | `#5EE6A8` | `created`, booking CONFIRMED, race winner |
| `status.replayed` / info | `#5AA9FF` | `replayed`, idempotent re-read, "live" refresh |
| `status.conflict` / warn | `#F2B84B` | `conflict_rejected`, SLOT_UNAVAILABLE, `write_state:"unknown"` |
| `status.failed` / danger | `#FF6B6B` | `fail`, INTERNAL/UNAVAILABLE, `write_state:"none"` failure |
| `status.cancelled` / neutral | `#9AA7BD` | CANCELLED, lookup_denied |
| `demo.badge` | `#C792FF` | the "DEMO — not a real booking" marker (unmistakably distinct) |

> **write_state → color is a system rule, not a per-screen choice:** `none` (known-failed) =
> danger red; `unknown` (unverified) = warn amber; verified success = accent mint. This keeps
> the dashboard's story identical to the agent's outcome table (architecture §4).

### Light theme (same tokens, abbreviated)

`bg.base #FBFCFE` · `surface.1 #FFFFFF` · `surface.2 #F3F6FB` · `text.primary #0B0E14` ·
`text.secondary #47536B` · `border.subtle #E4E9F2` · `accent.base #09B37A` (darkened for
contrast on light). Semantic hues darkened ~10% for AA on white.

---

## 3. Typography

Two families, loaded self-hosted (no external CDN at runtime).

| Role | Family | Token | Notes |
| --- | --- | --- | --- |
| UI / prose | **Inter** (variable) | `font.sans` | labels, nav, body, buttons |
| Data / code | **JetBrains Mono** | `font.mono` | references, manage codes, times, IDs, counts |

**Type scale** (1.250 major-third, rem):

| Token | Size / line | Use |
| --- | --- | --- |
| `text.display` | 28 / 34, 600 | page title, big race result count |
| `text.h1` | 22 / 28, 600 | view heading |
| `text.h2` | 18 / 24, 600 | card heading |
| `text.body` | 15 / 22, 400 | default |
| `text.label` | 13 / 18, 500, +0.01em | field labels, nav, table headers (uppercase for nav) |
| `text.mono` | 14 / 20, 450 | references/codes/times |
| `text.caption`| 12 / 16, 400 | timestamps, help |

Rule: anything a user would copy or compare literally (reference, manage code, request ID,
ISO time) is `font.mono`. Never letter-space mono.

---

## 4. Space, radius, border, elevation, motion

- **Spacing** (`space.*`, 4px base): `1`=4 `2`=8 `3`=12 `4`=16 `5`=24 `6`=32 `8`=48 `10`=64.
  Card padding `space.5`; section gap `space.6`.
- **Radius** (`radius.*`): `sm`=6 (chips/inputs) · `md`=10 (cards) · `lg`=14 (modals) ·
  `full`=9999 (dots, pills). One family — no mixed sharp/round.
- **Border**: 1px `border.subtle` default; focused/active uses `border.strong` or a 2px
  `accent.base` ring. Hairline dividers only.
- **Elevation** (`elevation.*`): `0` flat · `1` `0 1px 0 rgba(0,0,0,.4)` (cards) ·
  `2` `0 8px 24px -8px rgba(0,0,0,.6)` (popover/modal) · `glow.accent`
  `0 0 0 1px accent.base, 0 0 16px -4px accent.base` reserved for the primary action & live state.
- **Motion** (`motion.*`): durations `fast`=120ms `base`=180ms `slow`=260ms; easing
  `standard` cubic-bezier(.2,.8,.2,1). Only *state changes* animate: new event row slides+fades
  in, race result count-up, status dot pulse. `prefers-reduced-motion` disables all of it.

---

## 5. Component specs (dashboard)

All four spec views (§9 of the build spec) are composed from these.

- **AppBar** — `surface.1`, title `SlotSure` in mono-caps, right side a `● live` dot
  (`accent.base`, 2s pulse) + IST clock (`text.mono`). Nav tabs are `text.label` uppercase;
  active tab underlined with `accent.base` + `text.primary`.
- **StatCluster** — top-of-view KPI row: demo capacity used `n/200`, active bookings, last
  reset. Big number `text.display` mono, label `text.label` secondary.
- **ScheduleLane** — one horizontal lane per staff (one in prod). Gutter `bg.sunken` with
  15-min grid ticks. **BookingBlock**: `surface.2`, left 3px bar in the service's hue, shows
  time (mono), `serviceName`, `projectType` chip, reference (mono). Free slots are ghost chips
  (`border.subtle`, `text.muted`) that fill `surface.3` on hover.
- **BookingBlock states**: CONFIRMED = normal; CANCELLED = `text.muted`, strikethrough time,
  diagonal-hatch fill; the race-demo slot gets a faint `accent.dim` outline.
- **StatusBadge** — pill, `radius.full`, semantic bg at ~14% + semantic text + a leading glyph
  (`✓ created`, `⟳ replayed`, `⚠ conflict`, `✕ failed`, `– cancelled`). Icon + label always,
  never color alone.
- **DemoBadge** — `demo.badge` outline pill, text `DEMO — not a real booking`. Appears on every
  booking surface and on the agent review card. Non-negotiable per the demo-safety rule.
- **EventRow** (Events view) — mono `requestId` (click-to-copy), relative time, `StatusBadge`,
  one-line detail. Newest-first; new rows animate in. Left edge tinted by severity.
- **DataTable** (Bookings) — `surface.1`, header `surface.2` `text.label`, zebra via
  `surface.1`/`#0E131C`, row hover `surface.3`. Sortable; filter chips above.
- **Button** — primary: `accent.base` fill, `accent.on` text, `glow.accent` on hover.
  secondary: `surface.2` + `border.strong`. danger: `status.failed` outline. Focus = 2px ring.
- **RaceButton** — the hero control. Primary button labelled `▸ RUN THE RACE`; on click shows
  an inline result strip that counts up to `1 created · 9 rejected` (success + conflict hues).
  This is the money shot of the demo video — it gets the only `glow.accent` + count-up motion.
- **FaultControl** (Controls) — segmented control `none / latency / 503 / fail-after-commit`
  with a live countdown pill (`status.conflict`) when a fault is armed, so it's obvious on video
  that a fault is on and when it expires.
- **Toast** — `surface.2` + `elevation.2`, semantic left bar; used for admin actions (reset done).

---

## 6. Agent adaptive page (later)

Reuses the same tokens so the published agent looks like one product with the dashboard:
service cards (duration + "free" + `DemoBadge`), slot buttons (the ghost-chip → accent-fill
pattern), and a **ReviewCard** carrying the `demo.badge`, the quote facts, and a single primary
"Confirm demo booking" action. If Agentplace's components can't render it, fall back to the
API's `say` strings — the token system still governs whatever *can* be styled.

---

## 7. Accessibility

- AA contrast on every pair (values in §2 chosen for it); `text.muted` only on `bg.base`/
  `surface.1`, never on busier surfaces.
- Visible focus ring (2px `accent.base`, 2px offset) on every interactive element; never
  removed.
- Status conveyed by icon + text + color together (color-blind safe).
- Full keyboard path for nav, table, race button, fault control; `aria-live="polite"` on the
  events feed and race result so screen readers announce changes.
- Respects `prefers-reduced-motion` and `prefers-color-scheme` (defaults dark).
- Hit targets ≥ 32px; body text never below 13px.

---

## 8. Implementation

```
packages/shared/design/
├─ tokens.ts         # the ONE source: typed token objects (color, type, space, radius, motion)
├─ tokens.css        # generated: :root[data-theme] CSS custom properties
└─ tailwind-preset.ts # generated: maps tokens → Tailwind theme (colors, fontFamily, spacing…)
```

- `tokens.ts` exports typed objects; a tiny build step emits `tokens.css` (CSS variables, one
  `:root` block per theme via `[data-theme="dark|light"]`) and `tailwind-preset.ts`.
- Dashboard (Vite + React + Tailwind) imports the preset; components use semantic Tailwind
  classes (`bg-surface-1`, `text-secondary`, `text-status-conflict`) — **never** raw hex.
- Theme switch = flip `data-theme` on `<html>`; no JS re-render, no component branching.
- Charts/viz (if any) pull the categorical/semantic hues from the same tokens.

## 9. Governance — "strictly follow"

1. **No raw values in components.** ESLint rule (`no-restricted-syntax` on hex literals +
   stylelint `color-no-hex` outside `tokens.*`) fails CI on any hardcoded color/shadow/radius.
2. **Tokens change in one PR, in one file.** Any new color/space must be added to `tokens.ts`
   with a semantic name and a contrast note; components reference the name.
3. **Semantic over raw.** Use `text-status-conflict`, not `text-amber`. The mapping (and the
   `write_state` rule in §2) is the contract the whole product shares.
4. **One accent.** Adding a second decorative accent needs an explicit design decision; the
   default answer is no.
