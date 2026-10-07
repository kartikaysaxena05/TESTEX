/**
 * @file packages/core/src/auth/auth-throttle-service.ts
 * Bounded rate-limiting and brute-force protection service for V8 Phase 113.
 */

import { AUTH_BOUNDS, type IAuthThrottleService } from './auth-types.js';

interface ThrottleRecord {
  failedAttempts: number;
  firstFailedAt: number;
  lockedUntil: number | null;
}

export class AuthThrottleService implements IAuthThrottleService {
  private readonly maxAttempts: number;
  private readonly windowMs: number;
  private readonly lockoutDurationMs: number;
  private readonly records = new Map<string, ThrottleRecord>();
  private readonly maxTrackedKeys = 10000;

  constructor(options?: {
    readonly maxAttempts?: number;
    readonly windowMs?: number;
    readonly lockoutDurationMs?: number;
  }) {
    this.maxAttempts = options?.maxAttempts ?? AUTH_BOUNDS.MAX_FAILED_ATTEMPTS;
    this.windowMs = options?.windowMs ?? AUTH_BOUNDS.THROTTLE_WINDOW_MS;
    this.lockoutDurationMs = options?.lockoutDurationMs ?? AUTH_BOUNDS.LOCKOUT_DURATION_MS;
  }

  /**
   * Checks if an identity key is currently throttled/locked.
   */
  public checkThrottled(key: string): {
    readonly isThrottled: boolean;
    readonly retryAfterSeconds: number;
  } {
    const normalizedKey = key.trim().toLowerCase();
    const now = Date.now();
    const record = this.records.get(normalizedKey);

    if (!record) {
      return { isThrottled: false, retryAfterSeconds: 0 };
    }

    // Check active lockout
    if (record.lockedUntil !== null) {
      if (now < record.lockedUntil) {
        const retryAfterSeconds = Math.max(1, Math.ceil((record.lockedUntil - now) / 1000));
        return { isThrottled: true, retryAfterSeconds };
      } else {
        // Lockout expired, reset
        this.records.delete(normalizedKey);
        return { isThrottled: false, retryAfterSeconds: 0 };
      }
    }

    // Check sliding window expiry
    if (now - record.firstFailedAt > this.windowMs) {
      this.records.delete(normalizedKey);
      return { isThrottled: false, retryAfterSeconds: 0 };
    }

    if (record.failedAttempts >= this.maxAttempts) {
      const lockedUntil = now + this.lockoutDurationMs;
      record.lockedUntil = lockedUntil;
      const retryAfterSeconds = Math.ceil(this.lockoutDurationMs / 1000);
      return { isThrottled: true, retryAfterSeconds };
    }

    return { isThrottled: false, retryAfterSeconds: 0 };
  }

  /**
   * Records a failed authentication attempt. Returns updated failed attempt count.
   */
  public recordFailure(key: string): number {
    const normalizedKey = key.trim().toLowerCase();
    const now = Date.now();

    // Prevent unbounded memory growth
    if (this.records.size >= this.maxTrackedKeys) {
      this.evictExpired(now);
    }

    const existing = this.records.get(normalizedKey);

    if (!existing || now - existing.firstFailedAt > this.windowMs) {
      this.records.set(normalizedKey, {
        failedAttempts: 1,
        firstFailedAt: now,
        lockedUntil: null,
      });
      return 1;
    }

    existing.failedAttempts += 1;
    if (existing.failedAttempts >= this.maxAttempts && existing.lockedUntil === null) {
      existing.lockedUntil = now + this.lockoutDurationMs;
    }

    return existing.failedAttempts;
  }

  /**
   * Resets failed attempt counter upon successful authentication.
   */
  public reset(key: string): void {
    const normalizedKey = key.trim().toLowerCase();
    this.records.delete(normalizedKey);
  }

  /**
   * Evicts expired records to bound memory usage.
   */
  private evictExpired(now: number): void {
    for (const [key, record] of this.records.entries()) {
      if (record.lockedUntil !== null && now >= record.lockedUntil) {
        this.records.delete(key);
      } else if (now - record.firstFailedAt > this.windowMs) {
        this.records.delete(key);
      }
    }
  }

  /**
   * Clears all tracked records (test helper).
   */
  public clearAllForTest(): void {
    this.records.clear();
  }
}
