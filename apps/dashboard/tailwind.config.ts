import type { Config } from "tailwindcss";
// The ONE source of theme: the generated preset from @slotsure/shared design tokens.
// Run `pnpm design:build` first. Components use semantic classes (bg-surface-1, text-status-*).
// eslint-disable-next-line @typescript-eslint/no-var-requires
import preset from "@slotsure/shared/design/tailwind-preset";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  presets: [preset as unknown as Config],
} satisfies Config;
