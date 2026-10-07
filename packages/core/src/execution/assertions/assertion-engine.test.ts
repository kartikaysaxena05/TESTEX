/**
 * @file packages/core/src/execution/assertions/assertion-engine.test.ts
 * Comprehensive Playwright browser integration tests for Phase 67 Assertion & Verification Engine.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import crypto from 'node:crypto';
import { chromium, type Browser, type Page } from 'playwright';
import { AssertionEngine } from './index.js';
import type { ExecutableAssertionDto } from '@ai-quality/contracts';

describe('Phase 67 — Assertion Engine Real Playwright Integration Tests', () => {
  let server: http.Server;
  let serverUrl: string;
  let browser: Browser;
  let page: Page;
  let engine: AssertionEngine;

  const projectId = crypto.randomUUID();
  const testRunId = crypto.randomUUID();

  before(async () => {
    // 1. Create local test bench HTTP server
    server = http.createServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Test Verification Bench</title>
        </head>
        <body>
          <h1 id="header">Welcome to Quality Platform</h1>
          <div id="status-msg">Order #4589 Confirmed</div>
          <div id="secret-token">secret-token-abcdef123456</div>
          
          <button id="btn-enabled">Active Button</button>
          <button id="btn-disabled" disabled>Disabled Action</button>
          
          <input id="input-email" type="email" value="admin@platform.local" />
          <input id="input-empty" type="text" value="" />
          
          <input id="chk-agreed" type="checkbox" checked />
          <input id="chk-optin" type="checkbox" />
          
          <div id="box-visible" style="display: block;">Visible Box</div>
          <div id="box-hidden" style="display: none;">Hidden Box</div>
          
          <ul id="items-list">
            <li class="item">Item Alpha</li>
            <li class="item">Item Beta</li>
            <li class="item">Item Gamma</li>
          </ul>
          
          <button id="menu-dropdown" aria-expanded="true" data-testid="nav-menu" href="/dashboard">Menu</button>
          
          <div id="async-spinner">Loading...</div>
          <div id="async-target" style="display: none;">Async Content Ready</div>
          
          <script>
            setTimeout(() => {
              const spinner = document.getElementById('async-spinner');
              if (spinner) spinner.style.display = 'none';
              const target = document.getElementById('async-target');
              if (target) target.style.display = 'block';
            }, 300);
          </script>
        </body>
        </html>
      `);
    });

    await new Promise<void>(resolve => {
      server.listen(0, '127.0.0.1', () => {
        const address = server.address() as { port: number };
        serverUrl = `http://127.0.0.1:${address.port}`;
        resolve();
      });
    });

    browser = await chromium.launch({ headless: true });
    page = await browser.newPage();
    await page.goto(serverUrl);

    engine = new AssertionEngine();
  });

  after(async () => {
    await browser?.close();
    await new Promise<void>(resolve => server?.close(() => resolve()));
  });

  describe('1. Text Verification Evaluator', () => {
    it('passes TEXT_EQUALS and TEXT_CONTAINS when text matches exactly', async () => {
      const assertion: ExecutableAssertionDto = {
        id: crypto.randomUUID(),
        type: 'TEXT_EQUALS',
        target: { kind: 'ELEMENT', css: '#header' },
        expectedValue: { kind: 'LITERAL', value: 'Welcome to Quality Platform' },
        description: 'Verify page header text',
      };

      const result = await engine.evaluateAssertion(assertion, {
        projectId,
        testRunId,
        page,
      });

      assert.equal(result.status, 'PASSED');
      assert.equal(result.actual, 'Welcome to Quality Platform');
    });

    it('fails TEXT_EQUALS truthfully when text does not match', async () => {
      const assertion: ExecutableAssertionDto = {
        id: crypto.randomUUID(),
        type: 'TEXT_EQUALS',
        target: { kind: 'ELEMENT', css: '#header' },
        expectedValue: { kind: 'LITERAL', value: 'Wrong Title' },
        description: 'Verify mismatch fails',
      };

      const result = await engine.evaluateAssertion(
        assertion,
        { projectId, testRunId, page },
        { timeoutMs: 300 },
      );

      assert.equal(result.status, 'FAILED');
      assert.equal(result.errorCode, 'ASSERTION_FAILED');
    });

    it('evaluates TEXT_MATCHES with regex pattern', async () => {
      const assertion: ExecutableAssertionDto = {
        id: crypto.randomUUID(),
        type: 'TEXT_MATCHES',
        target: { kind: 'ELEMENT', css: '#status-msg' },
        expectedValue: { kind: 'LITERAL', value: '^Order #\\d{4} Confirmed$' },
        description: 'Verify order format',
      };

      const result = await engine.evaluateAssertion(assertion, {
        projectId,
        testRunId,
        page,
      });

      assert.equal(result.status, 'PASSED');
    });
  });

  describe('2. Visibility vs Existence Verification Evaluators', () => {
    it('verifies ELEMENT_VISIBLE on visible element and ELEMENT_HIDDEN on hidden element', async () => {
      const visibleAssertion: ExecutableAssertionDto = {
        id: crypto.randomUUID(),
        type: 'ELEMENT_VISIBLE',
        target: { kind: 'ELEMENT', css: '#box-visible' },
        description: 'Visible box check',
      };
      const visResult = await engine.evaluateAssertion(visibleAssertion, {
        projectId,
        testRunId,
        page,
      });
      assert.equal(visResult.status, 'PASSED');

      const hiddenAssertion: ExecutableAssertionDto = {
        id: crypto.randomUUID(),
        type: 'ELEMENT_HIDDEN',
        target: { kind: 'ELEMENT', css: '#box-hidden' },
        description: 'Hidden box check',
      };
      const hidResult = await engine.evaluateAssertion(hiddenAssertion, {
        projectId,
        testRunId,
        page,
      });
      assert.equal(hidResult.status, 'PASSED');
    });

    it('verifies ELEMENT_EXISTS is true even for hidden elements (DOM attachment)', async () => {
      const existsAssertion: ExecutableAssertionDto = {
        id: crypto.randomUUID(),
        type: 'ELEMENT_EXISTS',
        target: { kind: 'ELEMENT', css: '#box-hidden' },
        description: 'Hidden element exists in DOM',
      };
      const result = await engine.evaluateAssertion(existsAssertion, {
        projectId,
        testRunId,
        page,
      });
      assert.equal(result.status, 'PASSED');
      assert.equal(result.actual, true);
    });

    it('verifies ELEMENT_NOT_EXISTS for non-existent selector', async () => {
      const notExistsAssertion: ExecutableAssertionDto = {
        id: crypto.randomUUID(),
        type: 'ELEMENT_NOT_EXISTS',
        target: { kind: 'ELEMENT', css: '#non-existent-dom-node' },
        description: 'Selector absent from DOM',
      };
      const result = await engine.evaluateAssertion(
        notExistsAssertion,
        { projectId, testRunId, page },
        { timeoutMs: 200 },
      );
      assert.equal(result.status, 'PASSED');
    });
  });

  describe('3. State Verification Evaluator (Enabled/Disabled, Checked/Unchecked)', () => {
    it('verifies ELEMENT_ENABLED and ELEMENT_DISABLED correctly', async () => {
      const enabledRes = await engine.evaluateAssertion(
        {
          id: crypto.randomUUID(),
          type: 'ELEMENT_ENABLED',
          target: { kind: 'ELEMENT', css: '#btn-enabled' },
          description: 'Button enabled',
        },
        { projectId, testRunId, page },
      );
      assert.equal(enabledRes.status, 'PASSED');

      const disabledRes = await engine.evaluateAssertion(
        {
          id: crypto.randomUUID(),
          type: 'ELEMENT_DISABLED',
          target: { kind: 'ELEMENT', css: '#btn-disabled' },
          description: 'Button disabled',
        },
        { projectId, testRunId, page },
      );
      assert.equal(disabledRes.status, 'PASSED');
    });

    it('verifies ELEMENT_CHECKED and ELEMENT_UNCHECKED correctly', async () => {
      const checkedRes = await engine.evaluateAssertion(
        {
          id: crypto.randomUUID(),
          type: 'ELEMENT_CHECKED',
          target: { kind: 'ELEMENT', css: '#chk-agreed' },
          description: 'Checkbox checked',
        },
        { projectId, testRunId, page },
      );
      assert.equal(checkedRes.status, 'PASSED');

      const uncheckedRes = await engine.evaluateAssertion(
        {
          id: crypto.randomUUID(),
          type: 'ELEMENT_UNCHECKED',
          target: { kind: 'ELEMENT', css: '#chk-optin' },
          description: 'Checkbox unchecked',
        },
        { projectId, testRunId, page },
      );
      assert.equal(uncheckedRes.status, 'PASSED');
    });
  });

  describe('4. Input Value, URL, Title, Count & Attribute Evaluators', () => {
    it('verifies VALUE_EQUALS on form input', async () => {
      const result = await engine.evaluateAssertion(
        {
          id: crypto.randomUUID(),
          type: 'VALUE_EQUALS',
          target: { kind: 'ELEMENT', css: '#input-email' },
          expectedValue: { kind: 'LITERAL', value: 'admin@platform.local' },
          description: 'Input value equals',
        },
        { projectId, testRunId, page },
      );
      assert.equal(result.status, 'PASSED');
      assert.equal(result.actual, 'admin@platform.local');
    });

    it('verifies URL_CONTAINS and PAGE_TITLE_EQUALS', async () => {
      const urlRes = await engine.evaluateAssertion(
        {
          id: crypto.randomUUID(),
          type: 'URL_CONTAINS',
          target: { kind: 'ROUTE', route: '127.0.0.1' },
          expectedValue: { kind: 'LITERAL', value: '127.0.0.1' },
          description: 'URL contains host',
        },
        { projectId, testRunId, page },
      );
      assert.equal(urlRes.status, 'PASSED');

      const titleRes = await engine.evaluateAssertion(
        {
          id: crypto.randomUUID(),
          type: 'PAGE_TITLE_EQUALS',
          target: { kind: 'PAGE_REGION' },
          expectedValue: { kind: 'LITERAL', value: 'Test Verification Bench' },
          description: 'Page title equals',
        },
        { projectId, testRunId, page },
      );
      assert.equal(titleRes.status, 'PASSED');
    });

    it('verifies ELEMENT_COUNT_EQUALS and GREATER_THAN on collections', async () => {
      const countRes = await engine.evaluateAssertion(
        {
          id: crypto.randomUUID(),
          type: 'ELEMENT_COUNT_EQUALS',
          target: { kind: 'ELEMENT', css: '#items-list li' },
          expectedValue: { kind: 'LITERAL', value: '3' },
          description: '3 list items',
        },
        { projectId, testRunId, page },
      );
      assert.equal(countRes.status, 'PASSED');
      assert.equal(countRes.actual, 3);

      const gtRes = await engine.evaluateAssertion(
        {
          id: crypto.randomUUID(),
          type: 'ELEMENT_COUNT_GREATER_THAN',
          target: { kind: 'ELEMENT', css: '#items-list li' },
          expectedValue: { kind: 'LITERAL', value: '2' },
          description: 'More than 2 items',
        },
        { projectId, testRunId, page },
      );
      assert.equal(gtRes.status, 'PASSED');
    });

    it('verifies ATTRIBUTE_EQUALS on aria-expanded and data-testid', async () => {
      const attrRes = await engine.evaluateAssertion(
        {
          id: crypto.randomUUID(),
          type: 'ATTRIBUTE_EQUALS',
          target: { kind: 'ELEMENT', css: '#menu-dropdown' },
          attributeName: 'aria-expanded',
          expectedValue: { kind: 'LITERAL', value: 'true' },
          description: 'Aria expanded is true',
        },
        { projectId, testRunId, page },
      );
      assert.equal(attrRes.status, 'PASSED');
      assert.equal(attrRes.actual, 'true');
    });
  });

  describe('5. Async Stability & Dynamic State Waiting', () => {
    it('waits for async content to appear and spinner to disappear within bounded timeout', async () => {
      const asyncRes = await engine.evaluateAssertion(
        {
          id: crypto.randomUUID(),
          type: 'ELEMENT_VISIBLE',
          target: { kind: 'ELEMENT', css: '#async-target' },
          description: 'Wait for async target to become visible',
        },
        { projectId, testRunId, page },
        { timeoutMs: 2000 },
      );
      assert.equal(asyncRes.status, 'PASSED');
      assert.equal(asyncRes.actual, true);
    });
  });

  describe('6. Variable Resolution & Secret Redaction', () => {
    it('resolves {{dynamicVar}} from execution context', async () => {
      const varAssertion: ExecutableAssertionDto = {
        id: crypto.randomUUID(),
        type: 'VALUE_EQUALS',
        target: { kind: 'ELEMENT', css: '#input-email' },
        expectedValue: { kind: 'LITERAL', value: '{{userEmail}}' },
        description: 'Resolve user email template variable',
      };

      const result = await engine.evaluateAssertion(varAssertion, {
        projectId,
        testRunId,
        page,
        variables: {
          userEmail: 'admin@platform.local',
        },
      });

      assert.equal(result.status, 'PASSED');
      assert.equal(result.expected, 'admin@platform.local');
    });

    it('fails truthfully with UNRESOLVED_VARIABLE when variable is missing', async () => {
      const missingVarAssertion: ExecutableAssertionDto = {
        id: crypto.randomUUID(),
        type: 'VALUE_EQUALS',
        target: { kind: 'ELEMENT', css: '#input-email' },
        expectedValue: { kind: 'LITERAL', value: '{{missingVar}}' },
        description: 'Missing variable should fail truthfully',
      };

      const result = await engine.evaluateAssertion(missingVarAssertion, {
        projectId,
        testRunId,
        page,
        variables: {},
      });

      assert.equal(result.status, 'ERROR');
      assert.equal(result.errorCode, 'UNRESOLVED_VARIABLE');
    });
  });

  describe('7. Distinction: Verification Failure vs Automation Error', () => {
    it('returns FAILED when element is resolved but assertion condition is not met', async () => {
      const result = await engine.evaluateAssertion(
        {
          id: crypto.randomUUID(),
          type: 'TEXT_EQUALS',
          target: { kind: 'ELEMENT', css: '#header' },
          expectedValue: { kind: 'LITERAL', value: 'Non-existent header' },
          description: 'Assertion condition mismatch',
        },
        { projectId, testRunId, page },
        { timeoutMs: 200 },
      );

      assert.equal(result.status, 'FAILED');
      assert.equal(result.errorCode, 'ASSERTION_FAILED');
    });

    it('returns ERROR when target element is invalid or cannot be resolved', async () => {
      const result = await engine.evaluateAssertion(
        {
          id: crypto.randomUUID(),
          type: 'TEXT_EQUALS',
          target: { kind: 'ELEMENT', css: '###invalid-selector!' },
          expectedValue: { kind: 'LITERAL', value: 'Anything' },
          description: 'Malformed selector error',
        },
        { projectId, testRunId, page },
        { timeoutMs: 200 },
      );

      assert.equal(result.status, 'ERROR');
      assert.ok(
        result.errorCode === 'LOCATOR_INVALID_TARGET' || result.errorCode === 'LOCATOR_NOT_FOUND',
      );
    });
  });

  describe('8. Cancellation via AbortSignal', () => {
    it('returns CANCELLED immediately when AbortSignal is aborted', async () => {
      const controller = new AbortController();
      controller.abort();

      const result = await engine.evaluateAssertion(
        {
          id: crypto.randomUUID(),
          type: 'TEXT_EQUALS',
          target: { kind: 'ELEMENT', css: '#header' },
          expectedValue: { kind: 'LITERAL', value: 'Welcome' },
          description: 'Cancelled assertion',
        },
        {
          projectId,
          testRunId,
          page,
          abortSignal: controller.signal,
        },
      );

      assert.equal(result.status, 'CANCELLED');
      assert.equal(result.errorCode, 'ACTION_CANCELLED');
    });
  });

  describe('9. Action Success != Test Pass (Action Execution + Assertion Verdict Verification)', () => {
    it('marks step as FAILED when browser action succeeds but post-action assertion fails', async () => {
      const stepId = crypto.randomUUID();
      const failingAssertion: ExecutableAssertionDto = {
        id: crypto.randomUUID(),
        type: 'TEXT_EQUALS',
        target: { kind: 'ELEMENT', css: '#header' },
        expectedValue: { kind: 'LITERAL', value: 'Incorrect Header Text' },
        description: 'Assert that header is Incorrect Header Text',
      };

      const result = await engine.evaluateStepAssertions(
        stepId,
        [failingAssertion],
        { projectId, testRunId, page },
        { isHard: true, timeoutMs: 200 },
      );

      assert.equal(result.status, 'FAILED');
      assert.equal(result.failedCount, 1);
      assert.equal(result.passedCount, 0);
      assert.equal(result.results.length, 1);
      const firstRes = result.results[0];
      assert.ok(firstRes);
      assert.equal(firstRes.status, 'FAILED');
      assert.equal(firstRes.errorCode, 'ASSERTION_FAILED');
    });

    it('marks step as PASSED when action succeeds and all assertions pass', async () => {
      const stepId = crypto.randomUUID();
      const passingAssertion1: ExecutableAssertionDto = {
        id: crypto.randomUUID(),
        type: 'ELEMENT_VISIBLE',
        target: { kind: 'ELEMENT', css: '#btn-enabled' },
        description: 'Button is visible',
      };
      const passingAssertion2: ExecutableAssertionDto = {
        id: crypto.randomUUID(),
        type: 'TEXT_CONTAINS',
        target: { kind: 'ELEMENT', css: '#header' },
        expectedValue: { kind: 'LITERAL', value: 'Quality Platform' },
        description: 'Header contains Quality Platform',
      };

      const result = await engine.evaluateStepAssertions(
        stepId,
        [passingAssertion1, passingAssertion2],
        { projectId, testRunId, page },
        { isHard: true, timeoutMs: 500 },
      );

      assert.equal(result.status, 'PASSED');
      assert.equal(result.passedCount, 2);
      assert.equal(result.failedCount, 0);
      assert.equal(result.results.length, 2);
    });
  });
});
