import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PasswordHasher } from './password-hasher.js';

describe('PasswordHasher', () => {
  // Use slightly reduced cost for speed in fast unit tests (production default is 16384)
  const hasher = new PasswordHasher({ n: 2048, r: 8, p: 1 });

  it('hashes a plaintext password into serialized scrypt format', async () => {
    const plain = 'VerySecureP@ssw0rd!2026';
    const result = await hasher.hash(plain);

    assert.equal(result.algorithm, 'scrypt');
    assert.equal(result.version, 1);
    assert.ok(result.passwordHash.startsWith('$scrypt$v=1$'));
    assert.ok(!result.passwordHash.includes(plain), 'Password hash must never contain plaintext');
  });

  it('produces unique hashes for the same password due to random salt', async () => {
    const plain = 'VerySecureP@ssw0rd!2026';
    const hash1 = await hasher.hash(plain);
    const hash2 = await hasher.hash(plain);

    assert.notEqual(hash1.passwordHash, hash2.passwordHash);
  });

  it('verifies correct password against serialized hash', async () => {
    const plain = 'VerySecureP@ssw0rd!2026';
    const result = await hasher.hash(plain);

    const isMatch = await hasher.verify(plain, result.passwordHash);
    assert.equal(isMatch, true);
  });

  it('rejects incorrect password', async () => {
    const plain = 'VerySecureP@ssw0rd!2026';
    const wrong = 'WrongP@ssw0rd!2026';
    const result = await hasher.hash(plain);

    const isMatch = await hasher.verify(wrong, result.passwordHash);
    assert.equal(isMatch, false);
  });

  it('handles corrupted or malformed hashes safely without throwing', async () => {
    assert.equal(await hasher.verify('SomePassword123!', 'corrupted-hash'), false);
    assert.equal(await hasher.verify('SomePassword123!', '$scrypt$v=1$malformed'), false);
    assert.equal(await hasher.verify('SomePassword123!', ''), false);
  });

  it('executes dummy hash without error', async () => {
    await assert.doesNotReject(async () => {
      await hasher.performDummyHash();
    });
  });
});
