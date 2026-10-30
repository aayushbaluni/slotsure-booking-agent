import type {
  CalendarPort,
  NotifierPort,
  RepositoryPort,
  RateLimiterPort,
  ClockPort,
  TokenSignerPort,
  CodeDeriverPort,
  EventSinkPort,
  FaultPort,
} from "@slotsure/shared/ports";
import type { Config } from "./config.js";
import { SystemClock } from "./clock.js";

/**
 * The integration registry (composition root). The ONE place adapters are constructed and
 * bound to ports. Nothing else in the codebase `new`s an adapter. Adding an integration =
 * implement the port in a new adapter file + one case here, selected by an env flag.
 * The core receives this `Ports` bag and knows nothing about which concrete adapters won.
 */
export interface Ports {
  clock: ClockPort;
  repository: RepositoryPort;
  tokenSigner: TokenSignerPort;
  codeDeriver: CodeDeriverPort;
  events: EventSinkPort;
  calendar: CalendarPort;
  notifier: NotifierPort;
  limiter: RateLimiterPort;
  faults: FaultPort;
}

export async function buildPorts(cfg: Config): Promise<Ports> {
  // --- driven adapters, chosen by flags ---
  const repository = await selectRepository(cfg);
  const calendar = await selectCalendar(cfg);
  const notifier = await selectNotifier(cfg);
  const limiter = await selectLimiter(cfg);

  // --- fixed infrastructure adapters (one implementation today) ---
  const { HmacSha256Signer } = await import("./adapters/crypto/hmac-signer.js");
  const { CrockfordCodeDeriver } = await import("./adapters/crypto/code-deriver.js");
  const { DbEventSink } = await import("./adapters/events/db-event-sink.js");
  const { FaultInjector } = await import("./adapters/faults/fault-injector.js");

  return {
    clock: new SystemClock(),
    repository,
    tokenSigner: new HmacSha256Signer(cfg.QUOTE_SECRET),
    codeDeriver: new CrockfordCodeDeriver(cfg.CODE_SECRET),
    events: new DbEventSink(repository),
    calendar,
    notifier,
    limiter,
    faults: new FaultInjector(cfg.FAULTS_ENABLED),
  };
}

async function selectRepository(cfg: Config): Promise<RepositoryPort> {
  switch (cfg.STORE) {
    case "postgres": {
      const { PrismaPgRepository } = await import("./db/repository.js");
      return PrismaPgRepository.create(cfg.DATABASE_URL);
    }
  }
}

async function selectCalendar(cfg: Config): Promise<CalendarPort> {
  switch (cfg.CALENDAR) {
    case "noop": {
      const { NoopCalendar } = await import("./adapters/calendar/noop-calendar.js");
      return new NoopCalendar();
    }
    // case "google": return (await import("./adapters/calendar/google-calendar.js")).GoogleCalendar.create(cfg);
    // case "outlook": ...
    default:
      throw new Error(`calendar adapter not implemented: ${cfg.CALENDAR}`);
  }
}

async function selectNotifier(cfg: Config): Promise<NotifierPort> {
  switch (cfg.NOTIFY) {
    case "none": {
      const { NoopNotifier } = await import("./adapters/notify/noop-notifier.js");
      return new NoopNotifier();
    }
    // case "email": return (await import("./adapters/notify/email-notifier.js")).EmailNotifier.create(cfg);
    default:
      throw new Error(`notifier adapter not implemented: ${cfg.NOTIFY}`);
  }
}

async function selectLimiter(cfg: Config): Promise<RateLimiterPort> {
  switch (cfg.LIMITER) {
    case "memory": {
      const { InMemoryRateLimiter } = await import("./adapters/limiter/in-memory-limiter.js");
      return new InMemoryRateLimiter();
    }
    // case "redis": ...
    default:
      throw new Error(`limiter adapter not implemented: ${cfg.LIMITER}`);
  }
}
