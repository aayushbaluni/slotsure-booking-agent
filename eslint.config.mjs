import tseslint from "typescript-eslint";

/**
 * Minimal, high-signal lint. The one rule that matters architecturally: the booking CORE must
 * depend only on ports (@slotsure/shared), never on adapters, infrastructure, Fastify or Prisma
 * (architecture.md §7). This keeps the hexagon's dependency direction one-way, so a new
 * integration can never leak into the core. A violation fails CI.
 */
export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/node_modules/**",
      "**/*.config.*",
      "**/generated/**",
      "**/prisma/migrations/**",
      "packages/shared/src/design/tailwind-preset.js",
    ],
  },
  // base: give ESLint a TS parser for every source file (no rules, just parse so it doesn't choke)
  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: { parser: tseslint.parser },
  },
  // the boundary rule, scoped to the core
  {
    files: ["apps/api/src/core/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/adapters/**", "**/db/**", "**/plugins/**", "fastify", "fastify-plugin", "@prisma/client", "pg"],
              message:
                "The booking core must depend only on ports (@slotsure/shared), never on adapters/infra/Fastify/Prisma. See architecture.md §7.",
            },
          ],
        },
      ],
    },
  },
);
