/**
 * @file packages/core/src/execution/playwright-browser-provider.test.ts
 * Real integration tests for PlaywrightBrowserProvider with actual Chromium browser lifecycle.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PlaywrightBrowserProvider } from './browser-provider.js';
import { BrowserUnsupportedError, ExecutionSecurityViolationError } from './execution-errors.js';

describe('PlaywrightBrowserProvider Real Integration Tests', () => {
  const provider = new PlaywrightBrowserProvider();

  it('discovers runtime capabilities with real Chromium binary', async () => {
    const caps = await provider.getCapabilities();
    assert.equal(caps.playwrightInstalled, true);
    assert.equal(caps.playwrightVersion, '1.62.1');
    assert.equal(caps.defaultBrowser, 'chromium');
    assert.equal(caps.chromiumAvailable, true);
    assert.ok(caps.chromiumVersion !== null && caps.chromiumVersion.length > 0);
    assert.equal(caps.runtimeStatus, 'READY');
  });

  it('launches real Chromium, creates context, page, navigates fixture, and closes cleanly', async () => {
    const browser = await provider.launch({
      engine: 'chromium',
      headless: true,
      timeoutMs: 15000,
    });
    assert.ok(browser.isConnected());

    try {
      const context = await provider.createContext(browser);
      const page = await provider.createPage(context);

      const htmlFixture = `<!DOCTYPE html>
<html>
  <head><title>Integration Fixture</title></head>
  <body>
    <h1>Controlled Local Test</h1>
    <button id="action-btn">Action Ready</button>
  </body>
</html>`;

      await page.setContent(htmlFixture);
      const title = await page.title();
      assert.equal(title, 'Integration Fixture');

      const btnText = await page.textContent('#action-btn');
      assert.equal(btnText?.trim(), 'Action Ready');

      await page.close();
      await context.close();
    } finally {
      await browser.close();
    }

    assert.equal(browser.isConnected(), false);
  });

  it('rejects unsupported browser engine with BrowserUnsupportedError', async () => {
    await assert.rejects(
      async () => {
        await provider.launch({ engine: 'unsupported-browser' as any });
      },
      (err: unknown) => {
        assert.ok(err instanceof BrowserUnsupportedError);
        return true;
      },
    );
  });

  it('rejects prohibited browser argument injection with ExecutionSecurityViolationError', () => {
    assert.throws(
      () => {
        provider.sanitizeLaunchArgs(['--no-sandbox', '--disable-gpu']);
      },
      (err: unknown) => {
        assert.ok(err instanceof ExecutionSecurityViolationError);
        return true;
      },
    );

    assert.throws(
      () => {
        provider.sanitizeLaunchArgs(['--disable-web-security']);
      },
      (err: unknown) => {
        assert.ok(err instanceof ExecutionSecurityViolationError);
        return true;
      },
    );
  });
});
