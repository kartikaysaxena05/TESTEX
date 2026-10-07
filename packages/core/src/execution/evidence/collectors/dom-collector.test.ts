/**
 * @file packages/core/src/execution/evidence/collectors/dom-collector.test.ts
 * Unit and security tests for DomCollector.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { DomCollector } from './dom-collector.js';

describe('DomCollector Unit & Security Tests (V5 Phase 70)', () => {
  let browser: Browser;
  let context: BrowserContext;
  let page: Page;

  before(async () => {
    browser = await chromium.launch({ headless: true });
    context = await browser.newContext();
    page = await context.newPage();

    await page.setContent(`
      <!DOCTYPE html>
      <html>
        <head><title>Secure DOM Test Page</title></head>
        <body>
          <h1 id="header">Login Portal</h1>
          <form id="loginForm">
            <input type="text" name="username" id="userInput" value="admin" />
            <input type="password" name="password" id="passInput" value="super_secret_pw_999" />
            <button type="submit" id="submitBtn" data-token="secret-token-12345">Log In</button>
          </form>
        </body>
      </html>
    `);
  });

  after(async () => {
    await browser?.close();
  });

  it('captures sanitized HTML snapshot, document title, and viewport', async () => {
    const collector = new DomCollector();
    const result = await collector.captureDomSnapshot(page);

    assert.equal(result.success, true);
    assert.ok(result.data);
    assert.equal(result.data.title, 'Secure DOM Test Page');
    assert.ok(result.byteSize > 0);
    assert.equal(result.isTruncated, false);
  });

  it('defensively sanitizes password values and data-token attributes in DOM snapshot', async () => {
    const collector = new DomCollector();
    const result = await collector.captureDomSnapshot(page);

    assert.equal(result.success, true);
    assert.ok(result.serializedHtml);

    // Password input value should be sanitized
    assert.ok(!result.serializedHtml.includes('super_secret_pw_999'));
    assert.ok(result.serializedHtml.includes('value="***"'));

    // data-token attribute should be sanitized
    assert.ok(!result.serializedHtml.includes('secret-token-12345'));
    assert.ok(result.serializedHtml.includes('data-token="***"'));
  });

  it('enforces maximum DOM byte limit and records truncation truthfully', async () => {
    // Set maxDomBytes very small (e.g. 50 bytes)
    const collector = new DomCollector({ maxDomBytes: 50 });
    const result = await collector.captureDomSnapshot(page);

    assert.equal(result.success, true);
    assert.equal(result.isTruncated, true);
    assert.ok(result.serializedHtml?.includes('[TRUNCATED DUE TO SIZE LIMIT]'));
  });

  it('includes failed element locator context when provided', async () => {
    const collector = new DomCollector();
    const result = await collector.captureDomSnapshot(page, {
      failedElementContext: {
        locatorStrategy: 'CSS',
        targetSelector: '#missing-button',
        role: 'button',
        accessibleName: 'Submit Payment',
        isVisible: false,
      },
    });

    assert.equal(result.success, true);
    assert.equal(result.data?.failedElementContext?.targetSelector, '#missing-button');
    assert.equal(result.data?.failedElementContext?.accessibleName, 'Submit Payment');
    assert.equal(result.data?.failedElementContext?.isVisible, false);
  });

  it('handles closed pages gracefully without throwing unhandled errors', async () => {
    const freshContext = await browser.newContext();
    const freshPage = await freshContext.newPage();
    await freshPage.close();

    const collector = new DomCollector();
    const result = await collector.captureDomSnapshot(freshPage);

    assert.equal(result.success, false);
    assert.equal(result.byteSize, 0);
    assert.ok(result.errorMessage?.includes('closed'));
    await freshContext.close();
  });
});
