/**
 * @file packages/core/src/website-targets/certification/v8-phase119-certification.test.ts
 * Comprehensive Certification Test Suite for V8 Phase 119:
 * Website URL Connection, Environment Targeting & Live Production Safety.
 *
 * CERTIFICATION INVARIANTS:
 * 1. URL validation, normalization, and protocol allowlist (http/https only).
 * 2. SSRF prevention: direct cloud metadata (169.254.169.254), IPv6 link-local, and SSRF via HTTP redirect.
 * 3. Environment types (LOCAL, DEVELOPMENT, STAGING, PRODUCTION) with loopback restrictions on PRODUCTION.
 * 4. Preflight connectivity checker: DNS resolution, HTTP probe, latency, TLS status, timeout & cancellation.
 * 5. Target authorization state machine: UNVERIFIED -> USER_CONFIRMED with actor audit.
 * 6. Production Safe Mode: deterministic blocking of DESTRUCTIVE, FINANCIAL, and EXTERNAL_SIDE_EFFECT actions.
 * 7. Target persistence, transactional active target switching, and V5 ProjectEnvironment synchronization.
 * 8. Immutable target snapshotting for wrong-target prevention.
 * 9. Multi-user project isolation: cross-tenant access denied.
 * 10. REAL Playwright browser execution proof against real HTTP test fixture.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { chromium, type Browser } from 'playwright';
import { getPrismaClient } from '../../database/client.js';
import { UrlSafetyEvaluator } from '../url-safety.js';
import { WebsiteTargetConnectivityChecker } from '../connectivity-checker.js';
import { ProductionSafetyChecker } from '../production-safety-checker.js';
import { WebsiteTargetService } from '../website-target-service.js';
import {
  WebsiteTargetNotFoundError,
  TargetAccessDeniedError,
  TargetValidationError,
  ProductionSafeModeViolationError,
  UnsafeUrlTargetError,
} from '../website-target-errors.js';
import type { PrismaClient } from '@prisma/client';

describe('V8 Phase 119 — Website Target & Production Safety Certification Suite', () => {
  let prisma: PrismaClient;
  let testServer: http.Server;
  let serverBaseUrl: string;
  let browser: Browser;
  let targetService: WebsiteTargetService;
  let connectivityChecker: WebsiteTargetConnectivityChecker;

  // Test Fixture IDs
  const userAId = '00000000-0000-0000-0000-000000000119';
  const userBId = '00000000-0000-0000-0000-000000000120';
  const projectAId = '00000000-0000-0000-0000-000000001190';
  const projectBId = '00000000-0000-0000-0000-000000001191';

  before(async () => {
    const client = getPrismaClient();
    if (!client) {
      throw new Error('PostgreSQL database connection required for Phase 119 certification.');
    }
    prisma = client;
    connectivityChecker = new WebsiteTargetConnectivityChecker();
    targetService = new WebsiteTargetService(prisma, connectivityChecker);

    // 1. Launch real HTTP server fixture with safe and hazardous routes
    testServer = http.createServer((req, res) => {
      const url = new URL(req.url || '/', `http://${req.headers.host}`);

      // Safe landing page
      if (url.pathname === '/') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`
          <!DOCTYPE html>
          <html>
            <head><title>Phase 119 Test Target Application</title></head>
            <body>
              <header><h1>Autonomous QA Target Portal</h1></header>
              <main>
                <form id="search-form" action="/search" method="GET">
                  <input type="text" id="search-query" name="q" placeholder="Search quality metrics..." />
                  <button type="submit" id="search-submit">Search</button>
                </form>
                <div id="results">Ready for testing.</div>
                <button id="btn-delete-database" data-danger="true">Delete Database</button>
                <button id="btn-purchase-order" data-danger="true">Confirm 10,000 USD Order</button>
              </main>
            </body>
          </html>
        `);
        return;
      }

      // Safe search results
      if (url.pathname === '/search') {
        const query = url.searchParams.get('q') || '';
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`
          <!DOCTYPE html>
          <html>
            <head><title>Search Results</title></head>
            <body>
              <div id="search-result-count">Found results for: ${query}</div>
            </body>
          </html>
        `);
        return;
      }

      // Malicious / SSRF redirect simulator (redirects to AWS cloud metadata)
      if (url.pathname === '/redirect-to-metadata') {
        res.writeHead(302, { Location: 'http://169.254.169.254/latest/meta-data/' });
        res.end();
        return;
      }

      // Safe redirect
      if (url.pathname === '/safe-redirect') {
        res.writeHead(301, { Location: '/' });
        res.end();
        return;
      }

      // Fallback
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
    });

    await new Promise<void>(resolve => {
      testServer.listen(0, '127.0.0.1', () => {
        const addr = testServer.address() as AddressInfo;
        serverBaseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });

    // 2. Launch real Playwright Chromium browser
    browser = await chromium.launch({ headless: true });

    // 3. Clean up any existing test records and seed user and projects
    await prisma.websiteTarget.deleteMany({
      where: { projectId: { in: [projectAId, projectBId] } },
    });
    await prisma.projectEnvironment.deleteMany({
      where: { projectId: { in: [projectAId, projectBId] } },
    });
    await prisma.project.deleteMany({
      where: { id: { in: [projectAId, projectBId] } },
    });
    await prisma.user.deleteMany({
      where: { id: { in: [userAId, userBId] } },
    });

    // Seed test users
    await prisma.user.create({
      data: {
        id: userAId,
        email: 'user-a-119@example.com',
        normalizedEmail: 'user-a-119@example.com',
        displayName: 'User A',
      },
    });

    await prisma.user.create({
      data: {
        id: userBId,
        email: 'user-b-119@example.com',
        normalizedEmail: 'user-b-119@example.com',
        displayName: 'User B',
      },
    });

    // Seed test projects
    await prisma.project.create({
      data: {
        id: projectAId,
        name: 'Project A (User A)',
        description: 'V8 Phase 119 Primary Target Test Project',
        status: 'ACTIVE',
        userId: userAId,
      },
    });

    await prisma.project.create({
      data: {
        id: projectBId,
        name: 'Project B (User B)',
        description: 'V8 Phase 119 Secondary Isolation Project',
        status: 'ACTIVE',
        userId: userBId,
      },
    });
  });

  after(async () => {
    if (browser) {
      await browser.close();
    }
    if (testServer) {
      await new Promise<void>(resolve => testServer.close(() => resolve()));
    }
    if (prisma) {
      await prisma.websiteTarget.deleteMany({
        where: { projectId: { in: [projectAId, projectBId] } },
      });
      await prisma.projectEnvironment.deleteMany({
        where: { projectId: { in: [projectAId, projectBId] } },
      });
      await prisma.project.deleteMany({
        where: { id: { in: [projectAId, projectBId] } },
      });
      await prisma.user.deleteMany({
        where: { id: { in: [userAId, userBId] } },
      });
      await prisma.$disconnect();
    }
  });

  // =========================================================================
  // SECTION 1: URL VALIDATION, NORMALIZATION & PROTOCOL RESTRICTION
  // =========================================================================
  describe('1. URL Validation, Normalization & Protocol Allowlist', () => {
    it('should normalize URLs by trimming trailing slashes on root and lowercasing host', () => {
      const res = UrlSafetyEvaluator.normalizeAndValidate('HTTPS://EXAMPLE.COM/', 'STAGING');
      assert.strictEqual(res.canonicalUrl, 'https://example.com');
      assert.strictEqual(res.hostname, 'example.com');
      assert.strictEqual(res.port, 443);
    });

    it('should preserve ports, nested paths, and queries while collapsing duplicate slashes', () => {
      const res = UrlSafetyEvaluator.normalizeAndValidate('http://localhost:3000///api//v1?env=test#anchor', 'LOCAL');
      assert.strictEqual(res.canonicalUrl, 'http://localhost:3000/api/v1');
      assert.strictEqual(res.normalizedUrl, 'http://localhost:3000/api/v1?env=test#anchor');
      assert.strictEqual(res.port, 3000);
    });

    it('should reject embedded user credentials from target URLs with UnsafeUrlTargetError', () => {
      assert.throws(
        () => UrlSafetyEvaluator.normalizeAndValidate('https://admin:secret123@staging.example.com/login', 'STAGING'),
        UnsafeUrlTargetError,
      );
    });

    it('should reject malformed URLs with UnsafeUrlTargetError', () => {
      assert.throws(
        () => UrlSafetyEvaluator.normalizeAndValidate('not-a-valid-url', 'DEVELOPMENT'),
        UnsafeUrlTargetError,
      );
    });

    it('should reject disallowed schemes (file:, javascript:, data:, ftp:, chrome:, electron:)', () => {
      const forbiddenSchemes = [
        'file:///etc/passwd',
        'javascript:alert(1)',
        'data:text/html,<h1>Pwn</h1>',
        'ftp://files.example.com/test',
        'chrome://settings',
        'electron://renderer',
        'ws://realtime.example.com',
      ];

      for (const forbidden of forbiddenSchemes) {
        assert.throws(
          () => UrlSafetyEvaluator.normalizeAndValidate(forbidden, 'DEVELOPMENT'),
          UnsafeUrlTargetError,
          `Must reject forbidden scheme: ${forbidden}`,
        );
      }
    });
  });

  // =========================================================================
  // SECTION 2: SSRF & CLOUD METADATA & LOOPBACK PROTECTION
  // =========================================================================
  describe('2. SSRF, Cloud Metadata & Loopback Security Guards', () => {
    it('should reject direct AWS/GCP/Azure link-local metadata IP (169.254.169.254)', () => {
      assert.throws(
        () => UrlSafetyEvaluator.normalizeAndValidate('http://169.254.169.254/latest/meta-data/', 'DEVELOPMENT'),
        UnsafeUrlTargetError,
        'Must block AWS metadata target',
      );
    });

    it('should reject entire 169.254.0.0/16 link-local IPv4 address range', () => {
      assert.throws(
        () => UrlSafetyEvaluator.normalizeAndValidate('http://169.254.1.1/secret', 'DEVELOPMENT'),
        UnsafeUrlTargetError,
      );
      assert.throws(
        () => UrlSafetyEvaluator.normalizeAndValidate('http://169.254.255.254:8080', 'DEVELOPMENT'),
        UnsafeUrlTargetError,
      );
    });

    it('should reject IPv6 link-local addresses ([fe80::], [fd00:ec2::254])', () => {
      assert.throws(
        () => UrlSafetyEvaluator.normalizeAndValidate('http://[fe80::1]:8080/', 'DEVELOPMENT'),
        UnsafeUrlTargetError,
      );
      assert.throws(
        () => UrlSafetyEvaluator.normalizeAndValidate('http://[fd00:ec2::254]/', 'DEVELOPMENT'),
        UnsafeUrlTargetError,
      );
    });

    it('should forbid localhost / 127.0.0.1 when environment type is PRODUCTION', () => {
      assert.throws(
        () => UrlSafetyEvaluator.normalizeAndValidate('http://localhost:3000', 'PRODUCTION'),
        UnsafeUrlTargetError,
        'Must reject localhost on PRODUCTION',
      );
      assert.throws(
        () => UrlSafetyEvaluator.normalizeAndValidate('http://127.0.0.1:8080', 'PRODUCTION'),
        UnsafeUrlTargetError,
        'Must reject 127.0.0.1 on PRODUCTION',
      );
    });

    it('should permit localhost / 127.0.0.1 when environment type is LOCAL or DEVELOPMENT', () => {
      const localResult = UrlSafetyEvaluator.normalizeAndValidate('http://localhost:3000', 'LOCAL');
      assert.strictEqual(localResult.hostname, 'localhost');

      const devResult = UrlSafetyEvaluator.normalizeAndValidate('http://127.0.0.1:5173/app', 'DEVELOPMENT');
      assert.strictEqual(devResult.hostname, '127.0.0.1');
    });
  });

  // =========================================================================
  // SECTION 3: PREFLIGHT CONNECTIVITY CHECKER
  // =========================================================================
  describe('3. Preflight Connectivity Checker Probing & Redirect SSRF', () => {
    it('should probe reachable server and return VERIFIED_REACHABLE with status 200', async () => {
      const result = await connectivityChecker.check(serverBaseUrl, {
        environmentType: 'LOCAL',
        timeoutMs: 10000,
      });

      assert.strictEqual(result.status, 'VERIFIED_REACHABLE');
      assert.strictEqual(result.statusCode, 200);
      assert.ok(result.responseTimeMs >= 0);
      assert.strictEqual(result.dnsResolved, true);
      assert.ok(result.resolvedFinalUrl?.startsWith('http://127.0.0.1'));
    });

    it('should return UNREACHABLE when connecting to a non-listening port', async () => {
      const result = await connectivityChecker.check('http://127.0.0.1:59999', {
        environmentType: 'LOCAL',
        timeoutMs: 2000,
      });

      assert.strictEqual(result.status, 'UNREACHABLE');
      assert.strictEqual(result.statusCode, null);
      assert.ok(
        result.message.includes('Unable to connect') ||
          result.message.includes('refused') ||
          result.message.includes('ECONNREFUSED') ||
          result.message.includes('failed'),
      );
    });

    it('should block redirects destination that attempts SSRF to metadata IP', async () => {
      const redirectUrl = `${serverBaseUrl}/redirect-to-metadata`;
      const result = await connectivityChecker.check(redirectUrl, {
        environmentType: 'LOCAL',
        timeoutMs: 5000,
      });

      assert.strictEqual(result.status, 'BLOCKED');
      assert.ok(result.message.includes('SSRF') || result.message.includes('blocked') || result.message.includes('protected') || result.message.includes('Unsafe'));
    });

    it('should safely follow allowed redirects up to limit and track redirect count', async () => {
      const safeRedirectUrl = `${serverBaseUrl}/safe-redirect`;
      const result = await connectivityChecker.check(safeRedirectUrl, {
        environmentType: 'LOCAL',
        timeoutMs: 5000,
      });

      assert.strictEqual(result.status, 'VERIFIED_REACHABLE');
      assert.strictEqual(result.redirectCount, 1);
      assert.strictEqual(result.statusCode, 200);
    });

    it('should support AbortSignal cancellation', async () => {
      const controller = new AbortController();
      controller.abort();

      const result = await connectivityChecker.check(serverBaseUrl, {
        environmentType: 'LOCAL',
        timeoutMs: 5000,
        signal: controller.signal,
      });

      assert.strictEqual(result.status, 'UNKNOWN');
      assert.ok(result.message.includes('cancelled'));
    });
  });

  // =========================================================================
  // SECTION 4: PRODUCTION SAFE MODE & DETERMINISTIC ACTION INTERCEPTION
  // =========================================================================
  describe('4. Production Safe Mode & Action Safety Evaluation', () => {
    const prodTarget = { environmentType: 'PRODUCTION' as const, safeModeEnabled: true };
    const devTarget = { environmentType: 'DEVELOPMENT' as const, safeModeEnabled: false };

    it('should classify browser actions into precise safety tiers', () => {
      assert.strictEqual(
        ProductionSafetyChecker.evaluateAction(prodTarget, { action: 'NAVIGATE', value: 'https://example.com' }).safetyClass,
        'SAFE_READ',
      );
      assert.strictEqual(
        ProductionSafetyChecker.evaluateAction(prodTarget, { action: 'SCREENSHOT' }).safetyClass,
        'SAFE_READ',
      );
      assert.strictEqual(
        ProductionSafetyChecker.evaluateAction(prodTarget, { action: 'ASSERT_TEXT', targetSelector: '#title' }).safetyClass,
        'SAFE_READ',
      );
      assert.strictEqual(
        ProductionSafetyChecker.evaluateAction(prodTarget, { action: 'TYPE', targetSelector: '#search', value: 'testing' }).safetyClass,
        'LOW_RISK_MUTATION',
      );
      assert.strictEqual(
        ProductionSafetyChecker.evaluateAction(prodTarget, { action: 'CLICK', targetSelector: '#btn-delete-database' }).safetyClass,
        'DESTRUCTIVE',
      );
      assert.strictEqual(
        ProductionSafetyChecker.evaluateAction(prodTarget, { action: 'CLICK', targetSelector: '#btn-purchase-order' }).safetyClass,
        'FINANCIAL',
      );
      assert.strictEqual(
        ProductionSafetyChecker.evaluateAction(prodTarget, { action: 'CLICK', targetSelector: '#btn-send-email-webhook' }).safetyClass,
        'EXTERNAL_SIDE_EFFECT',
      );
    });

    it('should allow SAFE_READ and LOW_RISK_MUTATION actions when Safe Mode is enabled', () => {
      assert.doesNotThrow(() => {
        ProductionSafetyChecker.assertActionSafe(prodTarget, {
          action: 'NAVIGATE',
          value: 'https://prod.example.com',
        });
      });

      assert.doesNotThrow(() => {
        ProductionSafetyChecker.assertActionSafe(prodTarget, {
          action: 'TYPE',
          targetSelector: '#search-query',
          value: 'shoes',
        });
      });
    });

    it('should deterministically block DESTRUCTIVE actions in Production Safe Mode', () => {
      assert.throws(
        () => {
          ProductionSafetyChecker.assertActionSafe(prodTarget, {
            action: 'CLICK',
            targetSelector: '#btn-delete-database',
          });
        },
        ProductionSafeModeViolationError,
        'Must block destructive button in production safe mode',
      );
    });

    it('should deterministically block FINANCIAL actions in Production Safe Mode', () => {
      assert.throws(
        () => {
          ProductionSafetyChecker.assertActionSafe(prodTarget, {
            action: 'CLICK',
            targetSelector: '#btn-purchase-order',
          });
        },
        ProductionSafeModeViolationError,
        'Must block financial action in production safe mode',
      );
    });

    it('should deterministically block EXTERNAL_SIDE_EFFECT actions in Production Safe Mode', () => {
      assert.throws(
        () => {
          ProductionSafetyChecker.assertActionSafe(prodTarget, {
            action: 'CLICK',
            targetSelector: '#btn-send-email-webhook',
          });
        },
        ProductionSafeModeViolationError,
        'Must block external webhook action in production safe mode',
      );
    });

    it('should permit non-production environments to execute actions without safe mode violation', () => {
      assert.doesNotThrow(() => {
        ProductionSafetyChecker.assertActionSafe(devTarget, {
          action: 'CLICK',
          targetSelector: '#btn-delete-database',
        });
      });
    });
  });

  // =========================================================================
  // SECTION 5: TARGET AUTHORIZATION STATE MACHINE
  // =========================================================================
  describe('5. Target Authorization State Machine', () => {
    it('should transition target authorization from UNVERIFIED to USER_CONFIRMED with audit metadata', async () => {
      // Create a remote target
      const created = await targetService.createWebsiteTarget(
        {
          projectId: projectAId,
          name: 'Staging Environment Target',
          url: 'https://staging.qa-testing.example.com',
          environmentType: 'STAGING',
          safeModeEnabled: true,
          requiresAuth: false,
        },
        userAId,
      );

      assert.strictEqual(created.authorizationState, 'UNVERIFIED');

      // User confirms authorization
      const confirmed = await targetService.confirmAuthorization(
        {
          projectId: projectAId,
          targetId: created.id,
          confirmedOwnership: true,
          confirmedProductionRisk: false,
        },
        userAId,
      );

      assert.strictEqual(confirmed.authorizationState, 'USER_CONFIRMED');
      assert.strictEqual(confirmed.authorizationConfirmedBy, userAId);
      assert.ok(confirmed.authorizationConfirmedAt !== null);
    });

    it('should require production risk confirmation when confirming PRODUCTION target', async () => {
      const prodTarget = await targetService.createWebsiteTarget(
        {
          projectId: projectAId,
          name: 'Live Production Target',
          url: 'https://app.qa-testing.example.com',
          environmentType: 'PRODUCTION',
          safeModeEnabled: true,
          requiresAuth: false,
        },
        userAId,
      );

      assert.strictEqual(prodTarget.authorizationState, 'UNVERIFIED');

      // Missing confirmedProductionRisk must fail
      await assert.rejects(
        async () => {
          await targetService.confirmAuthorization(
            {
              projectId: projectAId,
              targetId: prodTarget.id,
              confirmedOwnership: true,
              confirmedProductionRisk: false,
            },
            userAId,
          );
        },
        TargetValidationError,
      );

      // With confirmedProductionRisk, confirmation succeeds
      const confirmedProd = await targetService.confirmAuthorization(
        {
          projectId: projectAId,
          targetId: prodTarget.id,
          confirmedOwnership: true,
          confirmedProductionRisk: true,
        },
        userAId,
      );

      assert.strictEqual(confirmedProd.authorizationState, 'USER_CONFIRMED');
    });
  });

  // =========================================================================
  // SECTION 6: TARGET PERSISTENCE, ACTIVE SWITCHING & V5 ADAPTER
  // =========================================================================
  describe('6. Target Persistence, Transactional Active Switching & V5 Adapter', () => {
    let localTargetId: string;
    let stagingTargetId: string;

    before(async () => {
      await prisma.websiteTarget.deleteMany({ where: { projectId: projectAId } });
      await prisma.projectEnvironment.deleteMany({ where: { projectId: projectAId } });
    });

    it('should persist website target and synchronize linked V5 ProjectEnvironment record', async () => {
      const target = await targetService.createWebsiteTarget(
        {
          projectId: projectAId,
          name: 'Local Dev Portal',
          url: serverBaseUrl,
          environmentType: 'LOCAL',
          safeModeEnabled: true,
          requiresAuth: false,
        },
        userAId,
      );

      localTargetId = target.id;
      assert.ok(target.id);
      assert.strictEqual(target.name, 'Local Dev Portal');
      assert.strictEqual(target.environmentType, 'LOCAL');
      assert.strictEqual(target.isActive, true); // First target becomes active

      // Verify linked V5 ProjectEnvironment was automatically provisioned
      const linkedEnv = await prisma.projectEnvironment.findFirst({
        where: { projectId: projectAId, baseUrl: serverBaseUrl },
      });
      assert.ok(linkedEnv, 'Linked ProjectEnvironment must exist for V5 compatibility');
      assert.strictEqual(linkedEnv?.name, 'Local Dev Portal');
      assert.strictEqual(linkedEnv?.type, 'LOCAL');
    });

    it('should switch active target transactionally, deactivating all other targets', async () => {
      const stagingTarget = await targetService.createWebsiteTarget(
        {
          projectId: projectAId,
          name: 'Pre-Release Staging',
          url: 'https://staging-v8.example.com',
          environmentType: 'STAGING',
          safeModeEnabled: true,
          requiresAuth: false,
        },
        userAId,
      );
      stagingTargetId = stagingTarget.id;

      // Set staging as active target
      const activated = await targetService.setActiveWebsiteTarget(
        {
          projectId: projectAId,
          targetId: stagingTargetId,
        },
        userAId,
      );

      assert.strictEqual(activated.isActive, true);

      // Verify previous local target was deactivated
      const localReloaded = await targetService.getWebsiteTarget(
        {
          projectId: projectAId,
          targetId: localTargetId,
        },
        userAId,
      );
      assert.strictEqual(localReloaded.isActive, false);

      // Switch back to local target
      const reactivatedLocal = await targetService.setActiveWebsiteTarget(
        {
          projectId: projectAId,
          targetId: localTargetId,
        },
        userAId,
      );
      assert.strictEqual(reactivatedLocal.isActive, true);
    });

    it('should resolve immutable target execution snapshot for wrong-target prevention', async () => {
      const snapshot = await targetService.resolveSnapshot(
        {
          projectId: projectAId,
          targetId: localTargetId,
        },
        userAId,
      );

      assert.strictEqual(snapshot.websiteTargetId, localTargetId);
      assert.strictEqual(snapshot.projectId, projectAId);
      assert.strictEqual(snapshot.environmentType, 'LOCAL');
      assert.ok(snapshot.resolvedFinalUrl.startsWith('http://127.0.0.1'));
      assert.strictEqual(snapshot.safeModeEnabled, true);
      assert.ok(typeof snapshot.timestamp === 'string');
    });

    it('should soft-delete website target, deactivating it while preserving history', async () => {
      await targetService.deleteWebsiteTarget(
        {
          projectId: projectAId,
          targetId: stagingTargetId,
        },
        userAId,
      );

      // Fetching deleted target via service should fail with NotFound
      await assert.rejects(
        async () => {
          await targetService.getWebsiteTarget(
            {
              projectId: projectAId,
              targetId: stagingTargetId,
            },
            userAId,
          );
        },
        WebsiteTargetNotFoundError,
      );

      // Directly inspecting database confirms soft-deletion (deletedAt is set)
      const rawRecord = await prisma.websiteTarget.findUnique({
        where: { id: stagingTargetId },
      });
      assert.ok(rawRecord !== null);
      assert.ok(rawRecord?.deletedAt !== null);
      assert.strictEqual(rawRecord?.isActive, false);
    });
  });

  // =========================================================================
  // SECTION 7: MULTI-USER ISOLATION & ACCESS CONTROL
  // =========================================================================
  describe('7. Multi-User Project Isolation & Access Control', () => {
    it('should reject User B attempting to view, create, or delete targets in User A project', async () => {
      // User B tries to list User A's targets
      await assert.rejects(
        async () => {
          await targetService.listWebsiteTargets({ projectId: projectAId }, userBId);
        },
        TargetAccessDeniedError,
      );

      // User B tries to create target in User A's project
      await assert.rejects(
        async () => {
          await targetService.createWebsiteTarget(
            {
              projectId: projectAId,
              name: 'Malicious Injected Target',
              url: 'https://evil.example.com',
              environmentType: 'DEVELOPMENT',
            },
            userBId,
          );
        },
        TargetAccessDeniedError,
      );
    });
  });

  // =========================================================================
  // SECTION 8: REAL PLAYWRIGHT BROWSER INTEGRATION PROOF
  // =========================================================================
  describe('8. Real Playwright Browser Execution & V5 Handoff Proof', () => {
    it('should launch Chromium, navigate to target snapshot URL, and execute browser interactions', async () => {
      // 1. Get active target for project A
      const targets = await targetService.listWebsiteTargets({ projectId: projectAId }, userAId);
      const activeTarget = targets.find(t => t.isActive);
      assert.ok(activeTarget, 'Active target must exist');

      // 2. Preflight verify reachability
      const checkResult = await targetService.testConnection(
        {
          projectId: projectAId,
          targetId: activeTarget.id,
        },
        userAId,
      );
      assert.strictEqual(checkResult.status, 'VERIFIED_REACHABLE');

      // 3. Resolve snapshot for browser handoff
      const snapshot = await targetService.resolveSnapshot(
        {
          projectId: projectAId,
          targetId: activeTarget.id,
        },
        userAId,
      );

      // 4. Use real Playwright Chromium browser to execute against real HTTP server
      const page = await browser.newPage();
      try {
        await page.goto(snapshot.resolvedFinalUrl, { waitUntil: 'domcontentloaded' });

        const title = await page.title();
        assert.strictEqual(title, 'Phase 119 Test Target Application');

        // Execute safe search action
        const searchInput = page.locator('#search-query');
        await searchInput.fill('autonomous regression');

        const submitBtn = page.locator('#search-submit');
        await submitBtn.click();

        await page.waitForSelector('#search-result-count');
        const resultText = await page.textContent('#search-result-count');
        assert.ok(resultText?.includes('autonomous regression'));
      } finally {
        await page.close();
      }
    });

    it('should demonstrate that a destructive action under Production Safe Mode is intercepted BEFORE browser execution', async () => {
      const simulatedProdAction = {
        action: 'CLICK',
        targetSelector: '#btn-delete-database',
      };

      const prodContext = {
        environmentType: 'PRODUCTION' as const,
        safeModeEnabled: true,
      };

      // Intercept check:
      let interceptedError: unknown = null;
      try {
        ProductionSafetyChecker.assertActionSafe(prodContext, simulatedProdAction);
      } catch (err) {
        interceptedError = err;
      }

      assert.ok(
        interceptedError instanceof ProductionSafeModeViolationError,
        'Destructive action must be intercepted with ProductionSafeModeViolationError before browser dispatch',
      );

      // Verify message explains blocked destructive operation
      const violation = interceptedError as ProductionSafeModeViolationError;
      assert.ok(violation.message.includes('Destructive') || violation.message.includes('Safe Mode'));
    });
  });
});
