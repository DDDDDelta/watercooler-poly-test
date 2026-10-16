/** Tiny in-memory fixed-window limiter (single process is all we need). */
export class RateLimiter {
  private hits = new Map<string, { count: number; resetAt: number }>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
  ) {}

  /** Returns false once `key` has exceeded the limit in the current window. */
  check(key: string, now = Date.now()): boolean {
    const entry = this.hits.get(key);
    if (!entry || entry.resetAt <= now) return true;
    return entry.count < this.limit;
  }

  hit(key: string, now = Date.now()): void {
    const entry = this.hits.get(key);
    if (!entry || entry.resetAt <= now) {
      this.hits.set(key, { count: 1, resetAt: now + this.windowMs });
      if (this.hits.size > 10_000) this.prune(now);
    } else {
      entry.count++;
    }
  }

  reset(key: string): void {
    this.hits.delete(key);
  }

  private prune(now: number): void {
    for (const [k, v] of this.hits) if (v.resetAt <= now) this.hits.delete(k);
  }
}
