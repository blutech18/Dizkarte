import type { Clock, IdGenerator } from "../ports/providers.js";
import { syntheticUuid } from "./hash.js";

/** Real system clock. */
export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }
  nowIso(): string {
    return new Date().toISOString();
  }
}

/** Deterministic clock for tests; advances by a fixed step on each read. */
export class FixedClock implements Clock {
  private current: number;
  private readonly stepMs: number;

  constructor(startIso = "2026-01-01T00:00:00.000Z", stepMs = 0) {
    this.current = new Date(startIso).getTime();
    this.stepMs = stepMs;
  }

  now(): Date {
    const value = new Date(this.current);
    this.current += this.stepMs;
    return value;
  }

  nowIso(): string {
    return this.now().toISOString();
  }
}

/** Deterministic, seeded UUID generator for synthetic/test flows. */
export class DeterministicIdGenerator implements IdGenerator {
  private counter = 0;
  constructor(private readonly seed = "dizkarte") {}

  uuid(): string {
    this.counter += 1;
    return syntheticUuid(`${this.seed}:${this.counter}`);
  }
}

/** Real random UUID generator (uses crypto.randomUUID when available). */
export class RandomIdGenerator implements IdGenerator {
  uuid(): string {
    const globalCrypto = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
    if (globalCrypto?.randomUUID) {
      return globalCrypto.randomUUID();
    }
    // Fallback deterministic-ish; only used where crypto is unavailable.
    return syntheticUuid(`${Date.now()}:${Math.random()}`);
  }
}
