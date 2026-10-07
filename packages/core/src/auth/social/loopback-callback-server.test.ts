import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { LoopbackCallbackServer } from './loopback-callback-server.js';
import { SocialAuthCancelledError, SocialAuthExpiredError } from '../auth-errors.js';

describe('LoopbackCallbackServer', () => {
  it('starts on 127.0.0.1 ephemeral port and receives GET callback', async () => {
    const server = await LoopbackCallbackServer.start({ timeoutMs: 5000 });
    assert.ok(server.port > 0);
    assert.equal(server.redirectUri, `http://127.0.0.1:${server.port}/callback`);

    // Simulate browser redirect GET
    const responsePromise = fetch(
      `${server.redirectUri}?code=mock-google-code&state=mock-google-state`,
    );

    const callbackData = await server.waitForCallback();
    assert.equal(callbackData.code, 'mock-google-code');
    assert.equal(callbackData.state, 'mock-google-state');

    const res = await responsePromise;
    assert.equal(res.status, 200);
    const text = await res.text();
    assert.ok(text.includes('Authentication Complete'));
  });

  it('receives POST callback (form_post for Apple)', async () => {
    const server = await LoopbackCallbackServer.start({ timeoutMs: 5000 });

    const body = new URLSearchParams();
    body.set('code', 'mock-apple-code');
    body.set('state', 'mock-apple-state');
    body.set('id_token', 'mock-apple-id-token');

    const responsePromise = fetch(server.redirectUri, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    const callbackData = await server.waitForCallback();
    assert.equal(callbackData.code, 'mock-apple-code');
    assert.equal(callbackData.state, 'mock-apple-state');
    assert.equal(callbackData.idToken, 'mock-apple-id-token');

    const res = await responsePromise;
    assert.equal(res.status, 200);
  });

  it('handles explicit server closure / cancellation', async () => {
    const server = await LoopbackCallbackServer.start({ timeoutMs: 5000 });
    const waitPromise = server.waitForCallback();

    await server.close('User clicked cancel');

    await assert.rejects(() => waitPromise, SocialAuthCancelledError);
  });

  it('handles timeout when no callback arrives', async () => {
    const server = await LoopbackCallbackServer.start({ timeoutMs: 150 });
    const waitPromise = server.waitForCallback();

    await assert.rejects(() => waitPromise, SocialAuthExpiredError);
  });
});
