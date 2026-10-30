import { argv } from "node:process";
import { pathToFileURL } from "node:url";
import Fastify from "fastify";
import helmet from "@fastify/helmet";
import cors from "@fastify/cors";
import { loadConfig } from "./config.js";
import { buildPorts } from "./composition.js";
import { BookingCore } from "./core/index.js";
import { registerRest } from "./adapters/rest/index.js";
import requestContext from "./plugins/request-context.js";
import errorHandler from "./plugins/error-handler.js";

/**
 * Composition happens here: load config -> build ports (the integration registry picks adapters
 * from flags) -> construct the core with those ports -> mount the agent-facing adapter (REST
 * today; MCP only if Phase 1 requires it) plus the always-on REST/admin surface.
 */
export async function buildServer() {
  const cfg = loadConfig();
  const ports = await buildPorts(cfg);
  const core = new BookingCore(ports);

  const app = Fastify({
    logger: {
      level: cfg.LOG_LEVEL,
      // redact PII and secrets from logs (build spec §8)
      redact: {
        paths: ["req.headers.authorization", "*.customer_name", "*.project_brief", "*.manage_code"],
        remove: true,
      },
    },
    bodyLimit: 16 * 1024,
    // overall request budget (build spec §8, F2). The DB statement timeout (3s) caps query time;
    // this caps the whole request so a stuck connection can't hang indefinitely.
    requestTimeout: 8000,
  });

  await app.register(helmet);
  await app.register(cors, {
    origin: cfg.DASHBOARD_ORIGIN,
    methods: ["GET", "POST", "PUT"],
    allowedHeaders: ["Content-Type", "Authorization", "x-request-id"],
  });
  await app.register(requestContext);
  await app.register(errorHandler);

  await registerRest(app, {
    core,
    repository: ports.repository,
    faults: ports.faults,
    limiter: ports.limiter,
    adminToken: cfg.ADMIN_TOKEN,
    faultsEnabled: cfg.FAULTS_ENABLED,
  });

  // Agent-facing MCP adapter — mounted when AGENT_ADAPTER=mcp (Phase 1 picks the connection type).
  // REST (/v1) always exists for the dashboard and tests, and also serves the agent if Phase 1
  // chooses API integration instead.
  if (cfg.AGENT_ADAPTER === "mcp") {
    const { registerMcp } = await import("./adapters/mcp/index.js");
    await registerMcp(app, { core, apiKey: cfg.AGENT_API_KEY });
  }

  // release the repository's connection pool when the server closes (tests + graceful shutdown)
  app.addHook("onClose", async () => {
    const repo = ports.repository as { close?: () => Promise<void> };
    if (typeof repo.close === "function") await repo.close();
  });

  return { app, cfg, ports };
}

async function main() {
  const { app, cfg } = await buildServer();
  await app.listen({ port: cfg.PORT, host: "0.0.0.0" });
}

// run only when executed directly (not when imported by tests). pathToFileURL handles Windows
// drive letters / backslashes, which a raw `file://${argv[1]}` comparison gets wrong.
if (argv[1] && import.meta.url === pathToFileURL(argv[1]).href) {
  main().catch((err) => {
     
    console.error(err);
    process.exit(1);
  });
}
