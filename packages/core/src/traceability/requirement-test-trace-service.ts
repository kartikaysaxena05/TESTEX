/**
 * @file packages/core/src/traceability/requirement-test-trace-service.ts
 * Core service for managing persistent, auditable Requirement-to-Test Traceability.
 */

import type { Prisma, PrismaClient, TraceOrigin, TraceStatus } from '@prisma/client';
import type {
  CreateRequirementTestTraceInputDto,
  DeleteRequirementTestTraceInputDto,
  GetTraceByIdInputDto,
  ListProjectTracesInputDto,
  ListTracesByRequirementInputDto,
  ListTracesByTestCaseInputDto,
  ListTracesResultDto,
  RequirementTestTraceDto,
  TestCasePriority,
  TestCaseStatus,
  TestCaseType,
} from '@ai-quality/contracts';
import {
  TraceNotFoundError,
  TraceProjectMismatchError,
  TraceRequirementNotFoundError,
  TraceTestCaseNotFoundError,
  TraceValidationError,
} from './traceability-errors.js';
import { TRACEABILITY_BOUNDS } from './traceability-types.js';

export class RequirementTestTraceService {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Creates or idempotently links a Requirement to a Test Case with version binding and provenance.
   */
  async createTrace(
    input: CreateRequirementTestTraceInputDto,
    externalTx?: Prisma.TransactionClient,
  ): Promise<RequirementTestTraceDto> {
    const tx = externalTx ?? this.prisma;

    if (!input.projectId || !input.requirementId || !input.testCaseId) {
      throw new TraceValidationError('projectId, requirementId, and testCaseId are required.');
    }

    // 1. Verify Requirement exists and belongs to the project
    const requirement = await tx.requirement.findUnique({
      where: { id: input.requirementId },
      include: {
        versions: {
          orderBy: { versionNumber: 'desc' },
          take: 1,
        },
      },
    });

    if (!requirement) {
      throw new TraceRequirementNotFoundError(`Requirement ${input.requirementId} not found.`);
    }

    if (requirement.projectId !== input.projectId) {
      throw new TraceProjectMismatchError(
        `Requirement ${input.requirementId} does not belong to project ${input.projectId}.`,
      );
    }

    // 2. Verify Test Case exists and belongs to the project
    const testCase = await tx.testCase.findUnique({
      where: { id: input.testCaseId },
    });

    if (!testCase) {
      throw new TraceTestCaseNotFoundError(`Test case ${input.testCaseId} not found.`);
    }

    if (testCase.projectId !== input.projectId) {
      throw new TraceProjectMismatchError(
        `Test case ${input.testCaseId} does not belong to project ${input.projectId}.`,
      );
    }

    // 3. Resolve latest Requirement Version binding
    const latestVersion = requirement.versions[0];
    const requirementVersionId = latestVersion?.id ?? null;
    const requirementVersionNumber = latestVersion?.versionNumber ?? 1;

    const origin: TraceOrigin = input.origin ?? 'MANUAL';
    const provenanceJson = (input.provenance ?? {}) as Prisma.InputJsonValue;

    // 4. Upsert trace link (Idempotency guarantee)
    const trace = await tx.requirementTestTrace.upsert({
      where: {
        requirementId_testCaseId: {
          requirementId: input.requirementId,
          testCaseId: input.testCaseId,
        },
      },
      update: {
        origin,
        provenanceJson,
      },
      create: {
        projectId: input.projectId,
        requirementId: input.requirementId,
        requirementVersionId,
        requirementVersionNumber,
        testCaseId: input.testCaseId,
        scenarioCandidateId: testCase.sourceScenarioCandidateId ?? null,
        scenarioKey: testCase.sourceScenarioKey ?? null,
        generationRunId: testCase.generationId ?? null,
        origin,
        status: 'CURRENT',
        provenanceJson,
      },
      include: {
        requirement: {
          include: {
            versions: {
              orderBy: { versionNumber: 'desc' },
              take: 1,
            },
          },
        },
        testCase: true,
      },
    });

    return this.mapToDto(trace);
  }

  /**
   * Deletes a trace relationship with project verification.
   */
  async deleteTrace(
    input: DeleteRequirementTestTraceInputDto,
  ): Promise<{ readonly deleted: true }> {
    if (!input.projectId || !input.traceId) {
      throw new TraceValidationError('projectId and traceId are required.');
    }

    const trace = await this.prisma.requirementTestTrace.findUnique({
      where: { id: input.traceId },
    });

    if (!trace) {
      throw new TraceNotFoundError(`Trace ${input.traceId} not found.`);
    }

    if (trace.projectId !== input.projectId) {
      throw new TraceProjectMismatchError(
        `Trace ${input.traceId} does not belong to project ${input.projectId}.`,
      );
    }

    await this.prisma.requirementTestTrace.delete({
      where: { id: input.traceId },
    });

    return { deleted: true };
  }

  /**
   * Retrieves a single trace by ID.
   */
  async getTraceById(input: GetTraceByIdInputDto): Promise<RequirementTestTraceDto | null> {
    if (!input.projectId || !input.traceId) {
      throw new TraceValidationError('projectId and traceId are required.');
    }

    const trace = await this.prisma.requirementTestTrace.findUnique({
      where: { id: input.traceId },
      include: {
        requirement: {
          include: {
            versions: {
              orderBy: { versionNumber: 'desc' },
              take: 1,
            },
          },
        },
        testCase: true,
      },
    });

    if (!trace) {
      return null;
    }

    if (trace.projectId !== input.projectId) {
      throw new TraceProjectMismatchError(
        `Trace ${input.traceId} does not belong to project ${input.projectId}.`,
      );
    }

    return this.mapToDto(trace);
  }

  /**
   * Lists all test cases traced to a requirement (Forward Lookup).
   */
  async listTracesForRequirement(
    input: ListTracesByRequirementInputDto,
  ): Promise<ListTracesResultDto> {
    if (!input.projectId || !input.requirementId) {
      throw new TraceValidationError('projectId and requirementId are required.');
    }

    // Verify requirement belongs to project
    const requirement = await this.prisma.requirement.findUnique({
      where: { id: input.requirementId },
      select: { id: true, projectId: true },
    });

    if (!requirement) {
      throw new TraceRequirementNotFoundError(`Requirement ${input.requirementId} not found.`);
    }

    if (requirement.projectId !== input.projectId) {
      throw new TraceProjectMismatchError(
        `Requirement ${input.requirementId} does not belong to project ${input.projectId}.`,
      );
    }

    const page = Math.max(1, input.page ?? TRACEABILITY_BOUNDS.DEFAULT_PAGE);
    const pageSize = Math.min(
      TRACEABILITY_BOUNDS.MAX_PAGE_SIZE,
      Math.max(1, input.pageSize ?? TRACEABILITY_BOUNDS.DEFAULT_PAGE_SIZE),
    );
    const skip = (page - 1) * pageSize;

    const where: Prisma.RequirementTestTraceWhereInput = {
      projectId: input.projectId,
      requirementId: input.requirementId,
      ...(input.status ? { status: input.status as TraceStatus } : {}),
      ...(input.origin ? { origin: input.origin as TraceOrigin } : {}),
    };

    const [rawTraces, total] = await Promise.all([
      this.prisma.requirementTestTrace.findMany({
        where,
        include: {
          requirement: {
            include: {
              versions: {
                orderBy: { versionNumber: 'desc' },
                take: 1,
              },
            },
          },
          testCase: true,
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip,
        take: pageSize,
      }),
      this.prisma.requirementTestTrace.count({ where }),
    ]);

    return {
      traces: rawTraces.map(t => this.mapToDto(t)),
      total,
      page,
      pageSize,
    };
  }

  /**
   * Lists all requirements traced to a test case (Reverse Lookup).
   */
  async listTracesForTestCase(input: ListTracesByTestCaseInputDto): Promise<ListTracesResultDto> {
    if (!input.projectId || !input.testCaseId) {
      throw new TraceValidationError('projectId and testCaseId are required.');
    }

    // Verify test case belongs to project
    const testCase = await this.prisma.testCase.findUnique({
      where: { id: input.testCaseId },
      select: { id: true, projectId: true },
    });

    if (!testCase) {
      throw new TraceTestCaseNotFoundError(`Test case ${input.testCaseId} not found.`);
    }

    if (testCase.projectId !== input.projectId) {
      throw new TraceProjectMismatchError(
        `Test case ${input.testCaseId} does not belong to project ${input.projectId}.`,
      );
    }

    const page = Math.max(1, input.page ?? TRACEABILITY_BOUNDS.DEFAULT_PAGE);
    const pageSize = Math.min(
      TRACEABILITY_BOUNDS.MAX_PAGE_SIZE,
      Math.max(1, input.pageSize ?? TRACEABILITY_BOUNDS.DEFAULT_PAGE_SIZE),
    );
    const skip = (page - 1) * pageSize;

    const where: Prisma.RequirementTestTraceWhereInput = {
      projectId: input.projectId,
      testCaseId: input.testCaseId,
      ...(input.status ? { status: input.status as TraceStatus } : {}),
      ...(input.origin ? { origin: input.origin as TraceOrigin } : {}),
    };

    const [rawTraces, total] = await Promise.all([
      this.prisma.requirementTestTrace.findMany({
        where,
        include: {
          requirement: {
            include: {
              versions: {
                orderBy: { versionNumber: 'desc' },
                take: 1,
              },
            },
          },
          testCase: true,
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip,
        take: pageSize,
      }),
      this.prisma.requirementTestTrace.count({ where }),
    ]);

    return {
      traces: rawTraces.map(t => this.mapToDto(t)),
      total,
      page,
      pageSize,
    };
  }

  /**
   * Lists project-wide traces with filtering and search.
   */
  async listProjectTraces(input: ListProjectTracesInputDto): Promise<ListTracesResultDto> {
    if (!input.projectId) {
      throw new TraceValidationError('projectId is required.');
    }

    const page = Math.max(1, input.page ?? TRACEABILITY_BOUNDS.DEFAULT_PAGE);
    const pageSize = Math.min(
      TRACEABILITY_BOUNDS.MAX_PAGE_SIZE,
      Math.max(1, input.pageSize ?? TRACEABILITY_BOUNDS.DEFAULT_PAGE_SIZE),
    );
    const skip = (page - 1) * pageSize;

    const where: Prisma.RequirementTestTraceWhereInput = {
      projectId: input.projectId,
      ...(input.status ? { status: input.status as TraceStatus } : {}),
      ...(input.origin ? { origin: input.origin as TraceOrigin } : {}),
      ...(input.isStale === true ? { status: 'STALE' } : {}),
      ...(input.isStale === false ? { status: 'CURRENT' } : {}),
    };

    if (input.search && input.search.trim().length > 0) {
      const q = input.search.trim().slice(0, TRACEABILITY_BOUNDS.MAX_SEARCH_LENGTH);
      where.OR = [
        { requirement: { requirementKey: { contains: q, mode: 'insensitive' } } },
        { requirement: { title: { contains: q, mode: 'insensitive' } } },
        { testCase: { testCaseKey: { contains: q, mode: 'insensitive' } } },
        { testCase: { title: { contains: q, mode: 'insensitive' } } },
      ];
    }

    const [rawTraces, total] = await Promise.all([
      this.prisma.requirementTestTrace.findMany({
        where,
        include: {
          requirement: {
            include: {
              versions: {
                orderBy: { versionNumber: 'desc' },
                take: 1,
              },
            },
          },
          testCase: true,
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip,
        take: pageSize,
      }),
      this.prisma.requirementTestTrace.count({ where }),
    ]);

    return {
      traces: rawTraces.map(t => this.mapToDto(t)),
      total,
      page,
      pageSize,
    };
  }

  /**
   * Transactional helper: marks traces as STALE when a Requirement version advances.
   */
  static async syncTraceStalenessForRequirement(
    requirementId: string,
    newVersionNumber: number,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    await tx.requirementTestTrace.updateMany({
      where: {
        requirementId,
        requirementVersionNumber: { lt: newVersionNumber },
      },
      data: {
        status: 'STALE',
        staleReason: 'REQUIREMENT_VERSION_ADVANCED',
      },
    });
  }

  /**
   * Maps database entity with relations to RequirementTestTraceDto with dynamic staleness resolution.
   */
  private mapToDto(
    trace: Prisma.RequirementTestTraceGetPayload<{
      include: {
        requirement: {
          include: {
            versions: {
              take: 1;
            };
          };
        };
        testCase: true;
      };
    }>,
  ): RequirementTestTraceDto {
    const latestVersionNumber = trace.requirement.versions[0]?.versionNumber ?? 1;
    const isVersionStale = latestVersionNumber > trace.requirementVersionNumber;
    const effectiveStatus: TraceStatus =
      trace.status === 'STALE' || isVersionStale ? 'STALE' : (trace.status as TraceStatus);
    const effectiveStaleReason =
      trace.staleReason ?? (isVersionStale ? 'REQUIREMENT_VERSION_ADVANCED' : null);

    return {
      id: trace.id,
      projectId: trace.projectId,
      requirementId: trace.requirementId,
      requirementKey: trace.requirement.requirementKey,
      requirementTitle: trace.requirement.title,
      requirementVersionId: trace.requirementVersionId,
      requirementVersionNumber: trace.requirementVersionNumber,
      currentRequirementVersionNumber: latestVersionNumber,
      testCaseId: trace.testCaseId,
      testCaseKey: trace.testCase.testCaseKey,
      testCaseTitle: trace.testCase.title,
      testCaseType: trace.testCase.type as TestCaseType,
      testCasePriority: trace.testCase.priority as TestCasePriority,
      testCaseStatus: trace.testCase.status as TestCaseStatus,
      scenarioCandidateId: trace.scenarioCandidateId,
      scenarioKey: trace.scenarioKey,
      generationRunId: trace.generationRunId,
      origin: trace.origin as TraceOrigin,
      status: effectiveStatus,
      isStale: effectiveStatus === 'STALE',
      staleReason: effectiveStaleReason,
      provenance: (trace.provenanceJson ?? {}) as Record<string, unknown>,
      createdAt: trace.createdAt.toISOString(),
      updatedAt: trace.updatedAt.toISOString(),
    };
  }
}
