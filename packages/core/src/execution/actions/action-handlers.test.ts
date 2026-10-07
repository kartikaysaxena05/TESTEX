/**
 * @file packages/core/src/execution/actions/action-handlers.test.ts
 * Comprehensive Playwright integration tests for all Phase 63 Action Handlers.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import * as http from 'node:http';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import crypto from 'node:crypto';
import type { Browser, BrowserContext, Page } from 'playwright';
import { PlaywrightBrowserProvider } from '../browser-provider.js';
import { ActionHandlerRegistry } from './action-handler-registry.js';
import type { ActionExecutionContext } from './action-types.js';
import type { BrowserExecutionSession } from '../sessions/session-types.js';

describe('Action Handlers Playwright Integration Tests', () => {
  let browser: Browser;
  let context: BrowserContext;
  let page: Page;
  let server: http.Server;
  let serverPort: number;
  let serverUrl: string;
  let tempUploadFilePath: string;
  const registry = new ActionHandlerRegistry();

  const mockSession: BrowserExecutionSession = {
    sessionId: 'session-test-01',
    testRunId: 'run-action-01',
    projectId: 'd9e79391-7667-4e3e-a107-5509930f30c1',
    browserEngine: 'chromium',
    browser: null as any,
    context: null as any,
    page: null as any,
    status: 'ACTIVE',
    createdAt: new Date(),
    isFresh: true,
    storageStateRestored: false,
    close: async () => {},
  };

  before(async () => {
    // 1. Create temporary upload test file
    tempUploadFilePath = path.join(os.tmpdir(), `test-upload-${Date.now()}.txt`);
    fs.writeFileSync(tempUploadFilePath, 'Hello Playwright Upload Test Content');

    // 2. Spin up local HTTP test fixture server
    server = http.createServer((req, res) => {
      const parsedUrl = new URL(req.url || '/', 'http://127.0.0.1');

      if (parsedUrl.pathname === '/target-page') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`<!DOCTYPE html>
<html>
<head><title>Target Destination Page</title></head>
<body><h1>Welcome to Target Page</h1></body>
</html>`);
        return;
      }

      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`<!DOCTYPE html>
<html>
<head><title>Action Execution Test Fixture</title></head>
<body>
  <h1>Test Interaction Controls</h1>
  <button id="btn-counter" onclick="this.dataset.clicks = (parseInt(this.dataset.clicks || '0') + 1).toString(); this.innerText = 'Clicked ' + this.dataset.clicks;">Click Me</button>
  <button id="btn-dbl" ondblclick="this.dataset.dbl = 'true'; this.innerText = 'Double Clicked';">Double Click Me</button>
  <button id="btn-disabled" disabled>Disabled Button</button>
  
  <input id="input-text" type="text" placeholder="Type here" value="" />
  <input id="input-prefilled" type="text" value="Initial Value" />
  <input id="input-password" type="password" placeholder="Password" />
  
  <select id="select-country">
    <option value="US">United States</option>
    <option value="CA">Canada</option>
    <option value="UK">United Kingdom</option>
  </select>

  <label><input id="chk-terms" type="checkbox" /> Accept Terms</label>
  <label><input id="chk-optin" type="checkbox" checked /> Email Updates</label>

  <div id="hover-box" onmouseenter="this.innerText = 'Hovered!'" style="width:100px;height:50px;background:#ccc;">Hover target</div>
  
  <input id="input-focus" type="text" onfocus="this.dataset.focused = 'true'" onblur="this.dataset.blurred = 'true'" />

  <input id="input-file" type="file" />

  <div id="drag-source" draggable="true" ondragstart="event.dataTransfer.setData('text', 'dragged-item')">Drag Source Item</div>
  <div id="drag-target" ondragover="event.preventDefault()" ondrop="event.preventDefault(); this.innerText = 'Dropped: ' + event.dataTransfer.getData('text')">Drop Target Area</div>

  <div id="hidden-element" style="display: none;">Hidden Secret Element</div>

  <div style="height: 1200px;">Spacer</div>
  <div id="scroll-target">Bottom Element</div>

  <script>
    setTimeout(() => {
      const el = document.createElement('div');
      el.id = 'dynamic-element';
      el.innerText = 'Appeared dynamically!';
      document.body.appendChild(el);
    }, 200);
  </script>
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

    // 3. Launch real Playwright Chromium browser
    const provider = new PlaywrightBrowserProvider();
    browser = await provider.launch({ headless: true });
    context = await browser.newContext();
    page = await context.newPage();

    mockSession.browser = browser;
    mockSession.context = context;
    mockSession.page = page;
  });

  after(async () => {
    if (fs.existsSync(tempUploadFilePath)) {
      fs.unlinkSync(tempUploadFilePath);
    }
    if (page) await page.close().catch(() => {});
    if (context) await context.close().catch(() => {});
    if (browser) await browser.close().catch(() => {});
    await new Promise<void>(resolve => server.close(() => resolve()));
  });

  function makeContext(overrides?: Partial<ActionExecutionContext>): ActionExecutionContext {
    return {
      projectId: 'd9e79391-7667-4e3e-a107-5509930f30c1',
      testRunId: 'run-action-01',
      session: mockSession,
      context,
      page,
      baseUrl: serverUrl,
      secrets: {
        SECRET_PASSWORD: 'SuperSecretPassword123!',
      },
      ...overrides,
    };
  }

  it('NAVIGATE: executes controlled navigation to relative path', async () => {
    const handler = registry.getHandler('NAVIGATE');
    const result = await handler.execute(
      {
        id: crypto.randomUUID(),
        sequence: 1,
        action: 'NAVIGATE',
        target: { kind: 'ROUTE', route: '/' },
        description: 'Navigate to base root',
        isOptional: false,
        assertions: [],
      },
      makeContext(),
    );

    assert.equal(result.status, 'PASSED');
    assert.equal(result.actionType, 'NAVIGATE');
    assert.ok(result.durationMs >= 0);
    assert.equal(page.url(), `${serverUrl}/`);
  });

  it('NAVIGATE: strictly blocks unsafe protocols and unauthorized external origins', async () => {
    const handler = registry.getHandler('NAVIGATE');

    // 1. Unsafe scheme javascript:
    const unsafeRes = await handler.execute(
      {
        id: crypto.randomUUID(),
        sequence: 1,
        action: 'NAVIGATE',
        target: { kind: 'ROUTE', route: 'javascript:alert(1)' },
        description: 'Attempt XSS navigation',
        isOptional: false,
        assertions: [],
      },
      makeContext(),
    );
    assert.equal(unsafeRes.status, 'FAILED');
    assert.equal(unsafeRes.errorCode, 'NAVIGATION_REJECTED');

    // 2. Unauthorized external origin
    const externalRes = await handler.execute(
      {
        id: crypto.randomUUID(),
        sequence: 1,
        action: 'NAVIGATE',
        target: { kind: 'ROUTE', route: 'https://attacker.example.com/login' },
        description: 'Attempt external origin navigation',
        isOptional: false,
        assertions: [],
      },
      makeContext(),
    );
    assert.equal(externalRes.status, 'FAILED');
    assert.equal(externalRes.errorCode, 'NAVIGATION_REJECTED');
  });

  it('CLICK: executes reliable click on target button and records duration', async () => {
    const handler = registry.getHandler('CLICK');
    const result = await handler.execute(
      {
        id: crypto.randomUUID(),
        sequence: 2,
        action: 'CLICK',
        target: { kind: 'CONTROL', name: 'Click Me' },
        description: 'Click button',
        isOptional: false,
        assertions: [],
      },
      makeContext(),
    );

    assert.equal(result.status, 'PASSED');
    const clicks = await page.$eval('#btn-counter', el => el.dataset.clicks);
    assert.equal(clicks, '1');
  });

  it('DOUBLE_CLICK: executes double click interaction', async () => {
    const handler = registry.getHandler('DOUBLE_CLICK');
    const result = await handler.execute(
      {
        id: crypto.randomUUID(),
        sequence: 3,
        action: 'DOUBLE_CLICK',
        target: { kind: 'CONTROL', name: 'Double Click Me' },
        description: 'Double click button',
        isOptional: false,
        assertions: [],
      },
      makeContext(),
    );

    assert.equal(result.status, 'PASSED');
    const dbl = await page.$eval('#btn-dbl', el => el.dataset.dbl);
    assert.equal(dbl, 'true');
  });

  it('CLICK: fails truthfully on disabled control without applying silent force', async () => {
    const handler = registry.getHandler('CLICK');
    const result = await handler.execute(
      {
        id: crypto.randomUUID(),
        sequence: 4,
        action: 'CLICK',
        target: { kind: 'CONTROL', name: 'Disabled Button' },
        description: 'Attempt click disabled button',
        isOptional: false,
        timeoutMs: 800, // Short timeout for test speed
        assertions: [],
      },
      makeContext(),
    );

    assert.equal(result.status, 'FAILED');
    assert.ok(result.errorCode === 'TARGET_DISABLED' || result.errorCode === 'ACTION_TIMEOUT');
  });

  it('FILL: sets form field value deterministically', async () => {
    const handler = registry.getHandler('FILL');
    const result = await handler.execute(
      {
        id: crypto.randomUUID(),
        sequence: 5,
        action: 'FILL',
        target: { kind: 'FIELD', placeholder: 'Type here' },
        value: { kind: 'LITERAL', value: 'playwright user' },
        description: 'Fill text input',
        isOptional: false,
        assertions: [],
      },
      makeContext(),
    );

    assert.equal(result.status, 'PASSED');
    const val = await page.$eval('#input-text', (el: HTMLInputElement) => el.value);
    assert.equal(val, 'playwright user');
  });

  it('FILL: redacts sensitive password inputs from execution summaries and logs', async () => {
    const handler = registry.getHandler('FILL');
    const result = await handler.execute(
      {
        id: crypto.randomUUID(),
        sequence: 6,
        action: 'FILL',
        target: { kind: 'FIELD', placeholder: 'Password' },
        value: { kind: 'SECRET_REFERENCE', secretRef: 'SECRET_PASSWORD' },
        description: 'Fill password input',
        isOptional: false,
        assertions: [],
      },
      makeContext(),
    );

    assert.equal(result.status, 'PASSED');
    // Verify DOM received actual secret
    const val = await page.$eval('#input-password', (el: HTMLInputElement) => el.value);
    assert.equal(val, 'SuperSecretPassword123!');

    // Verify result summary masked the password
    assert.equal(result.valueSummary, '[REDACTED]');
    assert.ok(!JSON.stringify(result).includes('SuperSecretPassword123!'));
  });

  it('CLEAR: clears text input', async () => {
    const handler = registry.getHandler('CLEAR');
    const result = await handler.execute(
      {
        id: crypto.randomUUID(),
        sequence: 7,
        action: 'CLEAR',
        target: { kind: 'FIELD', locatorHints: ['#input-prefilled'] },
        description: 'Clear prefilled input',
        isOptional: false,
        assertions: [],
      },
      makeContext(),
    );

    assert.equal(result.status, 'PASSED');
    const val = await page.$eval('#input-prefilled', (el: HTMLInputElement) => el.value);
    assert.equal(val, '');
  });

  it('PRESS: executes keyboard action and validates allowed keys', async () => {
    const handler = registry.getHandler('PRESS');

    // 1. Valid key Enter
    const validRes = await handler.execute(
      {
        id: crypto.randomUUID(),
        sequence: 8,
        action: 'PRESS',
        target: { kind: 'FIELD', placeholder: 'Type here' },
        value: { kind: 'LITERAL', value: 'Enter' },
        description: 'Press Enter',
        isOptional: false,
        assertions: [],
      },
      makeContext(),
    );
    assert.equal(validRes.status, 'PASSED');

    // 2. Prohibited key script
    const invalidRes = await handler.execute(
      {
        id: crypto.randomUUID(),
        sequence: 9,
        action: 'PRESS',
        value: { kind: 'LITERAL', value: 'invalid_malicious_script()' },
        description: 'Press invalid key',
        isOptional: false,
        assertions: [],
      },
      makeContext(),
    );
    assert.equal(invalidRes.status, 'FAILED');
    assert.equal(invalidRes.errorCode, 'INVALID_ACTION_VALUE');
  });

  it('SELECT: selects option in native HTML select dropdown', async () => {
    const handler = registry.getHandler('SELECT');
    const result = await handler.execute(
      {
        id: crypto.randomUUID(),
        sequence: 10,
        action: 'SELECT',
        target: { kind: 'FIELD', locatorHints: ['#select-country'] },
        value: { kind: 'LITERAL', value: 'Canada' },
        description: 'Select Canada',
        isOptional: false,
        assertions: [],
      },
      makeContext(),
    );

    assert.equal(result.status, 'PASSED');
    const val = await page.$eval('#select-country', (el: HTMLSelectElement) => el.value);
    assert.equal(val, 'CA');
  });

  it('CHECK & UNCHECK: toggles checkbox controls', async () => {
    const checkHandler = registry.getHandler('CHECK');
    const uncheckHandler = registry.getHandler('UNCHECK');

    // Check
    const checkRes = await checkHandler.execute(
      {
        id: crypto.randomUUID(),
        sequence: 11,
        action: 'CHECK',
        target: { kind: 'CONTROL', locatorHints: ['#chk-terms'] },
        description: 'Check terms',
        isOptional: false,
        assertions: [],
      },
      makeContext(),
    );
    assert.equal(checkRes.status, 'PASSED');
    const isChecked = await page.$eval('#chk-terms', (el: HTMLInputElement) => el.checked);
    assert.equal(isChecked, true);

    // Uncheck
    const uncheckRes = await uncheckHandler.execute(
      {
        id: crypto.randomUUID(),
        sequence: 12,
        action: 'UNCHECK',
        target: { kind: 'CONTROL', locatorHints: ['#chk-optin'] },
        description: 'Uncheck optin',
        isOptional: false,
        assertions: [],
      },
      makeContext(),
    );
    assert.equal(uncheckRes.status, 'PASSED');
    const isOptinChecked = await page.$eval('#chk-optin', (el: HTMLInputElement) => el.checked);
    assert.equal(isOptinChecked, false);
  });

  it('HOVER: executes hover over target element', async () => {
    const handler = registry.getHandler('HOVER');
    const result = await handler.execute(
      {
        id: crypto.randomUUID(),
        sequence: 13,
        action: 'HOVER',
        target: { kind: 'CONTROL', locatorHints: ['#hover-box'] },
        description: 'Hover over box',
        isOptional: false,
        assertions: [],
      },
      makeContext(),
    );

    assert.equal(result.status, 'PASSED');
    const text = await page.$eval('#hover-box', (el: HTMLElement) => el.innerText);
    assert.equal(text, 'Hovered!');
  });

  it('FOCUS & BLUR: triggers focus and blur field events', async () => {
    const focusHandler = registry.getHandler('FOCUS');
    const blurHandler = registry.getHandler('BLUR');

    const focusRes = await focusHandler.execute(
      {
        id: crypto.randomUUID(),
        sequence: 14,
        action: 'FOCUS',
        target: { kind: 'FIELD', locatorHints: ['#input-focus'] },
        description: 'Focus input',
        isOptional: false,
        assertions: [],
      },
      makeContext(),
    );
    assert.equal(focusRes.status, 'PASSED');
    const focused = await page.$eval('#input-focus', el => el.dataset.focused);
    assert.equal(focused, 'true');

    const blurRes = await blurHandler.execute(
      {
        id: crypto.randomUUID(),
        sequence: 15,
        action: 'BLUR',
        target: { kind: 'FIELD', locatorHints: ['#input-focus'] },
        description: 'Blur input',
        isOptional: false,
        assertions: [],
      },
      makeContext(),
    );
    assert.equal(blurRes.status, 'PASSED');
    const blurred = await page.$eval('#input-focus', el => el.dataset.blurred);
    assert.equal(blurred, 'true');
  });

  it('SCROLL: scrolls element into view', async () => {
    const handler = registry.getHandler('SCROLL');
    const result = await handler.execute(
      {
        id: crypto.randomUUID(),
        sequence: 16,
        action: 'SCROLL',
        target: { kind: 'ELEMENT', locatorHints: ['#scroll-target'] },
        description: 'Scroll bottom element into view',
        isOptional: false,
        assertions: [],
      },
      makeContext(),
    );

    assert.equal(result.status, 'PASSED');
  });

  it('WAIT_FOR_STATE: waits for dynamic element to attach', async () => {
    const handler = registry.getHandler('WAIT_FOR_STATE');
    const result = await handler.execute(
      {
        id: crypto.randomUUID(),
        sequence: 17,
        action: 'WAIT_FOR_STATE',
        target: { kind: 'ELEMENT', locatorHints: ['#dynamic-element'] },
        value: { kind: 'LITERAL', value: 'attached' },
        description: 'Wait for dynamic element',
        isOptional: false,
        timeoutMs: 3000,
        assertions: [],
      },
      makeContext(),
    );

    assert.equal(result.status, 'PASSED');
  });

  it('UPLOAD: sets files on input[type=file] and blocks path traversal', async () => {
    const handler = registry.getHandler('UPLOAD');

    // 1. Path traversal rejected
    const traversalRes = await handler.execute(
      {
        id: crypto.randomUUID(),
        sequence: 18,
        action: 'UPLOAD',
        target: { kind: 'FIELD', locatorHints: ['#input-file'] },
        value: { kind: 'LITERAL', value: '../../../../etc/passwd' },
        description: 'Attempt path traversal upload',
        isOptional: false,
        assertions: [],
      },
      makeContext(),
    );
    assert.equal(traversalRes.status, 'FAILED');
    assert.equal(traversalRes.errorCode, 'INVALID_ACTION_VALUE');

    // 2. Valid file upload
    const validRes = await handler.execute(
      {
        id: crypto.randomUUID(),
        sequence: 19,
        action: 'UPLOAD',
        target: { kind: 'FIELD', locatorHints: ['#input-file'] },
        value: { kind: 'LITERAL', value: tempUploadFilePath },
        description: 'Upload valid test file',
        isOptional: false,
        assertions: [],
      },
      makeContext(),
    );
    assert.equal(validRes.status, 'PASSED');
    const filesLength = await page.$eval(
      '#input-file',
      (el: HTMLInputElement) => el.files?.length || 0,
    );
    assert.equal(filesLength, 1);
  });

  it('SCROLL_INTO_VIEW: scrolls specific target element into viewport', async () => {
    const handler = registry.getHandler('SCROLL_INTO_VIEW');
    const res = await handler.execute(
      {
        id: crypto.randomUUID(),
        sequence: 20,
        action: 'SCROLL_INTO_VIEW',
        target: { kind: 'ELEMENT', locatorHints: ['#scroll-target'] },
        description: 'Scroll element into view',
        isOptional: false,
        assertions: [],
      },
      makeContext(),
    );

    assert.equal(res.status, 'PASSED');
    assert.equal(res.actionType, 'SCROLL_INTO_VIEW');
  });

  it('DRAG_AND_DROP: drags item from source to destination locator', async () => {
    const handler = registry.getHandler('DRAG_AND_DROP');
    const res = await handler.execute(
      {
        id: crypto.randomUUID(),
        sequence: 21,
        action: 'DRAG_AND_DROP',
        target: { kind: 'ELEMENT', locatorHints: ['#drag-source'] },
        value: { kind: 'LITERAL', value: '#drag-target' },
        description: 'Drag item to drop target',
        isOptional: false,
        assertions: [],
      },
      makeContext(),
    );

    assert.equal(res.status, 'PASSED');
    assert.equal(res.actionType, 'DRAG_AND_DROP');
  });

  it('GO_BACK, GO_FORWARD, RELOAD: targetless browser history and reload actions', async () => {
    const goBackHandler = registry.getHandler('GO_BACK');
    const goForwardHandler = registry.getHandler('GO_FORWARD');
    const reloadHandler = registry.getHandler('RELOAD');

    // 1. Reload
    const reloadRes = await reloadHandler.execute(
      {
        id: crypto.randomUUID(),
        sequence: 22,
        action: 'RELOAD',
        description: 'Reload page',
        isOptional: false,
        assertions: [],
      },
      makeContext(),
    );
    assert.equal(reloadRes.status, 'PASSED');

    // 2. Go Back & Forward
    const backRes = await goBackHandler.execute(
      {
        id: crypto.randomUUID(),
        sequence: 23,
        action: 'GO_BACK',
        description: 'Go back in history',
        isOptional: false,
        assertions: [],
      },
      makeContext(),
    );
    assert.equal(backRes.status, 'PASSED');

    const fwdRes = await goForwardHandler.execute(
      {
        id: crypto.randomUUID(),
        sequence: 24,
        action: 'GO_FORWARD',
        description: 'Go forward in history',
        isOptional: false,
        assertions: [],
      },
      makeContext(),
    );
    assert.equal(fwdRes.status, 'PASSED');
  });

  it('SELECT_OPTION and UPLOAD_FILE: aliases operate identically to canonical actions', async () => {
    const selectHandler = registry.getHandler('SELECT_OPTION');
    const uploadHandler = registry.getHandler('UPLOAD_FILE');

    const selRes = await selectHandler.execute(
      {
        id: crypto.randomUUID(),
        sequence: 25,
        action: 'SELECT_OPTION',
        target: { kind: 'FIELD', locatorHints: ['#select-country'] },
        value: { kind: 'LITERAL', value: 'Canada' },
        description: 'Select Canada via alias',
        isOptional: false,
        assertions: [],
      },
      makeContext(),
    );
    assert.equal(selRes.status, 'PASSED');

    const upRes = await uploadHandler.execute(
      {
        id: crypto.randomUUID(),
        sequence: 26,
        action: 'UPLOAD_FILE',
        target: { kind: 'FIELD', locatorHints: ['#input-file'] },
        value: { kind: 'LITERAL', value: tempUploadFilePath },
        description: 'Upload via alias',
        isOptional: false,
        assertions: [],
      },
      makeContext(),
    );
    assert.equal(upRes.status, 'PASSED');
  });

  it('FILL with Unicode, Hindi, Emoji, and XSS string treats input purely as test data', async () => {
    const handler = registry.getHandler('FILL');
    const complexString = "नमस्ते 🚀 <script>alert(1)</script> ' OR '1'='1";

    const res = await handler.execute(
      {
        id: crypto.randomUUID(),
        sequence: 27,
        action: 'FILL',
        target: { kind: 'FIELD', locatorHints: ['#input-text'] },
        value: { kind: 'LITERAL', value: complexString },
        description: 'Fill with Unicode, Hindi, Emoji and XSS payload',
        isOptional: false,
        assertions: [],
      },
      makeContext(),
    );

    assert.equal(res.status, 'PASSED');
    const domVal = await page.$eval('#input-text', (el: HTMLInputElement) => el.value);
    assert.equal(domVal, complexString);
  });

  it('PRESS with combination modifiers like Control+A / Shift+Tab', async () => {
    const handler = registry.getHandler('PRESS');
    const res = await handler.execute(
      {
        id: crypto.randomUUID(),
        sequence: 28,
        action: 'PRESS',
        target: { kind: 'FIELD', locatorHints: ['#input-text'] },
        value: { kind: 'LITERAL', value: 'Control+A' },
        description: 'Select all via key combo',
        isOptional: false,
        assertions: [],
      },
      makeContext(),
    );

    assert.equal(res.status, 'PASSED');
  });

  it('Actionability failure: Click on disabled button fails truthfully with TARGET_DISABLED', async () => {
    const handler = registry.getHandler('CLICK');
    const res = await handler.execute(
      {
        id: crypto.randomUUID(),
        sequence: 29,
        action: 'CLICK',
        target: { kind: 'CONTROL', locatorHints: ['#btn-disabled'] },
        description: 'Click disabled button',
        isOptional: false,
        timeoutMs: 500,
        assertions: [],
      },
      makeContext(),
    );

    assert.equal(res.status, 'FAILED');
    assert.ok(
      res.errorCode === 'TARGET_DISABLED' || res.errorCode === 'ACTION_TIMEOUT',
      `Unexpected error code: ${res.errorCode}`,
    );
  });

  it('Actionability failure: Click on hidden element fails truthfully with TARGET_NOT_VISIBLE / ACTION_TIMEOUT', async () => {
    const handler = registry.getHandler('CLICK');
    const res = await handler.execute(
      {
        id: crypto.randomUUID(),
        sequence: 30,
        action: 'CLICK',
        target: { kind: 'ELEMENT', locatorHints: ['#hidden-element'] },
        description: 'Click hidden element',
        isOptional: false,
        timeoutMs: 500,
        assertions: [],
      },
      makeContext(),
    );

    assert.equal(res.status, 'FAILED');
    assert.ok(
      res.errorCode === 'TARGET_NOT_VISIBLE' || res.errorCode === 'ACTION_TIMEOUT',
      `Unexpected error code: ${res.errorCode}`,
    );
  });

  it('Cancellation: abortSignal immediately marks action as CANCELLED', async () => {
    const controller = new AbortController();
    controller.abort();

    const handler = registry.getHandler('CLICK');
    const res = await handler.execute(
      {
        id: crypto.randomUUID(),
        sequence: 31,
        action: 'CLICK',
        target: { kind: 'CONTROL', locatorHints: ['#btn-counter'] },
        description: 'Cancelled click',
        isOptional: false,
        assertions: [],
      },
      makeContext({ abortSignal: controller.signal }),
    );

    assert.equal(res.status, 'CANCELLED');
    assert.equal(res.errorCode, 'ACTION_CANCELLED');
  });

  it('Browser closed handling: cleanly returns PAGE_NOT_AVAILABLE without unhandled crash', async () => {
    const dummyPage = await browser.newPage();
    await dummyPage.close();

    const handler = registry.getHandler('CLICK');
    const res = await handler.execute(
      {
        id: crypto.randomUUID(),
        sequence: 32,
        action: 'CLICK',
        target: { kind: 'CONTROL', locatorHints: ['#btn-counter'] },
        description: 'Click on closed page',
        isOptional: false,
        assertions: [],
      },
      makeContext({ page: dummyPage }),
    );

    assert.equal(res.status, 'FAILED');
    assert.equal(res.errorCode, 'PAGE_NOT_AVAILABLE');
  });
});
