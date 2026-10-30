/**
 * SlotSure design tokens — "Command-Center" (dark-first). The ONE source of truth.
 * See design-system.md. Components reference semantic names only; raw hex outside this
 * file fails lint (design-system.md §9). `design:build` emits tokens.css + a Tailwind preset.
 *
 * NOT the BusinessNext brand — standalone product identity.
 */

export const color = {
  dark: {
    bg: { base: "#0B0E14", sunken: "#070A0F" },
    surface: { 1: "#121722", 2: "#1A2130", 3: "#232C3D" },
    border: { subtle: "#232A38", strong: "#334155" },
    text: { primary: "#E8EDF5", secondary: "#9AA7BD", muted: "#5E6B82" },
    accent: { base: "#5EE6A8", hover: "#7CF0BB", dim: "#1E3A30", on: "#06231A" },
    status: {
      created: "#5EE6A8", // success · CONFIRMED · race winner
      replayed: "#5AA9FF", // info · idempotent re-read · live refresh
      conflict: "#F2B84B", // warn · SLOT_UNAVAILABLE · write_state:"unknown"
      failed: "#FF6B6B", // danger · INTERNAL/UNAVAILABLE · write_state:"none"
      cancelled: "#9AA7BD", // neutral · CANCELLED · lookup_denied
    },
    demo: { badge: "#C792FF" },
  },
  light: {
    bg: { base: "#FBFCFE", sunken: "#F3F6FB" },
    surface: { 1: "#FFFFFF", 2: "#F3F6FB", 3: "#E9EEF6" },
    border: { subtle: "#E4E9F2", strong: "#C3CDDC" },
    text: { primary: "#0B0E14", secondary: "#47536B", muted: "#6B7688" },
    accent: { base: "#09B37A", hover: "#0AC98A", dim: "#D6F6E8", on: "#FFFFFF" },
    status: {
      created: "#09B37A",
      replayed: "#2F7FE0",
      conflict: "#C98A14",
      failed: "#D94A4A",
      cancelled: "#6B7688",
    },
    demo: { badge: "#8B4FD6" },
  },
} as const;

export const font = {
  sans: "'Inter', system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
  mono: "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace",
} as const;

/** 1.250 major-third scale: [fontSize, lineHeight, weight] in px. */
export const type = {
  display: ["28px", "34px", 600],
  h1: ["22px", "28px", 600],
  h2: ["18px", "24px", 600],
  body: ["15px", "22px", 400],
  label: ["13px", "18px", 500],
  mono: ["14px", "20px", 450],
  caption: ["12px", "16px", 400],
} as const;

/** 4px base. */
export const space = { 1: "4px", 2: "8px", 3: "12px", 4: "16px", 5: "24px", 6: "32px", 8: "48px", 10: "64px" } as const;

export const radius = { sm: "6px", md: "10px", lg: "14px", full: "9999px" } as const;

export const elevation = {
  0: "none",
  1: "0 1px 0 rgba(0,0,0,.4)",
  2: "0 8px 24px -8px rgba(0,0,0,.6)",
  glowAccent: "0 0 0 1px #5EE6A8, 0 0 16px -4px #5EE6A8",
} as const;

export const motion = {
  duration: { fast: "120ms", base: "180ms", slow: "260ms" },
  easing: { standard: "cubic-bezier(.2,.8,.2,1)" },
} as const;

export type Theme = keyof typeof color;

/** write_state -> semantic status token. Keeps dashboard and agent in lockstep. */
export const writeStateColor = {
  none: "failed",
  unknown: "conflict",
} as const;

export const tokens = { color, font, type, space, radius, elevation, motion } as const;
export default tokens;
