import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { AuthThrottleService } from './auth-throttle-service.js';

describe('AuthThrottleService', () => {
  it('allows attempts below the maximum threshold', () => {
    const throttle = new AuthThrottleService({
      maxAttempts: 3,
      windowMs: 10000,
      lockoutDurationMs: 10000,
    });
    const key = 'user@example.com';

    assert.equal(throttle.checkThrottled(key).isThrottled, false);
    assert.equal(throttle.recordFailure(key), 1);
    assert.equal(throttle.checkThrottled(key).isThrottled, false);
    assert.equal(throttle.recordFailure(key), 2);
    assert.equal(throttle.checkThrottled(key).isThrottled, false);
  });

  it('locks out identity once threshold is reached', () => {
    const throttle = new AuthThrottleService({
      maxAttempts: 3,
      windowMs: 10000,
      lockoutDurationMs: 10000,
    });
    const key = 'user@example.com';

    throttle.recordFailure(key);
    throttle.recordFailure(key);
    throttle.recordFailure(key);

    const status = throttle.checkThrottled(key);
    assert.equal(status.isThrottled, true);
    assert.ok(status.retryAfterSeconds > 0 && status.retryAfterSeconds <= 10);
  });

  it('resets attempts upon successful login', () => {
    const throttle = new AuthThrottleService({
      maxAttempts: 3,
      windowMs: 10000,
      lockoutDurationMs: 10000,
    });
    const key = 'user@example.com';

    throttle.recordFailure(key);
    throttle.recordFailure(key);
    throttle.reset(key);

    assert.equal(throttle.checkThrottled(key).isThrottled, false);
  });

  it('defends against normalization bypass tricks (casing and whitespace)', () => {
    const throttle = new AuthThrottleService({
      maxAttempts: 2,
      windowMs: 10000,
      lockoutDurationMs: 10000,
    });

    throttle.recordFailure('User@Example.COM');
    throttle.recordFailure('  user@example.com  ');

    // Both variations map to the same normalized key
    assert.equal(throttle.checkThrottled('USER@EXAMPLE.COM').isThrottled, true);
    assert.equal(throttle.checkThrottled('user@example.com').isThrottled, true);
  });
});
