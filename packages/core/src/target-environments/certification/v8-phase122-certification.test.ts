/**
 * @file packages/core/src/target-environments/certification/v8-phase122-certification.test.ts
 * Comprehensive Certification Test Suite for V8 Phase 122:
 * Browser, Target Environment, and Authentication Configuration.
 *
 * CERTIFICATION INVARIANTS:
 * 1. Target URL validation, normalization, and protocol allowlist (http/https).
 * 2. SSRF prevention and production loopback restrictions.
 * 3. Real network connectivity probes with redirect chain following and latency measurement.
 * 4. Multi-environment profiles (Development, Staging, Production) with transactional active switching.
 * 5. Browser configuration (Chromium, Firefox, WebKit, headed/headless, viewport bounds).
 * 6. AES-256-GCM Credential Vault with AAD context binding and tamper resistance.
 * 7. Secret redaction: zero plaintext credentials in DB, audit logs, or error messages.
 * 8. Real Playwright browser authentication execution (Form login, success & failure verification).
 * 9. Multi-tenant project isolation (Project A != Project B, User A != User B).
 * 10. Downstream execution target resolution and authoritative audit logging.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { getPrismaClient } from '../../database/client.js';
import { TargetEnvironmentService } from '../target-environment-service.js';
import { TargetAuthVault } from '../target-auth-vault.js';
import { TargetEnvValidator } from '../target-env-validator.js';
import { SecretRedactor } from '../../execution/sessions/secret-redactor.js';
import {
  TargetEnvAccessDeniedError,
  TargetEnvValidationError,
  TargetEnvProductionSafetyError,
} from '../target-env-errors.js';
import type { PrismaClient } from '@prisma/client';

describe('V8 Phase 122 — Target Environment, Browser & Authentication Certification Suite', () => {
  let prisma: PrismaClient;
  let testServer: http.Server;
  let serverPort: number;
  let serverBaseUrl: string;
  let envService: TargetEnvironmentService;
  let vault: TargetAuthVault;

  // Test User & Project IDs
  const userAId = '00000000-0000-0000-0000-000000000122';
  const userBId = '00000000-0000-0000-0000-000000000123';
  const projectAId = '00000000-0000-0000-0000-000000001220';
  const projectBId = '00000000-0000-0000-0000-000000001221';

  before(async () => {
    const client = getPrismaClient();
    if (!client) {
      throw new Error('PostgreSQL database required for Phase 122 certification.');
    }
    prisma = client;
    vault = new TargetAuthVault();
    envService = new TargetEnvironmentService({ prisma, vault });

    // 1. Launch real HTTP server fixture with form login, redirects, and authenticated pages
    testServer = http.createServer((req, res) => {
      const url = new URL(req.url || '/', `http://${req.headers.host}`);

      // Landing / Home page
      if (url.pathname === '/') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`
          <!DOCTYPE html>
          <html>
            <head><title>App Home</title></head>
            <body>
              <h1>Welcome to Target Application</h1>
              <a href="/login" id="link-login">Sign In</a>
            </body>
          </html>
        `);
        return;
      }

      // Login form page
      if (url.pathname === '/login' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`
          <!DOCTYPE html>
          <html>
            <head><title>Login</title></head>
            <body>
              <form id="login-form" action="/login" method="POST">
                <input type="text" id="username" name="username" placeholder="Username" />
                <input type="password" id="password" name="password" placeholder="Password" />
                <button type="submit" id="login-submit">Log In</button>
              </form>
              <div id="error-box" style="display:none;"></div>
            </body>
          </html>
        `);
        return;
      }

      // Login form submit handler
      if (url.pathname === '/login' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
          const params = new URLSearchParams(body);
          const u = params.get('username');
          const p = params.get('password');

          if (u === 'admin@example.com' && p === 'valid-secret-password-122') {
            res.writeHead(302, {
              Location: '/dashboard',
              'Set-Cookie': 'auth_session=valid-session-token-122; Path=/; HttpOnly',
            });
            res.end();
          } else {
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(`
              <!DOCTYPE html>
              <html>
                <head><title>Login Failed</title></head>
                <body>
                  <div id="login-error">Invalid username or password</div>
                </body>
              </html>
            `);
          }
        });
        return;
      }

      // Authenticated Dashboard
      if (url.pathname === '/dashboard') {
        const cookie = req.headers.cookie || '';
        if (cookie.includes('auth_session=valid-session-token-122')) {
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(`
            <!DOCTYPE html>
            <html>
              <head><title>Dashboard</title></head>
              <body>
                <h1 id="user-dashboard-title">Quality Engineering Dashboard</h1>
                <div id="user-avatar">Admin Profile</div>
              </body>
            </html>
          `);
        } else {
          res.writeHead(302, { Location: '/login?expired=1' });
          res.end();
        }
        return;
      }

      // Redirect hops
      if (url.pathname === '/redirect-step-1') {
        res.writeHead(301, { Location: '/redirect-step-2' });
        res.end();
        return;
      }
      if (url.pathname === '/redirect-step-2') {
        res.writeHead(302, { Location: '/' });
        res.end();
        return;
      }

      // API health route
      if (url.pathname === '/api/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'UP', timestamp: new Date().toISOString() }));
        return;
      }

      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
    });

    await new Promise<void>((resolve, reject) => {
      testServer.listen(0, '127.0.0.1', () => {
        const addr = testServer.address() as AddressInfo;
        serverPort = addr.port;
        serverBaseUrl = `http://127.0.0.1:${serverPort}`;
        resolve();
      });
      testServer.on('error', reject);
    });

    // 2. Clean up old test data
    await prisma.authAuditEvent.deleteMany({
      where: { userId: { in: [userAId, userBId] } },
    });
    await prisma.authenticationProfile.deleteMany({
      where: { environment: { projectId: { in: [projectAId, projectBId] } } },
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

    // 3. Seed test users
    await prisma.user.create({
      data: {
        id: userAId,
        email: 'user-a-122@example.com',
        normalizedEmail: 'user-a-122@example.com',
        displayName: 'User A (Phase 122)',
      },
    });

    await prisma.user.create({
      data: {
        id: userBId,
        email: 'user-b-122@example.com',
        normalizedEmail: 'user-b-122@example.com',
        displayName: 'User B (Phase 122)',
      },
    });

    // 4. Seed test projects
    await prisma.project.create({
      data: {
        id: projectAId,
        userId: userAId,
        name: 'Project Alpha (Phase 122)',
        description: 'Target Environment Certification Project Alpha',
      },
    });

    await prisma.project.create({
      data: {
        id: projectBId,
        userId: userBId,
        name: 'Project Beta (Phase 122)',
        description: 'Isolated Project Beta',
      },
    });
  });

  after(async () => {
    if (testServer) {
      await new Promise<void>(resolve => testServer.close(() => resolve()));
    }
    if (prisma) {
      await prisma.authAuditEvent.deleteMany({
        where: { userId: { in: [userAId, userBId] } },
      });
      await prisma.authenticationProfile.deleteMany({
        where: { environment: { projectId: { in: [projectAId, projectBId] } } },
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
    }
  });

  describe('Target URL Validation & SSRF Firewall', () => {
    it('validates and normalizes valid web target URLs', () => {
      const res = TargetEnvValidator.validateAndNormalizeUrl('HTTP://example.com:8080/app/');
      assert.strictEqual(res.normalizedUrl, 'http://example.com:8080/app/');
      assert.strictEqual(res.protocol, 'http:');
      assert.strictEqual(res.hostname, 'example.com');
      assert.strictEqual(res.port, 8080);
      assert.strictEqual(res.isLoopback, false);
    });

    it('rejects malformed or empty URLs with TargetEnvValidationError', () => {
      assert.throws(
        () => TargetEnvValidator.validateAndNormalizeUrl(''),
        (err: Error) => err instanceof TargetEnvValidationError,
      );
      assert.throws(
        () => TargetEnvValidator.validateAndNormalizeUrl('not-a-valid-url'),
        (err: Error) => err instanceof TargetEnvValidationError,
      );
    });

    it('rejects disallowed protocols (ftp, file, javascript)', () => {
      assert.throws(
        () => TargetEnvValidator.validateAndNormalizeUrl('ftp://ftp.example.com/files'),
        (err: Error) => err instanceof TargetEnvValidationError && err.message.includes('protocol'),
      );
      assert.throws(
        () => TargetEnvValidator.validateAndNormalizeUrl('javascript:alert(1)'),
        (err: Error) => err instanceof TargetEnvValidationError,
      );
    });

    it('blocks SSRF attacks against cloud metadata IPs', () => {
      assert.throws(
        () => TargetEnvValidator.validateAndNormalizeUrl('http://169.254.169.254/latest/meta-data/'),
        (err: Error) => err instanceof TargetEnvValidationError && err.message.includes('metadata'),
      );
    });

    it('prevents loopback URLs on PRODUCTION environments', () => {
      assert.throws(
        () => TargetEnvValidator.validateAndNormalizeUrl('http://localhost:3000', 'PRODUCTION', true),
        (err: Error) => err instanceof TargetEnvProductionSafetyError,
      );
      assert.throws(
        () => TargetEnvValidator.validateAndNormalizeUrl('http://127.0.0.1:8080', 'PRODUCTION', true),
        (err: Error) => err instanceof TargetEnvProductionSafetyError,
      );
    });
  });

  describe('Real Network Probing & Redirect Handling (testConnection)', () => {
    it('probes live HTTP server successfully with latency measurement', async () => {
      const probe = await envService.testConnection(userAId, {
        projectId: projectAId,
        url: serverBaseUrl,
      });

      assert.strictEqual(probe.reachable, true);
      assert.strictEqual(probe.statusCode, 200);
      assert.ok(probe.responseTimeMs >= 0);
      assert.strictEqual(probe.finalUrl, serverBaseUrl);
      assert.strictEqual(probe.redirectCount, 0);
    });

    it('follows redirect hops and reports final destination URL', async () => {
      const probe = await envService.testConnection(userAId, {
        projectId: projectAId,
        url: `${serverBaseUrl}/redirect-step-1`,
      });

      assert.strictEqual(probe.reachable, true);
      assert.strictEqual(probe.statusCode, 200);
      assert.strictEqual(probe.redirectCount, 2);
      assert.strictEqual(probe.finalUrl, `${serverBaseUrl}/`);
    });

    it('reports unreachable status when target port is closed or invalid', async () => {
      const probe = await envService.testConnection(userAId, {
        projectId: projectAId,
        url: 'http://127.0.0.1:59998/closed',
      });

      assert.strictEqual(probe.reachable, false);
      assert.strictEqual(probe.statusCode, null);
      assert.ok(probe.errorMessage !== null);
    });
  });

  describe('Environment Profiles & Transactional Switching', () => {
    let devEnvId: string;
    let stagingEnvId: string;
    let prodEnvId: string;

    it('creates isolated Development, Staging, and Production environment profiles', async () => {
      // 1. Dev environment
      const dev = await envService.saveEnvironment(userAId, {
        projectId: projectAId,
        name: 'Development',
        type: 'DEVELOPMENT',
        baseUrl: `${serverBaseUrl}/`,
        apiUrl: `${serverBaseUrl}/api`,
        browserEngine: 'chromium',
        headless: true,
        viewportWidth: 1280,
        viewportHeight: 720,
        ignoreHttpsErrors: false,
        isDefault: true,
        isEnabled: true,
        isProduction: false,
        productionSafetyPolicy: 'SAFE_MODE',
      });
      devEnvId = dev.id;
      assert.strictEqual(dev.name, 'Development');
      assert.strictEqual(dev.isDefault, true);

      // 2. Staging environment
      const staging = await envService.saveEnvironment(userAId, {
        projectId: projectAId,
        name: 'Staging',
        type: 'STAGING',
        baseUrl: 'https://staging.example.com',
        apiUrl: 'https://api-staging.example.com',
        browserEngine: 'firefox',
        headless: true,
        viewportWidth: 1440,
        viewportHeight: 900,
        ignoreHttpsErrors: false,
        isDefault: false,
        isEnabled: true,
        isProduction: false,
        productionSafetyPolicy: 'SAFE_MODE',
      });
      stagingEnvId = staging.id;
      assert.strictEqual(staging.name, 'Staging');
      assert.strictEqual(staging.browserEngine, 'firefox');
      assert.strictEqual(staging.isDefault, false);

      // 3. Production environment
      const prod = await envService.saveEnvironment(userAId, {
        projectId: projectAId,
        name: 'Production',
        type: 'PRODUCTION',
        baseUrl: 'https://app.example.com',
        browserEngine: 'webkit',
        headless: true,
        viewportWidth: 1920,
        viewportHeight: 1080,
        ignoreHttpsErrors: false,
        isDefault: false,
        isEnabled: true,
        isProduction: true,
        productionSafetyPolicy: 'PROHIBITED',
      });
      prodEnvId = prod.id;
      assert.strictEqual(prod.name, 'Production');
      assert.strictEqual(prod.isProduction, true);
    });

    it('lists all configured environments for Project A with correct metadata', async () => {
      const list = await envService.listEnvironments(userAId, { projectId: projectAId });
      assert.strictEqual(list.length, 3);
      assert.ok(list.some(e => e.id === devEnvId && e.isDefault));
      assert.ok(list.some(e => e.id === stagingEnvId && !e.isDefault));
      assert.ok(list.some(e => e.id === prodEnvId && e.isProduction));
    });

    it('transactionally switches active environment without collision', async () => {
      // Switch active target to Staging
      const switched = await envService.setActiveEnvironment(userAId, {
        projectId: projectAId,
        environmentId: stagingEnvId,
      });

      assert.strictEqual(switched.id, stagingEnvId);
      assert.strictEqual(switched.isDefault, true);

      // Verify dev is no longer default
      const list = await envService.listEnvironments(userAId, { projectId: projectAId });
      const dev = list.find(e => e.id === devEnvId);
      const staging = list.find(e => e.id === stagingEnvId);

      assert.strictEqual(dev?.isDefault, false);
      assert.strictEqual(staging?.isDefault, true);

      // Switch back to Dev
      await envService.setActiveEnvironment(userAId, {
        projectId: projectAId,
        environmentId: devEnvId,
      });
    });
  });

  describe('Browser Selection & Viewport Configuration', () => {
    it('validates supported browser engines (chromium, firefox, webkit)', () => {
      assert.doesNotThrow(() => TargetEnvValidator.validateBrowserEngine('chromium'));
      assert.doesNotThrow(() => TargetEnvValidator.validateBrowserEngine('firefox'));
      assert.doesNotThrow(() => TargetEnvValidator.validateBrowserEngine('webkit'));

      assert.throws(
        () => TargetEnvValidator.validateBrowserEngine('opera' as unknown as 'chromium'),
        (err: Error) => err instanceof TargetEnvValidationError,
      );
    });

    it('enforces viewport dimension boundary limits', () => {
      assert.doesNotThrow(() => TargetEnvValidator.validateViewport(1280, 720));
      assert.doesNotThrow(() => TargetEnvValidator.validateViewport(320, 240));

      // Viewport too small
      assert.throws(
        () => TargetEnvValidator.validateViewport(200, 720),
        (err: Error) => err instanceof TargetEnvValidationError,
      );

      // Viewport too large
      assert.throws(
        () => TargetEnvValidator.validateViewport(1280, 4000),
        (err: Error) => err instanceof TargetEnvValidationError,
      );
    });
  });

  describe('Authentication Vault & Secret Protection', () => {
    const rawSecret = 'valid-secret-password-122';
    const contextKey = `${projectAId}:test-env-id`;
    let encryptedPayload: string;

    it('encrypts credentials using AES-256-GCM vault with context binding', async () => {
      encryptedPayload = await vault.encrypt(rawSecret, contextKey);

      assert.ok(encryptedPayload.startsWith('v1:'));
      assert.strictEqual(encryptedPayload.split(':').length, 4);
      assert.ok(!encryptedPayload.includes(rawSecret)); // Ciphertext never contains plain password
    });

    it('decrypts authenticated credentials matching the context key', async () => {
      const decrypted = await vault.decrypt(encryptedPayload, contextKey);
      assert.strictEqual(decrypted, rawSecret);
    });

    it('detects tampering and rejects invalid authentication tags', async () => {
      const parts = encryptedPayload.split(':');
      // Corrupt the ciphertext
      const last = parts[3] ?? '';
      parts[3] = last.slice(0, -2) + (last.endsWith('a') ? 'b' : 'a');
      const tampered = parts.join(':');

      await assert.rejects(
        async () => {
          await vault.decrypt(tampered, contextKey);
        },
        (err: Error) => err instanceof TargetEnvValidationError,
      );
    });

    it('rejects decryption when context key is swapped (cross-project attack)', async () => {
      const foreignContext = `${projectBId}:test-env-id`;
      await assert.rejects(
        async () => {
          await vault.decrypt(encryptedPayload, foreignContext);
        },
        (err: Error) => err instanceof TargetEnvValidationError,
      );
    });

    it('registers decrypted secret with SecretRedactor and masks UI previews', () => {
      const preview = vault.maskPreview(rawSecret);
      assert.ok(!preview.includes(rawSecret));
      assert.strictEqual(preview, '••••••••');

      // Verify SecretRedactor redacts the secret from strings
      const logMessage = `Attempting login with credentials ${rawSecret} at target endpoint`;
      const sanitized = SecretRedactor.redactText(logMessage);
      assert.ok(!sanitized.includes(rawSecret));
      assert.ok(sanitized.includes('***'));
    });
  });

  describe('Real Playwright Browser Authentication Execution', () => {
    let authEnvId: string;

    before(async () => {
      // Create environment with Form Login authentication profile
      const saved = await envService.saveEnvironment(userAId, {
        projectId: projectAId,
        name: 'Auth Testing Target',
        type: 'DEVELOPMENT',
        baseUrl: serverBaseUrl,
        browserEngine: 'chromium',
        headless: true,
        viewportWidth: 1280,
        viewportHeight: 720,
        ignoreHttpsErrors: false,
        isDefault: false,
        isEnabled: true,
        isProduction: false,
        productionSafetyPolicy: 'SAFE_MODE',
        auth: {
          strategy: 'FORM_LOGIN',
          loginUrl: `${serverBaseUrl}/login`,
          username: 'admin@example.com',
          password: 'valid-secret-password-122',
          usernameFieldSelector: '#username',
          passwordFieldSelector: '#password',
          submitControlSelector: '#login-submit',
          successValidationType: 'URL_MATCH',
          successValidationValue: '/dashboard',
        },
      });
      authEnvId = saved.id;
    });

    it('launches real Playwright browser, authenticates, and verifies URL match', async () => {
      const result = await envService.testAuthentication(userAId, {
        projectId: projectAId,
        environmentId: authEnvId,
        browserEngine: 'chromium',
        headless: true,
      });

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.authenticated, true);
      assert.ok(result.finalUrl?.includes('/dashboard'));
      assert.strictEqual(result.errorMessage, null);
    });

    it('launches real Playwright browser and captures diagnostic failure evidence on invalid password', async () => {
      const result = await envService.testAuthentication(userAId, {
        projectId: projectAId,
        environmentId: authEnvId,
        temporaryPassword: 'incorrect-bad-password-999',
        browserEngine: 'chromium',
        headless: true,
      });

      assert.strictEqual(result.success, false);
      assert.strictEqual(result.authenticated, false);
      assert.ok(result.errorMessage !== null);
      assert.ok(result.diagnosticEvidence !== null);
      assert.ok(result.diagnosticEvidence?.screenshotBase64 !== undefined);
      assert.strictEqual(result.diagnosticEvidence?.failedStep, 'VALIDATION_CHECK');
    });
  });

  describe('Downstream Execution Target Resolution (resolveExecutionTarget)', () => {
    it('produces immutable execution target snapshot ready for Playwright engine', async () => {
      const devEnv = (await envService.listEnvironments(userAId, { projectId: projectAId }))
        .find(e => e.name === 'Development')!;

      const snapshot = await envService.resolveExecutionTarget(userAId, {
        projectId: projectAId,
        environmentId: devEnv.id,
      });

      assert.strictEqual(snapshot.projectId, projectAId);
      assert.strictEqual(snapshot.environmentId, devEnv.id);
      assert.strictEqual(snapshot.name, 'Development');
      assert.strictEqual(snapshot.type, 'DEVELOPMENT');
      assert.strictEqual(snapshot.browserEngine, 'chromium');
      assert.strictEqual(snapshot.headless, true);
      assert.strictEqual(snapshot.viewport.width, 1280);
      assert.strictEqual(snapshot.viewport.height, 720);
      assert.ok(snapshot.resolvedAt);
    });
  });

  describe('Project Tenant Isolation & Multi-User Security', () => {
    it('prevents User B from accessing Project A target environments', async () => {
      await assert.rejects(
        async () => {
          await envService.listEnvironments(userBId, { projectId: projectAId });
        },
        (err: Error) => err instanceof TargetEnvAccessDeniedError,
      );
    });

    it('prevents User B from modifying or deleting Project A environments', async () => {
      const devEnv = (await envService.listEnvironments(userAId, { projectId: projectAId }))[0]!;

      await assert.rejects(
        async () => {
          await envService.saveEnvironment(userBId, {
            projectId: projectAId,
            environmentId: devEnv.id,
            name: 'Hacked Env Name',
            type: 'DEVELOPMENT',
            baseUrl: 'http://evil.com',
            browserEngine: 'chromium',
            headless: true,
            viewportWidth: 1280,
            viewportHeight: 720,
            ignoreHttpsErrors: false,
            isEnabled: true,
            isProduction: false,
            productionSafetyPolicy: 'SAFE_MODE',
          });
        },
        (err: Error) => err instanceof TargetEnvAccessDeniedError,
      );

      await assert.rejects(
        async () => {
          await envService.deleteEnvironment(userBId, {
            projectId: projectAId,
            environmentId: devEnv.id,
          });
        },
        (err: Error) => err instanceof TargetEnvAccessDeniedError,
      );
    });
  });

  describe('Authoritative Audit Trail Verification', () => {
    it('records all 5 AuthAuditAction events with zero plaintext credentials', async () => {
      const auditEvents = await prisma.authAuditEvent.findMany({
        where: { userId: userAId },
        orderBy: { timestamp: 'desc' },
      });

      assert.ok(auditEvents.length >= 5);

      const actionTypes = new Set(auditEvents.map(e => e.action));
      assert.ok(actionTypes.has('TARGET_ENVIRONMENT_CONFIGURED'));
      assert.ok(actionTypes.has('TARGET_ENVIRONMENT_SWITCHED'));
      assert.ok(actionTypes.has('BROWSER_CONFIGURATION_CHANGED'));
      assert.ok(actionTypes.has('AUTH_CONFIGURATION_CHANGED'));
      assert.ok(actionTypes.has('AUTH_TEST_RESULT'));

      // Verify zero plaintext secrets in any audit event metadata
      for (const event of auditEvents) {
        const metadataStr = JSON.stringify(event.metadata ?? {});
        assert.ok(!metadataStr.includes('valid-secret-password-122'));
        assert.ok(!metadataStr.includes('incorrect-bad-password-999'));
      }
    });
  });
});
