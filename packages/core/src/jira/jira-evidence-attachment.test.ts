/**
 * @file packages/core/src/jira/jira-evidence-attachment.test.ts
 * Integration tests for V7 Phase 92 — Bug Evidence & Artifact Attachment to Jira.
 * Verifies secure attachment, cryptographic integrity checks, secret redaction,
 * original file immutability, safe filenames, multi-tenant isolation, trace blocking,
 * mutex concurrency serialization, idempotency, and audit trails.
 */

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { getPrismaClient } from '../database/index.js';
import { JiraConnectionService } from './jira-connection-service.js';
import { JiraEvidenceAttachmentService } from './jira-evidence-attachment-service.js';
import { EvidenceStorageService } from '../execution/evidence/evidence-storage-service.js';
import { FailureEvidenceRedactor } from '../failures/evidence/failure-evidence-redactor.js';
import { JiraCrossProjectError, JiraAttachmentFailedError } from './jira-errors.js';
import { ProjectNotFoundError } from '../projects/project-errors.js';
import type {
  IJiraClient,
  JiraValidationResult,
  JiraHealthCheckResultDto,
  JiraAttachmentResponseDto,
} from './jira-types.js';
import type { PrismaClient } from '@prisma/client';

describe('Jira Evidence Attachment Integration (Phase 92)', () => {
  let prisma: PrismaClient;
  let connectionService: JiraConnectionService;
  let attachmentService: JiraEvidenceAttachmentService;
  let storageService: EvidenceStorageService;
  let redactor: FailureEvidenceRedactor;
  let tempStorageRoot: string;

  const testProjectIdA = crypto.randomUUID();
  const testProjectIdB = crypto.randomUUID();

  let testRunA1Id: string;
  let execA1Id: string;
  let failureCaseA1Id: string;
  let _bugReportA1Id: string;
  let externalIssueA1Id: string;
  let connectionAId: string;

  let _testRunB1Id: string;
  let _execB1Id: string;
  let _failureCaseB1Id: string;
  let _bugReportB1Id: string;
  let externalIssueB1Id: string;

  // Evidence reference IDs
  let refScreenshotId: string;
  let refConsoleLogId: string;
  let refNetworkLogId: string;
  let refDomSnapshotId: string;
  let refPlaywrightTraceId: string;
  let refTamperedId: string;
  let refMissingFileId: string;
  let refOversizedId: string;

  let uploadedCalls: Array<{
    issueIdOrKey: string;
    filename: string;
    content: Buffer;
    mimeType?: string;
  }> = [];

  let simulateUploadError = false;

  const mockJiraClient: IJiraClient = {
    async validateConnection(): Promise<JiraValidationResult> {
      return {
        status: 'CONNECTED',
        validatedAt: new Date(),
        durationMs: 30,
        accountIdentity: {
          accountId: 'jira-mock-user',
          displayName: 'Test Admin',
          emailAddress: 'admin@corp.test',
          active: true,
        },
      };
    },
    async discoverSites() {
      return [{ id: 'mock-site', name: 'Corporate Jira', url: 'https://test-jira.atlassian.net' }];
    },
    async discoverProjects() {
      return [{ id: '10000', key: 'ENG', name: 'Engineering Workspace' }];
    },
    async discoverIssueTypes() {
      return [{ id: '10001', name: 'Bug', subtask: false }];
    },
    async discoverPriorities() {
      return [{ id: '2', name: 'High' }];
    },
    async discoverFields() {
      return [];
    },
    async discoverComponents() {
      return [];
    },
    async discoverAssignees() {
      return [];
    },
    async testConnectionHealth(): Promise<JiraHealthCheckResultDto> {
      return {
        status: 'CONNECTED',
        healthy: true,
        checkedAt: new Date().toISOString(),
        durationMs: 40,
        checks: {
          authentication: { passed: true, message: 'OK' },
          reachability: { passed: true, message: 'OK' },
          projectAccess: { passed: true, message: 'OK', accessibleCount: 1 },
          issueMetadataAccess: { passed: true, message: 'OK' },
        },
      };
    },
    async createIssue(options) {
      return {
        id: '99001',
        key: 'ENG-99',
        self: `${options.baseUrl}/rest/api/3/issue/99001`,
      };
    },
    async getIssue(options) {
      return {
        id: options.issueIdOrKey,
        key: options.issueIdOrKey,
        self: `${options.baseUrl}/rest/api/3/issue/${options.issueIdOrKey}`,
        fields: {
          summary: 'Verified Defect',
          status: { name: 'To Do' },
        },
      };
    },
    async attachEvidence(options): Promise<readonly JiraAttachmentResponseDto[]> {
      if (simulateUploadError) {
        throw new JiraAttachmentFailedError('Jira API error (HTTP 500): Internal upload error');
      }
      uploadedCalls.push({
        issueIdOrKey: options.issueIdOrKey,
        filename: options.filename,
        content: Buffer.from(options.content),
        mimeType: options.mimeType,
      });

      const mockId = `jira-att-${crypto.randomUUID().slice(0, 8)}`;
      return [
        {
          id: mockId,
          self: `${options.baseUrl}/rest/api/3/attachment/${mockId}`,
          filename: options.filename,
          size: options.content.byteLength,
          mimeType: options.mimeType ?? 'application/octet-stream',
          created: new Date().toISOString(),
        },
      ];
    },
  };

  before(async () => {
    const client = getPrismaClient();
    if (!client) {
      throw new Error('DATABASE_URL must be configured for integration tests.');
    }
    prisma = client;

    tempStorageRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'jira-evidence-p92-'));
    storageService = new EvidenceStorageService(tempStorageRoot);
    redactor = new FailureEvidenceRedactor();

    connectionService = new JiraConnectionService({
      prisma,
      jiraClient: mockJiraClient,
      allowLocalhostForTesting: true,
    });

    attachmentService = new JiraEvidenceAttachmentService({
      prisma,
      storageService,
      redactor,
      jiraClient: mockJiraClient,
      allowLocalhostForTesting: true,
    });

    // 1. Create Projects A and B
    await prisma.project.createMany({
      data: [
        { id: testProjectIdA, name: `Phase 92 Proj A ${Date.now()}` },
        { id: testProjectIdB, name: `Phase 92 Proj B ${Date.now()}` },
      ],
    });

    // 2. Requirements & Test Cases
    const reqA = await prisma.requirement.create({
      data: {
        projectId: testProjectIdA,
        requirementKey: `REQ-92A-${Date.now().toString(36).toUpperCase()}`,
        title: 'Checkout Flow Requirement',
        originalText: 'Process checkout steps',
        status: 'ACTIVE',
      },
    });

    const tcA = await prisma.testCase.create({
      data: {
        projectId: testProjectIdA,
        testCaseKey: `TC-92A-${Date.now().toString(36).toUpperCase()}`,
        title: 'Checkout Failure Test Case',
        objective: 'Test checkout failure',
        reviewStatus: 'APPROVED',
        currentVersionNumber: 1,
        sourceRequirementId: reqA.id,
        sourceRequirementKey: reqA.requirementKey,
      },
    });

    const planA = await prisma.executableTestPlan.create({
      data: {
        projectId: testProjectIdA,
        testCaseId: tcA.id,
        testCaseVersionNumber: 1,
        planFingerprint: 'plan-fp-92a',
        summary: 'Executable checkout plan',
        status: 'VALID',
        isExecutable: true,
      },
    });

    const runA = await prisma.testRun.create({
      data: {
        projectId: testProjectIdA,
        testCaseId: tcA.id,
        testCaseVersionNumber: 1,
        executableTestPlanId: planA.id,
        status: 'FAILED',
        planFingerprint: 'plan-fp-92a',
        testCaseTitle: tcA.title,
      },
    });
    testRunA1Id = runA.id;

    const execA = await prisma.testCaseExecution.create({
      data: {
        projectId: testProjectIdA,
        testRunId: runA.id,
        testCaseId: tcA.id,
        testCaseVersionNumber: 1,
        executableTestPlanId: planA.id,
        status: 'FAILED',
        errorMessage: 'Unhandled 500 error in checkout payment',
      },
    });
    execA1Id = execA.id;

    const fcA = await prisma.failureCase.create({
      data: {
        projectId: testProjectIdA,
        testCaseId: tcA.id,
        testCaseVersionNumber: 1,
        testRunId: runA.id,
        executionId: execA.id,
        triggeringExecutionStatus: 'FAILED',
        title: 'Payment 500 Internal Server Error',
        failureSummary: 'POST /checkout returned 500',
        status: 'READY',
      },
    });
    failureCaseA1Id = fcA.id;

    const brA = await prisma.structuredBugReport.create({
      data: {
        projectId: testProjectIdA,
        failureCaseId: fcA.id,
        reportNumber: 'BUG-92A1',
        revision: 1,
        isAuthoritative: true,
        status: 'READY',
        applicationDefectState: 'CONFIRMED_APPLICATION_DEFECT',
        isApplicationDefect: true,
        title: 'Payment 500 Defect',
        summary: 'Confirmed defect in payment service.',
        testCaseId: tcA.id,
        testCaseKey: tcA.testCaseKey,
        testCaseVersionNumber: 1,
        testCaseTitle: tcA.title,
        originalExecutionId: execA.id,
        triggeringStatus: 'FAILED',
        expectedResult: '200 OK',
        actualResult: '500 Server Error',
        markdownReport: '# Bug Report 92A1',
        reportFingerprint: 'fp-report-92a1',
      },
    });
    _bugReportA1Id = brA.id;

    // Jira Connection A
    const connA = await connectionService.createConnection({
      projectId: testProjectIdA,
      displayName: 'Jira Connection Phase 92',
      baseUrl: 'https://test-jira.atlassian.net',
      accountIdentifier: 'admin@corp.test',
      apiToken: 'mock-valid-token-p92',
    });
    connectionAId = connA.id;

    await connectionService.validateConnection({
      projectId: testProjectIdA,
      connectionId: connA.id,
    });

    // Authoritative Jira External Issue A
    const extIssueA = await prisma.jiraExternalIssue.create({
      data: {
        projectId: testProjectIdA,
        failureCaseId: fcA.id,
        bugReportId: brA.id,
        connectionId: connA.id,
        jiraProjectId: '10000',
        jiraProjectKey: 'ENG',
        jiraIssueId: '99001',
        jiraIssueKey: 'ENG-99',
        jiraIssueUrl: 'https://test-jira.atlassian.net/browse/ENG-99',
        issueType: 'Bug',
        summary: 'Payment 500 Defect',
        priority: 'High',
        creationStatus: 'CREATED',
        requestFingerprint: 'fp-issue-eng99',
        createdBy: 'USER',
      },
    });
    externalIssueA1Id = extIssueA.id;

    // Project B Setup (for tenant isolation tests)
    const reqB = await prisma.requirement.create({
      data: {
        projectId: testProjectIdB,
        requirementKey: `REQ-92B-${Date.now().toString(36).toUpperCase()}`,
        title: 'Project B Requirement',
        originalText: 'Project B text',
        status: 'ACTIVE',
      },
    });

    const tcB = await prisma.testCase.create({
      data: {
        projectId: testProjectIdB,
        testCaseKey: `TC-92B-${Date.now().toString(36).toUpperCase()}`,
        title: 'Project B Test Case',
        objective: 'Test Project B',
        reviewStatus: 'APPROVED',
        currentVersionNumber: 1,
        sourceRequirementId: reqB.id,
        sourceRequirementKey: reqB.requirementKey,
      },
    });

    const planB = await prisma.executableTestPlan.create({
      data: {
        projectId: testProjectIdB,
        testCaseId: tcB.id,
        testCaseVersionNumber: 1,
        planFingerprint: 'plan-fp-92b',
        summary: 'Executable plan B',
        status: 'VALID',
        isExecutable: true,
      },
    });

    const runB = await prisma.testRun.create({
      data: {
        projectId: testProjectIdB,
        testCaseId: tcB.id,
        testCaseVersionNumber: 1,
        executableTestPlanId: planB.id,
        status: 'FAILED',
        planFingerprint: 'plan-fp-92b',
        testCaseTitle: tcB.title,
      },
    });
    _testRunB1Id = runB.id;

    const execB = await prisma.testCaseExecution.create({
      data: {
        projectId: testProjectIdB,
        testRunId: runB.id,
        testCaseId: tcB.id,
        testCaseVersionNumber: 1,
        executableTestPlanId: planB.id,
        status: 'FAILED',
      },
    });
    _execB1Id = execB.id;

    const fcB = await prisma.failureCase.create({
      data: {
        projectId: testProjectIdB,
        testCaseId: tcB.id,
        testCaseVersionNumber: 1,
        testRunId: runB.id,
        executionId: execB.id,
        triggeringExecutionStatus: 'FAILED',
        title: 'Project B Failure',
        failureSummary: 'Failure in B',
        status: 'READY',
      },
    });
    _failureCaseB1Id = fcB.id;

    const brB = await prisma.structuredBugReport.create({
      data: {
        projectId: testProjectIdB,
        failureCaseId: fcB.id,
        reportNumber: 'BUG-92B1',
        revision: 1,
        isAuthoritative: true,
        status: 'READY',
        applicationDefectState: 'CONFIRMED_APPLICATION_DEFECT',
        isApplicationDefect: true,
        title: 'Project B Defect',
        summary: 'Defect in B',
        testCaseId: tcB.id,
        testCaseKey: tcB.testCaseKey,
        testCaseVersionNumber: 1,
        testCaseTitle: tcB.title,
        originalExecutionId: execB.id,
        triggeringStatus: 'FAILED',
        expectedResult: 'OK',
        actualResult: 'Crash',
        markdownReport: '# Bug Report B',
        reportFingerprint: 'fp-report-b',
      },
    });
    _bugReportB1Id = brB.id;

    const extIssueB = await prisma.jiraExternalIssue.create({
      data: {
        projectId: testProjectIdB,
        failureCaseId: fcB.id,
        bugReportId: brB.id,
        connectionId: connA.id,
        jiraProjectId: '10000',
        jiraProjectKey: 'ENG',
        jiraIssueId: '99002',
        jiraIssueKey: 'ENG-100',
        jiraIssueUrl: 'https://test-jira.atlassian.net/browse/ENG-100',
        issueType: 'Bug',
        summary: 'Project B Defect',
        priority: 'High',
        creationStatus: 'CREATED',
        requestFingerprint: 'fp-issue-eng100',
        createdBy: 'USER',
      },
    });
    externalIssueB1Id = extIssueB.id;

    // 3. Populate Managed Storage Files and DB Evidence References
    const helperWriteEvidence = async (
      storageIdentity: string,
      content: Buffer,
      readOnly = true,
    ): Promise<string> => {
      const targetPath = storageService.resolveManagedPath(
        testProjectIdA,
        testRunA1Id,
        execA1Id,
        storageIdentity,
      );
      await fs.mkdir(path.dirname(targetPath), { recursive: true });
      await fs.writeFile(targetPath, content);
      if (readOnly) {
        await fs.chmod(targetPath, 0o444);
      }
      return targetPath;
    };

    // a) Screenshot (PNG binary)
    const screenshotBuffer = Buffer.from('FAKE_PNG_BINARY_IMAGE_DATA_123456');
    const screenshotSha256 = crypto.createHash('sha256').update(screenshotBuffer).digest('hex');
    const screenshotStorageIdentity = 'screenshot_fail.png';
    await helperWriteEvidence(screenshotStorageIdentity, screenshotBuffer);

    const refScreenshot = await prisma.failureEvidenceReference.create({
      data: {
        projectId: testProjectIdA,
        failureCaseId: failureCaseA1Id,
        executionId: execA1Id,
        artifactType: 'SCREENSHOT',
        logicalName: 'checkout_error_view.png',
        mimeType: 'image/png',
        byteSize: screenshotBuffer.length,
        sha256: screenshotSha256,
        integrityStatus: 'VERIFIED',
        storageIdentity: screenshotStorageIdentity,
      },
    });
    refScreenshotId = refScreenshot.id;

    // b) Console Log (Text containing sensitive API key)
    const consoleText =
      'Error: Failed to fetch /api/v1/charge with authorization: Bearer sk-ant-api03-abcdef1234567890abcdef1234567890';
    const consoleBuffer = Buffer.from(consoleText, 'utf8');
    const consoleSha256 = crypto.createHash('sha256').update(consoleBuffer).digest('hex');
    const consoleStorageIdentity = 'console_logs.txt';
    await helperWriteEvidence(consoleStorageIdentity, consoleBuffer);

    const refConsole = await prisma.failureEvidenceReference.create({
      data: {
        projectId: testProjectIdA,
        failureCaseId: failureCaseA1Id,
        executionId: execA1Id,
        artifactType: 'CONSOLE_LOG',
        logicalName: 'browser_console.log',
        mimeType: 'text/plain',
        byteSize: consoleBuffer.length,
        sha256: consoleSha256,
        integrityStatus: 'VERIFIED',
        storageIdentity: consoleStorageIdentity,
      },
    });
    refConsoleLogId = refConsole.id;

    // c) Network Log (JSON containing secret password)
    const networkText = JSON.stringify({
      request: {
        url: '/api/login',
        body: { user: 'qa_lead', password: 'SuperSecretPassword123!' },
      },
      response: { status: 500, error: 'Database timeout' },
    });
    const networkBuffer = Buffer.from(networkText, 'utf8');
    const networkSha256 = crypto.createHash('sha256').update(networkBuffer).digest('hex');
    const networkStorageIdentity = 'network_log.json';
    await helperWriteEvidence(networkStorageIdentity, networkBuffer);

    const refNetwork = await prisma.failureEvidenceReference.create({
      data: {
        projectId: testProjectIdA,
        failureCaseId: failureCaseA1Id,
        executionId: execA1Id,
        artifactType: 'NETWORK_LOG',
        logicalName: 'checkout_network.json',
        mimeType: 'application/json',
        byteSize: networkBuffer.length,
        sha256: networkSha256,
        integrityStatus: 'VERIFIED',
        storageIdentity: networkStorageIdentity,
      },
    });
    refNetworkLogId = refNetwork.id;

    // d) DOM Snapshot (HTML text)
    const domText =
      '<html><body><div class="error-dialog">Payment Gateway unreachable</div></body></html>';
    const domBuffer = Buffer.from(domText, 'utf8');
    const domSha256 = crypto.createHash('sha256').update(domBuffer).digest('hex');
    const domStorageIdentity = 'dom_snapshot.html';
    await helperWriteEvidence(domStorageIdentity, domBuffer);

    const refDom = await prisma.failureEvidenceReference.create({
      data: {
        projectId: testProjectIdA,
        failureCaseId: failureCaseA1Id,
        executionId: execA1Id,
        artifactType: 'DOM_SNAPSHOT',
        logicalName: 'error_dialog.html',
        mimeType: 'text/html',
        byteSize: domBuffer.length,
        sha256: domSha256,
        integrityStatus: 'VERIFIED',
        storageIdentity: domStorageIdentity,
      },
    });
    refDomSnapshotId = refDom.id;

    // e) Playwright Trace (Zip file, strictly blocked by policy)
    const traceBuffer = Buffer.from('PK_MOCK_PLAYWRIGHT_TRACE_ZIP_CONTENT');
    const traceSha256 = crypto.createHash('sha256').update(traceBuffer).digest('hex');
    const traceStorageIdentity = 'trace_run.zip';
    await helperWriteEvidence(traceStorageIdentity, traceBuffer);

    const refTrace = await prisma.failureEvidenceReference.create({
      data: {
        projectId: testProjectIdA,
        failureCaseId: failureCaseA1Id,
        executionId: execA1Id,
        artifactType: 'PLAYWRIGHT_TRACE',
        logicalName: 'trace_checkout.zip',
        mimeType: 'application/zip',
        byteSize: traceBuffer.length,
        sha256: traceSha256,
        integrityStatus: 'VERIFIED',
        storageIdentity: traceStorageIdentity,
      },
    });
    refPlaywrightTraceId = refTrace.id;

    // f) Tampered File (on disk hash does not match reference sha256)
    const tamperedBuffer = Buffer.from('TAMPERED_CONTENT_ON_DISK');
    const tamperedStorageIdentity = 'tampered_file.txt';
    await helperWriteEvidence(tamperedStorageIdentity, tamperedBuffer);

    const refTampered = await prisma.failureEvidenceReference.create({
      data: {
        projectId: testProjectIdA,
        failureCaseId: failureCaseA1Id,
        executionId: execA1Id,
        artifactType: 'CONSOLE_LOG',
        logicalName: 'corrupted_console.txt',
        mimeType: 'text/plain',
        byteSize: tamperedBuffer.length,
        sha256: '0000000000000000000000000000000000000000000000000000000000000000', // mismatched SHA
        integrityStatus: 'VERIFIED',
        storageIdentity: tamperedStorageIdentity,
      },
    });
    refTamperedId = refTampered.id;

    // g) Missing File (storage identity does not exist on disk)
    const refMissing = await prisma.failureEvidenceReference.create({
      data: {
        projectId: testProjectIdA,
        failureCaseId: failureCaseA1Id,
        executionId: execA1Id,
        artifactType: 'CONSOLE_LOG',
        logicalName: 'missing_console.txt',
        mimeType: 'text/plain',
        byteSize: 1234,
        sha256: 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
        integrityStatus: 'VERIFIED',
        storageIdentity: 'non_existent_file.txt',
      },
    });
    refMissingFileId = refMissing.id;

    // h) Oversized File (Exceeding 10MB)
    const refOversized = await prisma.failureEvidenceReference.create({
      data: {
        projectId: testProjectIdA,
        failureCaseId: failureCaseA1Id,
        executionId: execA1Id,
        artifactType: 'SCREENSHOT',
        logicalName: 'giant_screen.png',
        mimeType: 'image/png',
        byteSize: 11 * 1024 * 1024, // 11MB
        sha256: 'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
        integrityStatus: 'VERIFIED',
        storageIdentity: 'oversized_screen.png',
      },
    });
    refOversizedId = refOversized.id;
  });

  beforeEach(() => {
    uploadedCalls = [];
    simulateUploadError = false;
  });

  after(async () => {
    try {
      await fs.rm(tempStorageRoot, { recursive: true, force: true });
    } catch {
      // Best effort
    }
    await prisma.jiraEvidenceAttachment.deleteMany({
      where: { projectId: { in: [testProjectIdA, testProjectIdB] } },
    });
    await prisma.jiraConnectionAudit.deleteMany({
      where: { projectId: { in: [testProjectIdA, testProjectIdB] } },
    });
    await prisma.jiraExternalIssue.deleteMany({
      where: { projectId: { in: [testProjectIdA, testProjectIdB] } },
    });
    await prisma.jiraProjectConfig.deleteMany({
      where: { projectId: { in: [testProjectIdA, testProjectIdB] } },
    });
    await prisma.jiraConnection.deleteMany({
      where: { projectId: { in: [testProjectIdA, testProjectIdB] } },
    });
    await prisma.failureEvidenceReference.deleteMany({
      where: { projectId: { in: [testProjectIdA, testProjectIdB] } },
    });
    await prisma.structuredBugReport.deleteMany({
      where: { projectId: { in: [testProjectIdA, testProjectIdB] } },
    });
    await prisma.failureCase.deleteMany({
      where: { projectId: { in: [testProjectIdA, testProjectIdB] } },
    });
    await prisma.testCaseExecution.deleteMany({
      where: { projectId: { in: [testProjectIdA, testProjectIdB] } },
    });
    await prisma.testRun.deleteMany({
      where: { projectId: { in: [testProjectIdA, testProjectIdB] } },
    });
    await prisma.executableTestPlan.deleteMany({
      where: { projectId: { in: [testProjectIdA, testProjectIdB] } },
    });
    await prisma.testCase.deleteMany({
      where: { projectId: { in: [testProjectIdA, testProjectIdB] } },
    });
    await prisma.requirement.deleteMany({
      where: { projectId: { in: [testProjectIdA, testProjectIdB] } },
    });
    await prisma.project.deleteMany({
      where: { id: { in: [testProjectIdA, testProjectIdB] } },
    });
  });

  describe('listAttachableEvidence', () => {
    it('returns all attachable evidence items with correct eligibility and redaction flags', async () => {
      const items = await attachmentService.listAttachableEvidence({
        projectId: testProjectIdA,
        failureCaseId: failureCaseA1Id,
      });

      assert.ok(items.length >= 7);

      const screenshotItem = items.find(i => i.evidenceReferenceId === refScreenshotId);
      assert.ok(screenshotItem);
      assert.equal(screenshotItem.isEligible, true);
      assert.equal(screenshotItem.requiresRedaction, false);
      assert.equal(screenshotItem.isAlreadyAttached, false);

      const consoleItem = items.find(i => i.evidenceReferenceId === refConsoleLogId);
      assert.ok(consoleItem);
      assert.equal(consoleItem.isEligible, true);
      assert.equal(consoleItem.requiresRedaction, true);

      const networkItem = items.find(i => i.evidenceReferenceId === refNetworkLogId);
      assert.ok(networkItem);
      assert.equal(networkItem.isEligible, true);
      assert.equal(networkItem.requiresRedaction, true);

      const domItem = items.find(i => i.evidenceReferenceId === refDomSnapshotId);
      assert.ok(domItem);
      assert.equal(domItem.isEligible, true);
      assert.equal(domItem.requiresRedaction, true);

      const traceItem = items.find(i => i.evidenceReferenceId === refPlaywrightTraceId);
      assert.ok(traceItem);
      assert.equal(traceItem.isEligible, false);
      assert.ok(
        traceItem.ineligibilityReason?.includes(
          'Sensitive trace content cannot be safely sanitized',
        ),
      );

      const oversizedItem = items.find(i => i.evidenceReferenceId === refOversizedId);
      assert.ok(oversizedItem);
      assert.equal(oversizedItem.isEligible, false);
      assert.ok(oversizedItem.ineligibilityReason?.includes('exceeds Jira upload limit'));
    });

    it('rejects cross-project listing with JiraCrossProjectError', async () => {
      await assert.rejects(
        async () =>
          await attachmentService.listAttachableEvidence({
            projectId: testProjectIdB,
            failureCaseId: failureCaseA1Id,
          }),
        (err: any) => {
          assert.ok(err instanceof JiraCrossProjectError);
          return true;
        },
      );
    });

    it('rejects non-existent project with ProjectNotFoundError', async () => {
      await assert.rejects(
        async () =>
          await attachmentService.listAttachableEvidence({
            projectId: crypto.randomUUID(),
            failureCaseId: failureCaseA1Id,
          }),
        (err: any) => {
          assert.ok(err instanceof ProjectNotFoundError);
          return true;
        },
      );
    });
  });

  describe('attachEvidence — Core Attachment Workflow & Security Policies', () => {
    it('attaches binary screenshot directly without altering file or permissions', async () => {
      const targetFilePath = storageService.resolveManagedPath(
        testProjectIdA,
        testRunA1Id,
        execA1Id,
        'screenshot_fail.png',
      );
      const statBefore = await fs.stat(targetFilePath);

      const result = await attachmentService.attachEvidence({
        projectId: testProjectIdA,
        externalIssueId: externalIssueA1Id,
        evidenceReferenceIds: [refScreenshotId],
      });

      assert.equal(result.totalRequested, 1);
      assert.equal(result.attachedCount, 1);
      assert.equal(result.blockedCount, 0);
      assert.equal(result.failedCount, 0);
      assert.equal(result.skippedCount, 0);

      const att = result.attachments[0];
      assert.ok(att);
      assert.equal(att.status, 'ATTACHED');
      assert.equal(att.evidenceType, 'SCREENSHOT');
      assert.equal(att.isDerivedRedacted, false);
      assert.ok(att.jiraFilename.startsWith('[ENG-99]_screenshot_'));
      assert.ok(att.jiraAttachmentId?.startsWith('jira-att-'));

      // Check upload call
      assert.equal(uploadedCalls.length, 1);
      const call0 = uploadedCalls[0];
      assert.ok(call0);
      assert.equal(call0.issueIdOrKey, 'ENG-99');
      assert.equal(call0.content.toString('utf8'), 'FAKE_PNG_BINARY_IMAGE_DATA_123456');

      // Verify original file on disk remains strictly immutable
      const statAfter = await fs.stat(targetFilePath);
      assert.equal(statBefore.mode, statAfter.mode);
      assert.equal(statBefore.size, statAfter.size);
      assert.equal(statBefore.mtimeMs, statAfter.mtimeMs);
    });

    it('redacts sensitive tokens in text console log, preserving original immutable file and logging lineage', async () => {
      const targetFilePath = storageService.resolveManagedPath(
        testProjectIdA,
        testRunA1Id,
        execA1Id,
        'console_logs.txt',
      );
      const statBefore = await fs.stat(targetFilePath);
      const contentBefore = await fs.readFile(targetFilePath, 'utf8');

      const result = await attachmentService.attachEvidence({
        projectId: testProjectIdA,
        externalIssueId: externalIssueA1Id,
        evidenceReferenceIds: [refConsoleLogId],
      });

      assert.equal(result.attachedCount, 1);
      const att = result.attachments[0];
      assert.ok(att);
      assert.equal(att.status, 'ATTACHED');
      assert.equal(att.isDerivedRedacted, true);
      assert.equal(att.redactionVersion, '1.0.0');
      assert.ok(att.sourceArtifactHash);

      // Verify Jira upload received sanitized content (secret redacted)
      assert.equal(uploadedCalls.length, 1);
      const consoleCall = uploadedCalls[0];
      assert.ok(consoleCall);
      const uploadedText = consoleCall.content.toString('utf8');
      assert.ok(!uploadedText.includes('sk-ant-api03-abcdef1234567890abcdef1234567890'));
      assert.ok(
        uploadedText.includes('[REDACTED_ANTHROPIC_KEY]') || uploadedText.includes('[REDACTED'),
      );

      // Verify original file on disk was NOT modified (forensic immutability)
      const contentAfter = await fs.readFile(targetFilePath, 'utf8');
      assert.equal(contentBefore, contentAfter);
      assert.ok(contentAfter.includes('sk-ant-api03-abcdef1234567890abcdef1234567890'));

      const statAfter = await fs.stat(targetFilePath);
      assert.equal(statBefore.mtimeMs, statAfter.mtimeMs);
    });

    it('strictly blocks Playwright trace from automated upload according to platform policy', async () => {
      const result = await attachmentService.attachEvidence({
        projectId: testProjectIdA,
        externalIssueId: externalIssueA1Id,
        evidenceReferenceIds: [refPlaywrightTraceId],
      });

      assert.equal(result.totalRequested, 1);
      assert.equal(result.attachedCount, 0);
      assert.equal(result.blockedCount, 1);
      assert.equal(result.failedCount, 0);

      const att = result.attachments[0];
      assert.ok(att);
      assert.equal(att.status, 'BLOCKED');
      assert.equal(att.failureCode, 'JIRA_ATTACHMENT_INELIGIBLE');
      assert.ok(att.failureReason?.includes('Sensitive trace content cannot be safely sanitized'));

      // Verify remote Jira client was NEVER invoked
      assert.equal(uploadedCalls.length, 0);
    });

    it('rejects tampered evidence file with JIRA_EVIDENCE_INTEGRITY_FAILED', async () => {
      const result = await attachmentService.attachEvidence({
        projectId: testProjectIdA,
        externalIssueId: externalIssueA1Id,
        evidenceReferenceIds: [refTamperedId],
      });

      assert.equal(result.failedCount, 1);
      const att = result.attachments[0];
      assert.ok(att);
      assert.equal(att.status, 'FAILED');
      assert.equal(att.failureCode, 'JIRA_EVIDENCE_INTEGRITY_FAILED');

      // Verify remote Jira client was NEVER invoked
      assert.equal(uploadedCalls.length, 0);
    });

    it('detects missing evidence file with JIRA_EVIDENCE_NOT_FOUND', async () => {
      const result = await attachmentService.attachEvidence({
        projectId: testProjectIdA,
        externalIssueId: externalIssueA1Id,
        evidenceReferenceIds: [refMissingFileId],
      });

      assert.equal(result.failedCount, 1);
      const att = result.attachments[0];
      assert.ok(att);
      assert.equal(att.status, 'FAILED');
      assert.equal(att.failureCode, 'JIRA_EVIDENCE_NOT_FOUND');
      assert.equal(uploadedCalls.length, 0);
    });

    it('enforces multi-tenant project isolation (cross-project reject)', async () => {
      // Trying to attach Project A evidence to Project B Jira issue or vice-versa
      await assert.rejects(
        async () =>
          await attachmentService.attachEvidence({
            projectId: testProjectIdB,
            externalIssueId: externalIssueA1Id, // Belongs to Project A
            evidenceReferenceIds: [refScreenshotId],
          }),
        (err: any) => {
          assert.ok(err instanceof JiraCrossProjectError);
          return true;
        },
      );

      await assert.rejects(
        async () =>
          await attachmentService.attachEvidence({
            projectId: testProjectIdA,
            externalIssueId: externalIssueB1Id, // Belongs to Project B
            evidenceReferenceIds: [refScreenshotId],
          }),
        (err: any) => {
          assert.ok(err instanceof JiraCrossProjectError);
          return true;
        },
      );
    });

    it('enforces idempotency: skips already attached evidence on subsequent requests', async () => {
      // First attempt for network log and DOM snapshot
      const res1 = await attachmentService.attachEvidence({
        projectId: testProjectIdA,
        externalIssueId: externalIssueA1Id,
        evidenceReferenceIds: [refNetworkLogId, refDomSnapshotId],
      });

      assert.equal(res1.attachedCount, 2);
      assert.equal(res1.skippedCount, 0);
      assert.equal(uploadedCalls.length, 2);

      uploadedCalls = [];

      // Second attempt with the same evidence references
      const res2 = await attachmentService.attachEvidence({
        projectId: testProjectIdA,
        externalIssueId: externalIssueA1Id,
        evidenceReferenceIds: [refNetworkLogId, refDomSnapshotId],
      });

      assert.equal(res2.attachedCount, 0);
      assert.equal(res2.skippedCount, 2);
      assert.equal(res2.attachments.length, 2);
      const att0 = res2.attachments[0];
      const att1 = res2.attachments[1];
      assert.ok(att0);
      assert.ok(att1);
      assert.equal(att0.status, 'ATTACHED');
      assert.equal(att1.status, 'ATTACHED');

      // Zero upload calls made to remote Jira on re-upload
      assert.equal(uploadedCalls.length, 0);
    });

    it('handles remote Jira upload failure gracefully and records status FAILED', async () => {
      // Create a fresh reference to avoid already-attached skip
      const freshText = 'Temporary error log content';
      const freshBuffer = Buffer.from(freshText, 'utf8');
      const freshSha256 = crypto.createHash('sha256').update(freshBuffer).digest('hex');
      const freshIdentity = 'fresh_error_log.txt';
      const targetPath = storageService.resolveManagedPath(
        testProjectIdA,
        testRunA1Id,
        execA1Id,
        freshIdentity,
      );
      await fs.writeFile(targetPath, freshBuffer);
      await fs.chmod(targetPath, 0o444);

      const freshRef = await prisma.failureEvidenceReference.create({
        data: {
          projectId: testProjectIdA,
          failureCaseId: failureCaseA1Id,
          executionId: execA1Id,
          artifactType: 'CONSOLE_LOG',
          logicalName: 'fresh_error_log.txt',
          mimeType: 'text/plain',
          byteSize: freshBuffer.length,
          sha256: freshSha256,
          integrityStatus: 'VERIFIED',
          storageIdentity: freshIdentity,
        },
      });

      simulateUploadError = true;

      const result = await attachmentService.attachEvidence({
        projectId: testProjectIdA,
        externalIssueId: externalIssueA1Id,
        evidenceReferenceIds: [freshRef.id],
      });

      assert.equal(result.failedCount, 1);
      assert.equal(result.attachedCount, 0);

      const att = result.attachments[0];
      assert.ok(att);
      assert.equal(att.status, 'FAILED');
      assert.equal(att.failureCode, 'JIRA_ATTACHMENT_FAILED');
      assert.ok(att.failureReason?.includes('Internal upload error'));

      // Verify audit trail logged FAILURE
      const audit = await prisma.jiraConnectionAudit.findFirst({
        where: {
          projectId: testProjectIdA,
          eventType: 'EVIDENCE_ATTACHMENT_FAILED',
        },
        orderBy: { createdAt: 'desc' },
      });
      assert.ok(audit);
      assert.equal((audit.details as any).errorCode, 'JIRA_ATTACHMENT_FAILED');
    });

    it('serializes concurrent requests for the same external issue without race conditions', async () => {
      // Create two distinct references
      const buf1 = Buffer.from('concurrent 1');
      const buf2 = Buffer.from('concurrent 2');
      const id1 = 'concurrent_1.txt';
      const id2 = 'concurrent_2.txt';

      const p1 = storageService.resolveManagedPath(testProjectIdA, testRunA1Id, execA1Id, id1);
      const p2 = storageService.resolveManagedPath(testProjectIdA, testRunA1Id, execA1Id, id2);
      await fs.writeFile(p1, buf1);
      await fs.writeFile(p2, buf2);
      await fs.chmod(p1, 0o444);
      await fs.chmod(p2, 0o444);

      const ref1 = await prisma.failureEvidenceReference.create({
        data: {
          projectId: testProjectIdA,
          failureCaseId: failureCaseA1Id,
          executionId: execA1Id,
          artifactType: 'CONSOLE_LOG',
          logicalName: 'concurrent_1.txt',
          mimeType: 'text/plain',
          byteSize: buf1.length,
          sha256: crypto.createHash('sha256').update(buf1).digest('hex'),
          integrityStatus: 'VERIFIED',
          storageIdentity: id1,
        },
      });

      const ref2 = await prisma.failureEvidenceReference.create({
        data: {
          projectId: testProjectIdA,
          failureCaseId: failureCaseA1Id,
          executionId: execA1Id,
          artifactType: 'CONSOLE_LOG',
          logicalName: 'concurrent_2.txt',
          mimeType: 'text/plain',
          byteSize: buf2.length,
          sha256: crypto.createHash('sha256').update(buf2).digest('hex'),
          integrityStatus: 'VERIFIED',
          storageIdentity: id2,
        },
      });

      const [res1, res2] = await Promise.all([
        attachmentService.attachEvidence({
          projectId: testProjectIdA,
          externalIssueId: externalIssueA1Id,
          evidenceReferenceIds: [ref1.id],
        }),
        attachmentService.attachEvidence({
          projectId: testProjectIdA,
          externalIssueId: externalIssueA1Id,
          evidenceReferenceIds: [ref2.id],
        }),
      ]);

      assert.equal(res1.attachedCount, 1);
      assert.equal(res2.attachedCount, 1);
      assert.equal(res1.failedCount, 0);
      assert.equal(res2.failedCount, 0);
    });
  });

  describe('getAttachmentStatus', () => {
    it('retrieves all attachment records for an external issue', async () => {
      const records = await attachmentService.getAttachmentStatus({
        projectId: testProjectIdA,
        externalIssueId: externalIssueA1Id,
      });

      assert.ok(records.length > 0);
      const screenshot = records.find(r => r.evidenceReferenceId === refScreenshotId);
      assert.ok(screenshot);
      assert.equal(screenshot.status, 'ATTACHED');
      assert.equal(screenshot.projectId, testProjectIdA);
      assert.equal(screenshot.externalIssueId, externalIssueA1Id);
    });

    it('rejects non-existent project with ProjectNotFoundError', async () => {
      await assert.rejects(
        async () =>
          await attachmentService.getAttachmentStatus({
            projectId: crypto.randomUUID(),
            externalIssueId: externalIssueA1Id,
          }),
        (err: any) => {
          assert.ok(err instanceof ProjectNotFoundError);
          return true;
        },
      );
    });
  });

  describe('Audit Trail Verification', () => {
    it('verifies EVIDENCE_ATTACHMENT_ATTEMPTED and EVIDENCE_ATTACHED audit log entries', async () => {
      const audits = await prisma.jiraConnectionAudit.findMany({
        where: {
          connectionId: connectionAId,
          projectId: testProjectIdA,
        },
        orderBy: { createdAt: 'desc' },
      });

      const attempted = audits.filter(a => a.eventType === 'EVIDENCE_ATTACHMENT_ATTEMPTED');
      const attached = audits.filter(a => a.eventType === 'EVIDENCE_ATTACHED');
      const failed = audits.filter(a => a.eventType === 'EVIDENCE_ATTACHMENT_FAILED');

      assert.ok(attempted.length > 0);
      assert.ok(attached.length > 0);
      assert.ok(failed.length > 0);

      // Verify attempted log contains issue and file metadata
      const firstAttempt = attempted[0];
      assert.ok(firstAttempt);
      const attemptDetails = firstAttempt.details as any;
      assert.equal(attemptDetails.jiraIssueKey, 'ENG-99');
      assert.ok(attemptDetails.jiraFilename);
      assert.ok(attemptDetails.artifactType);

      // Verify attached log contains Jira attachment ID
      const firstAttached = attached[0];
      assert.ok(firstAttached);
      const attachedDetails = firstAttached.details as any;
      assert.equal(attachedDetails.jiraIssueKey, 'ENG-99');
      assert.ok(attachedDetails.jiraAttachmentId);
    });
  });
});
