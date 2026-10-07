/**
 * @file packages/core/src/execution/actions/locator-resolver.test.ts
 * Real Playwright tests for LocatorResolver strategies and ambiguity detection.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import * as http from 'node:http';
import { PlaywrightBrowserProvider } from '../browser-provider.js';
import { LocatorResolver } from './locator-resolver.js';
import { TargetAmbiguousError } from './action-errors.js';
import type { Browser, Page } from 'playwright';

describe('LocatorResolver Playwright Integration Tests', () => {
  let browser: Browser;
  let page: Page;
  let server: http.Server;
  let serverPort: number;
  let serverUrl: string;
  const resolver = new LocatorResolver();

  before(async () => {
    server = http.createServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`<!DOCTYPE html>
<html>
<body>
  <button data-testid="btn-submit">Submit Form</button>
  <button class="duplicate-btn">Duplicate</button>
  <button class="duplicate-btn">Duplicate</button>
  <input id="email" name="user_email" type="email" placeholder="Enter your email" />
  <label for="username">Username</label>
  <input id="username" type="text" />
  <a href="/dashboard">Go to Dashboard</a>
</body>
</html>`);
    });

    await new Promise<void>(resolve => {
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address() as { port: number };
        serverPort = addr.port;
        serverUrl = `http://127.0.0.1:${serverPort}`;
        resolve();
      });
    });

    const provider = new PlaywrightBrowserProvider();
    browser = await provider.launch({ headless: true });
    page = await browser.newPage();
    await page.goto(serverUrl);
  });

  after(async () => {
    if (page) await page.close().catch(() => {});
    if (browser) await browser.close().catch(() => {});
    await new Promise<void>(resolve => server.close(() => resolve()));
  });

  it('resolves element by testId cleanly', async () => {
    const loc = await resolver.resolve(page, {
      kind: 'CONTROL',
      testId: 'btn-submit',
    });

    assert.ok(loc);
    const text = await loc.textContent();
    assert.equal(text?.trim(), 'Submit Form');
  });

  it('resolves field by placeholder', async () => {
    const loc = await resolver.resolve(page, {
      kind: 'FIELD',
      placeholder: 'Enter your email',
    });

    assert.ok(loc);
    assert.equal(await loc.getAttribute('name'), 'user_email');
  });

  it('resolves field by label', async () => {
    const loc = await resolver.resolve(page, {
      kind: 'FIELD',
      label: 'Username',
    });

    assert.ok(loc);
    assert.equal(await loc.getAttribute('id'), 'username');
  });

  it('strictly detects ambiguous target when multiple elements match (count > 1)', async () => {
    await assert.rejects(
      async () => {
        await resolver.resolve(page, {
          kind: 'CONTROL',
          name: 'Duplicate',
        });
      },
      (err: unknown) => {
        assert.ok(err instanceof TargetAmbiguousError);
        assert.equal((err as TargetAmbiguousError).code, 'TARGET_AMBIGUOUS');
        assert.ok((err as TargetAmbiguousError).message.includes('resolved 2 matching elements'));
        return true;
      },
    );
  });
});
