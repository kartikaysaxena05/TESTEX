/**
 * @file packages/core/src/execution/evidence/collectors/trace-collector.test.ts
 * Unit and security tests for TraceCollector.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { chromium, type Browser } from 'playwright';
import { TraceCollector } from './trace-collector.js';

describe('TraceCollector Unit & Lifecycle Tests (V5 Phase 70)', () => {
  let browser: Browser;

  before(async () => {
    browser = await chromium.launch({ headless: true });
  });

  after(async () => {
    await browser?.close();
  });

  it('respects traceMode = OFF and does not start tracing', async () => {
    const context = await browser.newContext();
    const collector = new TraceCollector();

    await collector.startTracing(context, { mode: 'OFF' });
    const result = await collector.stopAndPersistTrace(context, {
      isFailed: true,
      projectId: crypto.randomUUID(),
      testRunId: crypto.randomUUID(),
      executionId: crypto.randomUUID(),
    });

    assert.equal(result.success, true);
    assert.equal(result.isRetained, false);
    assert.equal(result.mode, 'OFF');

    await context.close();
  });

  it('discards trace artifact when test passes under FAILURE_ONLY mode', async () => {
    const context = await browser.newContext();
    const page = await context.newPage();
    const collector = new TraceCollector({ defaultMode: 'FAILURE_ONLY' });

    await collector.startTracing(context);
    await page.goto('data:text/html,<h1>Passing Test Page</h1>');

    const result = await collector.stopAndPersistTrace(context, {
      isFailed: false, // PASS -> Discard
      projectId: crypto.randomUUID(),
      testRunId: crypto.randomUUID(),
      executionId: crypto.randomUUID(),
    });

    assert.equal(result.success, true);
    assert.equal(result.isRetained, false);
    assert.equal(result.mode, 'FAILURE_ONLY');
    assert.equal(result.traceBuffer, undefined);

    await context.close();
  });

  it('retains and reads Playwright trace zip buffer when test fails under FAILURE_ONLY mode', async () => {
    const context = await browser.newContext();
    const page = await context.newPage();
    const collector = new TraceCollector({ defaultMode: 'FAILURE_ONLY' });

    await collector.startTracing(context);
    await page.goto('data:text/html,<h1>Failing Test Page</h1>');
    await page.setContent('<div>Simulated action</div>');

    const result = await collector.stopAndPersistTrace(context, {
      isFailed: true, // FAIL -> Retain
      projectId: crypto.randomUUID(),
      testRunId: crypto.randomUUID(),
      executionId: crypto.randomUUID(),
    });

    assert.equal(result.success, true);
    assert.equal(result.isRetained, true);
    assert.equal(result.mimeType, 'application/zip');
    assert.ok(result.traceBuffer && result.traceBuffer.length > 0);
    assert.equal(result.byteSize, result.traceBuffer.length);

    await context.close();
  });

  it('handles browser or context crashes gracefully without corrupting state', async () => {
    const context = await browser.newContext();
    const collector = new TraceCollector();

    await collector.startTracing(context);
    await context.close(); // Closed before stop

    const result = await collector.stopAndPersistTrace(context, {
      isFailed: true,
      projectId: crypto.randomUUID(),
      testRunId: crypto.randomUUID(),
      executionId: crypto.randomUUID(),
    });

    assert.equal(result.success, false);
    assert.ok(result.errorMessage);
  });
});
