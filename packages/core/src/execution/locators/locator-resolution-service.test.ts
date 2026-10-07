/**
 * @file packages/core/src/execution/locators/locator-resolution-service.test.ts
 * Real Playwright integration tests for LocatorResolutionService covering all strategies,
 * scopes, tables, dialogs, iframes, dynamic DOM, ambiguity, security, and multi-tenant isolation.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { getPrismaClient } from '../../database/index.js';
import { getBrowserSessionManager } from '../sessions/index.js';
import { LocatorResolutionService } from './locator-resolution-service.js';
import { CrossRunExecutionError } from '../actions/action-errors.js';

describe('LocatorResolutionService Playwright Integration Tests', () => {
  let server: http.Server;
  let serverUrl: string;
  let prisma: any;
  let sessionManager: any;
  let resolutionService: LocatorResolutionService;

  let projectIdA: string;
  let projectIdB: string;
  let testRunIdA: string;
  let sessionA: any;

  before(async () => {
    prisma = getPrismaClient();

    // 1. Setup mock fixture HTTP server
    server = http.createServer((req, res) => {
      const url = req.url || '/';

      if (url === '/iframe-content') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`
          <!DOCTYPE html>
          <html>
            <body>
              <input data-testid="frame-inner-input" placeholder="Inside Iframe" />
            </body>
          </html>
        `);
        return;
      }

      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`
        <!DOCTYPE html>
        <html>
          <head><title>Locator Intelligence Test Fixture</title></head>
          <body>
            <!-- 1. Test IDs -->
            <button data-testid="primary-action-btn">Primary Action</button>
            <div data-testid="dup-testid">TestId 1</div>
            <div data-testid="dup-testid">TestId 2</div>

            <!-- 2. Roles & Accessible Names -->
            <button id="btn-create">Create Project</button>
            <a href="/dashboard">Dashboard</a>
            <input type="checkbox" id="tos" />
            <label for="tos">Accept Terms</label>

            <!-- 3. Form Labels & Fields -->
            <form name="login-form" id="form-login">
              <h3>Login Form</h3>
              <label for="login-email">Work Email</label>
              <input id="login-email" name="email" type="email" />
              <label for="login-pass">Password</label>
              <input id="login-pass" name="password" type="password" value="SuperSecretPassword123!" />
              <button type="submit">Submit</button>
            </form>

            <form name="newsletter-form" id="form-newsletter">
              <h3>Newsletter Form</h3>
              <label for="news-email">Work Email</label>
              <input id="news-email" name="email" type="email" />
              <button type="submit">Submit</button>
            </form>

            <!-- 4. Placeholders -->
            <input id="search-input" placeholder="Search projects..." />

            <!-- 5. Exact vs Substring Text -->
            <button id="btn-save">Save</button>
            <button id="btn-save-draft">Save Draft</button>

            <!-- 6. Alt Text & Titles -->
            <img alt="Company Logo" src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==" />
            <button title="Close Window">X</button>

            <!-- 7. CSS & XPath targets -->
            <div class="custom-card">
              <span class="badge-status">Active</span>
            </div>
            <button id="xpath-btn">XPath Target Button</button>

            <!-- 8. Unicode & Special Characters -->
            <button id="btn-unicode">Résumé & Profile (₹ / 日本語 / हिन्दी 🚀)</button>
            <button id="btn-special">Special &lt;Tags&gt; 'Quotes' &amp; "Double"</button>

            <!-- 9. Modal Dialog -->
            <div id="page-delete-container">
              <button class="action-delete">Delete</button>
            </div>
            <dialog id="modal-confirm" open aria-label="Confirm Deletion">
              <h2>Confirm Deletion</h2>
              <p>Are you sure?</p>
              <button class="action-delete">Delete</button>
              <button id="btn-modal-cancel">Cancel</button>
            </dialog>

            <!-- 10. Table Rows -->
            <table id="orders-table">
              <thead>
                <tr><th>Order ID</th><th>Action</th></tr>
              </thead>
              <tbody>
                <tr id="row-1"><td>ORD-001</td><td><button class="btn-edit">Edit</button></td></tr>
                <tr id="row-2"><td>ORD-002</td><td><button class="btn-edit">Edit</button></td></tr>
                <tr id="row-3"><td>ORD-003</td><td><button class="btn-edit">Edit</button></td></tr>
              </tbody>
            </table>

            <!-- 11. IFrame -->
            <iframe id="test-iframe" name="content-frame" src="/iframe-content"></iframe>

            <!-- 12. Multiple identical buttons (Ambiguous) -->
            <button class="ambiguous-btn">Batch Action</button>
            <button class="ambiguous-btn">Batch Action</button>
            <button class="ambiguous-btn">Batch Action</button>

            <!-- 13. Dynamic Element Attachment Container -->
            <div id="dynamic-container"></div>
            <script>
              setTimeout(() => {
                const el = document.createElement('div');
                el.id = 'delayed-element';
                el.innerText = 'Asynchronously Loaded Content';
                document.getElementById('dynamic-container').appendChild(el);
              }, 200);
            </script>
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

    // 2. Setup database records
    const projectA = await prisma.project.create({
      data: { name: 'Project A Locators', status: 'ACTIVE' },
    });
    projectIdA = projectA.id;

    const projectB = await prisma.project.create({
      data: { name: 'Project B Locators', status: 'ACTIVE' },
    });
    projectIdB = projectB.id;

    const req = await prisma.requirement.create({
      data: {
        projectId: projectIdA,
        title: 'Locator Test Requirement',
        requirementKey: `REQ-LOC-${Date.now()}`,
        originalText: 'Test requirement for locator resolution',
      },
    });

    const testCase = await prisma.testCase.create({
      data: {
        projectId: projectIdA,
        sourceRequirementId: req.id,
        title: 'Locator Test Suite Case',
        testCaseKey: `TC-LOC-${Date.now()}`,
        objective: 'Test locator resolution engine',
        status: 'ACTIVE',
        reviewStatus: 'APPROVED',
      },
    });

    const plan = await prisma.executableTestPlan.create({
      data: {
        projectId: projectIdA,
        testCaseId: testCase.id,
        testCaseVersionNumber: 1,
        planFingerprint: `fp-loc-test-${Date.now()}`,
        status: 'VALID',
      },
    });

    const testRun = await prisma.testRun.create({
      data: {
        projectId: projectIdA,
        testCaseId: testCase.id,
        testCaseVersionNumber: 1,
        executableTestPlanId: plan.id,
        testCaseTitle: 'Locator Test Suite Case',
        planFingerprint: `fp-loc-test-${Date.now()}`,
        status: 'RUNNING',
      },
    });
    testRunIdA = testRun.id;

    // 3. Initialize session manager and browser session
    sessionManager = getBrowserSessionManager(prisma);
    sessionA = await sessionManager.createSession({
      testRunId: testRunIdA,
      projectId: projectIdA,
      headless: true,
    });

    const page = sessionA.page;
    await page.goto(serverUrl, { waitUntil: 'domcontentloaded' });

    resolutionService = new LocatorResolutionService({
      prisma,
      sessionManager,
    });
  });

  after(async () => {
    if (sessionA) {
      await sessionManager.closeSession(sessionA.sessionId);
    }
    await new Promise<void>(resolve => server.close(() => resolve()));
  });

  it('resolves element by TEST_ID strategy uniquely', async () => {
    const result = await resolutionService.resolveLocator({
      projectId: projectIdA,
      testRunId: testRunIdA,
      target: {
        kind: 'CONTROL',
        strategy: 'TEST_ID',
        testId: 'primary-action-btn',
      },
    });

    assert.equal(result.status, 'RESOLVED');
    assert.equal(result.strategy, 'TEST_ID');
    assert.equal(result.matchCount, 1);
    assert.match(result.selectorRecipe, /getByTestId\("primary-action-btn"\)/);
    assert.equal(result.elementDiagnostics?.tagName, 'button');
    assert.equal(result.elementDiagnostics?.isVisible, true);
  });

  it('resolves element by ROLE + accessible name uniquely', async () => {
    const result = await resolutionService.resolveLocator({
      projectId: projectIdA,
      testRunId: testRunIdA,
      target: {
        kind: 'CONTROL',
        role: 'button',
        name: 'Create Project',
      },
    });

    assert.equal(result.status, 'RESOLVED');
    assert.equal(result.strategy, 'ROLE');
    assert.equal(result.matchCount, 1);
    assert.match(result.selectorRecipe, /getByRole\("button"/);
  });

  it('resolves form control by LABEL relationship', async () => {
    const result = await resolutionService.resolveLocator({
      projectId: projectIdA,
      testRunId: testRunIdA,
      target: {
        kind: 'FIELD',
        label: 'Accept Terms',
      },
    });

    assert.equal(result.status, 'RESOLVED');
    assert.equal(result.strategy, 'LABEL');
    assert.equal(result.matchCount, 1);
    assert.equal(result.elementDiagnostics?.tagName, 'input');
  });

  it('resolves input by PLACEHOLDER strategy', async () => {
    const result = await resolutionService.resolveLocator({
      projectId: projectIdA,
      testRunId: testRunIdA,
      target: {
        kind: 'FIELD',
        placeholder: 'Search projects...',
      },
    });

    assert.equal(result.status, 'RESOLVED');
    assert.equal(result.strategy, 'PLACEHOLDER');
    assert.equal(result.matchCount, 1);
  });

  it('resolves exact text without matching substring duplicates', async () => {
    const result = await resolutionService.resolveLocator({
      projectId: projectIdA,
      testRunId: testRunIdA,
      target: {
        kind: 'CONTROL',
        role: 'button',
        name: 'Save',
        exact: true,
      },
    });

    assert.equal(result.status, 'RESOLVED');
    assert.equal(result.matchCount, 1);
    assert.equal(result.elementDiagnostics?.accessibleName, 'Save');
  });

  it('resolves element by ALT_TEXT and TITLE strategies', async () => {
    const altResult = await resolutionService.resolveLocator({
      projectId: projectIdA,
      testRunId: testRunIdA,
      target: {
        kind: 'ELEMENT',
        altText: 'Company Logo',
      },
    });
    assert.equal(altResult.status, 'RESOLVED');
    assert.equal(altResult.strategy, 'ALT_TEXT');

    const titleResult = await resolutionService.resolveLocator({
      projectId: projectIdA,
      testRunId: testRunIdA,
      target: {
        kind: 'CONTROL',
        title: 'Close Window',
      },
    });
    assert.equal(titleResult.status, 'RESOLVED');
    assert.equal(titleResult.strategy, 'TITLE');
  });

  it('resolves valid CSS and XPath selectors', async () => {
    const cssResult = await resolutionService.resolveLocator({
      projectId: projectIdA,
      testRunId: testRunIdA,
      target: {
        kind: 'ELEMENT',
        css: 'span.badge-status',
      },
    });
    assert.equal(cssResult.status, 'RESOLVED');
    assert.equal(cssResult.strategy, 'CSS');

    const xpathResult = await resolutionService.resolveLocator({
      projectId: projectIdA,
      testRunId: testRunIdA,
      target: {
        kind: 'ELEMENT',
        xpath: '//button[@id="xpath-btn"]',
      },
    });
    assert.equal(xpathResult.status, 'RESOLVED');
    assert.equal(xpathResult.strategy, 'XPATH');
  });

  it('handles Unicode, international characters, and special characters', async () => {
    const unicodeResult = await resolutionService.resolveLocator({
      projectId: projectIdA,
      testRunId: testRunIdA,
      target: {
        kind: 'CONTROL',
        role: 'button',
        name: 'Résumé & Profile (₹ / 日本語 / हिन्दी 🚀)',
        exact: true,
      },
    });
    assert.equal(unicodeResult.status, 'RESOLVED');

    const specialResult = await resolutionService.resolveLocator({
      projectId: projectIdA,
      testRunId: testRunIdA,
      target: {
        kind: 'CONTROL',
        role: 'button',
        name: 'Special <Tags> \'Quotes\' & "Double"',
        exact: true,
      },
    });
    assert.equal(specialResult.status, 'RESOLVED');
  });

  it('resolves duplicate fields cleanly when scoped inside a specific FORM', async () => {
    // Both login-form and newsletter-form have label "Work Email"
    const globalResult = await resolutionService.resolveLocator({
      projectId: projectIdA,
      testRunId: testRunIdA,
      target: {
        kind: 'FIELD',
        label: 'Work Email',
      },
    });
    assert.equal(globalResult.status, 'AMBIGUOUS');
    assert.equal(globalResult.matchCount, 2);

    // Scoped resolution to login-form
    const scopedResult = await resolutionService.resolveLocator({
      projectId: projectIdA,
      testRunId: testRunIdA,
      target: {
        kind: 'FIELD',
        label: 'Work Email',
        scope: {
          type: 'FORM',
          name: 'login-form',
        },
      },
    });
    assert.equal(scopedResult.status, 'RESOLVED');
    assert.equal(scopedResult.matchCount, 1);
  });

  it('resolves buttons cleanly inside a modal DIALOG scope', async () => {
    // Both page body and dialog have a "Delete" button
    const scopedDialogResult = await resolutionService.resolveLocator({
      projectId: projectIdA,
      testRunId: testRunIdA,
      target: {
        kind: 'CONTROL',
        role: 'button',
        name: 'Delete',
        scope: {
          type: 'DIALOG',
          name: 'Confirm Deletion',
        },
      },
    });

    assert.equal(scopedDialogResult.status, 'RESOLVED');
    assert.equal(scopedDialogResult.matchCount, 1);
  });

  it('resolves a specific control within a TABLE_ROW identified by row content', async () => {
    // 3 rows all have an "Edit" button
    const rowResult = await resolutionService.resolveLocator({
      projectId: projectIdA,
      testRunId: testRunIdA,
      target: {
        kind: 'CONTROL',
        role: 'button',
        name: 'Edit',
        scope: {
          type: 'TABLE_ROW',
          hasText: 'ORD-002',
        },
      },
    });

    assert.equal(rowResult.status, 'RESOLVED');
    assert.equal(rowResult.matchCount, 1);
  });

  it('resolves element inside an IFRAME via frame descriptor', async () => {
    const frameResult = await resolutionService.resolveLocator({
      projectId: projectIdA,
      testRunId: testRunIdA,
      target: {
        kind: 'FIELD',
        testId: 'frame-inner-input',
        frame: {
          selector: '#test-iframe',
        },
      },
    });

    assert.equal(frameResult.status, 'RESOLVED');
    assert.equal(frameResult.matchCount, 1);
    assert.match(frameResult.selectorRecipe, /frameLocator/);
  });

  it('strictly detects AMBIGUOUS targets and returns candidate diagnostics without using .first()', async () => {
    const result = await resolutionService.resolveLocator({
      projectId: projectIdA,
      testRunId: testRunIdA,
      target: {
        kind: 'CONTROL',
        role: 'button',
        name: 'Batch Action',
      },
    });

    assert.equal(result.status, 'AMBIGUOUS');
    assert.equal(result.matchCount, 3);
    assert.ok(result.candidateDiagnostics && result.candidateDiagnostics.length === 3);
    assert.equal(result.candidateDiagnostics?.[0]?.tagName, 'button');
  });

  it('supports explicit ORDINAL targeting to select nth matching element deterministically', async () => {
    const result = await resolutionService.resolveLocator({
      projectId: projectIdA,
      testRunId: testRunIdA,
      target: {
        kind: 'CONTROL',
        role: 'button',
        name: 'Batch Action',
        ordinal: 1, // 2nd element
      },
    });

    assert.equal(result.status, 'RESOLVED');
    assert.equal(result.matchCount, 1);
    assert.match(result.selectorRecipe, /\.nth\(1\)/);
  });

  it('detects duplicate TEST_ID and reports AMBIGUOUS rather than assuming uniqueness', async () => {
    const result = await resolutionService.resolveLocator({
      projectId: projectIdA,
      testRunId: testRunIdA,
      target: {
        kind: 'ELEMENT',
        testId: 'dup-testid',
      },
    });

    assert.equal(result.status, 'AMBIGUOUS');
    assert.equal(result.matchCount, 2);
  });

  it('resolves dynamic delayed element using bounded waiting', async () => {
    const result = await resolutionService.resolveLocator({
      projectId: projectIdA,
      testRunId: testRunIdA,
      target: {
        kind: 'ELEMENT',
        text: 'Asynchronously Loaded Content',
      },
      timeoutMs: 3000,
    });

    assert.equal(result.status, 'RESOLVED');
    assert.equal(result.matchCount, 1);
  });

  it('returns NOT_FOUND for never-appearing element within bounded timeout', async () => {
    const result = await resolutionService.resolveLocator({
      projectId: projectIdA,
      testRunId: testRunIdA,
      target: {
        kind: 'CONTROL',
        role: 'button',
        name: 'Ghost Button That Never Exists',
      },
      timeoutMs: 300,
    });

    assert.equal(result.status, 'NOT_FOUND');
    assert.equal(result.matchCount, 0);
  });

  it('enforces multi-tenant project isolation and blocks cross-project resolution', async () => {
    await assert.rejects(
      async () => {
        await resolutionService.resolveLocator({
          projectId: projectIdB, // Mismatched project
          testRunId: testRunIdA,
          target: {
            kind: 'CONTROL',
            name: 'Create Project',
          },
        });
      },
      (err: any) => err instanceof CrossRunExecutionError,
    );
  });

  it('safely extracts password field diagnostics without leaking actual password values', async () => {
    const result = await resolutionService.resolveLocator({
      projectId: projectIdA,
      testRunId: testRunIdA,
      target: {
        kind: 'FIELD',
        label: 'Password',
        scope: {
          type: 'FORM',
          name: 'login-form',
        },
      },
    });

    assert.equal(result.status, 'RESOLVED');
    assert.equal(result.elementDiagnostics?.inputType, 'password');
    // Ensure password text is not present in diagnostics or recipe
    const serialized = JSON.stringify(result);
    assert.ok(!serialized.includes('SuperSecretPassword123!'));
  });

  it('supports cooperative cancellation via AbortSignal', async () => {
    const ac = new AbortController();
    ac.abort();

    const result = await resolutionService.resolveLocator(
      {
        projectId: projectIdA,
        testRunId: testRunIdA,
        target: {
          kind: 'CONTROL',
          name: 'Create Project',
        },
      },
      ac.signal,
    );

    assert.equal(result.status, 'CANCELLED');
  });

  it('guarantees deterministic resolution across multiple consecutive executions', async () => {
    const runs = [];
    for (let i = 0; i < 5; i++) {
      runs.push(
        await resolutionService.resolveLocator({
          projectId: projectIdA,
          testRunId: testRunIdA,
          target: {
            kind: 'CONTROL',
            role: 'button',
            name: 'Create Project',
          },
        }),
      );
    }

    const first = runs[0]!;
    for (const r of runs) {
      assert.equal(r.status, first.status);
      assert.equal(r.strategy, first.strategy);
      assert.equal(r.matchCount, first.matchCount);
      assert.equal(r.selectorRecipe, first.selectorRecipe);
    }
  });
});
