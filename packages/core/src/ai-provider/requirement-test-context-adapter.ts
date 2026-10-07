/**
 * @file packages/core/src/ai-provider/requirement-test-context-adapter.ts
 * V9 Phase 136 — Requirement & Test Context Adapter.
 *
 * Exposes a normalized, bounded, privacy-safe adapter to supply existing V3-V7
 * requirement, test case, traceability, execution, and failure domain context
 * to the V9 AI Runtime (Ollama / Local Models).
 *
 * Core Guarantees:
 * 1. Strict Tenant & Project Isolation: Verifies ownership; rejects cross-project queries.
 * 2. Source Provenance Preservation: Preserves requirements/tests/executions/failures IDs and source provenance.
 * 3. Secret Redaction: Scrubs passwords, bearer tokens, API keys, database credentials.
 * 4. Token Bounding & Budgeting: Prioritizes and bounds output using TokenEstimatorService.
 * 5. Deterministic Formatters: Produces both structured DTOs and clean model prompts.
 * 6. Untrusted Content Sandboxing: Formats with clear boundaries to mitigate prompt injection.
 */

import type { PrismaClient } from '@prisma/client';
import { getPrismaClient } from '../database/client.js';
import { getLogger, type ILogger } from '../logging/index.js';
import { TokenEstimatorService } from './token-estimator.js';
import { AiPrivacyService } from './ai-privacy-service.js';
import {
  AiInvalidRequestError,
  AiCrossProjectAccessError,
} from './ai-provider-errors.js';
import type {
  AiRequirementItemDto,
  AiTestCaseItemDto,
  AiTraceabilityItemDto,
  AiExecutionSummaryItemDto,
  AiFailureSummaryItemDto,
  AssembleRequirementTestContextInputDto,
  RequirementTestContextResultDto,
} from '@ai-quality/contracts';
import { assembleRequirementTestContextInputSchema } from '@ai-quality/contracts';

export interface RequirementTestContextAdapterDependencies {
  readonly prisma?: PrismaClient;
  readonly aiPrivacyService?: AiPrivacyService;
  readonly logger?: ILogger;
}

export class RequirementTestContextAdapter {
  private readonly prisma: PrismaClient;
  private readonly aiPrivacyService: AiPrivacyService;
  private readonly logger: ILogger;

  // Sensible default limits to prevent unbounded DB queries and token explosions
  public static readonly DEFAULT_MAX_REQUIREMENTS = 20;
  public static readonly DEFAULT_MAX_TEST_CASES = 25;
  public static readonly DEFAULT_MAX_EXECUTIONS = 15;
  public static readonly DEFAULT_MAX_FAILURES = 10;
  public static readonly DEFAULT_MAX_TOKENS = 12_000;

  constructor(deps?: RequirementTestContextAdapterDependencies) {
    const client = deps?.prisma ?? getPrismaClient();
    if (!client) {
      throw new Error('Database connection is not configured or unavailable.');
    }
    this.prisma = client;
    this.logger = deps?.logger ?? getLogger();
    this.aiPrivacyService =
      deps?.aiPrivacyService ??
      new AiPrivacyService({
        prisma: this.prisma,
        logger: this.logger,
      });
  }

  /**
   * Asserts project tenant isolation.
   */
  public async assertProjectAccess(projectId: string, userId?: string): Promise<void> {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, userId: true },
    });

    if (!project) {
      throw new AiInvalidRequestError(`Project with ID '${projectId}' was not found.`);
    }

    if (userId && project.userId && project.userId !== userId) {
      this.logger.warn('ai_context.cross_project_violation', {
        projectId,
        projectOwnerId: project.userId,
        requestUserId: userId,
      });
      throw new AiCrossProjectAccessError(
        `User '${userId}' does not have permission to access project '${projectId}'.`,
      );
    }
  }

  /**
   * Assembles, sanitizes, formats, and token-bounds requirement and test context.
   */
  public async assembleContext(
    input: AssembleRequirementTestContextInputDto,
    userId?: string,
  ): Promise<RequirementTestContextResultDto> {
    const validated = assembleRequirementTestContextInputSchema.parse(input);
    const projectId = validated.projectId;

    await this.assertProjectAccess(projectId, userId);

    const maxTokens = validated.maxTokens ?? RequirementTestContextAdapter.DEFAULT_MAX_TOKENS;
    const maxReqs = validated.maxRequirements ?? RequirementTestContextAdapter.DEFAULT_MAX_REQUIREMENTS;
    const maxTests = validated.maxTestCases ?? RequirementTestContextAdapter.DEFAULT_MAX_TEST_CASES;
    const maxExecs = validated.maxExecutions ?? RequirementTestContextAdapter.DEFAULT_MAX_EXECUTIONS;
    const maxFails = validated.maxFailures ?? RequirementTestContextAdapter.DEFAULT_MAX_FAILURES;

    // 1. Fetch Requirements
    const rawRequirements = await this.fetchRequirements(projectId, validated, maxReqs);

    // 2. Fetch Test Cases
    const rawTestCases = await this.fetchTestCases(
      projectId,
      validated,
      rawRequirements.map((r) => r.id),
      maxTests,
    );

    // 3. Fetch Traceability Links
    const rawTraceability = validated.includeTraceability !== false
      ? await this.fetchTraceability(
          projectId,
          rawRequirements.map((r) => r.id),
          rawTestCases.map((t) => t.id),
        )
      : [];

    // 4. Fetch Execution Summaries
    const rawExecutions = validated.includeExecutions !== false
      ? await this.fetchExecutions(
          projectId,
          rawTestCases.map((t) => t.id),
          maxExecs,
        )
      : [];

    // 5. Fetch Failure Cases
    const rawFailures = validated.includeFailures !== false
      ? await this.fetchFailures(
          projectId,
          rawTestCases.map((t) => t.id),
          maxFails,
        )
      : [];

    // 6. Redact secrets from text fields
    const sanitizedRequirements = this.sanitizeRequirements(rawRequirements);
    const sanitizedTestCases = this.sanitizeTestCases(rawTestCases);
    const sanitizedTraceability = rawTraceability;
    const sanitizedExecutions = this.sanitizeExecutions(rawExecutions);
    const sanitizedFailures = this.sanitizeFailures(rawFailures);

    // 7. Token budget packing & pruning
    return this.packAndBoundContext({
      projectId,
      requirements: sanitizedRequirements,
      testCases: sanitizedTestCases,
      traceability: sanitizedTraceability,
      executions: sanitizedExecutions,
      failures: sanitizedFailures,
      maxTokens,
    });
  }

  /**
   * Queries requirement entities with provenance.
   */
  private async fetchRequirements(
    projectId: string,
    input: AssembleRequirementTestContextInputDto,
    limit: number,
  ): Promise<AiRequirementItemDto[]> {
    const where: import('@prisma/client').Prisma.RequirementWhereInput = {
      projectId,
    };

    if (input.requirementIds && input.requirementIds.length > 0) {
      where.id = { in: [...input.requirementIds] };
    } else if (input.requirementKeys && input.requirementKeys.length > 0) {
      where.requirementKey = { in: [...input.requirementKeys] };
    }

    const records = await this.prisma.requirement.findMany({
      where,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        provenance: true,
        versions: {
          orderBy: { versionNumber: 'desc' },
          take: 1,
        },
      },
    });

    return records.map((record) => {
      const latestVersion = record.versions[0];
      return {
        id: record.id,
        requirementKey: record.requirementKey,
        title: record.title,
        description: record.originalText,
        type: record.type,
        status: record.status,
        priority: record.priority,
        versionNumber: latestVersion?.versionNumber,
        provenance: record.provenance
          ? {
              sourceKind: record.provenance.sourceKind,
              sourceText: record.provenance.sourceText,
              sectionPath: record.provenance.sectionPath,
              pageNumber: record.provenance.pageNumber,
              lineStart: record.provenance.lineStart,
              lineEnd: record.provenance.lineEnd,
            }
          : null,
      };
    });
  }

  /**
   * Queries test cases and steps.
   */
  private async fetchTestCases(
    projectId: string,
    input: AssembleRequirementTestContextInputDto,
    scopedReqIds: string[],
    limit: number,
  ): Promise<AiTestCaseItemDto[]> {
    const where: import('@prisma/client').Prisma.TestCaseWhereInput = {
      projectId,
    };

    if (input.testCaseIds && input.testCaseIds.length > 0) {
      where.id = { in: [...input.testCaseIds] };
    } else if (input.testCaseKeys && input.testCaseKeys.length > 0) {
      where.testCaseKey = { in: [...input.testCaseKeys] };
    } else if (scopedReqIds.length > 0) {
      where.sourceRequirementId = { in: scopedReqIds };
    }

    const records = await this.prisma.testCase.findMany({
      where,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        preconditions: {
          orderBy: { sequenceOrder: 'asc' },
        },
        steps: {
          orderBy: { stepNumber: 'asc' },
        },
      },
    });

    return records.map((record) => ({
      id: record.id,
      testCaseKey: record.testCaseKey,
      sourceRequirementId: record.sourceRequirementId,
      sourceRequirementKey: record.sourceRequirementKey,
      title: record.title,
      objective: record.objective,
      type: record.type,
      priority: record.priority,
      status: record.status,
      reviewStatus: record.reviewStatus,
      preconditions: record.preconditions.map((p) => p.description),
      steps: record.steps.map((s) => ({
        stepNumber: s.stepNumber,
        action: s.action,
        expectedResult: s.expectedResult,
      })),
      expectedResult: record.overallExpectedResult,
      tags: record.tags,
    }));
  }

  /**
   * Queries traceability records.
   */
  private async fetchTraceability(
    projectId: string,
    requirementIds: string[],
    testCaseIds: string[],
  ): Promise<AiTraceabilityItemDto[]> {
    const where: import('@prisma/client').Prisma.RequirementTestTraceWhereInput = {
      projectId,
    };

    if (requirementIds.length > 0 && testCaseIds.length > 0) {
      where.OR = [
        { requirementId: { in: requirementIds } },
        { testCaseId: { in: testCaseIds } },
      ];
    } else if (requirementIds.length > 0) {
      where.requirementId = { in: requirementIds };
    } else if (testCaseIds.length > 0) {
      where.testCaseId = { in: testCaseIds };
    }

    const records = await this.prisma.requirementTestTrace.findMany({
      where,
      take: 50,
      orderBy: { createdAt: 'desc' },
      include: {
        requirement: { select: { requirementKey: true } },
        testCase: { select: { testCaseKey: true } },
      },
    });

    return records.map((r) => ({
      id: r.id,
      requirementId: r.requirementId,
      requirementKey: r.requirement.requirementKey,
      testCaseId: r.testCaseId,
      testCaseKey: r.testCase.testCaseKey,
      status: r.status,
      origin: r.origin,
    }));
  }

  /**
   * Queries test execution summaries.
   */
  private async fetchExecutions(
    projectId: string,
    testCaseIds: string[],
    limit: number,
  ): Promise<AiExecutionSummaryItemDto[]> {
    const where: import('@prisma/client').Prisma.TestRunWhereInput = {
      projectId,
    };

    if (testCaseIds.length > 0) {
      where.testCaseId = { in: testCaseIds };
    }

    const records = await this.prisma.testRun.findMany({
      where,
      take: limit,
      orderBy: { queuedAt: 'desc' },
      include: {
        testCase: { select: { testCaseKey: true } },
      },
    });

    return records.map((run) => ({
      id: run.id,
      testCaseId: run.testCaseId,
      testCaseKey: run.testCase.testCaseKey,
      status: run.status,
      durationMs: run.executionDurationMs,
      errorMessage: run.errorMessage,
      terminalReason: run.terminalReason,
      completedAt: run.completedAt?.toISOString() ?? null,
    }));
  }

  /**
   * Queries failure case summaries.
   */
  private async fetchFailures(
    projectId: string,
    testCaseIds: string[],
    limit: number,
  ): Promise<AiFailureSummaryItemDto[]> {
    const where: import('@prisma/client').Prisma.FailureCaseWhereInput = {
      projectId,
    };

    if (testCaseIds.length > 0) {
      where.testCaseId = { in: testCaseIds };
    }

    const records = await this.prisma.failureCase.findMany({
      where,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        testCase: { select: { testCaseKey: true } },
      },
    });

    return records.map((fc) => ({
      id: fc.id,
      testCaseId: fc.testCaseId,
      testCaseKey: fc.testCase.testCaseKey,
      title: fc.title,
      failureSummary: fc.failureSummary,
      errorMessage: fc.errorMessage,
      errorCode: fc.errorCode,
      status: fc.status,
      failureSignature: fc.failureSignature,
    }));
  }

  /**
   * Sanitizes secrets from requirements.
   */
  private sanitizeRequirements(reqs: readonly AiRequirementItemDto[]): AiRequirementItemDto[] {
    return reqs.map((req) => ({
      ...req,
      title: this.aiPrivacyService.sanitizeText(req.title).text,
      description: this.aiPrivacyService.sanitizeText(req.description).text,
      provenance: req.provenance
        ? {
            ...req.provenance,
            sourceText: req.provenance.sourceText
              ? this.aiPrivacyService.sanitizeText(req.provenance.sourceText).text
              : null,
            sectionPath: req.provenance.sectionPath
              ? this.aiPrivacyService.sanitizeText(req.provenance.sectionPath).text
              : null,
          }
        : null,
    }));
  }

  /**
   * Sanitizes secrets from test cases.
   */
  private sanitizeTestCases(tests: readonly AiTestCaseItemDto[]): AiTestCaseItemDto[] {
    return tests.map((tc) => ({
      ...tc,
      title: this.aiPrivacyService.sanitizeText(tc.title).text,
      objective: tc.objective ? this.aiPrivacyService.sanitizeText(tc.objective).text : undefined,
      preconditions: tc.preconditions?.map((p) => this.aiPrivacyService.sanitizeText(p).text),
      steps: tc.steps?.map((s) => ({
        ...s,
        action: this.aiPrivacyService.sanitizeText(s.action).text,
        expectedResult: s.expectedResult
          ? this.aiPrivacyService.sanitizeText(s.expectedResult).text
          : null,
      })),
      expectedResult: tc.expectedResult
        ? this.aiPrivacyService.sanitizeText(tc.expectedResult).text
        : null,
    }));
  }

  /**
   * Sanitizes execution summaries.
   */
  private sanitizeExecutions(execs: readonly AiExecutionSummaryItemDto[]): AiExecutionSummaryItemDto[] {
    return execs.map((e) => ({
      ...e,
      errorMessage: e.errorMessage ? this.aiPrivacyService.sanitizeText(e.errorMessage).text : null,
      terminalReason: e.terminalReason
        ? this.aiPrivacyService.sanitizeText(e.terminalReason).text
        : null,
    }));
  }

  /**
   * Sanitizes failures.
   */
  private sanitizeFailures(fails: readonly AiFailureSummaryItemDto[]): AiFailureSummaryItemDto[] {
    return fails.map((f) => ({
      ...f,
      title: this.aiPrivacyService.sanitizeText(f.title).text,
      failureSummary: f.failureSummary
        ? this.aiPrivacyService.sanitizeText(f.failureSummary).text
        : null,
      errorMessage: f.errorMessage ? this.aiPrivacyService.sanitizeText(f.errorMessage).text : null,
    }));
  }

  /**
   * Packs, formats, and bounds items within maximum token budget.
   */
  private packAndBoundContext(params: {
    projectId: string;
    requirements: AiRequirementItemDto[];
    testCases: AiTestCaseItemDto[];
    traceability: AiTraceabilityItemDto[];
    executions: AiExecutionSummaryItemDto[];
    failures: AiFailureSummaryItemDto[];
    maxTokens: number;
  }): RequirementTestContextResultDto {
    let truncated = false;
    let truncationReason: string | null = null;

    let activeReqs = [...params.requirements];
    let activeTests = [...params.testCases];
    let activeTrace = [...params.traceability];
    let activeExecs = [...params.executions];
    let activeFails = [...params.failures];

    const generateFormats = () => {
      const reqText = this.formatRequirements(activeReqs);
      const testText = this.formatTestCases(activeTests, activeTrace, activeExecs, activeFails);
      const unifiedText = [reqText, testText].filter(Boolean).join('\n\n');
      const tokens = TokenEstimatorService.estimateString(unifiedText);
      return { reqText, testText, unifiedText, tokens };
    };

    let { reqText, testText, unifiedText, tokens } = generateFormats();

    // Prune in priority order if token limit exceeded:
    // 1. Drop executions
    // 2. Drop failures
    // 3. Drop traceability
    // 4. Drop test cases (from tail)
    // 5. Drop requirements (from tail)
    if (tokens > params.maxTokens && activeExecs.length > 0) {
      truncated = true;
      truncationReason = 'Context exceeded token budget; pruned execution history.';
      activeExecs = [];
      ({ reqText, testText, unifiedText, tokens } = generateFormats());
    }

    if (tokens > params.maxTokens && activeFails.length > 0) {
      truncated = true;
      truncationReason = 'Context exceeded token budget; pruned failure records.';
      activeFails = [];
      ({ reqText, testText, unifiedText, tokens } = generateFormats());
    }

    if (tokens > params.maxTokens && activeTrace.length > 0) {
      truncated = true;
      truncationReason = 'Context exceeded token budget; pruned traceability links.';
      activeTrace = [];
      ({ reqText, testText, unifiedText, tokens } = generateFormats());
    }

    while (tokens > params.maxTokens && activeTests.length > 0) {
      truncated = true;
      truncationReason = 'Context exceeded token budget; pruned test cases.';
      activeTests.pop();
      ({ reqText, testText, unifiedText, tokens } = generateFormats());
    }

    while (tokens > params.maxTokens && activeReqs.length > 0) {
      truncated = true;
      truncationReason = 'Context exceeded token budget; pruned requirement items.';
      activeReqs.pop();
      ({ reqText, testText, unifiedText, tokens } = generateFormats());
    }

    // If headers or single items still exceed maxTokens, deterministically truncate text
    if (tokens > params.maxTokens && unifiedText.length > 0) {
      truncated = true;
      truncationReason = 'Context exceeded token budget; truncated context text.';
      const maxChars = Math.floor(params.maxTokens * 3.8);
      unifiedText = unifiedText.slice(0, maxChars) + '... [TRUNCATED]';
      tokens = TokenEstimatorService.estimateString(unifiedText);
    }

    return {
      projectId: params.projectId,
      requirements: activeReqs,
      testCases: activeTests,
      traceability: activeTrace,
      executions: activeExecs,
      failures: activeFails,
      formattedRequirementContext: reqText,
      formattedTestContext: testText,
      formattedUnifiedContext: unifiedText,
      estimatedTokens: tokens,
      truncated,
      truncationReason,
    };
  }

  /**
   * Deterministic formatter for requirements context.
   */
  public formatRequirements(requirements: readonly AiRequirementItemDto[]): string {
    if (requirements.length === 0) return '';

    const lines: string[] = ['### PROJECT REQUIREMENTS (UNTRUSTED DATA SOURCE)'];

    for (const req of requirements) {
      lines.push(`\n[REQUIREMENT: ${req.requirementKey}]`);
      lines.push(`Title: ${req.title}`);
      lines.push(`Type: ${req.type} | Priority: ${req.priority} | Status: ${req.status}`);
      if (req.versionNumber) {
        lines.push(`Version: v${req.versionNumber}`);
      }
      if (req.provenance) {
        const provParts: string[] = [];
        if (req.provenance.sourceKind) provParts.push(`Source: ${req.provenance.sourceKind}`);
        if (req.provenance.sectionPath) provParts.push(`Section: ${req.provenance.sectionPath}`);
        if (req.provenance.pageNumber) provParts.push(`Page: ${req.provenance.pageNumber}`);
        if (req.provenance.lineStart && req.provenance.lineEnd) {
          provParts.push(`Lines: ${req.provenance.lineStart}-${req.provenance.lineEnd}`);
        }
        if (provParts.length > 0) {
          lines.push(`Provenance: ${provParts.join(', ')}`);
        }
      }
      lines.push('Description:');
      lines.push(req.description);
    }

    return lines.join('\n');
  }

  /**
   * Deterministic formatter for test cases, executions, and failures.
   */
  public formatTestCases(
    testCases: readonly AiTestCaseItemDto[],
    traceability: readonly AiTraceabilityItemDto[],
    executions: readonly AiExecutionSummaryItemDto[],
    failures: readonly AiFailureSummaryItemDto[],
  ): string {
    if (testCases.length === 0 && executions.length === 0 && failures.length === 0) return '';

    const lines: string[] = ['### TEST SPECIFICATIONS & EXECUTION CONTEXT (UNTRUSTED DATA SOURCE)'];

    // Map test traces
    const traceMap = new Map<string, string[]>();
    for (const tr of traceability) {
      const list = traceMap.get(tr.testCaseId) ?? [];
      list.push(tr.requirementKey);
      traceMap.set(tr.testCaseId, list);
    }

    for (const tc of testCases) {
      lines.push(`\n[TEST CASE: ${tc.testCaseKey}]`);
      lines.push(`Title: ${tc.title}`);
      lines.push(`Type: ${tc.type} | Priority: ${tc.priority} | Status: ${tc.status} | Review: ${tc.reviewStatus}`);

      const linkedReqs = traceMap.get(tc.id) ?? (tc.sourceRequirementKey ? [tc.sourceRequirementKey] : []);
      if (linkedReqs.length > 0) {
        lines.push(`Linked Requirements: ${linkedReqs.join(', ')}`);
      }

      if (tc.objective) {
        lines.push(`Objective: ${tc.objective}`);
      }

      if (tc.preconditions && tc.preconditions.length > 0) {
        lines.push('Preconditions:');
        tc.preconditions.forEach((p, idx) => lines.push(`  ${idx + 1}. ${p}`));
      }

      if (tc.steps && tc.steps.length > 0) {
        lines.push('Steps:');
        tc.steps.forEach((s) => {
          const exp = s.expectedResult ? ` -> Expected: ${s.expectedResult}` : '';
          lines.push(`  Step ${s.stepNumber}: ${s.action}${exp}`);
        });
      }

      if (tc.expectedResult) {
        lines.push(`Overall Expected Result: ${tc.expectedResult}`);
      }
    }

    if (executions.length > 0) {
      lines.push('\n[RECENT TEST EXECUTIONS]');
      for (const ex of executions) {
        const dur = ex.durationMs != null ? ` (${ex.durationMs}ms)` : '';
        const err = ex.errorMessage ? ` - Error: ${ex.errorMessage}` : '';
        lines.push(`- ${ex.testCaseKey}: Status=${ex.status}${dur}${err}`);
      }
    }

    if (failures.length > 0) {
      lines.push('\n[ACTIVE DEFECTS & FAILURES]');
      for (const f of failures) {
        const sig = f.failureSignature ? ` [Sig: ${f.failureSignature}]` : '';
        lines.push(`- ${f.testCaseKey}: ${f.title} (${f.status})${sig}`);
        if (f.failureSummary) {
          lines.push(`  Summary: ${f.failureSummary}`);
        }
        if (f.errorMessage) {
          lines.push(`  Error: ${f.errorMessage}`);
        }
      }
    }

    return lines.join('\n');
  }
}
