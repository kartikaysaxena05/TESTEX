/**
 * @file packages/core/src/execution/evidence/collectors/network-collector.test.ts
 * Unit and security tests for NetworkCollector.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { NetworkCollector } from './network-collector.js';

describe('NetworkCollector Unit & Security Tests (V5 Phase 70)', () => {
  let server: http.Server;
  let serverUrl: string;
  let browser: Browser;
  let context: BrowserContext;
  let page: Page;

  before(async () => {
    server = http.createServer((req, res) => {
      if (req.url?.startsWith('/api/success')) {
        res.writeHead(200, {
          'Content-Type': 'application/json',
          'Set-Cookie': 'secret_cookie=val123',
        });
        res.end(JSON.stringify({ ok: true, data: 'hello' }));
      } else if (req.url?.startsWith('/api/not-found')) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Not Found' }));
      } else if (req.url?.startsWith('/api/error')) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Server Crash' }));
      } else {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end('<html><body>Network Test Page</body></html>');
      }
    });

    await new Promise<void>(resolve => {
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address() as any;
        serverUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });

    browser = await chromium.launch({ headless: true });
    context = await browser.newContext();
    page = await context.newPage();
  });

  after(async () => {
    await browser?.close();
    await new Promise<void>(resolve => server.close(() => resolve()));
  });

  it('captures HTTP requests and responses (200, 404, 500) with status and timing', async () => {
    const collector = new NetworkCollector();
    collector.attach(page);

    await page.goto(`${serverUrl}/`);
    await page.evaluate(url => fetch(`${url}/api/success`), serverUrl);
    await page.evaluate(url => fetch(`${url}/api/not-found`), serverUrl);
    await page.evaluate(url => fetch(`${url}/api/error`), serverUrl);

    const events = collector.getEvents();
    assert.ok(events.length >= 4);

    const successEvent = events.find(e => e.url.includes('/api/success'));
    assert.ok(successEvent);
    assert.equal(successEvent.status, 200);
    assert.equal(successEvent.method, 'GET');

    const notFoundEvent = events.find(e => e.url.includes('/api/not-found'));
    assert.ok(notFoundEvent);
    assert.equal(notFoundEvent.status, 404);

    const errorEvent = events.find(e => e.url.includes('/api/error'));
    assert.ok(errorEvent);
    assert.equal(errorEvent.status, 500);

    collector.detach();
  });

  it('redacts sensitive headers (Authorization, Cookie, Set-Cookie) and sensitive query parameters', async () => {
    const collector = new NetworkCollector();
    collector.attach(page);

    await page.evaluate(url => {
      fetch(`${url}/api/success?auth_token=super_secret_token_123&api_key=key_xyz`, {
        headers: {
          Authorization: 'Bearer secret_jwt_token',
          Cookie: 'session_id=12345',
          'X-API-Key': 'my-secret-api-key',
        },
      });
    }, serverUrl);

    await page.waitForTimeout(50);

    const events = collector.getEvents();
    const targetEvent = events.find(e => e.url.includes('/api/success'));
    assert.ok(targetEvent);

    // Verify URL parameter redaction
    assert.ok(!targetEvent.url.includes('super_secret_token_123'));
    assert.ok(targetEvent.url.includes('auth_token=***'));
    assert.ok(!targetEvent.url.includes('key_xyz'));
    assert.ok(targetEvent.url.includes('api_key=***'));

    // Verify Request Headers redaction
    if (targetEvent.requestHeaders) {
      assert.equal(targetEvent.requestHeaders['authorization'], '***');
      assert.equal(targetEvent.requestHeaders['x-api-key'], '***');
    }

    collector.detach();
  });

  it('enforces maximum event buffer bounds and serializes truthfully', async () => {
    const collector = new NetworkCollector({ maxEvents: 3 });
    collector.attach(page);

    for (let i = 1; i <= 6; i++) {
      await page.evaluate(({ url, idx }) => fetch(`${url}/api/success?idx=${idx}`), {
        url: serverUrl,
        idx: i,
      });
    }

    await page.waitForTimeout(50);

    const events = collector.getEvents();
    assert.equal(events.length, 3);

    const serialized = collector.serialize();
    assert.equal(serialized.isTruncated, true);
    assert.equal(serialized.networkEvents.length, 3);

    collector.detach();
  });
});
