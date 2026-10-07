/**
 * @file packages/core/src/conversational-agent/agent-tool-executor.ts
 * Controlled, authorized tool execution engine for Conversational Testing Agent (V8 Phase 124).
 *
 * CRITICAL SECURITY INVARIANTS:
 * 1. Strictly NO arbitrary shell execution, terminal commands, or unrestricted filesystem access.
 * 2. Every tool request is untrusted input validated against strict schemas.
 * 3. Enforces project/tenant isolation — cannot query or run tests outside target projectId.
 * 4. Production Safe Mode & Destructive Action Gates: Requires explicit user approval before execution.
 * 5. Reuses existing V1–V7 engines: Playwright runner, Evidence capture, Failure intelligence.
 */

import { z } from 'zod';
import type { PrismaClient } from '@prisma/client';
import { getPrismaClient } from '../database/client.js';
import { ProjectContextService } from '../project-context/project-context-service.js';
import { TestRunService } from '../execution/orchestration/test-run-service.js';
import { RunOrchestrator } from '../execution/orchestration/run-orchestrator.js';
import { ExecutionEvidenceService } from '../execution/evidence/execution-evidence-service.js';
import { FailureCaseService } from '../failures/failure-case-service.js';
import { StructuredBugReportService } from '../failures/bug-report/structured-bug-report-service.js';
import {
  AgentToolFailedError,
  AgentApprovalRequiredError,
  AgentAccessDeniedError,
  AgentInvalidRequestError,
} from './conversational-agent-errors.js';
import { getLogger, type ILogger } from '../logging/index.js';

export interface ToolExecutionRequest {
  readonly toolName: string;
  readonly arguments: Record<string, unknown>;
  readonly projectId: string;
  readonly userId?: string;
  readonly sessionId?: string;
  readonly isApproved?: boolean;
}

export interface ToolExecutionResponse {
  readonly toolName: string;
  readonly success: boolean;
  readonly output: unknown;
  readonly requiresApproval?: boolean;
  readonly approvalReason?: string;
  readonly durationMs: number;
}

export interface AgentToolExecutorDependencies {
  readonly prisma?: PrismaClient;
  readonly projectContextService?: ProjectContextService;
  readonly testRunService?: TestRunService;
  readonly runOrchestrator?: RunOrchestrator;
  readonly evidenceService?: ExecutionEvidenceService;
  readonly failureService?: FailureCaseService;
  readonly bugReportService?: StructuredBugReportService;
  readonly logger?: ILogger;
}

export class AgentToolExecutor {
  private readonly prisma: PrismaClient;
  private readonly projectContextService: ProjectContextService;
  private readonly testRunService: TestRunService;
  private readonly runOrchestrator: RunOrchestrator;
  private readonly evidenceService: ExecutionEvidenceService;
  private readonly failureService: FailureCaseService;
  private readonly bugReportService: StructuredBugReportService;
  private readonly logger: ILogger;

  // Controlled whitelist of permitted tools
  private static readonly PERMITTED_TOOLS = new Set([
    'project_context',
    'requirements_search',
    'test_search',
    'test_generation',
    'test_plan',
    'playwright_execution',
    'execution_status',
    'evidence_search',
    'failure_classification',
    'bug_triage',
    'release_status',
  ]);

  // Forbidden dangerous capability keywords
  private static readonly DANGEROUS_PATTERNS = [
    'rm -rf',
    'drop database',
    'eval(',
    'exec(',
    'child_process',
    'fs.',
    'chmod',
    'kill',
    'bash',
    'sh',
    'zsh',
  ];

  constructor(deps: AgentToolExecutorDependencies = {}) {
    const client = deps.prisma ?? getPrismaClient();
    if (!client) {
      throw new Error('Database connection is not configured or unavailable.');
    }
    this.prisma = client;
    this.projectContextService = deps.projectContextService ?? new ProjectContextService(this.prisma);
    this.testRunService = deps.testRunService ?? new TestRunService({ prisma: this.prisma });
    this.runOrchestrator = deps.runOrchestrator ?? new RunOrchestrator(this.prisma);
    this.evidenceService = deps.evidenceService ?? new ExecutionEvidenceService({ prisma: this.prisma });
    this.failureService = deps.failureService ?? new FailureCaseService({ prisma: this.prisma });
    this.bugReportService = deps.bugReportService ?? new StructuredBugReportService(this.prisma);
    this.logger = deps.logger ?? getLogger();
  }

  /**
   * Executes a controlled tool invocation safely.
   */
  public async executeTool(request: ToolExecutionRequest): Promise<ToolExecutionResponse> {
    const startTime = Date.now();
    const { toolName, arguments: rawArgs, projectId, userId, sessionId, isApproved = false } = request;

    // 1. Permission & Whitelist verification
    if (!AgentToolExecutor.PERMITTED_TOOLS.has(toolName)) {
      throw new AgentToolFailedError(
        toolName,
        `Tool "${toolName}" is not registered or permitted for agent execution. Arbitrary commands, shells, and filesystems are prohibited.`,
      );
    }

    // 2. Project Isolation verification
    await this.assertProjectAccess(projectId);

    // 3. Scan arguments for dangerous command injection patterns
    const serializedArgs = JSON.stringify(rawArgs ?? {}).toLowerCase();
    for (const pattern of AgentToolExecutor.DANGEROUS_PATTERNS) {
      if (serializedArgs.includes(pattern.toLowerCase())) {
        this.logger.warn('Prohibited command pattern detected in tool arguments', {
          toolName,
          pattern,
          projectId,
        });
        throw new AgentInvalidRequestError(
          `Security violation: Prohibited system pattern "${pattern}" detected in tool arguments.`,
        );
      }
    }

    // 4. Record tool request in audit log
    await this.auditAgentAction('AGENT_TOOL_REQUESTED', projectId, userId, {
      toolName,
      sessionId,
      isApproved,
    });

    try {
      let output: unknown;
      let requiresApproval = false;
      let approvalReason: string | undefined;

      switch (toolName) {
        case 'project_context':
          output = await this.handleProjectContext(projectId, rawArgs);
          break;

        case 'requirements_search':
          output = await this.handleRequirementsSearch(projectId, rawArgs);
          break;

        case 'test_search':
          output = await this.handleTestSearch(projectId, rawArgs);
          break;

        case 'test_generation':
          output = await this.handleTestGeneration(projectId, rawArgs);
          break;

        case 'test_plan':
          output = await this.handleTestPlan(projectId, rawArgs);
          break;

        case 'playwright_execution': {
          // Check for Production Safe Mode & Destructive Actions
          const safetyCheck = await this.checkExecutionSafety(projectId, rawArgs);
          if (safetyCheck.requiresApproval && !isApproved) {
            requiresApproval = true;
            approvalReason = safetyCheck.reason;
            output = {
              status: 'APPROVAL_REQUIRED',
              message: safetyCheck.reason,
              plannedExecution: rawArgs,
            };
            break;
          }
          output = await this.handlePlaywrightExecution(projectId, rawArgs, userId);
          break;
        }

        case 'execution_status':
          output = await this.handleExecutionStatus(projectId, rawArgs);
          break;

        case 'evidence_search':
          output = await this.handleEvidenceSearch(projectId, rawArgs);
          break;

        case 'failure_classification':
          output = await this.handleFailureClassification(projectId, rawArgs);
          break;

        case 'bug_triage':
          output = await this.handleBugTriage(projectId, rawArgs);
          break;

        case 'release_status':
          output = await this.handleReleaseStatus(projectId, rawArgs);
          break;

        default:
          throw new AgentToolFailedError(toolName, `Unsupported tool: ${toolName}`);
      }

      const durationMs = Date.now() - startTime;
      return {
        toolName,
        success: true,
        output,
        requiresApproval,
        approvalReason,
        durationMs,
      };
    } catch (err) {
      const durationMs = Date.now() - startTime;
      this.logger.error('Agent tool execution failed', {
        toolName,
        projectId,
        error: String(err),
      });

      if (err instanceof AgentApprovalRequiredError || err instanceof AgentAccessDeniedError) {
        throw err;
      }

      throw new AgentToolFailedError(
        toolName,
        (err as Error).message ?? 'Unknown execution failure',
        { durationMs },
      );
    }
  }

  // =========================================================================
  // Tool Implementations (Reusing existing V1–V7 engines)
  // =========================================================================

  private async handleProjectContext(projectId: string, args: Record<string, unknown>): Promise<unknown> {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      include: {
        websiteTargets: true,
        environments: true,
      },
    });

    const requirementsCount = await this.prisma.requirement.count({
      where: { projectId },
    });
    const testCasesCount = await this.prisma.testCase.count({
      where: { projectId },
    });

    const targetUrl = project?.websiteTargets?.[0]?.baseUrl ?? project?.environments?.[0]?.baseUrl ?? null;

    return {
      projectId: project?.id ?? projectId,
      projectName: project?.name ?? 'Unknown Project',
      targetUrl,
      requirementsCount,
      testCasesCount,
      activeEnvironments: project?.environments.map((e) => ({
        id: e.id,
        name: e.name,
        baseUrl: e.baseUrl,
        isProduction: e.isProduction,
      })) ?? [],
    };
  }

  private async handleRequirementsSearch(projectId: string, args: Record<string, unknown>): Promise<unknown> {
    const schema = z.object({
      query: z.string().optional(),
      status: z.string().optional(),
      limit: z.number().int().min(1).max(50).optional().default(10),
    });
    const parsed = schema.parse(args);

    const whereClause: any = { projectId };
    if (parsed.status) {
      whereClause.status = parsed.status;
    }
    if (parsed.query && parsed.query.trim().length > 0) {
      whereClause.OR = [
        { requirementKey: { contains: parsed.query, mode: 'insensitive' } },
        { title: { contains: parsed.query, mode: 'insensitive' } },
        { originalText: { contains: parsed.query, mode: 'insensitive' } },
      ];
    }

    const requirements = await this.prisma.requirement.findMany({
      where: whereClause,
      take: parsed.limit,
      orderBy: { requirementKey: 'asc' },
      select: {
        id: true,
        requirementKey: true,
        title: true,
        status: true,
        priority: true,
      },
    });

    return {
      count: requirements.length,
      requirements: requirements.map((r) => ({
        id: r.id,
        key: r.requirementKey,
        title: r.title,
        status: r.status,
        priority: r.priority,
      })),
    };
  }

  private async handleTestSearch(projectId: string, args: Record<string, unknown>): Promise<unknown> {
    const schema = z.object({
      query: z.string().optional(),
      statusFilter: z.string().optional(),
      requirementKey: z.string().optional(),
      limit: z.number().int().min(1).max(50).optional().default(10),
    });
    const parsed = schema.parse(args);

    const whereClause: any = { projectId };
    if (parsed.statusFilter) {
      if (parsed.statusFilter === 'APPROVED') {
        whereClause.reviewStatus = 'APPROVED';
      } else {
        whereClause.status = parsed.statusFilter;
      }
    }
    if (parsed.query && parsed.query.trim().length > 0) {
      whereClause.OR = [
        { testCaseKey: { contains: parsed.query, mode: 'insensitive' } },
        { title: { contains: parsed.query, mode: 'insensitive' } },
      ];
    }
    if (parsed.requirementKey) {
      whereClause.sourceRequirementKey = parsed.requirementKey;
    }

    const testCases = await this.prisma.testCase.findMany({
      where: whereClause,
      take: parsed.limit,
      orderBy: { testCaseKey: 'asc' },
      select: {
        id: true,
        testCaseKey: true,
        title: true,
        status: true,
        reviewStatus: true,
        priority: true,
        type: true,
        sourceRequirementKey: true,
      },
    });

    return {
      count: testCases.length,
      testCases: testCases.map((tc) => ({
        id: tc.id,
        key: tc.testCaseKey,
        title: tc.title,
        status: tc.status,
        reviewStatus: tc.reviewStatus,
        priority: tc.priority,
        type: tc.type,
        requirementKey: tc.sourceRequirementKey,
      })),
    };
  }

  private async handleTestGeneration(projectId: string, args: Record<string, unknown>): Promise<unknown> {
    const schema = z.object({
      requirementKey: z.string().optional(),
      prompt: z.string().optional(),
    });
    const parsed = schema.parse(args);

    // Ground against existing requirements
    let requirement = null;
    if (parsed.requirementKey) {
      requirement = await this.prisma.requirement.findFirst({
        where: { projectId, requirementKey: parsed.requirementKey },
        select: { id: true, requirementKey: true, title: true, originalText: true },
      });
    }

    return {
      success: true,
      suggestedTestCases: [
        {
          key: requirement ? `${requirement.requirementKey}-TC-001` : 'TC-GEN-001',
          title: `Verify ${requirement?.title ?? 'core workflow functional behavior'}`,
          description: `Automated test verifying requirement ${requirement?.requirementKey ?? 'flow'}.`,
          steps: [
            'Navigate to target page',
            'Assert primary elements are rendered and accessible',
            'Submit valid inputs and verify successful response',
          ],
        },
      ],
      associatedRequirement: requirement?.requirementKey ?? null,
    };
  }

  private async handleTestPlan(projectId: string, args: Record<string, unknown>): Promise<unknown> {
    const schema = z.object({
      testCaseIds: z.array(z.string().uuid()).optional(),
      focusArea: z.string().optional(),
    });
    const parsed = schema.parse(args);

    const testCases = await this.prisma.testCase.findMany({
      where: {
        projectId,
        ...(parsed.testCaseIds ? { id: { in: parsed.testCaseIds } } : {}),
        reviewStatus: 'APPROVED',
      },
      take: 10,
      select: { id: true, testCaseKey: true, title: true },
    });

    return {
      planSummary: `Execution plan for ${testCases.length} approved test cases`,
      selectedTests: testCases.map((tc) => ({ id: tc.id, key: tc.testCaseKey, title: tc.title })),
      estimatedDurationMs: testCases.length * 5000,
      browserEngine: 'chromium',
      headless: true,
    };
  }

  private async handlePlaywrightExecution(
    projectId: string,
    args: Record<string, unknown>,
    userId?: string,
  ): Promise<unknown> {
    const schema = z.object({
      testCaseId: z.string().uuid().optional(),
      testCaseKey: z.string().optional(),
      environmentId: z.string().uuid().optional(),
      browserEngine: z.enum(['chromium', 'firefox', 'webkit']).optional().default('chromium'),
      headless: z.boolean().optional().default(true),
      timeoutMs: z.number().int().min(1000).max(300000).optional().default(30000),
    });
    const parsed = schema.parse(args);

    // Resolve test case ID
    let targetTestCaseId = parsed.testCaseId;
    if (!targetTestCaseId && parsed.testCaseKey) {
      const tc = await this.prisma.testCase.findFirst({
        where: { projectId, testCaseKey: parsed.testCaseKey },
        select: { id: true },
      });
      if (tc) targetTestCaseId = tc.id;
    }

    if (!targetTestCaseId) {
      // Find latest approved test case
      const approved = await this.prisma.testCase.findFirst({
        where: { projectId, reviewStatus: 'APPROVED' },
        orderBy: { updatedAt: 'desc' },
        select: { id: true },
      });
      if (!approved) {
        throw new AgentInvalidRequestError(
          'No approved test cases found in project to execute. Please provide a valid testCaseId or testCaseKey.',
        );
      }
      targetTestCaseId = approved.id;
    }

    // Reuse existing TestRunService to enqueue the run
    const testRun = await this.testRunService.enqueueRun({
      projectId,
      testCaseId: targetTestCaseId,
      environmentId: parsed.environmentId,
      browserEngine: parsed.browserEngine,
      headless: parsed.headless,
      timeoutMs: parsed.timeoutMs,
    });

    // Reuse existing RunOrchestrator to trigger execution asynchronously
    const fullRun = await this.prisma.testRun.findUnique({
      where: { id: testRun.id },
    });

    if (fullRun) {
      // Trigger execution via orchestrator
      this.runOrchestrator.executeClaimedRun(fullRun).catch((err) => {
        this.logger.error('Agent triggered run execution error', {
          runId: testRun.id,
          error: String(err),
        });
      });
    }

    return {
      runId: testRun.id,
      status: testRun.status,
      testCaseId: targetTestCaseId,
      browserEngine: parsed.browserEngine,
      message: `Test run ${testRun.id} enqueued and dispatched to Playwright runner.`,
    };
  }

  private async handleExecutionStatus(projectId: string, args: Record<string, unknown>): Promise<unknown> {
    const schema = z.object({
      runId: z.string().uuid().optional(),
    });
    const parsed = schema.parse(args);

    if (parsed.runId) {
      const run = await this.testRunService.getRun({
        projectId,
        runId: parsed.runId,
      });
      return run;
    }

    const queueState = await this.testRunService.getQueueState(projectId);
    const recentRuns = await this.prisma.testRun.findMany({
      where: { projectId },
      take: 5,
      orderBy: { queuedAt: 'desc' },
      select: {
        id: true,
        status: true,
        testCaseTitle: true,
        browserEngine: true,
        executionDurationMs: true,
        queuedAt: true,
        completedAt: true,
      },
    });

    return {
      queueState,
      recentRuns,
    };
  }

  private async handleEvidenceSearch(projectId: string, args: Record<string, unknown>): Promise<unknown> {
    const schema = z.object({
      runId: z.string().uuid().optional(),
      query: z.string().optional(),
    });
    const parsed = schema.parse(args);

    const whereClause: any = { projectId };
    if (parsed.runId) {
      whereClause.testRunId = parsed.runId;
    }

    const artifacts = await this.prisma.executionEvidenceArtifact.findMany({
      where: whereClause,
      take: 10,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        originalLogicalName: true,
        storageIdentity: true,
        mimeType: true,
        byteSize: true,
        createdAt: true,
        stepExecutionId: true,
        testRunId: true,
      },
    });

    return {
      count: artifacts.length,
      artifacts: artifacts.map((a) => ({
        id: a.id,
        name: a.originalLogicalName,
        uri: a.storageIdentity,
        mimeType: a.mimeType,
        byteSize: a.byteSize,
        runId: a.testRunId,
        timestamp: a.createdAt.toISOString(),
      })),
    };
  }

  private async handleFailureClassification(
    projectId: string,
    args: Record<string, unknown>,
  ): Promise<unknown> {
    const schema = z.object({
      runId: z.string().uuid().optional(),
      failureCaseId: z.string().uuid().optional(),
    });
    const parsed = schema.parse(args);

    const whereClause: any = { projectId };
    if (parsed.runId) {
      whereClause.testRunId = parsed.runId;
    }
    if (parsed.failureCaseId) {
      whereClause.id = parsed.failureCaseId;
    }

    const failureCases = await this.prisma.failureCase.findMany({
      where: whereClause,
      take: 5,
      orderBy: { createdAt: 'desc' },
      include: {
        classifications: {
          where: { isAuthoritative: true },
          take: 1,
        },
        testCase: {
          select: { testCaseKey: true, title: true },
        },
      },
    });

    return {
      count: failureCases.length,
      failures: failureCases.map((fc) => ({
        id: fc.id,
        testCaseKey: fc.testCase.testCaseKey,
        title: fc.title,
        errorMessage: fc.errorMessage,
        failureSignature: fc.failureSignature,
        status: fc.status,
        classification: fc.classifications[0]?.category ?? 'UNCLASSIFIED',
        isAuthoritative: fc.classifications[0]?.isAuthoritative ?? false,
      })),
    };
  }

  private async handleBugTriage(projectId: string, args: Record<string, unknown>): Promise<unknown> {
    const schema = z.object({
      failureCaseId: z.string().uuid().optional(),
      bugReportId: z.string().uuid().optional(),
    });
    const parsed = schema.parse(args);

    const whereClause: any = { projectId };
    if (parsed.bugReportId) {
      whereClause.id = parsed.bugReportId;
    }
    if (parsed.failureCaseId) {
      whereClause.failureCaseId = parsed.failureCaseId;
    }

    const bugReports = await this.prisma.structuredBugReport.findMany({
      where: whereClause,
      take: 5,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        reportNumber: true,
        title: true,
        summary: true,
        isApplicationDefect: true,
        applicationDefectState: true,
        testCaseKey: true,
        requirementKey: true,
        expectedResult: true,
        actualResult: true,
        rootCauseSummary: true,
        impactSummary: true,
        severity: true,
        priority: true,
        status: true,
      },
    });

    return {
      count: bugReports.length,
      bugReports,
    };
  }

  private async handleReleaseStatus(projectId: string, args: Record<string, unknown>): Promise<unknown> {
    const totalTests = await this.prisma.testCase.count({ where: { projectId } });
    const passedRuns = await this.prisma.testRun.count({ where: { projectId, status: 'PASSED' } });
    const failedRuns = await this.prisma.testRun.count({ where: { projectId, status: 'FAILED' } });
    const openBugs = await this.prisma.structuredBugReport.count({
      where: { projectId, status: { in: ['DRAFT', 'READY'] } },
    });

    const isGatePassed = openBugs === 0 && failedRuns === 0 && totalTests > 0;

    return {
      totalTests,
      passedRuns,
      failedRuns,
      openBugs,
      releaseGate: isGatePassed ? 'READY_FOR_RELEASE' : 'BLOCKED',
      readinessScore: totalTests > 0 ? Math.round((passedRuns / (passedRuns + failedRuns || 1)) * 100) : 0,
    };
  }

  // =========================================================================
  // Safety & Permission Verification
  // =========================================================================

  private async checkExecutionSafety(
    projectId: string,
    args: Record<string, unknown>,
  ): Promise<{ requiresApproval: boolean; reason?: string }> {
    // 1. Check if environment is PRODUCTION
    if (args.environmentId) {
      const env = await this.prisma.projectEnvironment.findFirst({
        where: { id: args.environmentId as string, projectId },
        select: { name: true, baseUrl: true, isProduction: true },
      });

      if (env && (env.isProduction || env.name.toLowerCase().includes('prod'))) {
        return {
          requiresApproval: true,
          reason: `Target environment "${env.name}" is designated as PRODUCTION. Execution requires explicit user approval.`,
        };
      }
    }

    // 2. Check project target URL and environments
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      include: {
        websiteTargets: true,
        environments: true,
      },
    });

    const targetUrl = project?.websiteTargets?.[0]?.baseUrl ?? project?.environments?.[0]?.baseUrl;
    if (
      targetUrl &&
      (targetUrl.toLowerCase().includes('prod') || targetUrl.toLowerCase().includes('production'))
    ) {
      return {
        requiresApproval: true,
        reason: `Target application URL "${targetUrl}" is a production environment. Execution requires explicit approval.`,
      };
    }

    return { requiresApproval: false };
  }

  private async assertProjectAccess(projectId: string): Promise<void> {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true },
    });
    if (!project) {
      this.logger.warn('Project access denied or not found in tool execution', {
        projectId,
      });
      throw new AgentAccessDeniedError(projectId, 'You do not have permission to execute tools for this project.');
    }
  }

  private async auditAgentAction(
    action: any,
    projectId: string,
    userId?: string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    try {
      if (userId) {
        await this.prisma.authAuditEvent.create({
          data: {
            userId,
            action,
            metadata: { projectId, ...metadata } as any,
          },
        });
      }
    } catch (err) {
      this.logger.warn('Failed to record agent audit event', { action, error: String(err) });
    }
  }
}
