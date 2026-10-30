import { z } from "zod";

/**
 * Env parsing. The app refuses to start if a secret is missing or shorter than 32 bytes
 * (build spec §8). Integration flags select which adapter each port binds to — see
 * composition.ts. Changing an integration happens here + one adapter file, never in core.
 */
const secret = (min = 32) => z.string().min(min, `must be at least ${min} bytes`);

const Env = z.object({
  DATABASE_URL: z.string().url(),
  AGENT_API_KEY: secret(),
  ADMIN_TOKEN: secret(),
  QUOTE_SECRET: secret(),
  CODE_SECRET: secret(),
  BUSINESS_TZ: z.string().default("Asia/Kolkata"),
  PORT: z.coerce.number().int().default(3000),
  DASHBOARD_ORIGIN: z.string().url().default("http://localhost:5173"),

  // integration registry flags
  STORE: z.enum(["postgres"]).default("postgres"),
  LIMITER: z.enum(["memory", "redis"]).default("memory"),
  CALENDAR: z.enum(["noop", "google", "outlook"]).default("noop"),
  NOTIFY: z.enum(["none", "email", "sms", "whatsapp"]).default("none"),
  AGENT_ADAPTER: z.enum(["rest", "mcp"]).default("rest"),

  FAULTS_ENABLED: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
  LOG_LEVEL: z.string().default("info"),
});

export type Config = z.infer<typeof Env>;

export function loadConfig(source: NodeJS.ProcessEnv = process.env): Config {
  const parsed = Env.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid configuration:\n${issues}`);
  }
  // demo-safety guard: a demo must never reach a real calendar or notifier
  const c = parsed.data;
  if (c.CALENDAR !== "noop" || c.NOTIFY !== "none") {
     
    console.warn(
      "[config] CALENDAR/NOTIFY are not no-op — this is NOT demo-safe. Ensure this is a production deploy.",
    );
  }
  return c;
}
