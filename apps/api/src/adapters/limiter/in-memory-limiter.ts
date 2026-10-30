import type { RateLimiterPort } from "@slotsure/shared/ports";

/**
 * Single-instance rate limiter + manage-code throttle (build spec §8). The code throttle
 * NEVER locks out — after 5 failures/hour for a reference it slows to 1 attempt/minute, so a
 * real client can always get in. Swap for a Redis adapter (same port) when running >1 instance.
 */
export class InMemoryRateLimiter implements RateLimiterPort {
  private buckets = new Map<string, number[]>();
  private codeFailures = new Map<string, number[]>();

  // bucket config: name -> { limit, windowMs }
  private static LIMITS: Record<string, { limit: number; windowMs: number }> = {
    reads: { limit: 120, windowMs: 60_000 },
    writes: { limit: 30, windowMs: 3_600_000 },
  };

  async take(bucket: string, key: string): Promise<{ allowed: boolean; retryAfterMs?: number }> {
    const cfg = InMemoryRateLimiter.LIMITS[bucket];
    if (!cfg) return { allowed: true };
    const now = Date.now();
    const id = `${bucket}:${key}`;
    const hits = (this.buckets.get(id) ?? []).filter((t) => now - t < cfg.windowMs);
    if (hits.length >= cfg.limit) {
      const retryAfterMs = cfg.windowMs - (now - hits[0]!);
      return { allowed: false, retryAfterMs };
    }
    hits.push(now);
    this.buckets.set(id, hits);
    return { allowed: true };
  }

  async recordCodeFailure(reference: string, _clientKey: string): Promise<void> {
    const now = Date.now();
    const hits = (this.codeFailures.get(reference) ?? []).filter((t) => now - t < 3_600_000);
    hits.push(now);
    this.codeFailures.set(reference, hits);
  }

  async isCodeThrottled(reference: string): Promise<boolean> {
    const now = Date.now();
    const hits = (this.codeFailures.get(reference) ?? []).filter((t) => now - t < 3_600_000);
    if (hits.length < 5) return false;
    // throttled: allow at most 1 attempt per minute
    const lastMinute = hits.filter((t) => now - t < 60_000);
    return lastMinute.length >= 1;
  }
}
