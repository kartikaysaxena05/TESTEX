/**
 * @file packages/core/src/execution/evidence/collectors/screenshot-collector.test.ts
 * Unit and security tests for ScreenshotCollector.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { ScreenshotCollector } from './screenshot-collector.js';

describe('ScreenshotCollector Unit & Security Tests (V5 Phase 70)', () => {
  let server: http.Server;
  let serverUrl: string;
  let browser: Browser;
  let context: BrowserContext;
  let page: Page;

  before(async () => {
    server = http.createServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`
        <!DOCTYPE html>
        <html>
          <head><title>Screenshot Test</title></head>
          <body style="height: 1500px; background: #fafafa;">
            <h1>Test Application Page</h1>
            <form>
              <label>Password: <input type="password" id="pwd" value="SecretPassword123!" /></label>
              <label>Token: <input type="text" name="authToken" data-sensitive="true" value="token-abc-999" /></label>
            </form>
          </body>
        </html>
      `);
    });

    await new Promise<void>(resolve => {
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address() as any;
        serverUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });

    browser = await chromium.launch({ headless: true });
    context = await browser.newContext({ viewport: { width: 1024, height: 768 } });
    page = await context.newPage();
    await page.goto(serverUrl);
  });

  after(async () => {
    await browser?.close();
    await new Promise<void>(resolve => server.close(() => resolve()));
  });

  it('captures a valid failure screenshot as a non-empty PNG buffer with dimensions', async () => {
    const collector = new ScreenshotCollector();
    const result = await collector.captureFailureScreenshot(page, { fullPage: false });

    assert.equal(result.success, true);
    assert.equal(result.mimeType, 'image/png');
    assert.ok(result.buffer && result.buffer.length > 0);
    assert.equal(result.byteSize, result.buffer.length);
    assert.equal(result.width, 1024);
    assert.equal(result.height, 768);
    assert.equal(result.isFullPage, false);
    assert.ok(result.pageUrl?.includes('127.0.0.1'));
  });

  it('captures full-page screenshots when configured', async () => {
    const collector = new ScreenshotCollector();
    const result = await collector.captureFailureScreenshot(page, { fullPage: true });

    assert.equal(result.success, true);
    assert.equal(result.isFullPage, true);
    assert.ok(result.buffer && result.buffer.length > 0);
  });

  it('applies defensive element masking without modifying permanent page DOM', async () => {
    const collector = new ScreenshotCollector();
    const result = await collector.captureFailureScreenshot(page, {
      maskSelectors: ['input[type="password"]', '[data-sensitive="true"]'],
    });

    assert.equal(result.success, true);
    assert.equal(result.isMasked, true);

    // Verify temporary masking style element was cleaned up afterward
    const styleExists = await page.evaluate(() => {
      return Boolean(document.getElementById('__ai_quality_evidence_mask_style__'));
    });
    assert.equal(styleExists, false);
  });

  it('handles closed or crashed pages gracefully without throwing exceptions', async () => {
    const freshContext = await browser.newContext();
    const freshPage = await freshContext.newPage();
    await freshPage.close();

    const collector = new ScreenshotCollector();
    const result = await collector.captureFailureScreenshot(freshPage);

    assert.equal(result.success, false);
    assert.equal(result.byteSize, 0);
    assert.ok(result.errorMessage?.includes('closed'));
    await freshContext.close();
  });
});
