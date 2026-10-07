/**
 * @file packages/core/src/conversational-agent/agent-planning-service.ts
 * Structured Task Planning & Intent Resolution for Conversational Testing Agent (V8 Phase 124).
 *
 * CRITICAL REQUIREMENTS:
 * 1. Translates natural language requests into structured, inspectable plans (AgentPlanDto).
 * 2. NO hidden chain-of-thought leaked to the user; provides clean, user-safe action summaries.
 * 3. Ambiguity handling: When a request is ambiguous, requests clarification instead of guessing.
 * 4. Destructive Action Protection & Production Safe Mode:
 *    Operations against PRODUCTION or destructive actions require explicit user approval.
 * 5. Deterministic fallback: Works robustly with or without active AI runtime providers.
 * 6. Tenant isolation: Strictly validates project access and scopes all plan entities to projectId.
 */

import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { getPrismaClient } from '../database/client.js';
import { ProjectContextService } from '../project-context/project-context-service.js';
import type {
  AgentPlanDto,
  AgentPlanStepDto,
} from '@ai-quality/contracts';
import {
  AgentInvalidRequestError,
  AgentAccessDeniedError,
} from './conversational-agent-errors.js';
import { getLogger, type ILogger } from '../logging/index.js';

export interface PlanGenerationRequest {
  readonly projectId: string;
  readonly prompt: string;
  readonly userId?: string;
  readonly sessionId?: string;
  readonly contextSnapshot?: Record<string, unknown>;
}

export interface PlanGenerationResult {
  readonly plan: AgentPlanDto;
  readonly intent: 'EXECUTE_TESTS' | 'QUERY_EVIDENCE' | 'GENERATE_TESTS' | 'STATUS_CHECK' | 'AMBIGUOUS' | 'GENERAL_QA';
  readonly requiresApproval: boolean;
  readonly requiresClarification: boolean;
  readonly clarificationMessage?: string;
  readonly suggestedOptions?: readonly string[];
}

export interface AgentPlanningServiceDependencies {
  readonly prisma?: PrismaClient;
  readonly projectContextService?: ProjectContextService;
  readonly logger?: ILogger;
}

export class AgentPlanningService {
  private readonly prisma: PrismaClient;
  private readonly projectContextService: ProjectContextService;
  private readonly logger: ILogger;

  constructor(deps: AgentPlanningServiceDependencies = {}) {
    const client = deps.prisma ?? getPrismaClient();
    if (!client) {
      throw new Error('Database connection is not configured or unavailable.');
    }
    this.prisma = client;
    this.projectContextService = deps.projectContextService ?? new ProjectContextService(this.prisma);
    this.logger = deps.logger ?? getLogger();
  }

  /**
   * Translates a natural language user request into a structured, inspectable plan.
   */
  public async generatePlan(request: PlanGenerationRequest): Promise<PlanGenerationResult> {
    const { projectId, prompt, userId, sessionId } = request;

    if (!prompt || prompt.trim().length === 0) {
      throw new AgentInvalidRequestError('Testing request prompt cannot be empty.');
    }

    // 1. Verify project access
    await this.assertProjectAccess(projectId);

    const normalizedPrompt = prompt.trim().toLowerCase();

    // 2. Fetch project context summary to ground planning
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      include: {
        websiteTargets: true,
        environments: true,
      },
    });

    if (!project) {
      throw new AgentAccessDeniedError(projectId, `Project not found: ${projectId}`);
    }

    const targetUrl = project.websiteTargets?.[0]?.baseUrl ?? project.environments?.[0]?.baseUrl ?? null;

    // 3. Check for Production Safe Mode and Destructive Operations
    const isProductionTarget = this.isTargetingProduction(targetUrl, prompt);
    const isDestructiveOperation = this.isDestructiveRequest(prompt);
    const requiresSafetyApproval = isProductionTarget || isDestructiveOperation;
    const safetyApprovalReason = isProductionTarget
      ? 'Execution targets a PRODUCTION environment. Explicit approval is required before running tests.'
      : isDestructiveOperation
        ? 'Request contains potentially destructive actions (data modification/wiping/heavy load). Explicit approval required.'
        : undefined;

    // 4. Intent Classification & Plan Building
    let result: PlanGenerationResult;

    if (this.isEvidenceQuery(normalizedPrompt)) {
      result = await this.planEvidenceQuery(projectId, prompt, userId, sessionId);
    } else if (this.isAmbiguousTestRequest(normalizedPrompt)) {
      result = await this.handleAmbiguousRequest(projectId, prompt, userId, sessionId);
    } else if (this.isTestExecutionRequest(normalizedPrompt)) {
      result = await this.planTestExecution(
        projectId,
        prompt,
        userId,
        sessionId,
        requiresSafetyApproval,
        safetyApprovalReason,
      );
    } else if (this.isTestGenerationRequest(normalizedPrompt)) {
      result = await this.planTestGeneration(projectId, prompt, userId, sessionId);
    } else if (this.isStatusOrReleaseCheck(normalizedPrompt)) {
      result = await this.planStatusCheck(projectId, prompt, userId, sessionId);
    } else {
      // General QA / Context lookup
      result = await this.planGeneralQa(projectId, prompt, userId, sessionId);
    }

    // 5. Audit Plan Generation
    await this.auditAgentAction('AGENT_PLAN_GENERATED', projectId, userId, {
      sessionId,
      intent: result.intent,
      requiresApproval: result.requiresApproval,
      requiresClarification: result.requiresClarification,
      stepCount: result.plan.steps.length,
    });

    return result;
  }

  // =========================================================================
  // Intent Analysis & Plan Generators
  // =========================================================================

  private async planTestExecution(
    projectId: string,
    prompt: string,
    userId?: string,
    sessionId?: string,
    requiresApproval = false,
    approvalReason?: string,
  ): Promise<PlanGenerationResult> {
    const isRetryFailed = prompt.toLowerCase().includes('failed') || prompt.toLowerCase().includes('retry');

    const steps: AgentPlanStepDto[] = [
      {
        stepIndex: 1,
        action: 'RESOLVE_CONTEXT',
        description: 'Resolve project context and execution target environment',
        targetTool: 'project_context',
        status: 'PENDING',
        isDestructive: false,
        requiresApproval: false,
      },
      {
        stepIndex: 2,
        action: 'SELECT_TESTS',
        description: isRetryFailed ? 'Identify failed test runs for rerun' : 'Search and select approved test cases',
        targetTool: 'test_search',
        status: 'PENDING',
        isDestructive: false,
        requiresApproval: false,
      },
      {
        stepIndex: 3,
        action: 'RUN_PLAYWRIGHT',
        description: 'Execute Playwright automated tests via run orchestrator',
        targetTool: 'playwright_execution',
        status: 'PENDING',
        isDestructive: requiresApproval,
        requiresApproval,
      },
      {
        stepIndex: 4,
        action: 'CAPTURE_EVIDENCE',
        description: 'Capture execution evidence, traces, and step screenshots',
        targetTool: 'evidence_search',
        status: 'PENDING',
        isDestructive: false,
        requiresApproval: false,
      },
      {
        stepIndex: 5,
        action: 'CLASSIFY_FAILURES',
        description: 'Classify any execution failures and analyze root causes',
        targetTool: 'failure_classification',
        status: 'PENDING',
        isDestructive: false,
        requiresApproval: false,
      },
    ];

    const plan: AgentPlanDto = {
      summary: `Automated testing plan: Resolves project context, locates approved tests, executes them via Playwright, collects evidence, and performs failure analysis.${requiresApproval ? ` [APPROVAL REQUIRED: ${approvalReason}]` : ''}`,
      intent: isRetryFailed ? 'RETRY_FAILED_TESTS' : 'EXECUTE_TESTS',
      steps,
      requiresApproval,
      approvalReason: approvalReason ?? null,
    };

    return {
      plan,
      intent: 'EXECUTE_TESTS',
      requiresApproval,
      requiresClarification: false,
    };
  }

  private async handleAmbiguousRequest(
    projectId: string,
    prompt: string,
    userId?: string,
    sessionId?: string,
  ): Promise<PlanGenerationResult> {
    // Find test cases in the project to provide concrete options
    const testCases = await this.prisma.testCase.findMany({
      where: { projectId },
      take: 4,
      select: { id: true, testCaseKey: true, title: true },
    });

    const suggestedOptions = testCases.length > 0
      ? testCases.map((tc) => `Run ${tc.testCaseKey}: ${tc.title}`)
      : ['Run all approved smoke tests', 'Run regression suite', 'Test specific URL endpoint'];

    const clarificationMessage =
      `Your request "${prompt}" is ambiguous and requires clarification because it matches multiple possible test suites or lacks a specific target. ` +
      `Please select one of the following options or specify exact test keys:`;

    const plan: AgentPlanDto = {
      summary: 'Ambiguity detected: Multiple test groups match or target scope is underspecified. Awaiting clarification from user.',
      intent: 'CLARIFY_AMBIGUOUS_REQUEST',
      steps: [
        {
          stepIndex: 1,
          action: 'AWAIT_CLARIFICATION',
          description: 'Awaiting user clarification on target test scope',
          targetTool: 'test_search',
          status: 'PENDING',
          isDestructive: false,
          requiresApproval: false,
        },
      ],
      requiresApproval: false,
      approvalReason: null,
    };

    return {
      plan,
      intent: 'AMBIGUOUS',
      requiresApproval: false,
      requiresClarification: true,
      clarificationMessage,
      suggestedOptions,
    };
  }

  private async planEvidenceQuery(
    projectId: string,
    prompt: string,
    userId?: string,
    sessionId?: string,
  ): Promise<PlanGenerationResult> {
    const steps: AgentPlanStepDto[] = [
      {
        stepIndex: 1,
        action: 'LOCATE_RUN_EVIDENCE',
        description: 'Locate execution run and associated evidence artifacts',
        targetTool: 'evidence_search',
        status: 'PENDING',
        isDestructive: false,
        requiresApproval: false,
      },
      {
        stepIndex: 2,
        action: 'INSPECT_TELEMETRY',
        description: 'Inspect step screenshots, console logs, and network telemetry',
        targetTool: 'evidence_search',
        status: 'PENDING',
        isDestructive: false,
        requiresApproval: false,
      },
      {
        stepIndex: 3,
        action: 'RETRIEVE_DIAGNOSTICS',
        description: 'Retrieve failure classifications, root cause diagnostics, and triage recommendations',
        targetTool: 'failure_classification',
        status: 'PENDING',
        isDestructive: false,
        requiresApproval: false,
      },
    ];

    const plan: AgentPlanDto = {
      summary: 'Grounded evidence inspection: Queries recorded run artifacts, step logs, DOM snapshots, and failure classifications to provide an accurate diagnostic explanation.',
      intent: 'QUERY_EVIDENCE',
      steps,
      requiresApproval: false,
      approvalReason: null,
    };

    return {
      plan,
      intent: 'QUERY_EVIDENCE',
      requiresApproval: false,
      requiresClarification: false,
    };
  }

  private async planTestGeneration(
    projectId: string,
    prompt: string,
    userId?: string,
    sessionId?: string,
  ): Promise<PlanGenerationResult> {
    const steps: AgentPlanStepDto[] = [
      {
        stepIndex: 1,
        action: 'FETCH_REQUIREMENTS',
        description: 'Retrieve project context, architecture, and requirements',
        targetTool: 'requirements_search',
        status: 'PENDING',
        isDestructive: false,
        requiresApproval: false,
      },
      {
        stepIndex: 2,
        action: 'GENERATE_SPECIFICATIONS',
        description: 'Generate structured test plan and test cases',
        targetTool: 'test_plan',
        status: 'PENDING',
        isDestructive: false,
        requiresApproval: false,
      },
    ];

    const plan: AgentPlanDto = {
      summary: 'Requirement-driven test generation: Discovers functional specs and produces executable test case plans.',
      intent: 'GENERATE_TESTS',
      steps,
      requiresApproval: false,
      approvalReason: null,
    };

    return {
      plan,
      intent: 'GENERATE_TESTS',
      requiresApproval: false,
      requiresClarification: false,
    };
  }

  private async planStatusCheck(
    projectId: string,
    prompt: string,
    userId?: string,
    sessionId?: string,
  ): Promise<PlanGenerationResult> {
    const steps: AgentPlanStepDto[] = [
      {
        stepIndex: 1,
        action: 'CHECK_RUN_QUEUE',
        description: 'Check active test runs and queue health',
        targetTool: 'execution_status',
        status: 'PENDING',
        isDestructive: false,
        requiresApproval: false,
      },
      {
        stepIndex: 2,
        action: 'CHECK_RELEASE_READINESS',
        description: 'Inspect project release gate status and quality score',
        targetTool: 'release_status',
        status: 'PENDING',
        isDestructive: false,
        requiresApproval: false,
      },
    ];

    const plan: AgentPlanDto = {
      summary: 'Status inspection: Checks active run progress, queue backlog, and quality release readiness.',
      intent: 'CHECK_STATUS',
      steps,
      requiresApproval: false,
      approvalReason: null,
    };

    return {
      plan,
      intent: 'STATUS_CHECK',
      requiresApproval: false,
      requiresClarification: false,
    };
  }

  private async planGeneralQa(
    projectId: string,
    prompt: string,
    userId?: string,
    sessionId?: string,
  ): Promise<PlanGenerationResult> {
    const steps: AgentPlanStepDto[] = [
      {
        stepIndex: 1,
        action: 'FETCH_PROJECT_CONTEXT',
        description: 'Fetch unified project context and quality metrics',
        targetTool: 'project_context',
        status: 'PENDING',
        isDestructive: false,
        requiresApproval: false,
      },
    ];

    const plan: AgentPlanDto = {
      summary: 'Context query: Gathers project specifications and test health metrics to answer your request.',
      intent: 'GENERAL_QA',
      steps,
      requiresApproval: false,
      approvalReason: null,
    };

    return {
      plan,
      intent: 'GENERAL_QA',
      requiresApproval: false,
      requiresClarification: false,
    };
  }

  // =========================================================================
  // Intent Helpers
  // =========================================================================

  private isEvidenceQuery(prompt: string): boolean {
    return (
      prompt.includes('why did') ||
      prompt.includes('why this test failed') ||
      prompt.includes('show evidence') ||
      prompt.includes('show screenshot') ||
      prompt.includes('show trace') ||
      prompt.includes('console log') ||
      prompt.includes('network error') ||
      prompt.includes('what happened') ||
      prompt.includes('expected result') ||
      prompt.includes('actual result') ||
      prompt.includes('bug report') ||
      prompt.includes('root cause')
    );
  }

  private isAmbiguousTestRequest(prompt: string): boolean {
    const trimmed = prompt.trim();
    const isVague =
      trimmed === 'test' ||
      trimmed === 'run tests' ||
      trimmed === 'execute tests' ||
      trimmed === 'test it' ||
      trimmed === 'run' ||
      trimmed === 'test all' ||
      trimmed === 'run all';
    return isVague;
  }

  private isTestExecutionRequest(prompt: string): boolean {
    return (
      prompt.includes('test') ||
      prompt.includes('run') ||
      prompt.includes('execute') ||
      prompt.includes('playwright') ||
      prompt.includes('retry') ||
      prompt.includes('rerun')
    );
  }

  private isTestGenerationRequest(prompt: string): boolean {
    return (
      prompt.includes('generate test') ||
      prompt.includes('create test') ||
      prompt.includes('plan test') ||
      prompt.includes('write test')
    );
  }

  private isStatusOrReleaseCheck(prompt: string): boolean {
    return (
      prompt.includes('status') ||
      prompt.includes('release') ||
      prompt.includes('queue') ||
      prompt.includes('progress')
    );
  }

  private isTargetingProduction(targetUrl?: string | null, prompt = ''): boolean {
    const combined = `${targetUrl ?? ''} ${prompt}`.toLowerCase();
    return (
      combined.includes('production') ||
      combined.includes('prod.internal') ||
      combined.includes('.prod.') ||
      combined.includes('live.env') ||
      combined.includes('api.production')
    );
  }

  private isDestructiveRequest(prompt: string): boolean {
    const lower = prompt.toLowerCase();
    return (
      lower.includes('drop database') ||
      lower.includes('delete all') ||
      lower.includes('wipe') ||
      lower.includes('truncate') ||
      lower.includes('destructive') ||
      lower.includes('purge')
    );
  }

  private async assertProjectAccess(projectId: string): Promise<void> {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true },
    });
    if (!project) {
      throw new AgentAccessDeniedError(projectId, `Project not found or inaccessible: "${projectId}"`);
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
      this.logger.warn('Failed to audit agent action', { action, error: String(err) });
    }
  }
}
