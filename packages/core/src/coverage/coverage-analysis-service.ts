/**
 * @file packages/core/src/coverage/coverage-analysis-service.ts
 * Core domain service for Requirement-to-Test Coverage Analysis, Explainable Dimension Derivation,
 * and the Project-scoped Requirement Traceability Matrix (RTM).
 */

import type { PrismaClient } from '@prisma/client';
import type {
  CoverageDimension,
  CoverageDimensionSummaryDto,
  CoverageGapDto,
  CoverageLinkedTestSummaryDto,
  GetOrphanTestsInputDto,
  GetProjectCoverageInputDto,
  GetRequirementCoverageInputDto,
  GetReverseTraceabilityInputDto,
  GetTraceabilityMatrixInputDto,
  OrphanTestsResultDto,
  ProjectCoverageSummaryDto,
  RequirementCoverageDetailDto,
  RequirementCoverageStatus,
  ReverseTraceabilityItemDto,
  ReverseTraceabilityResultDto,
  TraceabilityMatrixResultDto,
  TraceabilityMatrixRowDto,
} from '@ai-quality/contracts';
import {
  getOrphanTestsInputSchema,
  getProjectCoverageInputSchema,
  getRequirementCoverageInputSchema,
  getReverseTraceabilityInputSchema,
  getTraceabilityMatrixInputSchema,
} from '@ai-quality/contracts';
import { COVERAGE_BOUNDS } from './coverage-types.js';
import {
  CoverageProjectMismatchError,
  CoverageRequirementNotFoundError,
  CoverageValidationError,
} from './coverage-errors.js';
import { deriveRequiredDimensions } from './dimension-requirement-engine.js';
import { getPrismaClient } from '../database/index.js';
import { getLogger } from '../logging/index.js';

export class CoverageAnalysisService {
  constructor(private readonly prismaClient?: PrismaClient) {}

  private getPrisma(): PrismaClient {
    const client = this.prismaClient ?? getPrismaClient();
    if (!client) {
      throw new Error('Prisma client is not initialized.');
    }
    return client;
  }

  /**
   * Computes headline project-level coverage metrics, dimension breakdown, and prioritized coverage gaps.
   */
  public async getProjectCoverageSummary(
    input: GetProjectCoverageInputDto,
  ): Promise<ProjectCoverageSummaryDto> {
    const parsed = getProjectCoverageInputSchema.safeParse(input);
    if (!parsed.success) {
      throw new CoverageValidationError(parsed.error.issues.map(i => i.message).join('; '));
    }
    const { projectId, lifecycleFilter } = parsed.data;

    const prisma = this.getPrisma();
    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) {
      throw new CoverageProjectMismatchError(`Project with ID "${projectId}" was not found.`);
    }

    const lifecycleScope = lifecycleFilter && lifecycleFilter.length > 0 ? lifecycleFilter : ['ACTIVE'];

    // 1. Fetch requirements in scope
    const requirements = await prisma.requirement.findMany({
      where: {
        projectId,
        status: { in: lifecycleScope as never },
      },
      include: {
        versions: {
          orderBy: { versionNumber: 'desc' },
          take: 1,
        },
        testTraces: {
          include: {
            testCase: {
              include: {
                validations: {
                  orderBy: { createdAt: 'desc' },
                  take: 1,
                },
              },
            },
          },
        },
        representation: true,
        qualityAnalysis: true,
      },
    });

    // 2. Fetch all test design plans for this project to bind dimension requirements
    const testDesigns = await prisma.requirementTestDesign.findMany({
      where: {
        projectId,
        requirementId: { in: requirements.map(r => r.id) },
      },
      orderBy: { createdAt: 'desc' },
    });
    const designPlanMap = new Map<string, (typeof testDesigns)[0]>();
    for (const plan of testDesigns) {
      if (!designPlanMap.has(plan.requirementId)) {
        designPlanMap.set(plan.requirementId, plan);
      }
    }

    // 3. Evaluate coverage for each requirement
    const coverageDetails: RequirementCoverageDetailDto[] = [];
    for (const req of requirements) {
      const designPlan = designPlanMap.get(req.id);
      const detail = this.evaluateRequirementCoverage(
        req,
        designPlan ? (designPlan.structuredDesignJson as never) : null,
      );
      coverageDetails.push(detail);
    }

    // 4. Aggregate counts
    let coveredCount = 0;
    let partiallyCoveredCount = 0;
    let uncoveredCount = 0;
    let notApplicableCount = 0;
    let unknownCount = 0;

    for (const c of coverageDetails) {
      if (c.coverageStatus === 'COVERED') coveredCount++;
      else if (c.coverageStatus === 'PARTIALLY_COVERED') partiallyCoveredCount++;
      else if (c.coverageStatus === 'UNCOVERED') uncoveredCount++;
      else if (c.coverageStatus === 'NOT_APPLICABLE') notApplicableCount++;
      else unknownCount++;
    }

    const eligibleRequirements = coveredCount + partiallyCoveredCount + uncoveredCount;
    const overallCoveragePercentage =
      eligibleRequirements > 0 ? Math.round((coveredCount / eligibleRequirements) * 100) : null;
    const overallWithPartialPercentage =
      eligibleRequirements > 0
        ? Math.round(((coveredCount + 0.5 * partiallyCoveredCount) / eligibleRequirements) * 100)
        : null;

    // 5. Test metrics & orphan count
    const totalProjectTests = await prisma.testCase.count({ where: { projectId } });
    const linkedTestCaseIds = new Set<string>();
    let staleTestsCount = 0;
    let currentValidTestsCount = 0;

    for (const req of requirements) {
      const currentVersion = req.versions[0]?.versionNumber ?? 1;
      for (const t of req.testTraces) {
        linkedTestCaseIds.add(t.testCaseId);
        const isStale = t.status === 'STALE' || t.requirementVersionNumber < currentVersion;
        if (isStale) {
          staleTestsCount++;
        } else {
          currentValidTestsCount++;
        }
      }
    }

    const orphanTests = Math.max(0, totalProjectTests - linkedTestCaseIds.size);

    // 6. Aggregate dimension summaries
    const allDimensions: CoverageDimension[] = [
      'POSITIVE',
      'NEGATIVE',
      'BOUNDARY',
      'VALIDATION',
      'SECURITY',
    ];
    const dimensionSummaries: CoverageDimensionSummaryDto[] = allDimensions.map(dim => {
      let requiredCount = 0;
      let coveredCountForDim = 0;

      for (const c of coverageDetails) {
        if (c.coverageStatus === 'NOT_APPLICABLE') continue;
        if (c.requiredDimensions.includes(dim)) {
          requiredCount++;
          if (c.coveredDimensions.includes(dim)) {
            coveredCountForDim++;
          }
        }
      }

      const percentage =
        requiredCount > 0 ? Math.round((coveredCountForDim / requiredCount) * 100) : 100;
      return {
        dimension: dim,
        requiredCount,
        coveredCount: coveredCountForDim,
        percentage,
      };
    });

    // 7. Prioritized Coverage Gaps
    const topGaps = this.deriveTopGaps(requirements, coverageDetails);

    getLogger().info('coverage.summary_computed', {
      projectId,
      totalRequirements: requirements.length,
      eligibleRequirements,
      coveredCount,
      partiallyCoveredCount,
      uncoveredCount,
      overallCoveragePercentage,
    });

    return {
      projectId,
      totalRequirements: requirements.length,
      eligibleRequirements,
      coveredCount,
      partiallyCoveredCount,
      uncoveredCount,
      notApplicableCount,
      unknownCount,
      overallCoveragePercentage,
      overallWithPartialPercentage,
      totalLinkedTests: linkedTestCaseIds.size,
      currentValidTests: currentValidTestsCount,
      staleTests: staleTestsCount,
      orphanTests,
      dimensionSummaries,
      topGaps,
      lastEvaluatedAt: new Date().toISOString(),
    };
  }

  /**
   * Computes detailed, explainable coverage metrics for a single requirement.
   */
  public async getRequirementCoverage(
    input: GetRequirementCoverageInputDto,
  ): Promise<RequirementCoverageDetailDto> {
    const parsed = getRequirementCoverageInputSchema.safeParse(input);
    if (!parsed.success) {
      throw new CoverageValidationError(parsed.error.issues.map(i => i.message).join('; '));
    }
    const { projectId, requirementId } = parsed.data;

    const prisma = this.getPrisma();
    const req = await prisma.requirement.findUnique({
      where: { id: requirementId },
      include: {
        versions: {
          orderBy: { versionNumber: 'desc' },
          take: 1,
        },
        testTraces: {
          include: {
            testCase: {
              include: {
                validations: {
                  orderBy: { createdAt: 'desc' },
                  take: 1,
                },
              },
            },
          },
        },
        representation: true,
        qualityAnalysis: true,
      },
    });

    if (!req) {
      throw new CoverageRequirementNotFoundError(requirementId);
    }
    if (req.projectId !== projectId) {
      throw new CoverageProjectMismatchError(
        `Requirement "${requirementId}" does not belong to project "${projectId}".`,
      );
    }

    const designPlan = await prisma.requirementTestDesign.findFirst({
      where: { projectId, requirementId },
      orderBy: { createdAt: 'desc' },
    });

    return this.evaluateRequirementCoverage(
      req,
      designPlan ? (designPlan.structuredDesignJson as never) : null,
    );
  }

  /**
   * Generates paginated, filterable, and searchable Requirement Traceability Matrix (RTM) rows.
   */
  public async getTraceabilityMatrix(
    input: GetTraceabilityMatrixInputDto,
  ): Promise<TraceabilityMatrixResultDto> {
    const parsed = getTraceabilityMatrixInputSchema.safeParse(input);
    if (!parsed.success) {
      throw new CoverageValidationError(parsed.error.issues.map(i => i.message).join('; '));
    }
    const {
      projectId,
      page = 1,
      pageSize = COVERAGE_BOUNDS.DEFAULT_PAGE_SIZE,
      coverageStatus,
      lifecycleFilter,
      missingDimension,
      search,
      sortBy = 'requirementKey',
      sortDirection = 'asc',
    } = parsed.data;

    const boundedPage = Math.max(1, page);
    const boundedPageSize = Math.min(COVERAGE_BOUNDS.MAX_PAGE_SIZE, Math.max(1, pageSize));

    const prisma = this.getPrisma();
    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) {
      throw new CoverageProjectMismatchError(`Project with ID "${projectId}" was not found.`);
    }

    const summary = await this.getProjectCoverageSummary({ projectId, lifecycleFilter });

    const lifecycleScope = lifecycleFilter && lifecycleFilter.length > 0 ? lifecycleFilter : ['ACTIVE'];

    // Fetch all matching requirements
    const searchFilter = search && search.trim().length > 0 ? search.trim() : undefined;
    const requirements = await prisma.requirement.findMany({
      where: {
        projectId,
        status: { in: lifecycleScope as never },
        ...(searchFilter
          ? {
              OR: [
                { requirementKey: { contains: searchFilter, mode: 'insensitive' } },
                { title: { contains: searchFilter, mode: 'insensitive' } },
                { originalText: { contains: searchFilter, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      include: {
        versions: {
          orderBy: { versionNumber: 'desc' },
          take: 1,
        },
        testTraces: {
          include: {
            testCase: {
              include: {
                validations: {
                  orderBy: { createdAt: 'desc' },
                  take: 1,
                },
              },
            },
          },
        },
        representation: true,
        qualityAnalysis: true,
      },
    });

    const testDesigns = await prisma.requirementTestDesign.findMany({
      where: {
        projectId,
        requirementId: { in: requirements.map(r => r.id) },
      },
      orderBy: { createdAt: 'desc' },
    });
    const designPlanMap = new Map<string, (typeof testDesigns)[0]>();
    for (const plan of testDesigns) {
      if (!designPlanMap.has(plan.requirementId)) {
        designPlanMap.set(plan.requirementId, plan);
      }
    }

    // Build matrix rows
    let rows: TraceabilityMatrixRowDto[] = requirements.map(req => {
      const designPlan = designPlanMap.get(req.id);
      const detail = this.evaluateRequirementCoverage(
        req,
        designPlan ? (designPlan.structuredDesignJson as never) : null,
      );
      return {
        requirementId: req.id,
        requirementKey: req.requirementKey,
        requirementTitle: req.title,
        requirementLifecycle: req.status,
        requirementPriority: req.priority,
        requirementVersion: detail.requirementVersionNumber,
        currentRequirementVersion: detail.currentRequirementVersionNumber,
        testability: detail.testability,
        coverageStatus: detail.coverageStatus,
        coveragePercentage: detail.coveragePercentage,
        requiredDimensions: detail.requiredDimensions,
        coveredDimensions: detail.coveredDimensions,
        missingDimensions: detail.missingDimensions,
        totalLinkedTestCount: detail.totalLinkedTests,
        eligibleTestCount: detail.eligibleLinkedTests,
        staleTestCount: detail.staleLinkedTests,
        rejectedTestCount: detail.rejectedLinkedTests,
        linkedTests: detail.linkedTestSummaries,
      };
    });

    // Apply filters
    if (coverageStatus) {
      rows = rows.filter(r => r.coverageStatus === coverageStatus);
    }
    if (missingDimension) {
      rows = rows.filter(r => r.missingDimensions.includes(missingDimension));
    }

    // Sorting
    rows.sort((a, b) => {
      let cmp = 0;
      if (sortBy === 'requirementKey') {
        cmp = a.requirementKey.localeCompare(b.requirementKey, undefined, { numeric: true });
      } else if (sortBy === 'coverageStatus') {
        cmp = a.coverageStatus.localeCompare(b.coverageStatus);
      } else if (sortBy === 'priority') {
        const priorityOrder: Record<string, number> = {
          CRITICAL: 4,
          HIGH: 3,
          MEDIUM: 2,
          LOW: 1,
        };
        cmp = (priorityOrder[b.requirementPriority] ?? 0) - (priorityOrder[a.requirementPriority] ?? 0);
      } else if (sortBy === 'coveragePercentage') {
        cmp = (a.coveragePercentage ?? -1) - (b.coveragePercentage ?? -1);
      } else if (sortBy === 'linkedTestCount') {
        cmp = a.totalLinkedTestCount - b.totalLinkedTestCount;
      }
      return sortDirection === 'desc' ? -cmp : cmp;
    });

    const total = rows.length;
    const offset = (boundedPage - 1) * boundedPageSize;
    const paginatedRows = rows.slice(offset, offset + boundedPageSize);

    return {
      rows: paginatedRows,
      total,
      page: boundedPage,
      pageSize: boundedPageSize,
      summary,
    };
  }

  /**
   * Retrieves reverse traceability mapping (Test Case -> Requirements).
   */
  public async getReverseTraceability(
    input: GetReverseTraceabilityInputDto,
  ): Promise<ReverseTraceabilityResultDto> {
    const parsed = getReverseTraceabilityInputSchema.safeParse(input);
    if (!parsed.success) {
      throw new CoverageValidationError(parsed.error.issues.map(i => i.message).join('; '));
    }
    const {
      projectId,
      page = 1,
      pageSize = COVERAGE_BOUNDS.DEFAULT_PAGE_SIZE,
      search,
      orphansOnly = false,
      sortBy = 'testCaseKey',
      sortDirection = 'asc',
    } = parsed.data;

    const boundedPage = Math.max(1, page);
    const boundedPageSize = Math.min(COVERAGE_BOUNDS.MAX_PAGE_SIZE, Math.max(1, pageSize));

    const prisma = this.getPrisma();
    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) {
      throw new CoverageProjectMismatchError(`Project with ID "${projectId}" was not found.`);
    }

    const searchFilter = search && search.trim().length > 0 ? search.trim() : undefined;
    const testCases = await prisma.testCase.findMany({
      where: {
        projectId,
        ...(searchFilter
          ? {
              OR: [
                { testCaseKey: { contains: searchFilter, mode: 'insensitive' } },
                { title: { contains: searchFilter, mode: 'insensitive' } },
                { objective: { contains: searchFilter, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      include: {
        requirementTraces: {
          include: {
            requirement: {
              include: {
                versions: {
                  orderBy: { versionNumber: 'desc' },
                  take: 1,
                },
              },
            },
          },
        },
      },
    });

    let items: ReverseTraceabilityItemDto[] = testCases.map(tc => {
      const linkedReqs = tc.requirementTraces.map(t => {
        const currentReqVersion = t.requirement.versions[0]?.versionNumber ?? 1;
        const isStale =
          t.status === 'STALE' || t.requirementVersionNumber < currentReqVersion;
        return {
          traceId: t.id,
          requirementId: t.requirementId,
          requirementKey: t.requirement.requirementKey,
          requirementTitle: t.requirement.title,
          requirementVersionNumber: t.requirementVersionNumber,
          currentRequirementVersionNumber: currentReqVersion,
          traceOrigin: t.origin,
          traceStatus: t.status,
          isStale,
          staleReason: t.staleReason,
        };
      });

      return {
        testCaseId: tc.id,
        testCaseKey: tc.testCaseKey,
        testCaseTitle: tc.title,
        testCaseType: tc.type,
        testCasePriority: tc.priority,
        testCaseStatus: tc.status,
        isOrphan: linkedReqs.length === 0,
        linkedRequirements: linkedReqs,
      };
    });

    const totalOrphans = items.filter(i => i.isOrphan).length;

    if (orphansOnly) {
      items = items.filter(i => i.isOrphan);
    }

    // Sort
    items.sort((a, b) => {
      let cmp = 0;
      if (sortBy === 'testCaseKey') {
        cmp = a.testCaseKey.localeCompare(b.testCaseKey, undefined, { numeric: true });
      } else if (sortBy === 'type') {
        cmp = a.testCaseType.localeCompare(b.testCaseType);
      } else if (sortBy === 'priority') {
        const priorityOrder: Record<string, number> = {
          CRITICAL: 4,
          HIGH: 3,
          MEDIUM: 2,
          LOW: 1,
          UNSPECIFIED: 0,
        };
        cmp = (priorityOrder[b.testCasePriority] ?? 0) - (priorityOrder[a.testCasePriority] ?? 0);
      }
      return sortDirection === 'desc' ? -cmp : cmp;
    });

    const total = items.length;
    const offset = (boundedPage - 1) * boundedPageSize;
    const paginatedItems = items.slice(offset, offset + boundedPageSize);

    return {
      items: paginatedItems,
      total,
      page: boundedPage,
      pageSize: boundedPageSize,
      totalOrphans,
    };
  }

  /**
   * Retrieves orphan test cases (test cases with 0 requirement trace links).
   */
  public async getOrphanTests(input: GetOrphanTestsInputDto): Promise<OrphanTestsResultDto> {
    const parsed = getOrphanTestsInputSchema.safeParse(input);
    if (!parsed.success) {
      throw new CoverageValidationError(parsed.error.issues.map(i => i.message).join('; '));
    }
    const { projectId, page = 1, pageSize = COVERAGE_BOUNDS.DEFAULT_PAGE_SIZE } = parsed.data;

    const boundedPage = Math.max(1, page);
    const boundedPageSize = Math.min(COVERAGE_BOUNDS.MAX_PAGE_SIZE, Math.max(1, pageSize));

    const prisma = this.getPrisma();
    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) {
      throw new CoverageProjectMismatchError(`Project with ID "${projectId}" was not found.`);
    }

    const orphanTestCases = await prisma.testCase.findMany({
      where: {
        projectId,
        requirementTraces: { none: {} },
      },
      orderBy: { testCaseKey: 'asc' },
      skip: (boundedPage - 1) * boundedPageSize,
      take: boundedPageSize,
    });

    const total = await prisma.testCase.count({
      where: {
        projectId,
        requirementTraces: { none: {} },
      },
    });

    return {
      orphanTestCases: orphanTestCases.map(tc => ({
        id: tc.id,
        key: tc.testCaseKey,
        title: tc.title,
        type: tc.type,
        priority: tc.priority,
        status: tc.status,
        createdAt: tc.createdAt.toISOString(),
      })),
      total,
    };
  }

  /**
   * Core evaluator for a single requirement and its linked traces.
   */
  private evaluateRequirementCoverage(
    req: {
      id: string;
      requirementKey: string;
      title: string;
      originalText: string;
      status: string;
      versions: Array<{ versionNumber: number }>;
      testTraces: Array<{
        id: string;
        requirementVersionNumber: number;
        origin: string;
        status: string;
        staleReason: string | null;
        scenarioKey: string | null;
        testCase: {
          id: string;
          testCaseKey: string;
          title: string;
          type: string;
          priority: string;
          status: string;
          validations: Array<{ status: string }>;
        };
      }>;
      representation?: { normalizationStatus?: string; structuredJson?: unknown } | null;
      qualityAnalysis?: { testabilityScore?: number | null; qualityScore?: number | null } | null;
    },
    testDesignPlan?: {
      structuredDesign?: unknown;
    } | null,
  ): RequirementCoverageDetailDto {
    const reasons: string[] = [];
    const currentVersion = req.versions[0]?.versionNumber ?? 1;

    // Testability check
    const quality = req.qualityAnalysis;
    const isTestable =
      quality && quality.testabilityScore !== null && quality.testabilityScore !== undefined
        ? quality.testabilityScore > 0.2
        : true;

    if (!isTestable) {
      reasons.push('Requirement classified as NOT_TESTABLE by Quality Analysis.');
      return {
        requirementId: req.id,
        requirementKey: req.requirementKey,
        requirementTitle: req.title,
        requirementVersionNumber: currentVersion,
        currentRequirementVersionNumber: currentVersion,
        lifecycleStatus: req.status,
        testability: 'NOT_TESTABLE',
        coverageStatus: 'NOT_APPLICABLE',
        coveragePercentage: null,
        requiredDimensions: [],
        coveredDimensions: [],
        missingDimensions: [],
        totalLinkedTests: req.testTraces.length,
        eligibleLinkedTests: 0,
        staleLinkedTests: 0,
        rejectedLinkedTests: 0,
        reasonCodes: reasons,
        linkedTestSummaries: [],
        lastEvaluatedAt: new Date().toISOString(),
      };
    }

    // Determine required dimensions
    const requiredDimensions = deriveRequiredDimensions(
      {
        title: req.title,
        originalText: req.originalText,
      },
      testDesignPlan as never,
    );

    // Process traces
    const linkedTestSummaries: CoverageLinkedTestSummaryDto[] = [];
    const coveredDimensionsSet = new Set<CoverageDimension>();
    let eligibleCount = 0;
    let staleCount = 0;
    let rejectedCount = 0;

    for (const trace of req.testTraces) {
      const tc = trace.testCase;
      const latestValidation = tc.validations[0];
      const isValidationRejected = latestValidation?.status === 'REJECTED';
      const isReviewRejected = (tc as any).reviewStatus === 'REJECTED';
      const isStale =
        trace.status === 'STALE' || trace.requirementVersionNumber < currentVersion;

      if (isStale) staleCount++;
      if (isValidationRejected || isReviewRejected) rejectedCount++;

      const isEligible =
        !isStale && !isValidationRejected && !isReviewRejected && tc.status !== 'DEPRECATED';
      if (isEligible) {
        eligibleCount++;
        // Map testCase type to coverage dimension
        const typeUpper = tc.type.toUpperCase();
        if (
          typeUpper === 'POSITIVE' ||
          typeUpper === 'NEGATIVE' ||
          typeUpper === 'BOUNDARY' ||
          typeUpper === 'VALIDATION' ||
          typeUpper === 'SECURITY' ||
          typeUpper === 'PERFORMANCE' ||
          typeUpper === 'ACCESSIBILITY' ||
          typeUpper === 'COMPATIBILITY' ||
          typeUpper === 'BUSINESS_RULE'
        ) {
          coveredDimensionsSet.add(typeUpper as CoverageDimension);
        }
      }

      linkedTestSummaries.push({
        traceId: trace.id,
        testCaseId: tc.id,
        testCaseKey: tc.testCaseKey,
        testCaseTitle: tc.title,
        testCaseType: tc.type,
        testCasePriority: tc.priority,
        testCaseStatus: tc.status,
        traceOrigin: trace.origin,
        traceStatus: trace.status,
        isStale,
        staleReason: trace.staleReason,
        requirementVersionNumber: trace.requirementVersionNumber,
        isValidationRejected,
        scenarioKey: trace.scenarioKey,
      });
    }

    const coveredDimensions = Array.from(coveredDimensionsSet);
    const missingDimensions = requiredDimensions.filter(d => !coveredDimensions.includes(d));

    // Determine status
    let coverageStatus: RequirementCoverageStatus = 'UNCOVERED';
    let coveragePercentage: number | null = 0;

    if (eligibleCount === 0) {
      coverageStatus = 'UNCOVERED';
      coveragePercentage = 0;
      if (staleCount > 0 && req.testTraces.length === staleCount) {
        reasons.push(
          'All linked tests are stale due to requirement version advancement. Review required.',
        );
      } else if (rejectedCount > 0 && req.testTraces.length === rejectedCount) {
        reasons.push('All linked tests failed hallucination validation.');
      } else {
        reasons.push('No eligible test cases linked to requirement.');
      }
    } else if (missingDimensions.length === 0) {
      coverageStatus = 'COVERED';
      coveragePercentage = 100;
      reasons.push('All required test design dimensions are covered by eligible test cases.');
    } else if (coveredDimensions.length > 0) {
      coverageStatus = 'PARTIALLY_COVERED';
      coveragePercentage =
        requiredDimensions.length > 0
          ? Math.round((coveredDimensions.length / requiredDimensions.length) * 100)
          : 50;
      reasons.push(
        `Partially covered. Missing required dimensions: ${missingDimensions.join(', ')}.`,
      );
    } else {
      coverageStatus = 'UNCOVERED';
      coveragePercentage = 0;
      reasons.push(
        `Tests linked do not cover required dimensions. Missing: ${missingDimensions.join(', ')}.`,
      );
    }

    return {
      requirementId: req.id,
      requirementKey: req.requirementKey,
      requirementTitle: req.title,
      requirementVersionNumber: currentVersion,
      currentRequirementVersionNumber: currentVersion,
      lifecycleStatus: req.status,
      testability: 'TESTABLE',
      coverageStatus,
      coveragePercentage,
      requiredDimensions,
      coveredDimensions,
      missingDimensions,
      totalLinkedTests: req.testTraces.length,
      eligibleLinkedTests: eligibleCount,
      staleLinkedTests: staleCount,
      rejectedLinkedTests: rejectedCount,
      reasonCodes: reasons,
      linkedTestSummaries,
      lastEvaluatedAt: new Date().toISOString(),
    };
  }

  /**
   * Derives prioritized coverage gaps across requirements.
   */
  private deriveTopGaps(
    requirements: Array<{ id: string; requirementKey: string; title: string; priority: string }>,
    coverageDetails: RequirementCoverageDetailDto[],
  ): readonly CoverageGapDto[] {
    const gaps: CoverageGapDto[] = [];
    const reqMap = new Map(requirements.map(r => [r.id, r]));

    for (const c of coverageDetails) {
      if (c.coverageStatus === 'COVERED' || c.coverageStatus === 'NOT_APPLICABLE') continue;
      const req = reqMap.get(c.requirementId);
      const priority = req?.priority ?? 'MEDIUM';

      if (c.totalLinkedTests === 0) {
        gaps.push({
          requirementId: c.requirementId,
          requirementKey: c.requirementKey,
          requirementTitle: c.requirementTitle,
          priority,
          category: 'NO_TESTS',
          description: 'No test cases have been generated or linked for this requirement.',
          missingDimensions: c.requiredDimensions,
        });
      } else if (c.eligibleLinkedTests === 0 && c.staleLinkedTests > 0) {
        gaps.push({
          requirementId: c.requirementId,
          requirementKey: c.requirementKey,
          requirementTitle: c.requirementTitle,
          priority,
          category: 'ALL_TESTS_STALE',
          description:
            'All linked test cases are stale due to requirement version advancement.',
          missingDimensions: c.requiredDimensions,
        });
      } else if (c.eligibleLinkedTests === 0 && c.rejectedLinkedTests > 0) {
        gaps.push({
          requirementId: c.requirementId,
          requirementKey: c.requirementKey,
          requirementTitle: c.requirementTitle,
          priority,
          category: 'ALL_TESTS_REJECTED',
          description: 'All linked test cases were rejected by hallucination validation.',
          missingDimensions: c.requiredDimensions,
        });
      } else if (c.missingDimensions.length > 0) {
        gaps.push({
          requirementId: c.requirementId,
          requirementKey: c.requirementKey,
          requirementTitle: c.requirementTitle,
          priority,
          category: 'MISSING_DIMENSION',
          description: `Missing required test dimension(s): ${c.missingDimensions.join(', ')}.`,
          missingDimensions: c.missingDimensions,
        });
      }
    }

    // Sort by priority
    const priorityWeight: Record<string, number> = {
      CRITICAL: 4,
      HIGH: 3,
      MEDIUM: 2,
      LOW: 1,
    };
    gaps.sort((a, b) => (priorityWeight[b.priority] ?? 0) - (priorityWeight[a.priority] ?? 0));

    return gaps.slice(0, 20);
  }
}
