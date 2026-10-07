/**
 * @file packages/core/src/agent-tools/quality-intelligence/quality-intelligence-service.ts
 * Domain service for V10 Phase 146: Requirement & Test Intelligence Tools.
 *
 * Implements:
 * 1. requirements.list: Paginated, filtered list of project requirements.
 * 2. requirements.get: Single requirement with full provenance, versions, and tags.
 * 3. requirements.search: Search requirements by query text with contextual snippets.
 * 4. tests.list: Paginated, filtered list of generated/approved test cases.
 * 5. tests.get: Complete test case details with steps, preconditions, and source requirement link.
 * 6. tests.search: Search test cases by query text with contextual snippets.
 * 7. tests.forRequirement: Test cases traced to a specific requirement.
 * 8. traceability.get: Requirement-to-test traceability matrix with coverage analysis.
 *
 * Security & Isolation:
 * - Strict tenant authorization: User -> Project -> Resource.
 * - Read-only guarantee.
 * - Safe bounded pagination and text truncation.
 */

import type { Prisma, PrismaClient } from '@prisma/client';
import { getPrismaClient } from '../../database/client.js';
import { getLogger, type ILogger } from '../../logging/index.js';
import {
  type ReqListRequirementsInputDto,
  type ReqListRequirementsOutputDto,
  type ReqListItemDto,
  type ReqGetRequirementInputDto,
  type ReqGetRequirementOutputDto,
  type ReqSearchRequirementsInputDto,
  type ReqSearchRequirementsOutputDto,
  type ReqSearchMatchDto,
  type TestListTestsInputDto,
  type TestListTestsOutputDto,
  type TestListItemDto,
  type TestGetTestInputDto,
  type TestGetTestOutputDto,
  type TestSearchTestsInputDto,
  type TestSearchTestsOutputDto,
  type TestSearchMatchDto,
  type TestForRequirementInputDto,
  type TestForRequirementOutputDto,
  type TraceabilityGetInputDto,
  type TraceabilityGetOutputDto,
  type TraceabilityToolMatrixItemDto,
  reqListRequirementsInputSchema,
  reqGetRequirementInputSchema,
  reqSearchRequirementsInputSchema,
  testListTestsInputSchema,
  testGetTestInputSchema,
  testSearchTestsInputSchema,
  testForRequirementInputSchema,
  traceabilityGetInputSchema,
} from '@ai-quality/contracts';
import {
  QualityIntelligenceRequirementNotFoundError,
  QualityIntelligenceTestCaseNotFoundError,
  QualityIntelligenceValidationError,
} from './quality-intelligence-errors.js';
import {
  AiCrossProjectAccessError,
  AiInvalidRequestError,
} from '../../ai-provider/ai-provider-errors.js';
import { RequirementService } from '../../requirements/requirement-service.js';
import { TestCaseService } from '../../test-cases/test-case-service.js';
import { RequirementTestTraceService } from '../../traceability/requirement-test-trace-service.js';
import { CoverageAnalysisService } from '../../coverage/coverage-analysis-service.js';

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(str: string): boolean {
  return UUID_REGEX.test(str.trim());
}

function extractSnippet(text: string, query: string, maxLength = 160): string {
  if (!text) return '';
  const cleanText = text.replace(/\s+/g, ' ').trim();
  const lowerText = cleanText.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const matchIndex = lowerText.indexOf(lowerQuery);

  if (matchIndex === -1) {
    return cleanText.length > maxLength
      ? `${cleanText.slice(0, maxLength)}...`
      : cleanText;
  }

  const half = Math.floor((maxLength - query.length) / 2);
  const start = Math.max(0, matchIndex - half);
  const end = Math.min(cleanText.length, matchIndex + query.length + half);

  let snippet = cleanText.slice(start, end);
  if (start > 0) snippet = `...${snippet}`;
  if (end < cleanText.length) snippet = `${snippet}...`;
  return snippet;
}

export interface QualityIntelligenceServiceDependencies {
  readonly prisma?: PrismaClient;
  readonly logger?: ILogger;
  readonly requirementService?: RequirementService;
  readonly testCaseService?: TestCaseService;
  readonly traceService?: RequirementTestTraceService;
  readonly coverageService?: CoverageAnalysisService;
}

export class QualityIntelligenceService {
  private readonly prisma: PrismaClient;
  private readonly logger: ILogger;
  private readonly requirementService: RequirementService;
  private readonly testCaseService: TestCaseService;
  private readonly traceService: RequirementTestTraceService;
  private readonly coverageService: CoverageAnalysisService;

  constructor(deps?: QualityIntelligenceServiceDependencies) {
    const client = deps?.prisma ?? getPrismaClient();
    if (!client) {
      throw new Error('Database client is not configured or unavailable.');
    }
    this.prisma = client;
    this.logger = deps?.logger ?? getLogger();
    this.requirementService = deps?.requirementService ?? new RequirementService();
    this.testCaseService = deps?.testCaseService ?? new TestCaseService(this.prisma);
    this.traceService = deps?.traceService ?? new RequirementTestTraceService(this.prisma);
    this.coverageService = deps?.coverageService ?? new CoverageAnalysisService(this.prisma);
  }

  // ============================================================================
  // Project Access Authorization
  // ============================================================================

  public async assertProjectAccess(
    projectId: string,
    userId: string,
  ): Promise<{ id: string; userId: string | null; name: string }> {
    if (!projectId) {
      throw new AiInvalidRequestError('Project ID is required.');
    }

    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, userId: true, name: true, deletedAt: true },
    });

    if (!project || project.deletedAt) {
      throw new AiInvalidRequestError(`Project with ID '${projectId}' was not found.`);
    }

    if (project.userId && userId && project.userId !== userId) {
      this.logger.warn('quality_intelligence_tool.cross_project_violation', {
        projectId,
        projectOwnerId: project.userId,
        requestUserId: userId,
      });
      throw new AiCrossProjectAccessError(
        `User '${userId}' does not have permission to access project '${projectId}'.`,
      );
    }

    return project;
  }

  // ============================================================================
  // 1. requirements.list
  // ============================================================================

  public async listRequirements(
    rawInput: ReqListRequirementsInputDto,
    userId: string,
  ): Promise<ReqListRequirementsOutputDto> {
    const parsed = reqListRequirementsInputSchema.safeParse(rawInput);
    if (!parsed.success) {
      throw new QualityIntelligenceValidationError(
        parsed.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join('; '),
      );
    }
    const input = parsed.data;
    await this.assertProjectAccess(input.projectId, userId);

    const limit = input.limit ?? 20;
    const offset = input.offset ?? 0;

    const where: Prisma.RequirementWhereInput = {
      projectId: input.projectId,
      ...(input.status ? { status: input.status as never } : {}),
      ...(input.type ? { type: input.type as never } : {}),
      ...(input.priority ? { priority: input.priority as never } : {}),
    };

    const [total, records] = await Promise.all([
      this.prisma.requirement.count({ where }),
      this.prisma.requirement.findMany({
        where,
        orderBy: { requirementKey: 'asc' },
        skip: offset,
        take: limit,
        include: {
          requirementSource: { select: { sourceType: true } },
          versions: {
            orderBy: { versionNumber: 'desc' },
            take: 1,
            select: { versionNumber: true },
          },
        },
      }),
    ]);

    const items: ReqListItemDto[] = records.map(r => {
      const fullText = r.originalText || '';
      const summary = fullText.length > 200 ? `${fullText.slice(0, 197)}...` : fullText;
      return {
        id: r.id,
        requirementKey: r.requirementKey,
        title: r.title,
        descriptionSummary: summary,
        status: r.status,
        type: r.type,
        priority: r.priority,
        latestVersion: r.versions[0]?.versionNumber ?? 1,
        sourceType: r.requirementSource?.sourceType ?? null,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
      };
    });

    return {
      items,
      total,
      limit,
      offset,
      truncated: total > offset + limit,
    };
  }

  // ============================================================================
  // 2. requirements.get
  // ============================================================================

  public async getRequirement(
    rawInput: ReqGetRequirementInputDto,
    userId: string,
  ): Promise<ReqGetRequirementOutputDto> {
    const parsed = reqGetRequirementInputSchema.safeParse(rawInput);
    if (!parsed.success) {
      throw new QualityIntelligenceValidationError(
        parsed.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join('; '),
      );
    }
    const input = parsed.data;
    await this.assertProjectAccess(input.projectId, userId);

    const identifier = input.requirementId.trim();
    const isIdUuid = isUuid(identifier);

    const requirement = await this.prisma.requirement.findFirst({
      where: {
        projectId: input.projectId,
        ...(isIdUuid
          ? { OR: [{ id: identifier }, { requirementKey: identifier }] }
          : { requirementKey: identifier }),
      },
      include: {
        requirementSource: {
          select: { id: true, name: true, sourceType: true, document: true },
        },
        versions: { orderBy: { versionNumber: 'desc' }, take: 1 },
        metadata: { select: { tags: true } },
        _count: { select: { testTraces: true } },
      },
    });

    if (!requirement) {
      throw new QualityIntelligenceRequirementNotFoundError(
        input.requirementId,
        input.projectId,
      );
    }

    const latestVersion = requirement.versions[0]?.versionNumber ?? 1;
    let tags: string[] = [];
    if (requirement.metadata?.tags && Array.isArray(requirement.metadata.tags)) {
      tags = requirement.metadata.tags.map(String);
    }

    const sourceDto = requirement.requirementSource
      ? {
          sourceId: requirement.requirementSource.id,
          sourceType: requirement.requirementSource.sourceType,
          documentName:
            requirement.requirementSource.document?.originalFileName ??
            requirement.requirementSource.name,
          rawExcerpt: requirement.originalText.slice(0, 500),
        }
      : null;

    return {
      id: requirement.id,
      requirementKey: requirement.requirementKey,
      title: requirement.title,
      description: requirement.originalText,
      status: requirement.status,
      type: requirement.type,
      priority: requirement.priority,
      versionNumber: latestVersion,
      source: sourceDto,
      tags,
      tracedTestCount: requirement._count?.testTraces ?? 0,
      createdAt: requirement.createdAt.toISOString(),
      updatedAt: requirement.updatedAt.toISOString(),
    };
  }

  // ============================================================================
  // 3. requirements.search
  // ============================================================================

  public async searchRequirements(
    rawInput: ReqSearchRequirementsInputDto,
    userId: string,
  ): Promise<ReqSearchRequirementsOutputDto> {
    const parsed = reqSearchRequirementsInputSchema.safeParse(rawInput);
    if (!parsed.success) {
      throw new QualityIntelligenceValidationError(
        parsed.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join('; '),
      );
    }
    const input = parsed.data;
    await this.assertProjectAccess(input.projectId, userId);

    const query = input.query.trim();
    const limit = input.limit ?? 10;
    const offset = input.offset ?? 0;

    const where: Prisma.RequirementWhereInput = {
      projectId: input.projectId,
      OR: [
        { requirementKey: { contains: query, mode: 'insensitive' } },
        { title: { contains: query, mode: 'insensitive' } },
        { originalText: { contains: query, mode: 'insensitive' } },
      ],
    };

    const [total, records] = await Promise.all([
      this.prisma.requirement.count({ where }),
      this.prisma.requirement.findMany({
        where,
        orderBy: { requirementKey: 'asc' },
        skip: offset,
        take: limit,
      }),
    ]);

    const items: ReqSearchMatchDto[] = records.map(r => {
      const snippet = extractSnippet(r.originalText || r.title, query);
      return {
        id: r.id,
        requirementKey: r.requirementKey,
        title: r.title,
        snippet,
        status: r.status,
        priority: r.priority,
      };
    });

    return {
      query,
      items,
      total,
      truncated: total > offset + limit,
    };
  }

  // ============================================================================
  // 4. tests.list
  // ============================================================================

  public async listTests(
    rawInput: TestListTestsInputDto,
    userId: string,
  ): Promise<TestListTestsOutputDto> {
    const parsed = testListTestsInputSchema.safeParse(rawInput);
    if (!parsed.success) {
      throw new QualityIntelligenceValidationError(
        parsed.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join('; '),
      );
    }
    const input = parsed.data;
    await this.assertProjectAccess(input.projectId, userId);

    const limit = input.limit ?? 20;
    const offset = input.offset ?? 0;

    const where: Prisma.TestCaseWhereInput = {
      projectId: input.projectId,
      ...(input.status ? { status: input.status as never } : {}),
      ...(input.type ? { type: input.type as never } : {}),
      ...(input.priority ? { priority: input.priority as never } : {}),
    };

    const [total, records] = await Promise.all([
      this.prisma.testCase.count({ where }),
      this.prisma.testCase.findMany({
        where,
        orderBy: { testCaseKey: 'asc' },
        skip: offset,
        take: limit,
        include: {
          _count: { select: { steps: true } },
        },
      }),
    ]);

    const items: TestListItemDto[] = records.map(t => {
      const summaryText = t.objective || t.description || t.title;
      const summary =
        summaryText.length > 200 ? `${summaryText.slice(0, 197)}...` : summaryText;

      return {
        id: t.id,
        testKey: t.testCaseKey,
        title: t.title,
        summary,
        status: t.status,
        type: t.type,
        priority: t.priority,
        stepCount: t._count?.steps ?? 0,
        requirementId: t.sourceRequirementId ?? null,
        createdAt: t.createdAt.toISOString(),
        updatedAt: t.updatedAt.toISOString(),
      };
    });

    return {
      items,
      total,
      limit,
      offset,
      truncated: total > offset + limit,
    };
  }

  // ============================================================================
  // 5. tests.get
  // ============================================================================

  public async getTest(
    rawInput: TestGetTestInputDto,
    userId: string,
  ): Promise<TestGetTestOutputDto> {
    const parsed = testGetTestInputSchema.safeParse(rawInput);
    if (!parsed.success) {
      throw new QualityIntelligenceValidationError(
        parsed.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join('; '),
      );
    }
    const input = parsed.data;
    await this.assertProjectAccess(input.projectId, userId);

    const identifier = input.testCaseId.trim();
    const isIdUuid = isUuid(identifier);

    const testCase = await this.prisma.testCase.findFirst({
      where: {
        projectId: input.projectId,
        ...(isIdUuid
          ? { OR: [{ id: identifier }, { testCaseKey: identifier }] }
          : { testCaseKey: identifier }),
      },
      include: {
        preconditions: { orderBy: { sequenceOrder: 'asc' } },
        steps: { orderBy: { stepNumber: 'asc' } },
        sourceRequirement: {
          select: { id: true, requirementKey: true, title: true, status: true },
        },
      },
    });

    if (!testCase) {
      throw new QualityIntelligenceTestCaseNotFoundError(
        input.testCaseId,
        input.projectId,
      );
    }

    return {
      id: testCase.id,
      testKey: testCase.testCaseKey,
      title: testCase.title,
      description: testCase.description ?? testCase.objective ?? null,
      status: testCase.status,
      type: testCase.type,
      priority: testCase.priority,
      preconditions: testCase.preconditions.map(p => p.description),
      steps: testCase.steps.map(s => ({
        stepNumber: s.stepNumber,
        action: s.action,
        expectedResult: s.expectedResult ?? null,
        testData: s.testDataSummary ?? null,
      })),
      sourceRequirement: testCase.sourceRequirement
        ? {
            requirementId: testCase.sourceRequirement.id,
            requirementKey: testCase.sourceRequirement.requirementKey,
            title: testCase.sourceRequirement.title,
            status: testCase.sourceRequirement.status,
          }
        : null,
      createdAt: testCase.createdAt.toISOString(),
      updatedAt: testCase.updatedAt.toISOString(),
    };
  }

  // ============================================================================
  // 6. tests.search
  // ============================================================================

  public async searchTests(
    rawInput: TestSearchTestsInputDto,
    userId: string,
  ): Promise<TestSearchTestsOutputDto> {
    const parsed = testSearchTestsInputSchema.safeParse(rawInput);
    if (!parsed.success) {
      throw new QualityIntelligenceValidationError(
        parsed.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join('; '),
      );
    }
    const input = parsed.data;
    await this.assertProjectAccess(input.projectId, userId);

    const query = input.query.trim();
    const limit = input.limit ?? 10;
    const offset = input.offset ?? 0;

    const where: Prisma.TestCaseWhereInput = {
      projectId: input.projectId,
      OR: [
        { testCaseKey: { contains: query, mode: 'insensitive' } },
        { title: { contains: query, mode: 'insensitive' } },
        { objective: { contains: query, mode: 'insensitive' } },
        { description: { contains: query, mode: 'insensitive' } },
      ],
    };

    const [total, records] = await Promise.all([
      this.prisma.testCase.count({ where }),
      this.prisma.testCase.findMany({
        where,
        orderBy: { testCaseKey: 'asc' },
        skip: offset,
        take: limit,
      }),
    ]);

    const items: TestSearchMatchDto[] = records.map(t => {
      const fullText = `${t.title} ${t.objective || ''} ${t.description || ''}`;
      const snippet = extractSnippet(fullText, query);
      return {
        id: t.id,
        testKey: t.testCaseKey,
        title: t.title,
        snippet,
        status: t.status,
        priority: t.priority,
      };
    });

    return {
      query,
      items,
      total,
      truncated: total > offset + limit,
    };
  }

  // ============================================================================
  // 7. tests.forRequirement
  // ============================================================================

  public async getTestsForRequirement(
    rawInput: TestForRequirementInputDto,
    userId: string,
  ): Promise<TestForRequirementOutputDto> {
    const parsed = testForRequirementInputSchema.safeParse(rawInput);
    if (!parsed.success) {
      throw new QualityIntelligenceValidationError(
        parsed.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join('; '),
      );
    }
    const input = parsed.data;
    await this.assertProjectAccess(input.projectId, userId);

    const identifier = input.requirementId.trim();
    const isIdUuid = isUuid(identifier);

    // Resolve requirement first
    const requirement = await this.prisma.requirement.findFirst({
      where: {
        projectId: input.projectId,
        ...(isIdUuid
          ? { OR: [{ id: identifier }, { requirementKey: identifier }] }
          : { requirementKey: identifier }),
      },
      select: { id: true, requirementKey: true, title: true },
    });

    if (!requirement) {
      throw new QualityIntelligenceRequirementNotFoundError(
        input.requirementId,
        input.projectId,
      );
    }

    const limit = input.limit ?? 20;
    const offset = input.offset ?? 0;

    const where: Prisma.RequirementTestTraceWhereInput = {
      projectId: input.projectId,
      requirementId: requirement.id,
    };

    const [total, traces] = await Promise.all([
      this.prisma.requirementTestTrace.count({ where }),
      this.prisma.requirementTestTrace.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: offset,
        take: limit,
        include: {
          testCase: {
            include: {
              _count: { select: { steps: true } },
            },
          },
        },
      }),
    ]);

    const items: TestListItemDto[] = traces
      .filter(tr => tr.testCase !== null)
      .map(tr => {
        const t = tr.testCase;
        const summaryText = t.objective || t.description || t.title;
        const summary =
          summaryText.length > 200 ? `${summaryText.slice(0, 197)}...` : summaryText;
        return {
          id: t.id,
          testKey: t.testCaseKey,
          title: t.title,
          summary,
          status: t.status,
          type: t.type,
          priority: t.priority,
          stepCount: t._count?.steps ?? 0,
          requirementId: requirement.id,
          createdAt: t.createdAt.toISOString(),
          updatedAt: t.updatedAt.toISOString(),
        };
      });

    return {
      requirementId: requirement.id,
      requirementKey: requirement.requirementKey,
      requirementTitle: requirement.title,
      items,
      total,
      truncated: total > offset + limit,
    };
  }

  // ============================================================================
  // 8. traceability.get
  // ============================================================================

  public async getTraceability(
    rawInput: TraceabilityGetInputDto,
    userId: string,
  ): Promise<TraceabilityGetOutputDto> {
    const parsed = traceabilityGetInputSchema.safeParse(rawInput);
    if (!parsed.success) {
      throw new QualityIntelligenceValidationError(
        parsed.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join('; '),
      );
    }
    const input = parsed.data;
    await this.assertProjectAccess(input.projectId, userId);

    // Call existing CoverageAnalysisService
    const matrixResult = await this.coverageService.getTraceabilityMatrix({
      projectId: input.projectId,
      page: 1,
      pageSize: 500, // Fetch broader set to filter and slice safely
    });

    let rows = matrixResult.rows;

    // Filter by requirementId if requested
    if (input.requirementId && input.requirementId.trim().length > 0) {
      const reqIdentifier = input.requirementId.trim();
      const isIdUuid = isUuid(reqIdentifier);
      rows = rows.filter(r =>
        isIdUuid
          ? r.requirementId === reqIdentifier || r.requirementKey === reqIdentifier
          : r.requirementKey.toLowerCase() === reqIdentifier.toLowerCase(),
      );
    }

    const total = rows.length;
    const limit = input.limit ?? 20;
    const offset = input.offset ?? 0;
    const paginated = rows.slice(offset, offset + limit);

    const items: TraceabilityToolMatrixItemDto[] = paginated.map(r => ({
      requirementId: r.requirementId,
      requirementKey: r.requirementKey,
      requirementTitle: r.requirementTitle,
      status: r.requirementLifecycle,
      priority: r.requirementPriority,
      coverageStatus: r.coverageStatus,
      coveragePercentage: r.coveragePercentage,
      linkedTestCount: r.totalLinkedTestCount,
      tests: r.linkedTests.map(t => ({
        testCaseId: t.testCaseId,
        testCaseKey: t.testCaseKey,
        title: t.testCaseTitle,
        status: t.testCaseStatus,
        isCurrent: !t.isStale,
      })),
    }));

    return {
      projectId: input.projectId,
      items,
      total,
      coveredCount: matrixResult.summary.coveredCount,
      uncoveredCount: matrixResult.summary.uncoveredCount,
      overallCoveragePercentage: matrixResult.summary.overallCoveragePercentage ?? 0,
      truncated: total > offset + limit,
    };
  }
}
