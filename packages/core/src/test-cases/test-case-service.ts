import type { Prisma, PrismaClient } from '@prisma/client';
import type {
  TestCaseDto,
  TestCaseDetailDto,
  TestCasePreconditionDto,
  TestCaseStepDto,
  TestCaseTestDataItemDto,
  CreateTestCaseInputDto,
  PersistGeneratedTestCaseInputDto,
  PersistGeneratedTestCasesBatchInputDto,
  ListTestCasesInputDto,
  GetTestCaseByIdInputDto,
  DeleteTestCaseInputDto,
  TestCaseListResultDto,
  BatchPersistTestCasesResultDto,
  PreconditionCategory,
  TestCaseType,
  TestCasePriority,
  TestCaseStatus,
  TestCaseExecutionSuitability,
} from '@ai-quality/contracts';
import { TestCaseKeyAllocator } from './test-case-key-allocator.js';
import { TestCaseMappingService } from './test-case-mapping-service.js';
import { TEST_CASE_BOUNDS } from './test-case-types.js';
import {
  TestCaseNotFoundError,
  TestCaseProjectMismatchError,
  TestCaseRequirementNotFoundError,
  TestCaseValidationError,
  TestCasePersistenceError,
} from './test-case-errors.js';

export class TestCaseService {
  private readonly keyAllocator: TestCaseKeyAllocator;
  private readonly mappingService: TestCaseMappingService;

  constructor(private readonly prisma: PrismaClient) {
    this.keyAllocator = new TestCaseKeyAllocator(prisma);
    this.mappingService = new TestCaseMappingService();
  }

  /**
   * Persists a generated test specification as a canonical TestCase in a single atomic transaction.
   */
  async persistFromGeneration(input: PersistGeneratedTestCaseInputDto): Promise<TestCaseDetailDto> {
    // 1. Verify project
    const project = await this.prisma.project.findUnique({
      where: { id: input.projectId },
    });
    if (!project) {
      throw new TestCaseValidationError(`Project with ID '${input.projectId}' does not exist.`);
    }

    // 2. Verify source requirement
    const requirement = await this.prisma.requirement.findUnique({
      where: { id: input.requirementId },
      include: {
        versions: {
          orderBy: { versionNumber: 'desc' },
          take: 1,
        },
      },
    });
    if (!requirement) {
      throw new TestCaseRequirementNotFoundError(input.requirementId);
    }
    if (requirement.projectId !== input.projectId) {
      throw new TestCaseProjectMismatchError(
        'Requirement does not belong to the specified project.',
      );
    }

    const latestVersionNumber = requirement.versions[0]?.versionNumber ?? 1;
    const reqVersionNumber = input.requirementVersionNumber ?? latestVersionNumber;

    // 3. Idempotency check: Look for existing matching test case
    const inputFingerprint = input.generationProvenance?.inputFingerprint ?? null;
    if (inputFingerprint) {
      const existing = await this.prisma.testCase.findFirst({
        where: {
          projectId: input.projectId,
          sourceRequirementId: input.requirementId,
          title: input.specification.title.trim().slice(0, TEST_CASE_BOUNDS.MAX_TITLE_LENGTH),
          inputFingerprint,
        },
        include: {
          preconditions: { orderBy: { sequenceOrder: 'asc' } },
          steps: { orderBy: { stepNumber: 'asc' } },
          testData: { orderBy: { sequenceOrder: 'asc' } },
        },
      });

      if (existing) {
        // Ensure trace exists for existing test case
        const matchedVersion =
          requirement.versions[0]?.versionNumber === reqVersionNumber
            ? requirement.versions[0]
            : await this.prisma.requirementVersion.findUnique({
                where: {
                  requirementId_versionNumber: {
                    requirementId: requirement.id,
                    versionNumber: reqVersionNumber,
                  },
                },
              });

        await this.prisma.requirementTestTrace.upsert({
          where: {
            requirementId_testCaseId: {
              requirementId: requirement.id,
              testCaseId: existing.id,
            },
          },
          update: {},
          create: {
            projectId: input.projectId,
            requirementId: requirement.id,
            requirementVersionId: matchedVersion?.id ?? null,
            requirementVersionNumber: reqVersionNumber,
            testCaseId: existing.id,
            scenarioCandidateId: input.scenarioId ?? null,
            scenarioKey: input.specification.scenarioKey ?? null,
            generationRunId: input.generationProvenance?.generationId ?? null,
            origin: 'GENERATED',
            status: 'CURRENT',
            provenanceJson: {
              inputFingerprint,
              providerId: input.generationProvenance?.providerId ?? null,
              model: input.generationProvenance?.model ?? null,
              promptId: input.generationProvenance?.promptId ?? null,
              promptVersion: input.generationProvenance?.promptVersion ?? null,
            } as Prisma.InputJsonValue,
          },
        });

        return this.mapToDetailDto(existing);
      }
    }

    // 4. Map specification to domain
    const mapped = this.mappingService.mapSpecificationToTestCase(input.specification);

    // 5. Atomic persistence inside transaction
    try {
      return await this.prisma.$transaction(async tx => {
        const testCaseKey = await this.keyAllocator.allocateNextKey(input.projectId, tx);

        const matchedVersion =
          requirement.versions[0]?.versionNumber === reqVersionNumber
            ? requirement.versions[0]
            : await tx.requirementVersion.findUnique({
                where: {
                  requirementId_versionNumber: {
                    requirementId: requirement.id,
                    versionNumber: reqVersionNumber,
                  },
                },
              });

        const created = await tx.testCase.create({
          data: {
            projectId: input.projectId,
            testCaseKey,
            title: mapped.title,
            objective: mapped.objective,
            description: mapped.description,
            type: mapped.type,
            priority: mapped.priority,
            status: mapped.status,
            executionSuitability: mapped.executionSuitability,
            sourceRequirementId: requirement.id,
            sourceRequirementKey: requirement.requirementKey,
            sourceRequirementVersionId: matchedVersion?.id ?? null,
            sourceRequirementVersionNumber: reqVersionNumber,
            sourceScenarioCandidateId: input.scenarioId ?? null,
            sourceScenarioKey: input.specification.scenarioKey ?? null,
            generationId: input.generationProvenance?.generationId ?? null,
            inputFingerprint,
            providerId: input.generationProvenance?.providerId ?? null,
            model: input.generationProvenance?.model ?? null,
            promptId: input.generationProvenance?.promptId ?? null,
            promptVersion: input.generationProvenance?.promptVersion ?? null,
            overallExpectedResult: mapped.overallExpectedResult,
            assumptions: mapped.assumptions as unknown as Prisma.InputJsonValue,
            unknowns: mapped.unknowns as unknown as Prisma.InputJsonValue,
            tags: mapped.tags as string[],
            preconditions: {
              create: mapped.preconditions.map(p => ({
                sequenceOrder: p.sequenceOrder,
                category: p.category as PreconditionCategory,
                description: p.description,
                isEnforced: p.isEnforced,
                confidence: p.confidence,
                sourceEvidenceRefsJson: p.sourceEvidenceRefs as unknown as Prisma.InputJsonValue,
                reviewRequired: p.reviewRequired,
              })),
            },
            steps: {
              create: mapped.steps.map(s => ({
                stepNumber: s.stepNumber,
                action: s.action,
                expectedResult: s.expectedResult,
                testDataSummary: s.testDataSummary,
                stateChangeFrom: s.stateChangeFrom,
                stateChangeTo: s.stateChangeTo,
                stateEntity: s.stateEntity,
                isOptional: s.isOptional,
              })),
            },
            testData: {
              create: mapped.testData.map(d => ({
                sequenceOrder: d.sequenceOrder,
                name: d.name,
                dataType: d.dataType,
                origin: d.origin,
                valueJson: (d.value ?? undefined) as unknown as Prisma.InputJsonValue,
                generator: d.generator,
                constraint: d.constraint,
                isSensitive: d.isSensitive,
                unknownReason: d.unknownReason,
                confidence: d.confidence,
                sourceEvidenceRefsJson: d.sourceEvidenceRefs as unknown as Prisma.InputJsonValue,
                reviewRequired: d.reviewRequired,
              })),
            },
          },
          include: {
            preconditions: { orderBy: { sequenceOrder: 'asc' } },
            steps: { orderBy: { stepNumber: 'asc' } },
            testData: { orderBy: { sequenceOrder: 'asc' } },
          },
        });

        // Create atomic RequirementTestTrace (Phase 54)
        await tx.requirementTestTrace.upsert({
          where: {
            requirementId_testCaseId: {
              requirementId: requirement.id,
              testCaseId: created.id,
            },
          },
          update: {
            requirementVersionId: matchedVersion?.id ?? null,
            requirementVersionNumber: reqVersionNumber,
            origin: 'GENERATED',
            status: 'CURRENT',
          },
          create: {
            projectId: input.projectId,
            requirementId: requirement.id,
            requirementVersionId: matchedVersion?.id ?? null,
            requirementVersionNumber: reqVersionNumber,
            testCaseId: created.id,
            scenarioCandidateId: input.scenarioId ?? null,
            scenarioKey: input.specification.scenarioKey ?? null,
            generationRunId: input.generationProvenance?.generationId ?? null,
            origin: 'GENERATED',
            status: 'CURRENT',
            provenanceJson: {
              inputFingerprint,
              providerId: input.generationProvenance?.providerId ?? null,
              model: input.generationProvenance?.model ?? null,
              promptId: input.generationProvenance?.promptId ?? null,
              promptVersion: input.generationProvenance?.promptVersion ?? null,
            } as Prisma.InputJsonValue,
          },
        });

        return this.mapToDetailDto(created);
      });
    } catch (err) {
      if (err instanceof TestCaseValidationError || err instanceof TestCaseProjectMismatchError) {
        throw err;
      }
      throw new TestCasePersistenceError(
        `Failed to persist test case: ${err instanceof Error ? err.message : String(err)}`,
        err,
      );
    }
  }

  /**
   * Persists a batch of generated test specifications atomically.
   */
  async persistBatchFromGeneration(
    input: PersistGeneratedTestCasesBatchInputDto,
  ): Promise<BatchPersistTestCasesResultDto> {
    if (!input.specifications || input.specifications.length === 0) {
      throw new TestCaseValidationError('At least one test specification must be provided.');
    }

    const testCases: TestCaseDetailDto[] = [];
    const idempotentHit = false;

    for (const spec of input.specifications) {
      const persisted = await this.persistFromGeneration({
        projectId: input.projectId,
        requirementId: input.requirementId,
        requirementVersionNumber: input.requirementVersionNumber,
        scenarioId: spec.scenarioId ?? null,
        specification: spec,
        generationProvenance: input.generationProvenance,
        idempotencyToken: input.idempotencyToken,
      });

      testCases.push(persisted);
    }

    return {
      createdCount: testCases.length,
      testCases,
      idempotentHit,
    };
  }

  /**
   * Creates a test case directly with validation and atomic key allocation.
   */
  async createTestCase(input: CreateTestCaseInputDto): Promise<TestCaseDetailDto> {
    if (!input.title || input.title.trim().length === 0) {
      throw new TestCaseValidationError('Title is required.');
    }
    if (!input.objective || input.objective.trim().length === 0) {
      throw new TestCaseValidationError('Objective is required.');
    }
    if (!input.steps || input.steps.length === 0) {
      throw new TestCaseValidationError('At least one step is required.');
    }

    const project = await this.prisma.project.findUnique({
      where: { id: input.projectId },
    });
    if (!project) {
      throw new TestCaseValidationError(`Project with ID '${input.projectId}' does not exist.`);
    }

    let reqKey: string | null = null;
    if (input.sourceRequirementId) {
      const req = await this.prisma.requirement.findUnique({
        where: { id: input.sourceRequirementId },
      });
      if (!req) {
        throw new TestCaseRequirementNotFoundError(input.sourceRequirementId);
      }
      if (req.projectId !== input.projectId) {
        throw new TestCaseProjectMismatchError('Requirement belongs to a different project.');
      }
      reqKey = req.requirementKey;
    }

    try {
      return await this.prisma.$transaction(async tx => {
        const testCaseKey = await this.keyAllocator.allocateNextKey(input.projectId, tx);

        const created = await tx.testCase.create({
          data: {
            projectId: input.projectId,
            testCaseKey,
            title: input.title.trim().slice(0, TEST_CASE_BOUNDS.MAX_TITLE_LENGTH),
            objective: input.objective.trim().slice(0, TEST_CASE_BOUNDS.MAX_OBJECTIVE_LENGTH),
            description:
              input.description?.trim().slice(0, TEST_CASE_BOUNDS.MAX_DESCRIPTION_LENGTH) ?? null,
            type: input.type ?? 'POSITIVE',
            priority: input.priority ?? 'MEDIUM',
            status: input.status ?? 'DRAFT',
            executionSuitability: input.executionSuitability ?? 'UNKNOWN',
            sourceRequirementId: input.sourceRequirementId ?? null,
            sourceRequirementKey: reqKey,
            sourceRequirementVersionNumber: input.sourceRequirementVersionNumber ?? null,
            sourceScenarioCandidateId: input.sourceScenarioCandidateId ?? null,
            overallExpectedResult: input.overallExpectedResult?.trim() ?? null,
            assumptions: (input.assumptions ?? []) as unknown as Prisma.InputJsonValue,
            unknowns: (input.unknowns ?? []) as unknown as Prisma.InputJsonValue,
            tags: (input.tags ?? []) as string[],
            preconditions: {
              create: (input.preconditions ?? []).map((p, idx) => ({
                sequenceOrder: idx + 1,
                category: p.category,
                description: p.description.slice(
                  0,
                  TEST_CASE_BOUNDS.MAX_PRECONDITION_DESCRIPTION_LENGTH,
                ),
                isEnforced: p.isEnforced ?? true,
                confidence: p.confidence ?? 'HIGH',
                sourceEvidenceRefsJson: (p.sourceEvidenceRefs ??
                  []) as unknown as Prisma.InputJsonValue,
                reviewRequired: p.reviewRequired ?? false,
              })),
            },
            steps: {
              create: input.steps.map((s, idx) => ({
                stepNumber: idx + 1,
                action: s.action.slice(0, TEST_CASE_BOUNDS.MAX_STEP_ACTION_LENGTH),
                expectedResult:
                  s.expectedResult?.slice(0, TEST_CASE_BOUNDS.MAX_STEP_EXPECTED_RESULT_LENGTH) ??
                  null,
                testDataSummary: s.testDataSummary ?? null,
                stateChangeFrom: s.stateChangeFrom ?? null,
                stateChangeTo: s.stateChangeTo ?? null,
                stateEntity: s.stateEntity ?? null,
                isOptional: s.isOptional ?? false,
              })),
            },
            testData: {
              create: (input.testData ?? []).map((d, idx) => ({
                sequenceOrder: idx + 1,
                name: d.name.slice(0, TEST_CASE_BOUNDS.MAX_TEST_DATA_NAME_LENGTH),
                dataType: d.dataType ?? 'STRING',
                origin: d.origin ?? 'MANUAL',
                valueJson: (d.value ?? undefined) as unknown as Prisma.InputJsonValue,
                generator: d.generator ?? null,
                constraint:
                  d.constraint?.slice(0, TEST_CASE_BOUNDS.MAX_TEST_DATA_CONSTRAINT_LENGTH) ?? null,
                isSensitive: d.isSensitive ?? false,
                unknownReason: d.unknownReason ?? null,
                confidence: d.confidence ?? 'HIGH',
                sourceEvidenceRefsJson: (d.sourceEvidenceRefs ??
                  []) as unknown as Prisma.InputJsonValue,
                reviewRequired: d.reviewRequired ?? false,
              })),
            },
          },
          include: {
            preconditions: { orderBy: { sequenceOrder: 'asc' } },
            steps: { orderBy: { stepNumber: 'asc' } },
            testData: { orderBy: { sequenceOrder: 'asc' } },
          },
        });

        return this.mapToDetailDto(created);
      });
    } catch (err) {
      if (err instanceof TestCaseValidationError || err instanceof TestCaseProjectMismatchError) {
        throw err;
      }
      throw new TestCasePersistenceError(
        `Failed to create test case: ${err instanceof Error ? err.message : String(err)}`,
        err,
      );
    }
  }

  /**
   * Retrieves a single test case with complete relational details.
   */
  async getTestCaseById(input: GetTestCaseByIdInputDto): Promise<TestCaseDetailDto | null> {
    const testCase = await this.prisma.testCase.findUnique({
      where: { id: input.testCaseId },
      include: {
        preconditions: { orderBy: { sequenceOrder: 'asc' } },
        steps: { orderBy: { stepNumber: 'asc' } },
        testData: { orderBy: { sequenceOrder: 'asc' } },
      },
    });

    if (!testCase) {
      return null;
    }

    if (testCase.projectId !== input.projectId) {
      throw new TestCaseProjectMismatchError();
    }

    return this.mapToDetailDto(testCase);
  }

  /**
   * Lists test cases with filtering, searching, and pagination.
   */
  async listTestCases(input: ListTestCasesInputDto): Promise<TestCaseListResultDto> {
    const page = Math.max(1, input.page ?? 1);
    const pageSize = Math.min(
      TEST_CASE_BOUNDS.MAX_PAGE_SIZE,
      Math.max(1, input.pageSize ?? TEST_CASE_BOUNDS.DEFAULT_PAGE_SIZE),
    );
    const skip = (page - 1) * pageSize;

    const where: Prisma.TestCaseWhereInput = {
      projectId: input.projectId,
    };

    if (input.sourceRequirementId) {
      where.sourceRequirementId = input.sourceRequirementId;
    }
    if (input.type) {
      where.type = input.type;
    }
    if (input.priority) {
      where.priority = input.priority;
    }
    if (input.status) {
      where.status = input.status;
    }
    if (input.search && input.search.trim().length > 0) {
      const q = input.search.trim();
      where.OR = [
        { testCaseKey: { contains: q, mode: 'insensitive' } },
        { title: { contains: q, mode: 'insensitive' } },
        { objective: { contains: q, mode: 'insensitive' } },
      ];
    }

    const orderByField = input.sortBy ?? 'createdAt';
    const orderDirection = input.sortDirection ?? 'desc';
    const orderBy: Prisma.TestCaseOrderByWithRelationInput = {
      [orderByField]: orderDirection,
    };

    const [total, items] = await Promise.all([
      this.prisma.testCase.count({ where }),
      this.prisma.testCase.findMany({
        where,
        orderBy,
        skip,
        take: pageSize,
        include: {
          _count: {
            select: {
              preconditions: true,
              steps: true,
              testData: true,
            },
          },
        },
      }),
    ]);

    const mappedItems: TestCaseDto[] = items.map(tc => ({
      id: tc.id,
      projectId: tc.projectId,
      testCaseKey: tc.testCaseKey,
      title: tc.title,
      objective: tc.objective,
      description: tc.description,
      type: tc.type as TestCaseType,
      priority: tc.priority as TestCasePriority,
      status: tc.status as TestCaseStatus,
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
      assumptions: (tc.assumptions as unknown as string[]) ?? [],
      unknowns: (tc.unknowns as unknown as TestCaseDto['unknowns']) ?? [],
      tags: tc.tags,
      preconditionCount: tc._count.preconditions,
      stepCount: tc._count.steps,
      testDataCount: tc._count.testData,
      createdAt: tc.createdAt.toISOString(),
      updatedAt: tc.updatedAt.toISOString(),
    }));

    return {
      items: mappedItems,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  /**
   * Deletes a test case and cascades to child relations.
   */
  async deleteTestCase(input: DeleteTestCaseInputDto): Promise<{ readonly deleted: true }> {
    const existing = await this.prisma.testCase.findUnique({
      where: { id: input.testCaseId },
    });
    if (!existing) {
      throw new TestCaseNotFoundError(input.testCaseId);
    }
    if (existing.projectId !== input.projectId) {
      throw new TestCaseProjectMismatchError();
    }

    await this.prisma.testCase.delete({
      where: { id: input.testCaseId },
    });

    return { deleted: true };
  }

  private mapToDetailDto(testCase: {
    id: string;
    projectId: string;
    testCaseKey: string;
    title: string;
    objective: string;
    description: string | null;
    type: string;
    priority: string;
    status: string;
    executionSuitability: string;
    sourceRequirementId: string | null;
    sourceRequirementKey: string | null;
    sourceRequirementVersionId: string | null;
    sourceRequirementVersionNumber: number | null;
    sourceScenarioCandidateId: string | null;
    sourceScenarioKey: string | null;
    generationId: string | null;
    inputFingerprint: string | null;
    providerId: string | null;
    model: string | null;
    promptId: string | null;
    promptVersion: number | null;
    overallExpectedResult: string | null;
    assumptions: unknown;
    unknowns: unknown;
    tags: string[];
    createdAt: Date;
    updatedAt: Date;
    preconditions: Array<{
      id: string;
      testCaseId: string;
      sequenceOrder: number;
      category: string;
      description: string;
      isEnforced: boolean;
      confidence: string;
      sourceEvidenceRefsJson: unknown;
      reviewRequired: boolean;
      createdAt: Date;
      updatedAt: Date;
    }>;
    steps: Array<{
      id: string;
      testCaseId: string;
      stepNumber: number;
      action: string;
      expectedResult: string | null;
      testDataSummary: string | null;
      stateChangeFrom: string | null;
      stateChangeTo: string | null;
      stateEntity: string | null;
      isOptional: boolean;
      createdAt: Date;
      updatedAt: Date;
    }>;
    testData: Array<{
      id: string;
      testCaseId: string;
      sequenceOrder: number;
      name: string;
      dataType: string;
      origin: string;
      valueJson: unknown;
      generator: string | null;
      constraint: string | null;
      isSensitive: boolean;
      unknownReason: string | null;
      confidence: string;
      sourceEvidenceRefsJson: unknown;
      reviewRequired: boolean;
      createdAt: Date;
      updatedAt: Date;
    }>;
  }): TestCaseDetailDto {
    const preconditions: TestCasePreconditionDto[] = testCase.preconditions.map(p => ({
      id: p.id,
      testCaseId: p.testCaseId,
      sequenceOrder: p.sequenceOrder,
      category: p.category as PreconditionCategory,
      description: p.description,
      isEnforced: p.isEnforced,
      confidence: p.confidence,
      sourceEvidenceRefs: (p.sourceEvidenceRefsJson as string[]) ?? [],
      reviewRequired: p.reviewRequired,
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
    }));

    const steps: TestCaseStepDto[] = testCase.steps.map(s => ({
      id: s.id,
      testCaseId: s.testCaseId,
      stepNumber: s.stepNumber,
      action: s.action,
      expectedResult: s.expectedResult,
      testDataSummary: s.testDataSummary,
      stateChangeFrom: s.stateChangeFrom,
      stateChangeTo: s.stateChangeTo,
      stateEntity: s.stateEntity,
      isOptional: s.isOptional,
      createdAt: s.createdAt.toISOString(),
      updatedAt: s.updatedAt.toISOString(),
    }));

    const testData: TestCaseTestDataItemDto[] = testCase.testData.map(d => ({
      id: d.id,
      testCaseId: d.testCaseId,
      sequenceOrder: d.sequenceOrder,
      name: d.name,
      dataType: d.dataType,
      origin: d.origin,
      value: d.valueJson ?? undefined,
      generator: d.generator,
      constraint: d.constraint,
      isSensitive: d.isSensitive,
      unknownReason: d.unknownReason,
      confidence: d.confidence,
      sourceEvidenceRefs: (d.sourceEvidenceRefsJson as string[]) ?? [],
      reviewRequired: d.reviewRequired,
      createdAt: d.createdAt.toISOString(),
      updatedAt: d.updatedAt.toISOString(),
    }));

    return {
      id: testCase.id,
      projectId: testCase.projectId,
      testCaseKey: testCase.testCaseKey,
      title: testCase.title,
      objective: testCase.objective,
      description: testCase.description,
      type: testCase.type as TestCaseType,
      priority: testCase.priority as TestCasePriority,
      status: testCase.status as TestCaseStatus,
      executionSuitability: testCase.executionSuitability as TestCaseExecutionSuitability,
      sourceRequirementId: testCase.sourceRequirementId,
      sourceRequirementKey: testCase.sourceRequirementKey,
      sourceRequirementVersionId: testCase.sourceRequirementVersionId,
      sourceRequirementVersionNumber: testCase.sourceRequirementVersionNumber,
      sourceScenarioCandidateId: testCase.sourceScenarioCandidateId,
      sourceScenarioKey: testCase.sourceScenarioKey,
      generationId: testCase.generationId,
      inputFingerprint: testCase.inputFingerprint,
      providerId: testCase.providerId,
      model: testCase.model,
      promptId: testCase.promptId,
      promptVersion: testCase.promptVersion,
      overallExpectedResult: testCase.overallExpectedResult,
      assumptions: (testCase.assumptions as unknown as string[]) ?? [],
      unknowns: (testCase.unknowns as unknown as TestCaseDto['unknowns']) ?? [],
      tags: testCase.tags,
      preconditionCount: preconditions.length,
      stepCount: steps.length,
      testDataCount: testData.length,
      createdAt: testCase.createdAt.toISOString(),
      updatedAt: testCase.updatedAt.toISOString(),
      preconditions,
      steps,
      testData,
    };
  }
}
