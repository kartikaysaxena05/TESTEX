/**
 * @file packages/core/src/execution/sessions/secret-redactor.test.ts
 * Unit tests for SecretRedactor to ensure zero credential or token leakage.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { SecretRedactor } from './secret-redactor.js';

describe('SecretRedactor Unit Tests', () => {
  it('redacts registered secret strings from text', () => {
    SecretRedactor.registerSecret('SuperSecretP@ssw0rd!');

    const log = 'User logged in with password SuperSecretP@ssw0rd! at 12:00';
    const redacted = SecretRedactor.redactText(log);

    assert.ok(!redacted.includes('SuperSecretP@ssw0rd!'));
    assert.ok(redacted.includes('***'));

    SecretRedactor.clearRegisteredSecrets();
  });

  it('redacts sensitive query parameters and basic auth from URLs', () => {
    const url1 =
      'https://admin:mypassword123@app.example.com/api/v1?token=secret-token-xyz&role=user';
    const redacted1 = SecretRedactor.redactUrl(url1);

    assert.ok(!redacted1.includes('mypassword123'));
    assert.ok(!redacted1.includes('secret-token-xyz'));
    assert.ok(redacted1.includes('token=***'));
    assert.ok(redacted1.includes('role=user'));

    const url2 = 'https://login.example.com/oauth?access_token=eyJh...&state=123';
    const redacted2 = SecretRedactor.redactUrl(url2);

    assert.ok(!redacted2.includes('eyJh...'));
    assert.ok(redacted2.includes('access_token=***'));
  });

  it('redacts Authorization Bearer and Basic headers from strings', () => {
    const header1 = 'Authorization: Bearer sk-antigravity-secret-key-12345';
    const redacted1 = SecretRedactor.redactText(header1);
    assert.equal(redacted1, 'Authorization: Bearer ***');

    const header2 = 'Authorization: Basic dXNlcjpwYXNz';
    const redacted2 = SecretRedactor.redactText(header2);
    assert.equal(redacted2, 'Authorization: Basic ***');
  });

  it('recursively redacts sensitive object keys', () => {
    const obj = {
      username: 'john_doe',
      password: 'PlaintextPassword123',
      apiKey: 'api-key-value',
      nested: {
        token: 'jwt-token-string',
        publicField: 'safe_value',
      },
    };

    const redacted = SecretRedactor.redactObject(obj);

    assert.equal(redacted.username, 'john_doe');
    assert.equal(redacted.password, '***');
    assert.equal(redacted.apiKey, '***');
    assert.equal(redacted.nested.token, '***');
    assert.equal(redacted.nested.publicField, 'safe_value');
  });
});
