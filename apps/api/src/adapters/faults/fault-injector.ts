import type { FaultMode, FaultPort } from "@slotsure/shared/ports";

/**
 * In-memory fault injection for the demo/tests (build spec §8). Faults auto-expire after their
 * TTL so a fault left on can't leak into a review. Disabled entirely unless FAULTS_ENABLED.
 */
interface ArmedFault {
  mode: FaultMode;
  tools: Set<string>;
  expiresAt: number;
}

export class FaultInjector implements FaultPort {
  private armed: ArmedFault | null = null;
  constructor(private readonly enabled: boolean) {}

  current(tool: string): FaultMode {
    if (!this.enabled || !this.armed) return "none";
    if (Date.now() > this.armed.expiresAt) {
      this.armed = null;
      return "none";
    }
    return this.armed.tools.has(tool) ? this.armed.mode : "none";
  }

  set(mode: FaultMode, tools: string[], ttlS: number): void {
    if (!this.enabled) return;
    this.armed = mode === "none" ? null : { mode, tools: new Set(tools), expiresAt: Date.now() + ttlS * 1000 };
  }

  status(): { mode: FaultMode; tools: string[]; expiresAt: number | null } {
    if (!this.armed || Date.now() > this.armed.expiresAt) return { mode: "none", tools: [], expiresAt: null };
    return { mode: this.armed.mode, tools: [...this.armed.tools], expiresAt: this.armed.expiresAt };
  }
}
