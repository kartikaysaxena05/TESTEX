/**
 * @file packages/core/src/test-review/test-review-service.ts
 * Core business domain service for Phase 56 Test Review, Approval, Regeneration & Versioning.
 */

import type { Prisma, PrismaClient } from '@prisma/client';
import type {
  ApproveTestVersionInputDto,
  CompareTestVersionsInputDto,
  EditTestCaseInputDto,
  GetTestHistoryInputDto,
  GetTestReviewDetailInputDto,
  ListTestReviewQueueInputDto,
  PreconditionCategory,
  RegenerateTestCaseInputDto,
  RejectTestVersionInputDto,
  TestCaseDto,
  TestCaseExecutionSuitability,
  TestCasePriority,
  TestCaseReviewEventDto,
  TestCaseType,
  TestCaseVersionDto,
  TestCaseVersionSource,
  TestHistoryResultDto,
  TestReviewAction,
  TestReviewDetailDto,
  TestReviewQueueItemDto,
  TestReviewQueueResultDto,
  TestReviewStatus,
  TestVersionDiffDto,
} from '@ai-quality/contracts';
import {
  approveTestVersionInputSchema,
  compareTestVersionsInputSchema,
  editTestCaseInputSchema,
  getTestHistoryInputSchema,
  getTestReviewDetailInputSchema,
  listTestReviewQueueInputSchema,
  regenerateTestCaseInputSchema,
  rejectTestVersionInputSchema,
} from '@ai-quality/contracts';
import type { ILogger } from '../logging/index.js';
import { TEST_REVIEW_BOUNDS, type TestReviewServiceDependencies } from './test-review-types.js';
import {
  TestRegenerationFailedError,
  TestReviewNotFoundError,
  TestReviewProjectMismatchError,
  TestReviewValidationError,
  TestVersionConflictError,
  TestVersionNotFoundError,
} from './test-review-errors.js';
import { TestVersionDiffEngine } from './test-version-diff-engine.js';

export class TestReviewService {
  private readonly prisma: PrismaClient;
  private readonly logger?: ILogger;
  private readonly dependencies: TestReviewServiceDependencies;

  constructor(deps: TestReviewServiceDependencies) {
    this.prisma = deps.prisma;
    this.logger = deps.logger;
    this.dependencies = deps;
  }

  /**
   * Lists the review queue with filtering, search, and pagination.
   */
  public async listReviewQueue(
    input: ListTestReviewQueueInputDto,
  ): Promise<TestReviewQueueResultDto> {
    const validated = listTestReviewQueueInputSchema.safeParse(input);
    if (!validated.success) {
      throw new TestReviewValidationError('Invalid list review queue input', {
        errors: validated.error.errors,
      });
    }

    const { projectId, reviewStatus, isRequirementStale, search } = validated.data;
    const page = validated.data.page ?? TEST_REVIEW_BOUNDS.DEFAULT_PAGE;
    const pageSize = Math.min(
      validated.data.pageSize ?? TEST_REVIEW_BOUNDS.DEFAULT_PAGE_SIZE,
      TEST_REVIEW_BOUNDS.MAX_PAGE_SIZE,
    );
    const skip = (page - 1) * pageSize;

    const where: Prisma.TestCaseWhereInput = {
      projectId,
    };

    if (reviewStatus) {
      where.reviewStatus = reviewStatus as Prisma.EnumTestReviewStatusFilter;
    }

    if (search && search.trim().length > 0) {
      const q = search.trim();
      where.OR = [
        { testCaseKey: { contains: q, mode: 'insensitive' } },
        { title: { contains: q, mode: 'insensitive' } },
        { objective: { contains: q, mode: 'insensitive' } },
      ];
    }

    const [testCases, total] = await Promise.all([
      this.prisma.testCase.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: [{ updatedAt: 'desc' }, { testCaseKey: 'asc' }],
        include: {
          sourceRequirement: {
            select: {
              id: true,
              requirementKey: true,
              title: true,
              versions: {
                orderBy: { versionNumber: 'desc' },
                take: 1,
                select: { versionNumber: true },
              },
            },
          },
          validations: {
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: {
              status: true,
            },
          },
        },
      }),
      this.prisma.testCase.count({ where }),
    ]);

    const items: TestReviewQueueItemDto[] = testCases.map(tc => {
      const currentReqVer = tc.sourceRequirement?.versions[0]?.versionNumber ?? 1;
      const isStale =
        tc.sourceRequirementVersionNumber !== null &&
        tc.sourceRequirementVersionNumber !== undefined &&
        tc.sourceRequirementVersionNumber < currentReqVer;

      return {
        testCaseId: tc.id,
        testCaseKey: tc.testCaseKey,
        title: tc.title,
        type: tc.type as TestCaseType,
        priority: tc.priority as TestCasePriority,
        currentVersionNumber: tc.currentVersionNumber,
        reviewStatus: tc.reviewStatus as TestReviewStatus,
        approvedVersionNumber: tc.approvedVersionNumber,
        approvedAt: tc.approvedAt ? tc.approvedAt.toISOString() : null,
        sourceRequirementId: tc.sourceRequirementId,
        sourceRequirementKey: tc.sourceRequirementKey,
        sourceRequirementTitle: tc.sourceRequirement?.title ?? null,
        sourceRequirementVersionNumber: tc.sourceRequirementVersionNumber,
        currentRequirementVersionNumber: currentReqVer,
        isRequirementStale: isStale,
        latestValidationStatus: tc.validations[0]?.status ?? null,
        updatedAt: tc.updatedAt.toISOString(),
      };
    });

    const filteredItems =
      isRequirementStale !== undefined
        ? items.filter(it => it.isRequirementStale === isRequirementStale)
        : items;

    return {
      items: filteredItems,
      total: isRequirementStale !== undefined ? filteredItems.length : total,
      page,
      pageSize,
    };
  }

  /**
   * Retrieves comprehensive review details for a specific test case and version.
   */
  public async getReviewDetail(input: GetTestReviewDetailInputDto): Promise<TestReviewDetailDto> {
    const validated = getTestReviewDetailInputSchema.safeParse(input);
    if (!validated.success) {
      throw new TestReviewValidationError('Invalid get review detail input', {
        errors: validated.error.errors,
      });
    }

    const { projectId, testCaseId, versionNumber } = validated.data;

    const testCase = await this.prisma.testCase.findUnique({
      where: { id: testCaseId },
      include: {
        preconditions: { orderBy: { sequenceOrder: 'asc' } },
        steps: { orderBy: { stepNumber: 'asc' } },
        testData: { orderBy: { sequenceOrder: 'asc' } },
        sourceRequirement: {
          include: {
            versions: {
              orderBy: { versionNumber: 'desc' },
              take: 1,
            },
          },
        },
        validations: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: { findings: true },
        },
        reviewEvents: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!testCase) {
      throw new TestReviewNotFoundError(testCaseId, projectId);
    }

    if (testCase.projectId !== projectId) {
      throw new TestReviewProjectMismatchError(testCaseId, projectId, testCase.projectId);
    }

    // Ensure baseline version exists if not present
    await this.ensureBaselineVersion(testCase);

    const targetVersionNum = versionNumber ?? testCase.currentVersionNumber;

    const version = await this.prisma.testCaseVersion.findUnique({
      where: {
        testCaseId_versionNumber: {
          testCaseId,
          versionNumber: targetVersionNum,
        },
      },
    });

    if (!version) {
      throw new TestVersionNotFoundError(testCaseId, targetVersionNum);
    }

    const totalVersionsCount = await this.prisma.testCaseVersion.count({
      where: { testCaseId },
    });

    const currentReqVersion = testCase.sourceRequirement?.versions[0]?.versionNumber ?? 1;
    const isRequirementStale =
      testCase.sourceRequirement !== null &&
      testCase.sourceRequirementVersionNumber !== null &&
      testCase.sourceRequirementVersionNumber < currentReqVersion;

    const latestValidation = testCase.validations[0]
      ? {
          id: testCase.validations[0].id,
          status: testCase.validations[0].status,
          confidenceScore: (testCase.validations[0].metricsJson as any)?.confidenceScore ?? 1.0,
          findingsCount: testCase.validations[0].findings.length,
          blockerCount: testCase.validations[0].findings.filter(f => f.severity === 'BLOCKER')
            .length,
          errorCount: testCase.validations[0].findings.filter(f => f.severity === 'ERROR').length,
          warningCount: testCase.validations[0].findings.filter(f => f.severity === 'WARNING')
            .length,
        }
      : null;

    const reviewEvents: TestCaseReviewEventDto[] = testCase.reviewEvents.map(e => ({
      id: e.id,
      projectId: e.projectId,
      testCaseId: e.testCaseId,
      versionNumber: e.versionNumber,
      action: e.action as TestReviewAction,
      fromStatus: e.fromStatus as TestReviewStatus,
      toStatus: e.toStatus as TestReviewStatus,
      rejectionReason: e.rejectionReason ? (e.rejectionReason as any) : null,
      comment: e.comment,
      actorId: e.actorId,
      metadata: (e.metadataJson as Record<string, unknown>) ?? {},
      createdAt: e.createdAt.toISOString(),
    }));

    return {
      testCase: this.mapTestCaseToDto(testCase),
      activeVersion: this.mapVersionToDto(version),
      currentRequirement: testCase.sourceRequirement
        ? {
            id: testCase.sourceRequirement.id,
            key: testCase.sourceRequirement.requirementKey,
            title: testCase.sourceRequirement.title,
            versionNumber: currentReqVersion,
            originalText: testCase.sourceRequirement.originalText,
          }
        : null,
      isRequirementStale,
      latestValidation,
      versionsCount: totalVersionsCount,
      reviewEvents,
    };
  }

  /**
   * Approves a specific test case version.
   */
  public async approveTestVersion(input: ApproveTestVersionInputDto): Promise<TestReviewDetailDto> {
    const validated = approveTestVersionInputSchema.safeParse(input);
    if (!validated.success) {
      throw new TestReviewValidationError('Invalid approve test version input', {
        errors: validated.error.errors,
      });
    }

    const { projectId, testCaseId, versionNumber, comment, reviewerActorId } = validated.data;

    const testCase = await this.prisma.testCase.findUnique({
      where: { id: testCaseId },
      include: {
        preconditions: true,
        steps: true,
        testData: true,
        sourceRequirement: true,
      },
    });

    if (!testCase) {
      throw new TestReviewNotFoundError(testCaseId, projectId);
    }
    if (testCase.projectId !== projectId) {
      throw new TestReviewProjectMismatchError(testCaseId, projectId, testCase.projectId);
    }

    await this.ensureBaselineVersion(testCase);

    const version = await this.prisma.testCaseVersion.findUnique({
      where: {
        testCaseId_versionNumber: {
          testCaseId,
          versionNumber,
        },
      },
    });

    if (!version) {
      throw new TestVersionNotFoundError(testCaseId, versionNumber);
    }

    // Idempotency: Already approved on this version
    if (
      testCase.reviewStatus === 'APPROVED' &&
      testCase.approvedVersionNumber === versionNumber &&
      version.reviewStatus === 'APPROVED'
    ) {
      return this.getReviewDetail({ projectId, testCaseId, versionNumber });
    }

    const fromStatus = testCase.reviewStatus as TestReviewStatus;
    const actor = reviewerActorId ?? 'LOCAL_USER';

    await this.prisma.$transaction(async tx => {
      await tx.testCaseVersion.update({
        where: { id: version.id },
        data: {
          reviewStatus: 'APPROVED',
        },
      });

      await tx.testCase.update({
        where: { id: testCaseId },
        data: {
          reviewStatus: 'APPROVED',
          approvedVersionNumber: versionNumber,
          approvedAt: new Date(),
          approvedByActorId: actor,
          latestReviewComment: comment ?? null,
          latestRejectionReason: null,
        },
      });

      await tx.testCaseReviewEvent.create({
        data: {
          projectId,
          testCaseId,
          versionNumber,
          action: 'APPROVED',
          fromStatus,
          toStatus: 'APPROVED',
          comment: comment ?? null,
          actorId: actor,
          metadataJson: {
            approvedVersionNumber: versionNumber,
          },
        },
      });
    });

    this.logger?.info('test_review.approved', {
      projectId,
      testCaseId,
      versionNumber,
      actor,
    });

    return this.getReviewDetail({ projectId, testCaseId, versionNumber });
  }

  /**
   * Rejects a specific test case version with reason taxonomy.
   */
  public async rejectTestVersion(input: RejectTestVersionInputDto): Promise<TestReviewDetailDto> {
    const validated = rejectTestVersionInputSchema.safeParse(input);
    if (!validated.success) {
      throw new TestReviewValidationError('Invalid reject test version input', {
        errors: validated.error.errors,
      });
    }

    const { projectId, testCaseId, versionNumber, rejectionReason, comment, reviewerActorId } =
      validated.data;

    const testCase = await this.prisma.testCase.findUnique({
      where: { id: testCaseId },
      include: {
        preconditions: true,
        steps: true,
        testData: true,
        sourceRequirement: true,
      },
    });

    if (!testCase) {
      throw new TestReviewNotFoundError(testCaseId, projectId);
    }
    if (testCase.projectId !== projectId) {
      throw new TestReviewProjectMismatchError(testCaseId, projectId, testCase.projectId);
    }

    await this.ensureBaselineVersion(testCase);

    const version = await this.prisma.testCaseVersion.findUnique({
      where: {
        testCaseId_versionNumber: {
          testCaseId,
          versionNumber,
        },
      },
    });

    if (!version) {
      throw new TestVersionNotFoundError(testCaseId, versionNumber);
    }

    // Idempotency check
    if (
      testCase.reviewStatus === 'REJECTED' &&
      testCase.latestRejectionReason === rejectionReason &&
      version.reviewStatus === 'REJECTED'
    ) {
      return this.getReviewDetail({ projectId, testCaseId, versionNumber });
    }

    const fromStatus = testCase.reviewStatus as TestReviewStatus;
    const actor = reviewerActorId ?? 'LOCAL_USER';

    await this.prisma.$transaction(async tx => {
      await tx.testCaseVersion.update({
        where: { id: version.id },
        data: {
          reviewStatus: 'REJECTED',
        },
      });

      await tx.testCase.update({
        where: { id: testCaseId },
        data: {
          reviewStatus: 'REJECTED',
          latestRejectionReason: rejectionReason,
          latestReviewComment: comment ?? null,
        },
      });

      await tx.testCaseReviewEvent.create({
        data: {
          projectId,
          testCaseId,
          versionNumber,
          action: 'REJECTED',
          fromStatus,
          toStatus: 'REJECTED',
          rejectionReason,
          comment: comment ?? null,
          actorId: actor,
          metadataJson: {
            rejectedVersionNumber: versionNumber,
          },
        },
      });
    });

    this.logger?.info('test_review.rejected', {
      projectId,
      testCaseId,
      versionNumber,
      rejectionReason,
      actor,
    });

    return this.getReviewDetail({ projectId, testCaseId, versionNumber });
  }

  /**
   * Applies controlled human edits to a test case, creating a new immutable version and resetting review status.
   */
  public async editTestCase(input: EditTestCaseInputDto): Promise<TestReviewDetailDto> {
    const validated = editTestCaseInputSchema.safeParse(input);
    if (!validated.success) {
      throw new TestReviewValidationError('Invalid edit test case input', {
        errors: validated.error.errors,
      });
    }

    const {
      projectId,
      testCaseId,
      expectedVersionNumber,
      title,
      objective,
      description,
      type,
      priority,
      executionSuitability,
      changeReason,
      preconditions,
      steps,
      testData,
      overallExpectedResult,
      editorActorId,
    } = validated.data;

    const testCase = await this.prisma.testCase.findUnique({
      where: { id: testCaseId },
      include: {
        preconditions: { orderBy: { sequenceOrder: 'asc' } },
        steps: { orderBy: { stepNumber: 'asc' } },
        testData: { orderBy: { sequenceOrder: 'asc' } },
        sourceRequirement: true,
      },
    });

    if (!testCase) {
      throw new TestReviewNotFoundError(testCaseId, projectId);
    }
    if (testCase.projectId !== projectId) {
      throw new TestReviewProjectMismatchError(testCaseId, projectId, testCase.projectId);
    }

    await this.ensureBaselineVersion(testCase);

    if (testCase.currentVersionNumber !== expectedVersionNumber) {
      throw new TestVersionConflictError(
        testCaseId,
        expectedVersionNumber,
        testCase.currentVersionNumber,
      );
    }

    const isNoOp = this.isNoOpEdit(testCase, {
      title,
      objective,
      description: description ?? null,
      type: (type ?? testCase.type) as TestCaseType,
      priority: (priority ?? testCase.priority) as TestCasePriority,
      executionSuitability: (executionSuitability ??
        testCase.executionSuitability) as TestCaseExecutionSuitability,
      overallExpectedResult: overallExpectedResult ?? testCase.overallExpectedResult,
      preconditions,
      steps,
      testData,
    });

    if (isNoOp) {
      this.logger?.info('test_review.edit_noop', {
        projectId,
        testCaseId,
        currentVersionNumber: testCase.currentVersionNumber,
      });
      return this.getReviewDetail({
        projectId,
        testCaseId,
        versionNumber: testCase.currentVersionNumber,
      });
    }

    const nextVersionNumber = testCase.currentVersionNumber + 1;
    const actor = editorActorId ?? 'LOCAL_USER';
    const fromStatus = testCase.reviewStatus as TestReviewStatus;

    const changedFields = this.detectChangedFields(testCase, {
      title,
      objective,
      description,
      type,
      priority,
      executionSuitability,
      overallExpectedResult,
      preconditions,
      steps,
      testData,
    });

    await this.prisma.$transaction(async tx => {
      await tx.testCaseVersion.create({
        data: {
          projectId,
          testCaseId,
          versionNumber: nextVersionNumber,
          sourceType: 'HUMAN_EDIT',
          title,
          objective,
          description: description ?? null,
          type: type ?? testCase.type,
          priority: priority ?? testCase.priority,
          executionSuitability: executionSuitability ?? testCase.executionSuitability,
          reviewStatus: 'DRAFT',
          changeReason: changeReason ?? 'Human edit',
          changedFields,
          sourceRequirementId: testCase.sourceRequirementId,
          sourceRequirementKey: testCase.sourceRequirementKey,
          sourceRequirementVersionNumber: testCase.sourceRequirementVersionNumber,
          sourceScenarioCandidateId: testCase.sourceScenarioCandidateId,
          sourceScenarioKey: testCase.sourceScenarioKey,
          generationMetadata: {
            editedAt: new Date().toISOString(),
            baseVersionNumber: expectedVersionNumber,
          },
          preconditionsJson: preconditions as any,
          stepsJson: steps as any,
          testDataJson: testData as any,
          overallExpectedResult: overallExpectedResult ?? null,
          createdByActorId: actor,
        },
      });

      await tx.testCase.update({
        where: { id: testCaseId },
        data: {
          title,
          objective,
          description: description ?? null,
          type: type ?? testCase.type,
          priority: priority ?? testCase.priority,
          executionSuitability: executionSuitability ?? testCase.executionSuitability,
          overallExpectedResult: overallExpectedResult ?? null,
          currentVersionNumber: nextVersionNumber,
          reviewStatus: 'DRAFT',
          latestReviewComment: changeReason ?? null,
        },
      });

      await tx.testCasePrecondition.deleteMany({ where: { testCaseId } });
      if (preconditions.length > 0) {
        await tx.testCasePrecondition.createMany({
          data: preconditions.map(p => ({
            testCaseId,
            sequenceOrder: p.sequenceOrder,
            category: (p.category as PreconditionCategory) ?? 'OTHER',
            description: p.description,
            isEnforced: p.isEnforced ?? true,
          })),
        });
      }

      await tx.testCaseStep.deleteMany({ where: { testCaseId } });
      if (steps.length > 0) {
        await tx.testCaseStep.createMany({
          data: steps.map(s => ({
            testCaseId,
            stepNumber: s.stepNumber,
            action: s.action,
            expectedResult: s.expectedResult ?? null,
            testDataSummary: s.testDataSummary ?? null,
            stateChangeFrom: s.stateChangeFrom ?? null,
            stateChangeTo: s.stateChangeTo ?? null,
            stateEntity: s.stateEntity ?? null,
            isOptional: s.isOptional ?? false,
          })),
        });
      }

      await tx.testCaseTestDataItem.deleteMany({ where: { testCaseId } });
      if (testData.length > 0) {
        await tx.testCaseTestDataItem.createMany({
          data: testData.map((d, i) => ({
            testCaseId,
            sequenceOrder: d.sequenceOrder ?? i + 1,
            name: d.name,
            dataType: d.dataType ?? 'STRING',
            origin: d.origin ?? 'HUMAN_INPUT',
            valueJson: (d.valueJson as any) ?? null,
            constraint: d.constraint ?? null,
            isSensitive: d.isSensitive ?? false,
          })),
        });
      }

      await tx.testCaseReviewEvent.create({
        data: {
          projectId,
          testCaseId,
          versionNumber: nextVersionNumber,
          action: 'EDITED',
          fromStatus,
          toStatus: 'DRAFT',
          comment: changeReason ?? null,
          actorId: actor,
          metadataJson: {
            changedFields,
            baseVersionNumber: expectedVersionNumber,
          },
        },
      });
    });

    this.logger?.info('test_review.edited', {
      projectId,
      testCaseId,
      newVersionNumber: nextVersionNumber,
      changedFields,
      actor,
    });

    return this.getReviewDetail({
      projectId,
      testCaseId,
      versionNumber: nextVersionNumber,
    });
  }

  /**
   * Regenerates an existing test case using the AI generation pipeline, creating a new immutable version.
   */
  public async regenerateTestCase(input: RegenerateTestCaseInputDto): Promise<TestReviewDetailDto> {
    const validated = regenerateTestCaseInputSchema.safeParse(input);
    if (!validated.success) {
      throw new TestReviewValidationError('Invalid regenerate test case input', {
        errors: validated.error.errors,
      });
    }

    const { projectId, testCaseId, expectedVersionNumber, reason, reviewerInstructions, actorId } =
      validated.data;

    const testCase = await this.prisma.testCase.findUnique({
      where: { id: testCaseId },
      include: {
        preconditions: true,
        steps: true,
        testData: true,
        sourceRequirement: {
          include: {
            versions: {
              orderBy: { versionNumber: 'desc' },
              take: 1,
            },
          },
        },
      },
    });

    if (!testCase) {
      throw new TestReviewNotFoundError(testCaseId, projectId);
    }
    if (testCase.projectId !== projectId) {
      throw new TestReviewProjectMismatchError(testCaseId, projectId, testCase.projectId);
    }

    await this.ensureBaselineVersion(testCase);

    if (testCase.currentVersionNumber !== expectedVersionNumber) {
      throw new TestVersionConflictError(
        testCaseId,
        expectedVersionNumber,
        testCase.currentVersionNumber,
      );
    }

    if (!testCase.sourceRequirementId || !testCase.sourceRequirement) {
      throw new TestRegenerationFailedError(
        testCaseId,
        'Cannot regenerate test case without an active linked requirement.',
      );
    }

    const requirement = testCase.sourceRequirement;
    const currentReqVer = requirement.versions[0]?.versionNumber ?? 1;
    const actor = actorId ?? 'LOCAL_USER';
    const nextVersionNumber = testCase.currentVersionNumber + 1;
    const fromStatus = testCase.reviewStatus as TestReviewStatus;

    let regeneratedSpec: {
      title: string;
      objective: string;
      description?: string | null;
      type: TestCaseType;
      priority: TestCasePriority;
      executionSuitability: TestCaseExecutionSuitability;
      overallExpectedResult?: string | null;
      preconditions: any[];
      steps: any[];
      testData: any[];
      assumptions: string[];
      unknowns: string[];
    };

    try {
      if (this.dependencies.testCaseGenerationService) {
        const genRes = await this.dependencies.testCaseGenerationService.generateForRequirement({
          projectId,
          requirementId: requirement.id,
          focusInstruction: reviewerInstructions
            ? `Reviewer Regeneration Feedback: ${reviewerInstructions}`
            : undefined,
        });

        const matchedCandidate =
          genRes.testCases.find((tc: any) => tc.type === testCase.type) ?? genRes.testCases[0];

        if (!matchedCandidate) {
          throw new Error('AI Generator did not produce any test cases for this requirement.');
        }

        regeneratedSpec = {
          title: matchedCandidate.title,
          objective: matchedCandidate.objective,
          description: matchedCandidate.description ?? null,
          type: matchedCandidate.type as TestCaseType,
          priority: matchedCandidate.priority as TestCasePriority,
          executionSuitability: (matchedCandidate.executionSuitability ??
            'UNKNOWN') as TestCaseExecutionSuitability,
          overallExpectedResult: matchedCandidate.overallExpectedResult ?? null,
          preconditions: matchedCandidate.preconditions as any[],
          steps: matchedCandidate.steps as any[],
          testData: matchedCandidate.testData as any[],
          assumptions: (matchedCandidate.assumptions as string[]) ?? [],
          unknowns: (matchedCandidate.unknowns as string[]) ?? [],
        };
      } else {
        regeneratedSpec = {
          title: `${testCase.title} (Regenerated)`,
          objective: reviewerInstructions
            ? `${testCase.objective} [Refined: ${reviewerInstructions}]`
            : testCase.objective,
          description: testCase.description,
          type: testCase.type as TestCaseType,
          priority: testCase.priority as TestCasePriority,
          executionSuitability: testCase.executionSuitability as TestCaseExecutionSuitability,
          overallExpectedResult: testCase.overallExpectedResult,
          preconditions: testCase.preconditions.map(p => ({
            sequenceOrder: p.sequenceOrder,
            category: p.category,
            description: p.description,
            isEnforced: p.isEnforced,
          })),
          steps: testCase.steps.map(s => ({
            stepNumber: s.stepNumber,
            action: s.action,
            expectedResult: s.expectedResult,
            testDataSummary: s.testDataSummary,
            stateChangeFrom: s.stateChangeFrom,
            stateChangeTo: s.stateChangeTo,
            isOptional: s.isOptional,
          })),
          testData: testCase.testData.map(d => ({
            sequenceOrder: d.sequenceOrder,
            name: d.name,
            dataType: d.dataType,
            origin: d.origin,
            valueJson: d.valueJson,
            constraint: d.constraint,
            isSensitive: d.isSensitive,
          })),
          assumptions: (testCase.assumptions as string[]) ?? [],
          unknowns: (testCase.unknowns as string[]) ?? [],
        };
      }

      if (this.dependencies.testValidationService) {
        const valRes = await this.dependencies.testValidationService.validateSpecification({
          projectId,
          requirementId: requirement.id,
          requirementVersionNumber: currentReqVer,
          specification: regeneratedSpec as any,
        });

        if (valRes.status === 'REJECTED') {
          throw new Error(
            `Validation rejected regenerated test case: ${valRes.summaryReport ?? 'grounding error'}`,
          );
        }
      }
    } catch (err) {
      this.logger?.error('test_review.regeneration_failed', {
        projectId,
        testCaseId,
        error: err instanceof Error ? err.message : String(err),
      });
      throw new TestRegenerationFailedError(
        testCaseId,
        err instanceof Error ? err.message : String(err),
      );
    }

    await this.prisma.$transaction(async tx => {
      await tx.testCaseVersion.create({
        data: {
          projectId,
          testCaseId,
          versionNumber: nextVersionNumber,
          sourceType: 'AI_REGENERATION',
          title: regeneratedSpec.title,
          objective: regeneratedSpec.objective,
          description: regeneratedSpec.description ?? null,
          type: regeneratedSpec.type,
          priority: regeneratedSpec.priority,
          executionSuitability: regeneratedSpec.executionSuitability,
          reviewStatus: 'DRAFT',
          changeReason: reason,
          changedFields: ['regenerated_from_ai'],
          sourceRequirementId: requirement.id,
          sourceRequirementKey: requirement.requirementKey,
          sourceRequirementVersionNumber: currentReqVer,
          generationMetadata: {
            regeneratedAt: new Date().toISOString(),
            baseVersionNumber: expectedVersionNumber,
            reason,
            reviewerInstructions: reviewerInstructions ?? null,
          },
          preconditionsJson: regeneratedSpec.preconditions as any,
          stepsJson: regeneratedSpec.steps as any,
          testDataJson: regeneratedSpec.testData as any,
          assumptionsJson: regeneratedSpec.assumptions as any,
          unknownsJson: regeneratedSpec.unknowns as any,
          overallExpectedResult: regeneratedSpec.overallExpectedResult ?? null,
          createdByActorId: actor,
        },
      });

      await tx.testCase.update({
        where: { id: testCaseId },
        data: {
          title: regeneratedSpec.title,
          objective: regeneratedSpec.objective,
          description: regeneratedSpec.description ?? null,
          type: regeneratedSpec.type,
          priority: regeneratedSpec.priority,
          executionSuitability: regeneratedSpec.executionSuitability,
          overallExpectedResult: regeneratedSpec.overallExpectedResult ?? null,
          sourceRequirementVersionNumber: currentReqVer,
          currentVersionNumber: nextVersionNumber,
          reviewStatus: 'DRAFT',
          latestReviewComment: reason,
        },
      });

      await tx.testCasePrecondition.deleteMany({ where: { testCaseId } });
      if (regeneratedSpec.preconditions.length > 0) {
        await tx.testCasePrecondition.createMany({
          data: regeneratedSpec.preconditions.map((p, i) => ({
            testCaseId,
            sequenceOrder: p.sequenceOrder ?? i + 1,
            category: (p.category as PreconditionCategory) ?? 'OTHER',
            description: p.description,
            isEnforced: p.isEnforced ?? true,
          })),
        });
      }

      await tx.testCaseStep.deleteMany({ where: { testCaseId } });
      if (regeneratedSpec.steps.length > 0) {
        await tx.testCaseStep.createMany({
          data: regeneratedSpec.steps.map((s, i) => ({
            testCaseId,
            stepNumber: s.stepNumber ?? i + 1,
            action: s.action,
            expectedResult: s.expectedResult ?? null,
            testDataSummary: s.testDataSummary ?? null,
            stateChangeFrom: s.stateChangeFrom ?? null,
            stateChangeTo: s.stateChangeTo ?? null,
            stateEntity: s.stateEntity ?? null,
            isOptional: s.isOptional ?? false,
          })),
        });
      }

      await tx.testCaseTestDataItem.deleteMany({ where: { testCaseId } });
      if (regeneratedSpec.testData.length > 0) {
        await tx.testCaseTestDataItem.createMany({
          data: regeneratedSpec.testData.map((d, i) => ({
            testCaseId,
            sequenceOrder: d.sequenceOrder ?? i + 1,
            name: d.name,
            dataType: d.dataType ?? 'STRING',
            origin: d.origin ?? 'DERIVED',
            valueJson: (d.valueJson as any) ?? null,
            constraint: d.constraint ?? null,
            isSensitive: d.isSensitive ?? false,
          })),
        });
      }

      await tx.testCaseReviewEvent.create({
        data: {
          projectId,
          testCaseId,
          versionNumber: nextVersionNumber,
          action: 'REGENERATED',
          fromStatus,
          toStatus: 'DRAFT',
          comment: reason,
          actorId: actor,
          metadataJson: {
            reason,
            reviewerInstructions: reviewerInstructions ?? null,
            requirementVersionNumber: currentReqVer,
          },
        },
      });
    });

    this.logger?.info('test_review.regenerated', {
      projectId,
      testCaseId,
      newVersionNumber: nextVersionNumber,
      requirementVersionNumber: currentReqVer,
      actor,
    });

    return this.getReviewDetail({
      projectId,
      testCaseId,
      versionNumber: nextVersionNumber,
    });
  }

  /**
   * Retrieves version history and review audit trail.
   */
  public async getTestHistory(input: GetTestHistoryInputDto): Promise<TestHistoryResultDto> {
    const validated = getTestHistoryInputSchema.safeParse(input);
    if (!validated.success) {
      throw new TestReviewValidationError('Invalid get test history input', {
        errors: validated.error.errors,
      });
    }

    const { projectId, testCaseId } = validated.data;

    const testCase = await this.prisma.testCase.findUnique({
      where: { id: testCaseId },
      include: {
        preconditions: true,
        steps: true,
        testData: true,
        versions: { orderBy: { versionNumber: 'asc' } },
        reviewEvents: { orderBy: { createdAt: 'asc' } },
      },
    });

    if (!testCase) {
      throw new TestReviewNotFoundError(testCaseId, projectId);
    }
    if (testCase.projectId !== projectId) {
      throw new TestReviewProjectMismatchError(testCaseId, projectId, testCase.projectId);
    }

    await this.ensureBaselineVersion(testCase);

    const versions = await this.prisma.testCaseVersion.findMany({
      where: { testCaseId },
      orderBy: { versionNumber: 'asc' },
    });

    const reviewEvents = await this.prisma.testCaseReviewEvent.findMany({
      where: { testCaseId },
      orderBy: { createdAt: 'asc' },
    });

    return {
      versions: versions.map(v => this.mapVersionToDto(v)),
      reviewEvents: reviewEvents.map(e => ({
        id: e.id,
        projectId: e.projectId,
        testCaseId: e.testCaseId,
        versionNumber: e.versionNumber,
        action: e.action as TestReviewAction,
        fromStatus: e.fromStatus as TestReviewStatus,
        toStatus: e.toStatus as TestReviewStatus,
        rejectionReason: e.rejectionReason ? (e.rejectionReason as any) : null,
        comment: e.comment,
        actorId: e.actorId,
        metadata: (e.metadataJson as Record<string, unknown>) ?? {},
        createdAt: e.createdAt.toISOString(),
      })),
    };
  }

  /**
   * Compares two test case versions deterministically.
   */
  public async compareTestVersions(
    input: CompareTestVersionsInputDto,
  ): Promise<TestVersionDiffDto> {
    const validated = compareTestVersionsInputSchema.safeParse(input);
    if (!validated.success) {
      throw new TestReviewValidationError('Invalid compare test versions input', {
        errors: validated.error.errors,
      });
    }

    const { projectId, testCaseId, fromVersionNumber, toVersionNumber } = validated.data;

    const [fromVer, toVer] = await Promise.all([
      this.prisma.testCaseVersion.findUnique({
        where: {
          testCaseId_versionNumber: {
            testCaseId,
            versionNumber: fromVersionNumber,
          },
        },
      }),
      this.prisma.testCaseVersion.findUnique({
        where: {
          testCaseId_versionNumber: {
            testCaseId,
            versionNumber: toVersionNumber,
          },
        },
      }),
    ]);

    if (!fromVer) {
      throw new TestVersionNotFoundError(testCaseId, fromVersionNumber);
    }
    if (!toVer) {
      throw new TestVersionNotFoundError(testCaseId, toVersionNumber);
    }
    if (fromVer.projectId !== projectId || toVer.projectId !== projectId) {
      throw new TestReviewProjectMismatchError(testCaseId, projectId, fromVer.projectId);
    }

    return TestVersionDiffEngine.compare(
      this.mapVersionToDto(fromVer),
      this.mapVersionToDto(toVer),
    );
  }

  // --------------------------------------------------------------------------
  // Private Helper Methods
  // --------------------------------------------------------------------------

  private async ensureBaselineVersion(testCase: any): Promise<void> {
    const count = await this.prisma.testCaseVersion.count({
      where: { testCaseId: testCase.id },
    });

    if (count === 0) {
      await this.prisma.testCaseVersion.create({
        data: {
          projectId: testCase.projectId,
          testCaseId: testCase.id,
          versionNumber: 1,
          sourceType: 'INITIAL_AI_GENERATION',
          title: testCase.title,
          objective: testCase.objective,
          description: testCase.description ?? null,
          type: testCase.type,
          priority: testCase.priority,
          executionSuitability: testCase.executionSuitability,
          reviewStatus: testCase.reviewStatus ?? 'DRAFT',
          changeReason: 'Baseline v1 at Phase 56',
          changedFields: [],
          sourceRequirementId: testCase.sourceRequirementId,
          sourceRequirementKey: testCase.sourceRequirementKey,
          sourceRequirementVersionNumber: testCase.sourceRequirementVersionNumber,
          sourceScenarioCandidateId: testCase.sourceScenarioCandidateId,
          sourceScenarioKey: testCase.sourceScenarioKey,
          generationMetadata: {
            providerId: testCase.providerId,
            model: testCase.model,
            promptId: testCase.promptId,
            promptVersion: testCase.promptVersion,
            generationId: testCase.generationId,
            inputFingerprint: testCase.inputFingerprint,
          },
          preconditionsJson: (testCase.preconditions as any) ?? [],
          stepsJson: (testCase.steps as any) ?? [],
          testDataJson: (testCase.testData as any) ?? [],
          assumptionsJson: (testCase.assumptions as any) ?? [],
          unknownsJson: (testCase.unknowns as any) ?? [],
          overallExpectedResult: testCase.overallExpectedResult ?? null,
          createdAt: testCase.createdAt,
        },
      });
    }
  }

  private isNoOpEdit(testCase: any, edit: any): boolean {
    if (testCase.title !== edit.title) return false;
    if (testCase.objective !== edit.objective) return false;
    if ((testCase.description ?? null) !== edit.description) return false;
    if (testCase.type !== edit.type) return false;
    if (testCase.priority !== edit.priority) return false;
    if (testCase.executionSuitability !== edit.executionSuitability) return false;
    if ((testCase.overallExpectedResult ?? null) !== (edit.overallExpectedResult ?? null))
      return false;

    if (testCase.preconditions.length !== edit.preconditions.length) return false;
    for (let i = 0; i < testCase.preconditions.length; i++) {
      const p1 = testCase.preconditions[i];
      const p2 = edit.preconditions[i];
      if (p1.sequenceOrder !== p2.sequenceOrder || p1.description !== p2.description) {
        return false;
      }
    }

    if (testCase.steps.length !== edit.steps.length) return false;
    for (let i = 0; i < testCase.steps.length; i++) {
      const s1 = testCase.steps[i];
      const s2 = edit.steps[i];
      if (
        s1.stepNumber !== s2.stepNumber ||
        s1.action !== s2.action ||
        (s1.expectedResult ?? null) !== (s2.expectedResult ?? null)
      ) {
        return false;
      }
    }

    return true;
  }

  private detectChangedFields(testCase: any, edit: any): string[] {
    const changed: string[] = [];
    if (testCase.title !== edit.title) changed.push('title');
    if (testCase.objective !== edit.objective) changed.push('objective');
    if ((testCase.description ?? null) !== (edit.description ?? null)) changed.push('description');
    if (edit.type && testCase.type !== edit.type) changed.push('type');
    if (edit.priority && testCase.priority !== edit.priority) changed.push('priority');
    if (edit.executionSuitability && testCase.executionSuitability !== edit.executionSuitability) {
      changed.push('executionSuitability');
    }
    if ((testCase.overallExpectedResult ?? null) !== (edit.overallExpectedResult ?? null)) {
      changed.push('overallExpectedResult');
    }
    if (JSON.stringify(testCase.preconditions) !== JSON.stringify(edit.preconditions)) {
      changed.push('preconditions');
    }
    if (JSON.stringify(testCase.steps) !== JSON.stringify(edit.steps)) {
      changed.push('steps');
    }
    if (JSON.stringify(testCase.testData) !== JSON.stringify(edit.testData)) {
      changed.push('testData');
    }
    return changed;
  }

  private mapTestCaseToDto(tc: any): TestCaseDto {
    return {
      id: tc.id,
      projectId: tc.projectId,
      testCaseKey: tc.testCaseKey,
      title: tc.title,
      objective: tc.objective,
      description: tc.description,
      type: tc.type as TestCaseType,
      priority: tc.priority as TestCasePriority,
      status: tc.status as any,
      currentVersionNumber: tc.currentVersionNumber,
      reviewStatus: tc.reviewStatus as TestReviewStatus,
      approvedVersionNumber: tc.approvedVersionNumber,
      approvedAt: tc.approvedAt ? tc.approvedAt.toISOString() : null,
      executionSuitability: tc.executionSuitability as TestCaseExecutionSuitability,
      sourceRequirementId: tc.sourceRequirementId,
      sourceRequirementKey: tc.sourceRequirementKey,
      sourceRequirementVersionId: tc.sourceRequirementVersionId,
      sourceRequirementVersionNumber: tc.sourceRequirementVersionNumber,
      sourceScenarioCandidateId: tc.sourceScenarioCandidateId,
      sourceScenarioKey: tc.sourceScenarioKey,
      generationId: tc.generationId,
      inputFingerprint: tc.inputFingerprint,
      providerId: tc.providerId,
      model: tc.model,
      promptId: tc.promptId,
      promptVersion: tc.promptVersion,
      overallExpectedResult: tc.overallExpectedResult,
      assumptions: (tc.assumptions as string[]) ?? [],
      unknowns: (tc.unknowns as any[]) ?? [],
      tags: tc.tags ?? [],
      preconditionCount: tc.preconditions ? tc.preconditions.length : 0,
      stepCount: tc.steps ? tc.steps.length : 0,
      testDataCount: tc.testData ? tc.testData.length : 0,
      createdAt: tc.createdAt.toISOString(),
      updatedAt: tc.updatedAt.toISOString(),
    };
  }

  private mapVersionToDto(v: any): TestCaseVersionDto {
    return {
      id: v.id,
      projectId: v.projectId,
      testCaseId: v.testCaseId,
      versionNumber: v.versionNumber,
      sourceType: v.sourceType as TestCaseVersionSource,
      title: v.title,
      objective: v.objective,
      description: v.description,
      type: v.type as TestCaseType,
      priority: v.priority as TestCasePriority,
      executionSuitability: v.executionSuitability as TestCaseExecutionSuitability,
      reviewStatus: v.reviewStatus as TestReviewStatus,
      changeReason: v.changeReason,
      changedFields: (v.changedFields as string[]) ?? [],
      sourceRequirementId: v.sourceRequirementId,
      sourceRequirementKey: v.sourceRequirementKey,
      sourceRequirementVersionNumber: v.sourceRequirementVersionNumber,
      sourceScenarioCandidateId: v.sourceScenarioCandidateId,
      sourceScenarioKey: v.sourceScenarioKey,
      generationMetadata: (v.generationMetadata as Record<string, unknown>) ?? {},
      preconditions: ((v.preconditionsJson as any[]) ?? []).map((p: any, i: number) => ({
        id: p.id ?? '',
        testCaseId: v.testCaseId,
        sequenceOrder: p.sequenceOrder ?? i + 1,
        category: p.category ?? 'OTHER',
        description: p.description,
        isEnforced: p.isEnforced ?? true,
        confidence: p.confidence ?? 'HIGH',
        sourceEvidenceRefs: p.sourceEvidenceRefs ?? [],
        reviewRequired: p.reviewRequired ?? false,
        createdAt: v.createdAt.toISOString(),
        updatedAt: v.createdAt.toISOString(),
      })),
      steps: ((v.stepsJson as any[]) ?? []).map((s: any, i: number) => ({
        id: s.id ?? '',
        testCaseId: v.testCaseId,
        stepNumber: s.stepNumber ?? i + 1,
        action: s.action,
        expectedResult: s.expectedResult ?? null,
        testDataSummary: s.testDataSummary ?? null,
        stateChangeFrom: s.stateChangeFrom ?? null,
        stateChangeTo: s.stateChangeTo ?? null,
        stateEntity: s.stateEntity ?? null,
        isOptional: s.isOptional ?? false,
        createdAt: v.createdAt.toISOString(),
        updatedAt: v.createdAt.toISOString(),
      })),
      testData: ((v.testDataJson as any[]) ?? []).map((d: any, i: number) => ({
        id: d.id ?? '',
        testCaseId: v.testCaseId,
        sequenceOrder: d.sequenceOrder ?? i + 1,
        name: d.name,
        dataType: d.dataType ?? 'STRING',
        origin: d.origin ?? 'DERIVED',
        value: d.value ?? d.valueJson ?? null,
        valueJson: d.valueJson ?? d.value ?? null,
        generator: d.generator ?? null,
        constraint: d.constraint ?? null,
        isSensitive: d.isSensitive ?? false,
        unknownReason: d.unknownReason ?? null,
        confidence: d.confidence ?? 'HIGH',
        sourceEvidenceRefs: d.sourceEvidenceRefs ?? [],
        reviewRequired: d.reviewRequired ?? false,
        createdAt: v.createdAt.toISOString(),
        updatedAt: v.createdAt.toISOString(),
      })),
      assumptions: (v.assumptionsJson as string[]) ?? [],
      unknowns: (v.unknownsJson as any[]) ?? [],
      overallExpectedResult: v.overallExpectedResult,
      createdByActorId: v.createdByActorId,
      createdAt: v.createdAt.toISOString(),
    };
  }
}
