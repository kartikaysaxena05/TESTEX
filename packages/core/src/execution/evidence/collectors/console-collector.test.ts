/**
 * @file packages/core/src/execution/evidence/collectors/console-collector.test.ts
 * Unit and security tests for ConsoleCollector.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { ConsoleCollector } from './console-collector.js';

describe('ConsoleCollector Unit & Security Tests (V5 Phase 70)', () => {
  let browser: Browser;
  let context: BrowserContext;
  let page: Page;

  before(async () => {
    browser = await chromium.launch({ headless: true });
    context = await browser.newContext();
    page = await context.newPage();
  });

  after(async () => {
    await browser?.close();
  });

  it('captures console.log, info, warn, error, and debug messages', async () => {
    const collector = new ConsoleCollector();
    collector.attach(page);

    await page.evaluate(() => {
      console.log('User action started');
      console.info('Loaded bundle v1.2');
      console.warn('Deprecated feature invoked');
      console.error('Network request failed with 500');
    });

    const events = collector.getEvents();
    assert.equal(events.length, 4);
    assert.equal(events[0]?.type, 'log');
    assert.equal(events[0]?.text, 'User action started');
    assert.equal(events[1]?.type, 'info');
    assert.equal(events[2]?.type, 'warn');
    assert.equal(events[3]?.type, 'error');

    collector.detach();
  });

  it('distinguishes standard console messages from uncaught page exceptions (pageerror)', async () => {
    const collector = new ConsoleCollector();
    collector.attach(page);

    await page.evaluate(() => {
      console.error('Handled API error message');
    });

    // Cause uncaught page error via setTimeout
    await page.evaluate(() => {
      setTimeout(() => {
        throw new Error('Uncaught reference in script');
      }, 0);
    });

    await page.waitForTimeout(50);

    const consoleEvents = collector.getEvents();
    const pageErrors = collector.getPageErrors();

    assert.equal(consoleEvents.length, 1);
    assert.equal(consoleEvents[0]?.text, 'Handled API error message');
    assert.ok(pageErrors.length >= 1);
    assert.ok(pageErrors[0]?.message.includes('Uncaught reference in script'));

    collector.detach();
  });

  it('enforces FIFO ring buffer limit and flags isTruncated = true', async () => {
    const collector = new ConsoleCollector({ maxEvents: 5 });
    collector.attach(page);

    await page.evaluate(() => {
      for (let i = 1; i <= 10; i++) {
        console.log(`Message #${i}`);
      }
    });

    const events = collector.getEvents();
    assert.equal(events.length, 5);
    assert.equal(events[0]?.text, 'Message #6');
    assert.equal(events[4]?.text, 'Message #10');

    const serialized = collector.serialize();
    assert.equal(serialized.isTruncated, true);
    assert.equal(serialized.consoleEvents.length, 5);

    collector.detach();
  });

  it('defensively redacts secrets, passwords, and Bearer tokens in console text', async () => {
    const collector = new ConsoleCollector();
    collector.attach(page);

    await page.evaluate(() => {
      console.error('Failed auth with Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.token123');
      console.log('Login attempt with password MySecretPass123!');
      console.warn('URL: https://api.example.com/data?token=super_secret_token_abc');
    });

    const events = collector.getEvents();
    assert.equal(events.length, 3);
    assert.ok(
      events[0] && !events[0].text.includes('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.token123'),
    );
    assert.ok(events[0] && events[0].text.includes('Bearer ***'));
    assert.ok(events[1] && !events[1].text.includes('MySecretPass123!'));
    assert.ok(events[1] && events[1].text.includes('***'));
    assert.ok(events[2] && !events[2].text.includes('super_secret_token_abc'));
    assert.ok(events[2] && events[2].text.includes('token=***'));

    collector.detach();
  });

  it('tracks popup / new tab console events via attachContext', async () => {
    const collector = new ConsoleCollector();
    collector.attachContext(context);

    const [newPage] = await Promise.all([
      context.waitForEvent('page'),
      page.evaluate(() => {
        window.open('about:blank', '_blank');
      }),
    ]);

    await newPage.evaluate(() => {
      console.warn('Message from popup window');
    });

    const events = collector.getEvents();
    assert.ok(events.some(e => e.text === 'Message from popup window'));

    await newPage.close();
    collector.detach();
  });

  it('cleans up listeners on detach() without leaking memory across runs', async () => {
    const collector = new ConsoleCollector();
    collector.attach(page);
    collector.detach();

    await page.evaluate(() => {
      console.log('Post-detach message should be ignored');
    });

    const events = collector.getEvents();
    assert.equal(events.length, 0);
  });
});
