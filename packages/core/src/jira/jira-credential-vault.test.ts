/**
 * @file packages/core/src/jira/jira-credential-vault.test.ts
 * Unit and security tests for AES-256-GCM Jira credential encryption and SecretRedactor integration (V7 Phase 89).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { JiraCredentialVault } from './jira-credential-vault.js';
import { JiraSecurityError } from './jira-errors.js';
import { SecretRedactor } from '../execution/sessions/secret-redactor.js';

describe('JiraCredentialVault (Phase 89)', () => {
  const vault = new JiraCredentialVault();
  const testConnectionId = '11111111-1111-1111-1111-111111111111';

  it('encrypts and decrypts API tokens symmetrically', async () => {
    const rawToken = 'ATATT3xFfGF0example_secret_token_12345';
    const encrypted = await vault.encrypt(rawToken, testConnectionId);

    assert.ok(encrypted.startsWith('v1:'), 'Encrypted payload must use v1 envelope');
    assert.notEqual(encrypted, rawToken, 'Ciphertext must not match plaintext');
    assert.ok(!encrypted.includes(rawToken), 'Raw token must not appear in encrypted payload');

    const decrypted = await vault.decrypt(encrypted, testConnectionId);
    assert.equal(decrypted, rawToken);
  });

  it('automatically registers secrets with SecretRedactor on encrypt and decrypt', async () => {
    const sensitiveSecret = 'super-secret-jira-pat-token-999888';
    await vault.encrypt(sensitiveSecret, testConnectionId);

    const logMessage = `User authenticated with token: ${sensitiveSecret}`;
    const redacted = SecretRedactor.redactText(logMessage);

    assert.ok(!redacted.includes(sensitiveSecret), 'Plaintext secret must be redacted from logs');
    assert.ok(redacted.includes('***'), 'Masked marker must replace secret');
  });

  it('rejects tampering with the authentication tag or ciphertext', async () => {
    const rawToken = 'secret-token-to-tamper';
    const encrypted = await vault.encrypt(rawToken, testConnectionId);

    const parts = encrypted.split(':');
    // Tamper with ciphertext
    const tamperedCiphertext = parts[3]!.slice(0, -2) + (parts[3]!.endsWith('0') ? '1' : '0');
    const tamperedPayload = `${parts[0]}:${parts[1]}:${parts[2]}:${tamperedCiphertext}`;

    await assert.rejects(
      async () => await vault.decrypt(tamperedPayload, testConnectionId),
      JiraSecurityError,
      'Tampered ciphertext must fail authentication tag check',
    );
  });

  it('enforces connection isolation via Associated Authenticated Data (AAD)', async () => {
    const rawToken = 'token-for-conn-a';
    const encrypted = await vault.encrypt(rawToken, 'connection-a-id');

    // Attempting to decrypt with connection-b-id must fail
    await assert.rejects(
      async () => await vault.decrypt(encrypted, 'connection-b-id'),
      JiraSecurityError,
      'Decrypting with mismatched AAD connectionId must fail',
    );
  });

  it('rejects malformed envelopes and empty segments', async () => {
    const badEnvelopes = [
      '',
      'invalid-string',
      'v2:iv:tag:cipher',
      'v1::tag:cipher',
      'v1:iv::cipher',
      'v1:iv:tag:',
    ];

    for (const bad of badEnvelopes) {
      await assert.rejects(
        async () => await vault.decrypt(bad, testConnectionId),
        JiraSecurityError,
        `Expected rejection for envelope: ${bad}`,
      );
    }
  });
});
