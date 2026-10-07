/**
 * @file packages/core/src/execution/synchronization/synchronization-coordinator.test.ts
 * Comprehensive Playwright integration tests for Phase 66 Synchronization Engine.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import * as http from 'node:http';
import crypto from 'node:crypto';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { SynchronizationCoordinator } from './synchronization-coordinator.js';
import { TimeoutBudgetTracker } from './timeout-budget.js';

describe('SynchronizationCoordinator Playwright Integration Tests', () => {
  let browser: Browser;
  let context: BrowserContext;
  let page: Page;
  let coordinator: SynchronizationCoordinator;
  let server: http.Server;
  let serverPort: number;
  let serverUrl: string;

  before(async () => {
    coordinator = new SynchronizationCoordinator();

    // 1. Create HTTP Server reproducing realistic async web conditions
    server = http.createServer((req, res) => {
      const url = new URL(req.url ?? '/', `http://127.0.0.1:${serverPort}`);

      // Chained redirects: /login -> /auth/callback -> /dashboard
      if (url.pathname === '/login-redirect') {
        res.writeHead(302, { Location: '/auth/callback' });
        res.end();
        return;
      }
      if (url.pathname === '/auth/callback') {
        res.writeHead(302, { Location: '/dashboard' });
        res.end();
        return;
      }

      // Fast API endpoint
      if (url.pathname === '/api/fast-response') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', id: 'fast-123' }));
        return;
      }

      // Delayed API endpoint
      if (url.pathname === '/api/orders' && req.method === 'POST') {
        let _body = '';
        req.on('data', _chunk => {
          _body += _chunk;
        });
        req.on('end', () => {
          setTimeout(() => {
            res.writeHead(201, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ orderId: 'ord-999', created: true }));
          }, 80);
        });
        return;
      }

      // Long-polling endpoint that does not complete quickly
      if (url.pathname === '/api/long-poll') {
        // Leave open indefinitely until client disconnects
        res.writeHead(200, {
          'Content-Type': 'text/plain',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        });
        res.write('polling-connected\n');
        return;
      }

      // Debounced search API
      if (url.pathname === '/api/search') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ results: [`Result for ${url.searchParams.get('q')}`] }));
        return;
      }

      // Dynamic table data API
      if (url.pathname === '/api/table-data') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ rows: ['Row A', 'Row B', 'Row C'] }));
        return;
      }

      // Popup target
      if (url.pathname === '/popup-target') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end('<!DOCTYPE html><html><body><h1>Popup Target Page</h1></body></html>');
        return;
      }

      // Primary test harness page
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`<!DOCTYPE html>
<html>
<head>
  <title>Synchronization Test Bench</title>
  <style>
    .animated-box {
      width: 100px;
      height: 100px;
      background: red;
      position: relative;
      transition: top 0.1s linear;
      top: 0px;
    }
    .animated-box.moved {
      top: 20px;
    }
  </style>
</head>
<body>
  <h1>Synchronization Test Bench</h1>

  <!-- Delayed Elements -->
  <div id="delayed-container"></div>
  <button id="show-delayed-btn" onclick="setTimeout(() => {
    const el = document.createElement('div');
    el.id = 'async-loaded-box';
    el.innerText = 'Async Loaded Content';
    document.getElementById('delayed-container').appendChild(el);
  }, 100)">Trigger Delayed Attach</button>

  <!-- Disabled until ready -->
  <button id="async-enable-btn" disabled>Disabled Action Button</button>
  <script>
    setTimeout(() => {
      document.getElementById('async-enable-btn').disabled = false;
    }, 120);
  </script>

  <!-- Editable field -->
  <input id="test-input" type="text" placeholder="Type here" />

  <!-- Animated box -->
  <div id="anim-box" class="animated-box"></div>
  <script>
    setTimeout(() => {
      document.getElementById('anim-box').classList.add('moved');
    }, 50);
  </script>

  <!-- Loading indicator / spinner -->
  <div id="spinner" class="spinner" aria-busy="true">Loading...</div>
  <script>
    setTimeout(() => {
      const sp = document.getElementById('spinner');
      sp.style.display = 'none';
      sp.setAttribute('aria-busy', 'false');
    }, 150);
  </script>

  <!-- Form with API Call and Spinner -->
  <form id="order-form" onsubmit="event.preventDefault(); submitOrder();">
    <button id="submit-order-btn" type="submit">Submit Order</button>
    <span id="order-status"></span>
  </form>
  <script>
    async function submitOrder() {
      const btn = document.getElementById('submit-order-btn');
      btn.disabled = true;
      const res = await fetch('/api/orders', { method: 'POST', body: JSON.stringify({ item: 'Widget' }) });
      const data = await res.json();
      document.getElementById('order-status').innerText = 'Order Created: ' + data.orderId;
      btn.disabled = false;
    }
  </script>

  <!-- SPA Router simulation -->
  <button id="spa-nav-btn" onclick="
    history.pushState({}, '', '/dashboard?view=analytics');
    document.getElementById('spa-view').innerText = 'Dashboard Analytics View';
  ">SPA Navigate</button>
  <div id="spa-view">Initial View</div>

  <!-- Popup / New Tab Trigger -->
  <button id="open-popup-btn" onclick="window.open('/popup-target', '_blank')">Open Popup</button>

  <!-- Debounced search input -->
  <input id="debounce-input" type="text" placeholder="Search..." oninput="handleDebounce(this.value)" />
  <ul id="search-results"></ul>
  <script>
    let debounceTimer;
    function handleDebounce(val) {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(async () => {
        const res = await fetch('/api/search?q=' + encodeURIComponent(val));
        const data = await res.json();
        const list = document.getElementById('search-results');
        list.innerHTML = '';
        data.results.forEach(r => {
          const li = document.createElement('li');
          li.innerText = r;
          list.appendChild(li);
        });
      }, 100);
    }
  </script>

  <!-- Dynamic Table Filter -->
  <button id="filter-table-btn" onclick="loadTable()">Filter Table</button>
  <table id="data-table"><tbody></tbody></table>
  <script>
    async function loadTable() {
      const res = await fetch('/api/table-data');
      const data = await res.json();
      const tbody = document.querySelector('#data-table tbody');
      tbody.innerHTML = '';
      data.rows.forEach(r => {
        const tr = document.createElement('tr');
        tr.innerHTML = '<td>' + r + '</td>';
        tbody.appendChild(tr);
      });
    }
  </script>

  <!-- Fast Response Trigger -->
  <button id="fast-api-btn" onclick="fetch('/api/fast-response')">Trigger Fast API</button>

  <!-- Long-Polling Background Connection -->
  <script>
    // Start background fetch to simulate live polling app
    fetch('/api/long-poll').catch(() => {});
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

    browser = await chromium.launch({ headless: true });
    context = await browser.newContext();
    page = await context.newPage();
    await page.goto(serverUrl);
  });

  after(async () => {
    if (page) await page.close().catch(() => {});
    if (context) await context.close().catch(() => {});
    if (browser) await browser.close().catch(() => {});
    await new Promise<void>(resolve => server.close(() => resolve()));
  });

  it('Pre-Action Readiness: waits for dynamic element ATTACHED and VISIBLE', async () => {
    // Click button to trigger delayed attachment
    await page.click('#show-delayed-btn');

    const result = await coordinator.synchronize(
      {
        projectId: crypto.randomUUID(),
        testRunId: crypto.randomUUID(),
        page,
      },
      {
        strategy: 'ELEMENT',
        target: { kind: 'CONTROL', locatorHints: ['#async-loaded-box'] },
        readinessState: 'VISIBLE',
        timeoutMs: 3000,
      },
    );

    assert.equal(result.outcome, 'SATISFIED');
    assert.equal(result.strategy, 'ELEMENT');
    assert.ok(result.durationMs >= 0);
  });

  it('Pre-Action Readiness: waits for button ENABLED state without arbitrary sleep', async () => {
    const result = await coordinator.synchronize(
      {
        projectId: crypto.randomUUID(),
        testRunId: crypto.randomUUID(),
        page,
      },
      {
        strategy: 'ELEMENT',
        target: { kind: 'CONTROL', locatorHints: ['#async-enable-btn'] },
        readinessState: 'ENABLED',
        timeoutMs: 3000,
      },
    );

    assert.equal(result.outcome, 'SATISFIED');
    assert.equal(result.actualState, 'READY');
  });

  it('Pre-Action Readiness: verifies EDITABLE state for form inputs', async () => {
    const result = await coordinator.synchronize(
      {
        projectId: crypto.randomUUID(),
        testRunId: crypto.randomUUID(),
        page,
      },
      {
        strategy: 'ELEMENT',
        target: { kind: 'CONTROL', locatorHints: ['#test-input'] },
        readinessState: 'EDITABLE',
        timeoutMs: 2000,
      },
    );

    assert.equal(result.outcome, 'SATISFIED');
  });

  it('Pre-Action Readiness: verifies STABLE bounding box for animated element', async () => {
    const result = await coordinator.synchronize(
      {
        projectId: crypto.randomUUID(),
        testRunId: crypto.randomUUID(),
        page,
      },
      {
        strategy: 'ELEMENT',
        target: { kind: 'CONTROL', locatorHints: ['#anim-box'] },
        readinessState: 'STABLE',
        timeoutMs: 3000,
      },
    );

    assert.equal(result.outcome, 'SATISFIED');
  });

  it('Loading State: waits for spinner / aria-busy loading indicator disappearance', async () => {
    const result = await coordinator.synchronize(
      {
        projectId: crypto.randomUUID(),
        testRunId: crypto.randomUUID(),
        page,
      },
      {
        strategy: 'LOADING_STATE',
        timeoutMs: 3000,
      },
    );

    assert.equal(result.outcome, 'SATISFIED');
    assert.equal(result.strategy, 'LOADING_STATE');
  });

  it('SPA Navigation: synchronizes on client-side route and query update', async () => {
    const result = await coordinator.synchronize(
      {
        projectId: crypto.randomUUID(),
        testRunId: crypto.randomUUID(),
        page,
      },
      {
        strategy: 'URL',
        urlPattern: '**/dashboard?view=analytics',
        triggerAction: async () => {
          await page.click('#spa-nav-btn');
        },
        timeoutMs: 3000,
      },
    );

    assert.equal(result.outcome, 'SATISFIED');
    assert.ok(page.url().includes('/dashboard?view=analytics'));
  });

  it('Redirect Chain: handles chained 302 redirects (/login -> /callback -> /dashboard)', async () => {
    const result = await coordinator.synchronize(
      {
        projectId: crypto.randomUUID(),
        testRunId: crypto.randomUUID(),
        page,
      },
      {
        strategy: 'NAVIGATION',
        urlPattern: '**/dashboard',
        triggerAction: async () => {
          await page.goto(`${serverUrl}/login-redirect`);
        },
        timeoutMs: 5000,
      },
    );

    assert.equal(result.outcome, 'SATISFIED');
    assert.ok(page.url().includes('/dashboard'));
  });

  it('Targeted Response Wait: awaits specific POST /api/orders completion', async () => {
    await page.goto(serverUrl);

    const result = await coordinator.synchronize(
      {
        projectId: crypto.randomUUID(),
        testRunId: crypto.randomUUID(),
        page,
      },
      {
        strategy: 'RESPONSE',
        responseMatcher: {
          method: 'POST',
          urlPattern: '/api/orders',
          status: 201,
        },
        triggerAction: async () => {
          await page.click('#submit-order-btn');
        },
        timeoutMs: 4000,
      },
    );

    assert.equal(result.outcome, 'SATISFIED');
  });

  it('Fast Response Race: pre-registered listener captures fast API response (< 1ms)', async () => {
    const result = await coordinator.synchronize(
      {
        projectId: crypto.randomUUID(),
        testRunId: crypto.randomUUID(),
        page,
      },
      {
        strategy: 'RESPONSE',
        responseMatcher: {
          urlPattern: '/api/fast-response',
          status: 200,
        },
        triggerAction: async () => {
          await page.click('#fast-api-btn');
        },
        timeoutMs: 3000,
      },
    );

    assert.equal(result.outcome, 'SATISFIED');
  });

  it('Long-Polling & Background Activity: normal actions succeed despite active background connection', async () => {
    // The test page maintains an active background /api/long-poll connection.
    // Verifies that synchronization does not hang waiting for universal network idle.
    const result = await coordinator.synchronize(
      {
        projectId: crypto.randomUUID(),
        testRunId: crypto.randomUUID(),
        page,
      },
      {
        strategy: 'ELEMENT',
        target: { kind: 'CONTROL', locatorHints: ['#test-input'] },
        readinessState: 'VISIBLE',
        timeoutMs: 2000,
      },
    );

    assert.equal(result.outcome, 'SATISFIED');
  });

  it('Debounced UI: synchronizes on dynamic search result list after input debounce', async () => {
    await page.fill('#debounce-input', 'Gadget');

    const result = await coordinator.synchronize(
      {
        projectId: crypto.randomUUID(),
        testRunId: crypto.randomUUID(),
        page,
      },
      {
        strategy: 'CUSTOM_CONDITION',
        customCondition: {
          kind: 'TEXT_APPEARS',
          text: 'Result for Gadget',
          timeoutMs: 3000,
        },
      },
    );

    assert.equal(result.outcome, 'SATISFIED');
  });

  it('Dynamic Table: awaits table rows populated asynchronously', async () => {
    await page.click('#filter-table-btn');

    const result = await coordinator.synchronize(
      {
        projectId: crypto.randomUUID(),
        testRunId: crypto.randomUUID(),
        page,
      },
      {
        strategy: 'CUSTOM_CONDITION',
        customCondition: {
          kind: 'TEXT_APPEARS',
          text: 'Row A',
          timeoutMs: 3000,
        },
      },
    );

    assert.equal(result.outcome, 'SATISFIED');
  });

  it('Fast Popup Race: captures newly opened popup window without race condition', async () => {
    let capturedPopupUrl = '';

    const result = await coordinator.synchronize(
      {
        projectId: crypto.randomUUID(),
        testRunId: crypto.randomUUID(),
        page,
        browserContext: context,
      },
      {
        strategy: 'POPUP',
        triggerAction: async () => {
          await page.click('#open-popup-btn');
        },
        timeoutMs: 4000,
      },
    );

    assert.equal(result.outcome, 'SATISFIED');
    const pages = context.pages();
    const popupPage = pages.find(p => p.url().includes('popup-target'));
    assert.ok(popupPage);
    capturedPopupUrl = popupPage.url();
    assert.ok(capturedPopupUrl.includes('/popup-target'));

    if (popupPage) await popupPage.close();
  });

  it('Timeout Budgeting: prevents multi-phase timeouts from compounding unbounded', () => {
    const tracker = new TimeoutBudgetTracker(5000);
    const rem1 = tracker.getRemainingTimeoutMs(2000);
    assert.equal(rem1, 2000);

    const rem2 = tracker.getRemainingTimeoutMs(10000);
    assert.ok(rem2 <= 5000);
  });

  it('Timeout Handling: returns TIMEOUT outcome when condition is not met within budget', async () => {
    const result = await coordinator.synchronize(
      {
        projectId: crypto.randomUUID(),
        testRunId: crypto.randomUUID(),
        page,
      },
      {
        strategy: 'ELEMENT',
        target: { kind: 'CONTROL', locatorHints: ['#non-existent-never-appearing-box'] },
        readinessState: 'VISIBLE',
        timeoutMs: 300,
      },
    );

    assert.equal(result.outcome, 'TIMEOUT');
    assert.equal(result.errorCode, 'ELEMENT_READINESS_TIMEOUT');
  });

  it('Cancellation: abortSignal immediately marks synchronization as CANCELLED', async () => {
    const abortController = new AbortController();
    abortController.abort();

    const result = await coordinator.synchronize(
      {
        projectId: crypto.randomUUID(),
        testRunId: crypto.randomUUID(),
        page,
        abortSignal: abortController.signal,
      },
      {
        strategy: 'URL',
        urlPattern: '**/never-arriving-page',
        timeoutMs: 5000,
      },
    );

    assert.equal(result.outcome, 'CANCELLED');
    assert.equal(result.errorCode, 'ACTION_CANCELLED');
  });

  it('Closed Page Handling: returns FAILED with PAGE_NOT_AVAILABLE cleanly without crash', async () => {
    const isolatedPage = await context.newPage();
    await isolatedPage.close();

    const result = await coordinator.synchronize(
      {
        projectId: crypto.randomUUID(),
        testRunId: crypto.randomUUID(),
        page: isolatedPage,
      },
      {
        strategy: 'DOM_CONTENT_LOADED',
        timeoutMs: 1000,
      },
    );

    assert.equal(result.outcome, 'FAILED');
    assert.equal(result.errorCode, 'PAGE_NOT_AVAILABLE');
  });

  it('Secret Redaction: masks credentials from network URL patterns and error messages', async () => {
    const secretApiKey = 'SUPER_SECRET_TOKEN_999';

    const result = await coordinator.synchronize(
      {
        projectId: crypto.randomUUID(),
        testRunId: crypto.randomUUID(),
        page,
        secrets: { authSecret: secretApiKey },
      },
      {
        strategy: 'RESPONSE',
        responseMatcher: {
          urlPattern: `/api/orders?token=${secretApiKey}`,
          timeoutMs: 200,
        },
      },
    );

    assert.equal(result.outcome, 'TIMEOUT');
    assert.ok(!result.errorMessage?.includes(secretApiKey));
  });

  it('Multi-Run Stability: executes 5 consecutive fast race synchronization cycles without flakiness', async () => {
    for (let i = 0; i < 5; i++) {
      const result = await coordinator.synchronize(
        {
          projectId: crypto.randomUUID(),
          testRunId: crypto.randomUUID(),
          page,
        },
        {
          strategy: 'RESPONSE',
          responseMatcher: {
            urlPattern: '/api/fast-response',
            status: 200,
          },
          triggerAction: async () => {
            await page.click('#fast-api-btn');
          },
          timeoutMs: 3000,
        },
      );
      assert.equal(result.outcome, 'SATISFIED', `Iteration ${i + 1} failed`);
    }
  });
});
