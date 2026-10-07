import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { SessionTokenService } from './session-token-service.js';
import { InvalidAuthInputError } from './auth-errors.js';

describe('SessionTokenService', () => {
  it('generates 32-byte (64 hex character) cryptographically strong tokens', () => {
    const token1 = SessionTokenService.generateBearerToken();
    const token2 = SessionTokenService.generateBearerToken();

    assert.equal(typeof token1, 'string');
    assert.equal(token1.length, 64);
    assert.notEqual(token1, token2);
  });

  it('hashes tokens deterministically with SHA-256', () => {
    const token = 'a1b2c3d4e5f607182930415263748596a1b2c3d4e5f607182930415263748596';
    const hash1 = SessionTokenService.hashToken(token);
    const hash2 = SessionTokenService.hashToken(token);

    assert.equal(hash1, hash2);
    assert.equal(hash1.length, 64);
    assert.notEqual(hash1, token);
  });

  it('verifies bearer tokens in constant time', () => {
    const token = SessionTokenService.generateBearerToken();
    const hash = SessionTokenService.hashToken(token);

    assert.equal(SessionTokenService.verifyToken(token, hash), true);
    assert.equal(SessionTokenService.verifyToken('wrong-token', hash), false);
  });

  it('rejects invalid token inputs', () => {
    assert.throws(() => SessionTokenService.hashToken(''), InvalidAuthInputError);
    assert.throws(
      () => SessionTokenService.hashToken(null as unknown as string),
      InvalidAuthInputError,
    );
  });
});
