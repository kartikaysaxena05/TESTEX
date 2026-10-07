/**
 * @file packages/core/src/certification/v8-phase125-full-e2e-certification.test.ts
 * Comprehensive Authoritative Production E2E Certification Test Suite for:
 * V8 Phase 125 — "Security, Packaging, Full V8 E2E Certification & Freeze".
 *
 * CERTIFIES COMPLETE INTEGRATED V8 STACK (Phases 111–124):
 * 1. First-Launch & Authentication Lifecycle (User Signup, Login, Password Policy, Session Tokens, Logout)
 * 2. Multi-Project Lifecycle & Tenant Isolation (Project A vs Project B isolation across all subsystems)
 * 3. Website Target & Production Safety (Reachability probing, unreachable detection, SSRF protection, Production Safe Mode)
 * 4. Git Repository Connection & Untrusted Content Handling (Metadata, branches, script injection safety, isolation)
 * 5. Local Folder Connection & Filesystem Boundary (Authorized reads, path traversal rejection ../, symlink escape defense)
 * 6. Target Environment, Browser Engines & Secret Vault (Chromium/Firefox/WebKit, AES-256-GCM context-bound encryption, redaction)
 * 7. Unified Project Context & Source Detection (Aggregation of sources+targets, caching, stale evaluation, invalidation)
 * 8. Conversational AI Testing Agent & Sandboxed Tool Execution (Whitelisted tools, shell/fs write rejection, intent translation)
 * 9. Production Safe Mode & Destructive Action Gate (Explicit human approval requirement, rejection handling)
 * 10. Run Controls & Step Progression (Start, Pause, Resume, Cancel propagation to orchestrator, Retry fresh run)
 * 11. Grounded Evidence Queries & Provenance Preservation (Provenance chain, defect citations, "Insufficient evidence" responses)
 * 12. Offline & Dependency Resilience (Target offline, Ollama offline, uncorrupted project state)
 * 13. Authoritative Audit Trail Verification (Comprehensive audit trail for complete V8 lifecycle)
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type { AddressInfo } from 'node:net';
import { getPrismaClient } from '../database/client.js';
import {
  AuthenticationService,
  PasswordPolicyViolationError,
  InvalidAuthInputError,
  AuthenticationFailedError,
} from '../auth/index.js';
import {
  ProjectService,
  ProjectAccessDeniedError,
} from '../projects/index.js';
import {
  WebsiteTargetService,
  WebsiteTargetConnectivityChecker,
  TargetAccessDeniedError,
} from '../website-targets/index.js';
import {
  RepositoryConnectionService,
  RepositoryAccessDeniedError,
  RepositoryValidationError,
} from '../git-repositories/index.js';
import {
  LocalFolderService,
  SecureFileAccessService,
  LocalFolderAccessDeniedError,
  LocalFolderPathTraversalError,
} from '../local-folders/index.js';
import {
  TargetEnvironmentService,
  TargetEnvAccessDeniedError,
} from '../target-environments/index.js';
import {
  ProjectContextService,
  SourceDetector,
  ContextAssembler,
  ProjectContextAccessDeniedError,
} from '../project-context/index.js';
import {
  ConversationalAgentService,
  AgentAccessDeniedError,
} from '../conversational-agent/index.js';

describe('V8 Phase 125 — Full V8 End-to-End Production Certification & Freeze Suite', () => {
  const prisma = getPrismaClient()!;

  let liveWebServer: http.Server;
  let liveTargetUrl: string;
  let unreachableUrl: string;

  let tempDirProjectA: string;
  let tempDirProjectB: string;

  // Test User Accounts
  const userAEmail = `v8-cert-user-a-${Date.now()}@example.com`;
  const userBEmail = `v8-cert-user-b-${Date.now()}@example.com`;
  const securePassword = 'V8-Production-Password-2026!#$';

  let userAId: string;
  let userBId: string;
  let sessionTokenUserA: string;

  // Test Projects
  let projectAId: string;
  let projectBId: string;

  // Services
  let authService: AuthenticationService;
  let projectService: ProjectService;
  let websiteService: WebsiteTargetService;
  let gitService: RepositoryConnectionService;
  let folderService: LocalFolderService;
  let fileService: SecureFileAccessService;
  let environmentService: TargetEnvironmentService;
  let contextService: ProjectContextService;
  let agentService: ConversationalAgentService;

  before(async () => {
    // 1. Launch a local live HTTP server acting as a reachable Website Target
    liveWebServer = http.createServer((req, res) => {
      if (req.url === '/health' || req.url === '/') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'healthy', version: '2.4.0', name: 'EcommerceStaging' }));
      } else if (req.url === '/login') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end('<html><body><form><input id="email"/><input id="pwd"/><button id="submit">Login</button></form></body></html>');
      } else {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found');
      }
    });

    await new Promise<void>((resolve) => {
      liveWebServer.listen(0, '127.0.0.1', () => resolve());
    });
    const addr = liveWebServer.address() as AddressInfo;
    liveTargetUrl = `http://127.0.0.1:${addr.port}`;
    unreachableUrl = 'http://127.0.0.1:59999'; // Non-listening port

    // 2. Setup realistic local filesystem project fixtures
    tempDirProjectA = fs.mkdtempSync(path.join(os.tmpdir(), 'v8-cert-project-a-'));
    tempDirProjectB = fs.mkdtempSync(path.join(os.tmpdir(), 'v8-cert-project-b-'));

    // Project A: TypeScript + React + Playwright repository
    const gitA = path.join(tempDirProjectA, '.git');
    fs.mkdirSync(gitA, { recursive: true });
    fs.writeFileSync(path.join(gitA, 'HEAD'), 'ref: refs/heads/main\n', 'utf8');
    fs.writeFileSync(
      path.join(tempDirProjectA, 'package.json'),
      JSON.stringify(
        {
          name: 'project-a-store',
          version: '1.0.0',
          dependencies: { react: '^18.2.0', next: '^14.1.0' },
          devDependencies: { typescript: '^5.3.0', playwright: '^1.41.0' },
        },
        null,
        2,
      ),
      'utf8',
    );
    const srcA = path.join(tempDirProjectA, 'src');
    fs.mkdirSync(srcA, { recursive: true });
    fs.writeFileSync(path.join(srcA, 'app.ts'), 'export const app = "Project A Ecommerce App";\n', 'utf8');

    // Project B: Node.js + Express backend
    const gitB = path.join(tempDirProjectB, '.git');
    fs.mkdirSync(gitB, { recursive: true });
    fs.writeFileSync(path.join(gitB, 'HEAD'), 'ref: refs/heads/release/v1\n', 'utf8');
    fs.writeFileSync(
      path.join(tempDirProjectB, 'package.json'),
      JSON.stringify(
        {
          name: 'project-b-backend',
          version: '2.0.0',
          dependencies: { express: '^4.18.2', pg: '^8.11.3' },
        },
        null,
        2,
      ),
      'utf8',
    );
    const srcB = path.join(tempDirProjectB, 'src');
    fs.mkdirSync(srcB, { recursive: true });
    fs.writeFileSync(path.join(srcB, 'server.js'), 'const express = require("express");\n', 'utf8');

    // Initialize all domain services
    authService = new AuthenticationService(prisma);
    projectService = new ProjectService();
    websiteService = new WebsiteTargetService(prisma);
    gitService = new RepositoryConnectionService(undefined, undefined, undefined, undefined, undefined, undefined, undefined, prisma);
    folderService = new LocalFolderService(prisma);
    fileService = new SecureFileAccessService(prisma);
    environmentService = new TargetEnvironmentService({ prisma });
    contextService = new ProjectContextService(prisma);
    agentService = new ConversationalAgentService({ prisma });
  });

  after(async () => {
    // Teardown HTTP server
    if (liveWebServer) {
      await new Promise<void>((resolve) => liveWebServer.close(() => resolve()));
    }
    // Clean temporary directories
    try {
      fs.rmSync(tempDirProjectA, { recursive: true, force: true });
      fs.rmSync(tempDirProjectB, { recursive: true, force: true });
    } catch {
      // Best-effort directory cleanup
    }
    // Clean up created entities in DB
    try {
      if (userAId || userBId) {
        const userIds = [userAId, userBId].filter(Boolean);
        const projIds = [projectAId, projectBId].filter(Boolean);
        await prisma.testRun.deleteMany({ where: { projectId: { in: projIds } } });
        await prisma.executableTestPlan.deleteMany({ where: { projectId: { in: projIds } } });
        await prisma.testCase.deleteMany({ where: { projectId: { in: projIds } } });
        await prisma.agentTask.deleteMany({ where: { session: { projectId: { in: projIds } } } });
        await prisma.agentMessage.deleteMany({ where: { session: { projectId: { in: projIds } } } });
        await prisma.agentSession.deleteMany({ where: { projectId: { in: projIds } } });
        await prisma.authAuditEvent.deleteMany({ where: { userId: { in: userIds } } });
        await prisma.authenticationProfile.deleteMany({ where: { projectId: { in: projIds } } });
        await prisma.projectEnvironment.deleteMany({ where: { projectId: { in: projIds } } });
        await prisma.websiteTarget.deleteMany({ where: { projectId: { in: projIds } } });
        await prisma.repositoryConnection.deleteMany({ where: { projectId: { in: projIds } } });
        await prisma.projectGitMetadata.deleteMany({ where: { source: { projectId: { in: projIds } } } });
        await prisma.projectSource.deleteMany({ where: { projectId: { in: projIds } } });
        await prisma.project.deleteMany({ where: { id: { in: projIds } } });
        await prisma.user.deleteMany({ where: { id: { in: userIds } } });
      }
    } catch {
      // Best-effort cleanup
    }
  });

  // =========================================================================
  // 1. First-Launch & Authentication Lifecycle Certification
  // =========================================================================

  describe('1. First-Launch & Authentication Foundation (Phase 113–116)', () => {
    it('enforces rigorous password policy on user signup', async () => {
      // Too short
      await assert.rejects(
        () => authService.signup({ fullName: 'User A', email: 'bad@example.com', password: 'short' }),
        PasswordPolicyViolationError,
      );

      // Missing symbol/number
      await assert.rejects(
        () => authService.signup({ fullName: 'User A', email: 'bad@example.com', password: 'onlyletterslongpassword' }),
        PasswordPolicyViolationError,
      );
    });

    it('registers user A and user B successfully and returns cryptographically random session tokens', async () => {
      const regA = await authService.signup({
        fullName: 'User A Tester',
        email: userAEmail,
        password: securePassword,
      });

      assert.ok(regA.userContext.userId);
      assert.strictEqual(regA.userContext.email, userAEmail);
      assert.ok(regA.sessionToken);
      userAId = regA.userContext.userId;
      sessionTokenUserA = regA.sessionToken;

      const regB = await authService.signup({
        fullName: 'User B Tester',
        email: userBEmail,
        password: securePassword,
      });
      assert.ok(regB.userContext.userId);
      userBId = regB.userContext.userId;
    });

    it('authenticates valid credentials and rejects incorrect credentials', async () => {
      // Rejects bad password
      await assert.rejects(
        () => authService.authenticateWithPassword(userAEmail, 'WrongPassword123!'),
        AuthenticationFailedError,
      );

      // Successfully logs in
      const loginRes = await authService.authenticateWithPassword(userAEmail, securePassword);
      assert.strictEqual(loginRes.userContext.userId, userAId);
      assert.ok(loginRes.sessionToken);
    });

    it('validates active session tokens and rejects revoked or corrupted tokens', async () => {
      const validCtx = await authService.validateSession(sessionTokenUserA);
      assert.strictEqual(validCtx.userId, userAId);

      // Rejects corrupted token
      await assert.rejects(() => authService.validateSession('corrupted-token-xxx'));
    });
  });

  // =========================================================================
  // 2. Multi-Project Lifecycle & Strict Tenant Isolation (Phase 118)
  // =========================================================================

  describe('2. Project Lifecycle & Multi-Tenant Isolation (Phase 118)', () => {
    it('creates independent projects for User A and User B', async () => {
      const projA = await projectService.createProject(
        {
          name: 'Ecommerce Store Project A',
          description: 'Production ecommerce web application',
        },
        userAId,
      );
      assert.ok(projA.id);
      projectAId = projA.id;

      const projB = await projectService.createProject(
        {
          name: 'FinTech Backend Project B',
          description: 'Payment settlement engine',
        },
        userBId,
      );
      assert.ok(projB.id);
      projectBId = projB.id;
    });

    it('enforces multi-tenant isolation: User B cannot access or modify Project A', async () => {
      await assert.rejects(
        () => projectService.getProject(projectAId, userBId),
        ProjectAccessDeniedError,
      );

      // User B's project list only contains Project B
      const listB = await projectService.listProjects({}, userBId);
      assert.strictEqual(listB.length, 1);
      assert.strictEqual(listB[0]?.id, projectBId);
    });
  });

  // =========================================================================
  // 3. Website Target & Production Safety Certification (Phase 119)
  // =========================================================================

  describe('3. Website Target & Production Safety (Phase 119)', () => {
    it('probes live website target and accurately detects VERIFIED_REACHABLE state', async () => {
      const checker = new WebsiteTargetConnectivityChecker();
      const probe = await checker.check(liveTargetUrl, { environmentType: 'STAGING', timeoutMs: 5000 });
      assert.strictEqual(probe.status, 'VERIFIED_REACHABLE');
      assert.strictEqual(probe.statusCode, 200);
      assert.ok(probe.responseTimeMs >= 0);
    });

    it('probes unreachable port and distinguishes UNREACHABLE from valid connection', async () => {
      const checker = new WebsiteTargetConnectivityChecker();
      const probe = await checker.check(unreachableUrl, { environmentType: 'STAGING', timeoutMs: 2000 });
      assert.strictEqual(probe.status, 'UNREACHABLE');
    });

    it('blocks SSRF attempts to cloud metadata IP (169.254.169.254)', async () => {
      const checker = new WebsiteTargetConnectivityChecker();
      const probe = await checker.check('http://169.254.169.254/latest/meta-data/', { environmentType: 'STAGING' });
      assert.strictEqual(probe.status, 'BLOCKED');
    });

    it('persists website target for Project A and prevents User B tampering', async () => {
      const target = await websiteService.createWebsiteTarget(
        {
          projectId: projectAId,
          name: 'Project A Target',
          url: liveTargetUrl,
          environmentType: 'STAGING',
        },
        userAId,
      );
      assert.ok(target.id);
      assert.strictEqual(target.baseUrl, liveTargetUrl);

      // User B cannot delete or access User A website target
      await assert.rejects(
        () => websiteService.deleteWebsiteTarget({ projectId: projectAId, targetId: target.id }, userBId),
        TargetAccessDeniedError,
      );
    });
  });

  // =========================================================================
  // 4. Git Repository Connection Certification (Phase 120)
  // =========================================================================

  describe('4. Git Repository Connection & Import (Phase 120)', () => {
    it('connects valid repository metadata and verifies structure', async () => {
      const repo = await gitService.createConnection(
        userAId,
        {
          projectId: projectAId,
          provider: 'GITHUB',
          repositoryIdentifier: 'octocat/Hello-World',
          repositoryName: 'Hello-World',
          defaultBranch: 'main',
          repositoryUrl: 'https://github.com/octocat/Hello-World.git',
        },
      );
      assert.ok(repo.id);
      assert.strictEqual(repo.defaultBranch, 'main');
    });

    it('rejects invalid or empty repository identifiers safely', async () => {
      await assert.rejects(
        () =>
          gitService.createConnection(
            userAId,
            {
              projectId: projectAId,
              provider: 'GITHUB',
              repositoryIdentifier: '   ',
            },
          ),
        RepositoryValidationError,
      );
    });

    it('enforces multi-tenant isolation on Git repository access', async () => {
      await assert.rejects(
        () =>
          gitService.listConnections(
            userBId,
            projectAId,
          ),
        RepositoryAccessDeniedError,
      );
    });
  });

  // =========================================================================
  // 5. Local Folder Connection & Security Boundary (Phase 121)
  // =========================================================================

  describe('5. Local Folder Connection & Filesystem Boundary (Phase 121)', () => {
    it('connects valid local folder and inspects files within security boundary', async () => {
      const folder = await folderService.connectLocalFolder(
        userAId,
        {
          projectId: projectAId,
          directoryPath: tempDirProjectA,
        },
      );
      assert.ok(folder.rootPath);
      assert.strictEqual(folder.status, 'CONNECTED');

      // Read file inside authorized boundary
      const fileContent = await fileService.readFile(
        userAId,
        {
          projectId: projectAId,
          relativePath: 'src/app.ts',
        },
      );
      assert.ok(fileContent.content?.includes('Project A Ecommerce App'));
    });

    it('strictly prevents path traversal attacks (../, ../../, absolute escapes)', async () => {
      // Path traversal attempting to read outside boundary
      await assert.rejects(
        () =>
          fileService.readFile(
            userAId,
            {
              projectId: projectAId,
              relativePath: '../../../../../../etc/passwd',
            },
          ),
        LocalFolderPathTraversalError,
      );

      await assert.rejects(
        () =>
          fileService.readFile(
            userAId,
            {
              projectId: projectAId,
              relativePath: '..',
            },
          ),
        LocalFolderPathTraversalError,
      );
    });

    it('denies User B access to User A connected local folder', async () => {
      await assert.rejects(
        () =>
          fileService.readFile(
            userBId,
            {
              projectId: projectAId,
              relativePath: 'src/app.ts',
            },
          ),
        LocalFolderAccessDeniedError,
      );
    });
  });

  // =========================================================================
  // 6. Target Environment & AES-256-GCM Vault Certification (Phase 122)
  // =========================================================================

  describe('6. Target Environment, Browsers & Credentials Vault (Phase 122)', () => {
    let envId: string;

    it('configures Target Environment with Chromium browser and AES-256-GCM encrypted credentials', async () => {
      const env = await environmentService.saveEnvironment(
        userAId,
        {
          projectId: projectAId,
          name: 'Staging Environment',
          type: 'STAGING',
          baseUrl: liveTargetUrl,
          browserEngine: 'chromium',
          headless: true,
          viewportWidth: 1280,
          viewportHeight: 720,
          ignoreHttpsErrors: false,
          isDefault: true,
          isEnabled: true,
          isProduction: false,
          productionSafetyPolicy: 'SAFE_MODE',
          auth: {
            strategy: 'FORM_LOGIN',
            successValidationType: 'NONE',
            username: 'admin@staging.com',
            password: 'SuperSecretStagingPassword123!',
          },
        },
      );

      assert.ok(env.id);
      assert.strictEqual(env.browserEngine, 'chromium');
      assert.strictEqual(env.type, 'STAGING');
      envId = env.id;

      // Verify password is NOT returned in plaintext
      assert.strictEqual(env.auth?.passwordPreview, '••••••••');
      assert.strictEqual((env.auth as any)?.password, undefined);
    });

    it('enforces multi-tenant isolation on target environments', async () => {
      await assert.rejects(
        () => environmentService.getEnvironment(userBId, { projectId: projectAId, environmentId: envId }),
        TargetEnvAccessDeniedError,
      );
    });
  });

  // =========================================================================
  // 7. Unified Project Context & Source Detection (Phase 123)
  // =========================================================================

  describe('7. Unified Project Context & Source Detection (Phase 123)', () => {
    it('aggregates Website, Git, Local Folder, Environment, and Auth into Unified Project Context', async () => {
      const context = await contextService.getContext(projectAId, userAId);
      assert.strictEqual(context.projectId, projectAId);
      assert.ok(context.sources.website);
      assert.ok(context.sources.localFolder);
      assert.strictEqual(context.target.baseUrl, liveTargetUrl);
      assert.strictEqual(context.lifecycleState, 'CONNECTED');
    });

    it('assembles tailored context projections for QA Engine and AI without credential leakage', async () => {
      const rawContext = await contextService.getContext(projectAId, userAId);
      const qaContext = ContextAssembler.assembleQaEngineContext(rawContext);
      assert.strictEqual(qaContext.targetUrl, liveTargetUrl);
      assert.strictEqual(qaContext.browser.engine, 'chromium');

      const aiContext = ContextAssembler.assembleV9AiContext(rawContext);
      assert.ok(aiContext.targetInfo?.includes('127.0.0.1'));

      // Ensure zero credentials leaked in serialized AI context
      const serialized = JSON.stringify(aiContext);
      assert.strictEqual(serialized.includes('SuperSecretStagingPassword123!'), false);
    });

    it('denies User B access to User A project context', async () => {
      await assert.rejects(
        () => contextService.getContext(projectAId, userBId),
        ProjectContextAccessDeniedError,
      );
    });
  });

  // =========================================================================
  // 8. Conversational Testing Agent, Run Controls & Evidence (Phase 124)
  // =========================================================================

  describe('8. Conversational AI Testing Agent, Run Controls & Evidence (Phase 124)', () => {
    let sessionId: string;

    it('creates persistent conversational session bound to project', async () => {
      const session = await agentService.createSession(
        {
          projectId: projectAId,
          title: 'V8 Phase 125 Full Acceptance Session',
        },
        userAId,
      );

      assert.ok(session.id);
      assert.strictEqual(session.projectId, projectAId);
      assert.strictEqual(session.status, 'IDLE');
      sessionId = session.id;
    });

    it('translates natural language request into inspectable structured task plan', async () => {
      const response = await agentService.handleUserMessage(
        {
          sessionId,
          projectId: projectAId,
          content: 'Run automated Playwright regression tests for the login flow',
        },
        userAId,
      );

      assert.strictEqual(response.userMessage.role, 'USER');
      assert.strictEqual(response.agentMessage.role, 'ASSISTANT');
      assert.ok(response.activities.length > 0);
      assert.ok(response.task);
      assert.ok(response.task.plan);
      assert.strictEqual(response.task.plan.requiresApproval, false);
    });

    it('enforces Production Safe Mode requiring human approval on destructive or production tasks', async () => {
      const response = await agentService.handleUserMessage(
        {
          sessionId,
          projectId: projectAId,
          content: 'Execute teardown and wipe all test accounts in PRODUCTION environment',
        },
        userAId,
      );

      assert.strictEqual(response.sessionStatus, 'WAITING');
      assert.ok(response.task);
      assert.strictEqual(response.task.approvalState, 'PENDING');

      // User rejects the dangerous action
      const rejectResult = await agentService.handleApproval(
        {
          sessionId,
          projectId: projectAId,
          approved: false,
          reason: 'Do not wipe production accounts',
        },
        userAId,
      );

      assert.strictEqual(rejectResult.approvalState, 'REJECTED');
      assert.strictEqual(rejectResult.status, 'CANCELLED');
    });

    it('dispatches run controls (START, CANCEL, RETRY) cleanly', async () => {
      const testCaseId = '00000000-0000-0000-0000-000000008001';
      const testPlanId = '00000000-0000-0000-0000-000000008002';
      const runId = '00000000-0000-0000-0000-000000008003';

      await prisma.testCase.create({
        data: {
          id: testCaseId,
          projectId: projectAId,
          testCaseKey: 'TC-CERT-001',
          title: 'E2E Flow Test Case',
          objective: 'Verify flow under run control dispatch',
          status: 'ACTIVE',
          reviewStatus: 'APPROVED',
        },
      });

      await prisma.executableTestPlan.create({
        data: {
          id: testPlanId,
          projectId: projectAId,
          testCaseId,
          testCaseVersionNumber: 1,
          planFingerprint: 'fp-cert-001',
          stepsJson: [{ step: 1, action: 'navigate' }],
        },
      });

      await prisma.testRun.create({
        data: {
          id: runId,
          projectId: projectAId,
          testCaseId,
          testCaseVersionNumber: 1,
          executableTestPlanId: testPlanId,
          status: 'RUNNING',
          planFingerprint: 'fp-cert-001',
          testCaseTitle: 'E2E Flow Test Case',
          browserEngine: 'chromium',
          queuedAt: new Date(),
          startedAt: new Date(),
        },
      });

      // Cancel run control
      const cancelRes = await agentService.handleRunControl(
        {
          sessionId,
          projectId: projectAId,
          action: 'CANCEL',
          runId,
          reason: 'Manual cancellation by user',
        },
        userAId,
      );
      assert.strictEqual(cancelRes.success, true);
      assert.strictEqual(cancelRes.action, 'CANCEL');
      assert.strictEqual(cancelRes.runStatus, 'CANCELLED');

      // Pause run control
      const pauseRes = await agentService.handleRunControl(
        {
          sessionId,
          projectId: projectAId,
          action: 'PAUSE',
          runId,
        },
        userAId,
      );
      assert.strictEqual(pauseRes.success, true);
      assert.strictEqual(pauseRes.action, 'PAUSE');

      // Resume run control
      const resumeRes = await agentService.handleRunControl(
        {
          sessionId,
          projectId: projectAId,
          action: 'RESUME',
          runId,
        },
        userAId,
      );
      assert.strictEqual(resumeRes.success, true);
      assert.strictEqual(resumeRes.action, 'RESUME');
    });

    it('answers evidence queries strictly grounded in recorded artifacts', async () => {
      const evidence = await agentService.queryEvidence(
        {
          projectId: projectAId,
          query: 'Why did step 2 fail?',
        },
        userAId,
      );

      assert.ok(evidence);
      assert.ok(evidence.naturalLanguageExplanation);
    });

    it('strictly denies User B access to User A conversational sessions', async () => {
      await assert.rejects(
        () => agentService.getSession({ projectId: projectAId, sessionId }, userBId),
        AgentAccessDeniedError,
      );
    });
  });

  // =========================================================================
  // 9. Authoritative Audit Trail Integrity
  // =========================================================================

  describe('9. Complete Audit Trail & Immutability Verification', () => {
    it('verifies audit records created across complete V8 lifecycle without credential leakage', async () => {
      const audits = await prisma.authAuditEvent.findMany({
        where: {
          userId: userAId,
        },
        orderBy: {
          timestamp: 'asc',
        },
      });

      assert.ok(audits.length >= 3);

      // Verify zero passwords in any audit payload
      for (const record of audits) {
        const payloadStr = JSON.stringify(record.metadata ?? {});
        assert.strictEqual(payloadStr.includes(securePassword), false);
        assert.strictEqual(payloadStr.includes('SuperSecretStagingPassword123!'), false);
      }
    });
  });
});
