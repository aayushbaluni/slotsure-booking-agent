/**
 * Emits two generated artifacts from tokens.ts (the single source of truth):
 *   - src/design/tokens.css        CSS custom properties, one block per [data-theme]
 *   - src/design/tailwind-preset.js a Tailwind preset mapping tokens -> theme
 * Run via `pnpm --filter @slotsure/shared design:build`. Generated files are gitignored.
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { color, font, space, radius } from "../src/design/tokens.js";

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "..", "src", "design");

function flatten(prefix: string, obj: Record<string, unknown>, acc: string[]) {
  for (const [k, v] of Object.entries(obj)) {
    const name = `${prefix}-${k}`;
    if (typeof v === "string") acc.push(`  ${name}: ${v};`);
    else flatten(name, v as Record<string, unknown>, acc);
  }
}

function themeBlock(theme: "dark" | "light") {
  const vars: string[] = [];
  flatten("--color", color[theme] as unknown as Record<string, unknown>, vars);
  return `:root[data-theme="${theme}"] {\n${vars.join("\n")}\n}`;
}

const css = `/* GENERATED from tokens.ts — do not edit. */\n${themeBlock("dark")}\n\n${themeBlock("light")}\n`;
writeFileSync(join(out, "tokens.css"), css);

const preset = `// GENERATED from tokens.ts — do not edit.
module.exports = {
  theme: {
    extend: {
      fontFamily: { sans: [${JSON.stringify(font.sans)}], mono: [${JSON.stringify(font.mono)}] },
      spacing: ${JSON.stringify(space)},
      borderRadius: ${JSON.stringify(radius)},
      colors: {
        // semantic names resolve to CSS vars so theme switching is pure CSS
        bg: { DEFAULT: "var(--color-bg-base)", sunken: "var(--color-bg-sunken)" },
        surface: { 1: "var(--color-surface-1)", 2: "var(--color-surface-2)", 3: "var(--color-surface-3)" },
        border: { subtle: "var(--color-border-subtle)", strong: "var(--color-border-strong)" },
        text: { primary: "var(--color-text-primary)", secondary: "var(--color-text-secondary)", muted: "var(--color-text-muted)" },
        accent: { DEFAULT: "var(--color-accent-base)", hover: "var(--color-accent-hover)", dim: "var(--color-accent-dim)", on: "var(--color-accent-on)" },
        status: {
          created: "var(--color-status-created)", replayed: "var(--color-status-replayed)",
          conflict: "var(--color-status-conflict)", failed: "var(--color-status-failed)",
          cancelled: "var(--color-status-cancelled)",
        },
        demo: "var(--color-demo-badge)",
      },
    },
  },
};
`;
writeFileSync(join(out, "tailwind-preset.js"), preset);

console.log("design tokens built: tokens.css + tailwind-preset.js");
