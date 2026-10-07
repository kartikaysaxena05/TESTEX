/**
 * @file packages/core/src/execution/healing/healing-e2e-real-browser.test.ts
 * Real-browser Playwright end-to-end integration tests for Locator Self-Healing and Parallel Isolation.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chromium, type Browser } from 'playwright';
import { LocatorHealingEngine } from './locator-healing-engine.js';
import type { HealingExecutionContext } from './healing-types.js';
import type { ExecutableTargetDescriptorDto } from '@ai-quality/contracts';

describe('Locator Self-Healing & Parallel Isolation Real Browser E2E Tests', () => {
  let browser: Browser;

  before(async () => {
    browser = await chromium.launch({ headless: true });
  });

  after(async () => {
    await browser.close();
  });

  it('autonomously heals drifted locator on live page and executes action successfully', async () => {
    const context = await browser.newContext();
    const page = await context.newPage();

    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head><title>Self Healing Test Page</title></head>
        <body>
          <h1>Login Portal</h1>
          <form id="login-form" action="/login">
            <input type="text" name="username" placeholder="Username" id="user-field" />
            <input type="password" name="password" placeholder="Password" id="pass-field" />
            <button type="submit" id="btn-login-new" data-testid="btn-login-v2" class="btn-primary">
              Log In to Account
            </button>
          </form>
          <div id="result"></div>
          <script>
            document.getElementById('btn-login-new').addEventListener('click', (e) => {
              e.preventDefault();
              document.getElementById('result').innerText = 'LOGIN_SUCCESS';
            });
          </script>
        </body>
      </html>
    `;

    await page.setContent(htmlContent);

    // Target descriptor with original (drifted) locator
    const target: ExecutableTargetDescriptorDto = {
      kind: 'CONTROL',
      strategy: 'ROLE',
      role: 'button',
      name: 'Log In',
      testId: 'btn-login-v1', // old testId that doesn't exist
    };

    const engine = new LocatorHealingEngine();
    const execContext: HealingExecutionContext = {
      projectId: '00000000-0000-0000-0000-000000000001',
      testRunId: '00000000-0000-0000-0000-000000000002',
      executionId: '00000000-0000-0000-0000-000000000003',
      stepIndex: 1,
      attempt: 1,
      actionType: 'CLICK',
      originalTarget: target,
      originalSelector: "page.getByRole('button', { name: 'Log In' })",
      failureReason: 'Original locator timed out',
      session: { context, page } as any,
      page,
    };

    const result = await engine.healLocator(execContext);

    assert.equal(result.healingResult, 'HEALED');
    assert.ok(result.selectedLocator, 'Should return a resolved replacement locator');
    assert.ok((result.selectedScore ?? 0) >= 75, 'Should score above confidence threshold');

    // Click using healed locator and verify page reaction
    await result.selectedLocator.click();
    const resultText = await page.locator('#result').innerText();
    assert.equal(resultText, 'LOGIN_SUCCESS');

    await context.close();
  });

  it('strictly refuses to click ambiguous candidates when multiple elements score similarly', async () => {
    const context = await browser.newContext();
    const page = await context.newPage();

    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head><title>Ambiguity Test Page</title></head>
        <body>
          <div class="card">
            <h3>Document Draft</h3>
            <button id="save-draft" class="btn">Save Draft</button>
          </div>
          <div class="card">
            <h3>Published Document</h3>
            <button id="save-pub" class="btn">Save Changes</button>
          </div>
        </body>
      </html>
    `;

    await page.setContent(htmlContent);

    // Target descriptor with ambiguous query "Save"
    const target: ExecutableTargetDescriptorDto = {
      kind: 'CONTROL',
      strategy: 'ROLE',
      role: 'button',
      name: 'Save',
    };

    const engine = new LocatorHealingEngine();
    const execContext: HealingExecutionContext = {
      projectId: '00000000-0000-0000-0000-000000000001',
      testRunId: '00000000-0000-0000-0000-000000000002',
      executionId: '00000000-0000-0000-0000-000000000003',
      stepIndex: 1,
      attempt: 1,
      actionType: 'CLICK',
      originalTarget: target,
      originalSelector: "page.getByRole('button', { name: 'Save' })",
      failureReason: 'Original locator ambiguous',
      session: { context, page } as any,
      page,
    };

    const result = await engine.healLocator(execContext);

    assert.equal(result.healingResult, 'AMBIGUOUS');
    assert.equal(result.selectedLocator, undefined);
    assert.ok(result.reason.includes('Ambiguous candidates detected'));

    await context.close();
  });

  it('guarantees zero cross-run state leakage across concurrent browser contexts', async () => {
    // Context A represents Run A (Tenant / User 1)
    const contextA = await browser.newContext();
    const pageA = await contextA.newPage();

    // Context B represents Run B (Tenant / User 2)
    const contextB = await browser.newContext();
    const pageB = await contextB.newPage();

    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <body>
          <div id="content">Default Content</div>
        </body>
      </html>
    `;

    await Promise.all([pageA.setContent(htmlContent), pageB.setContent(htmlContent)]);

    // Run A sets cookie on Context A and modifies window execution state
    await contextA.addCookies([
      { name: 'auth_token', value: 'admin_token_12345', url: 'https://example.com' },
      { name: 'session_id', value: 'sess_tenant_alpha', url: 'https://example.com' },
    ]);

    await pageA.evaluate(() => {
      (window as any).__TEST_TENANT_DATA__ = { tenantId: 'tenant_alpha', secret: 'alpha_secret' };
      document.getElementById('content')!.innerText = 'Modified by Tenant Alpha';
    });

    // Verify Context A state
    const cookiesA = await contextA.cookies('https://example.com');
    assert.equal(cookiesA.length, 2);
    const contentA = await pageA.locator('#content').innerText();
    assert.equal(contentA, 'Modified by Tenant Alpha');

    // Verify Context B has 0 cookies from Context A
    const cookiesB = await contextB.cookies('https://example.com');
    assert.equal(cookiesB.length, 0, 'Context B must have 0 cookies from Context A');

    // Run B inspects window state and DOM concurrently
    const stateB = await pageB.evaluate(() => ({
      tenantData: (window as any).__TEST_TENANT_DATA__,
      content: document.getElementById('content')?.innerText,
    }));

    // Verify Run B is completely clean and isolated
    assert.equal(stateB.tenantData, undefined);
    assert.equal(stateB.content, 'Default Content');

    await Promise.all([contextA.close(), contextB.close()]);
  });
});
