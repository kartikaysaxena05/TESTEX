/**
 * @file packages/core/src/execution/compiler/executable-plan-service.ts
 * High-level orchestration service managing compilation, atomic database persistence, idempotency, and retrieval of ExecutableTestPlans.
 */

import type { PrismaClient } from '@prisma/client';
import {
  compileTestPlanInputSchema,
  getExecutablePlanInputSchema,
  getExecutablePlanByTestCaseInputSchema,
  listExecutablePlansInputSchema,
  previewTestPlanInputSchema,
  type CompileTestPlanInputDto,
  type GetExecutablePlanInputDto,
  type GetExecutablePlanByTestCaseInputDto,
  type ListExecutablePlansInputDto,
  type PreviewTestPlanInputDto,
  type ExecutableTestPlanDto,
  type TestCaseDetailDto,
} from '@ai-quality/contracts';
import type { ILogger } from '../../logging/index.js';
import { TestPlanCompiler } from './test-plan-compiler.js';
import {
  TestPlanNotFoundError,
  TestEnvironmentMismatchError,
  CompilerProjectMismatchError,
  CompilerValidationError,
  TestNotApprovedError,
} from './compiler-errors.js';
import type { CompilationContext } from './compiler-types.js';

export class ExecutablePlanService {
  private readonly prisma: PrismaClient;
  private readonly compiler: TestPlanCompiler;
  private readonly logger?: ILogger;

  constructor(
    prisma: PrismaClient,
    compiler: TestPlanCompiler = new TestPlanCompiler(),
    logger?: ILogger,
  ) {
    this.prisma = prisma;
    this.compiler = compiler;
    this.logger = logger;
  }

  /**
   * Compiles and persists an authoritative ExecutableTestPlan.
   */
  public async compilePlan(input: CompileTestPlanInputDto): Promise<ExecutableTestPlanDto> {
    const parseResult = compileTestPlanInputSchema.safeParse(input);
    if (!parseResult.success) {
      throw new CompilerValidationError('Invalid compile test plan input', {
        errors: parseResult.error.errors,
      });
    }

    const {
      projectId,
      testCaseId,
      testCaseVersionNumber,
      environmentId,
      previewOnly,
      forceRecompile,
    } = parseResult.data;

    // 1. Fetch Project & Verify Status
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, status: true },
    });

    if (!project) {
      throw new CompilerProjectMismatchError(testCaseId, projectId, 'UNKNOWN');
    }

    // 2. Fetch TestCase with full relations
    const testCase = await this.prisma.testCase.findUnique({
      where: { id: testCaseId },
      include: {
        preconditions: { orderBy: { sequenceOrder: 'asc' } },
        steps: { orderBy: { stepNumber: 'asc' } },
        testData: { orderBy: { sequenceOrder: 'asc' } },
        requirementTraces: true,
        sourceRequirement: {
          include: {
            versions: {
              orderBy: { versionNumber: 'desc' },
              take: 1,
            },
          },
        },
        versions: testCaseVersionNumber
          ? { where: { versionNumber: testCaseVersionNumber } }
          : { orderBy: { versionNumber: 'desc' }, take: 1 },
      },
    });

    if (!testCase) {
      throw new CompilerValidationError(
        `Test case '${testCaseId}' not found in project '${projectId}'.`,
      );
    }

    if (testCase.projectId !== projectId) {
      throw new CompilerProjectMismatchError(testCaseId, projectId, testCase.projectId);
    }

    // 3. Resolve Version Target
    const targetVersionNumber = testCaseVersionNumber ?? testCase.currentVersionNumber;
    const targetVersionRecord = testCase.versions.find(
      v => v.versionNumber === targetVersionNumber,
    );

    if (!targetVersionRecord && targetVersionNumber !== testCase.currentVersionNumber) {
      throw new CompilerValidationError(
        `Test case version ${targetVersionNumber} not found for test case '${testCaseId}'.`,
      );
    }

    const activeReviewStatus = targetVersionRecord
      ? targetVersionRecord.reviewStatus
      : testCase.reviewStatus;

    if (activeReviewStatus !== 'APPROVED' && !previewOnly) {
      throw new TestNotApprovedError(testCaseId, targetVersionNumber, activeReviewStatus);
    }

    // 4. Resolve Environment & Target Application
    let resolvedEnv: {
      id: string;
      baseUrl: string | null;
      variables: any;
      secretReferences: any;
    } | null = null;

    if (environmentId) {
      const env = await this.prisma.projectEnvironment.findUnique({
        where: { id: environmentId },
      });
      if (!env) {
        throw new CompilerValidationError(`Environment '${environmentId}' not found.`);
      }
      if (env.projectId !== projectId) {
        throw new TestEnvironmentMismatchError(environmentId, projectId, env.projectId);
      }
      resolvedEnv = {
        id: env.id,
        baseUrl: env.baseUrl,
        variables: env.variables,
        secretReferences: env.secretReferences,
      };
    } else {
      // Find default environment for project
      const defaultEnv = await this.prisma.projectEnvironment.findFirst({
        where: { projectId, isDefault: true },
      });
      if (defaultEnv) {
        resolvedEnv = {
          id: defaultEnv.id,
          baseUrl: defaultEnv.baseUrl,
          variables: defaultEnv.variables,
          secretReferences: defaultEnv.secretReferences,
        };
      }
    }

    const targetApp = await this.prisma.targetApplication.findUnique({
      where: { projectId },
      select: { id: true },
    });

    // 5. Evaluate Requirement Staleness
    const latestReqVersion = testCase.sourceRequirement?.versions[0]?.versionNumber ?? 1;
    const isRequirementStale =
      testCase.sourceRequirement !== null &&
      testCase.sourceRequirementVersionNumber !== null &&
      testCase.sourceRequirementVersionNumber !== undefined &&
      testCase.sourceRequirementVersionNumber < latestReqVersion;

    const sourceRequirementIds = testCase.requirementTraces.map(t => t.requirementId);
    if (
      testCase.sourceRequirementId &&
      !sourceRequirementIds.includes(testCase.sourceRequirementId)
    ) {
      sourceRequirementIds.push(testCase.sourceRequirementId);
    }

    const sourceRequirementKeys = testCase.sourceRequirementKey
      ? [testCase.sourceRequirementKey]
      : [];

    // 6. Build Context & Compile
    const context: CompilationContext = {
      projectId,
      testCaseId: testCase.id,
      testCaseKey: testCase.testCaseKey,
      testCaseTitle: testCase.title,
      testCaseVersionNumber: targetVersionNumber,
      testCaseVersionId: targetVersionRecord?.id ?? null,
      environmentId: resolvedEnv?.id ?? null,
      targetApplicationId: targetApp?.id ?? null,
      environmentBaseUrl: resolvedEnv?.baseUrl ?? null,
      environmentVariables: resolvedEnv?.variables
        ? (resolvedEnv.variables as Record<string, string>)
        : undefined,
      environmentSecretRefs: resolvedEnv?.secretReferences
        ? (resolvedEnv.secretReferences as Record<string, string>)
        : undefined,
      previewOnly,
    };

    // Format test case data for compiler
    const testCasePayload: TestCaseDetailDto = {
      id: testCase.id,
      projectId: testCase.projectId,
      testCaseKey: testCase.testCaseKey,
      title: targetVersionRecord?.title ?? testCase.title,
      objective: targetVersionRecord?.objective ?? testCase.objective,
      description: targetVersionRecord?.description ?? testCase.description,
      type: (targetVersionRecord?.type ?? testCase.type) as any,
      priority: (targetVersionRecord?.priority ?? testCase.priority) as any,
      status: testCase.status as any,
      reviewStatus: (targetVersionRecord?.reviewStatus ?? testCase.reviewStatus) as any,
      executionSuitability: (targetVersionRecord?.executionSuitability ??
        testCase.executionSuitability) as any,
      sourceRequirementId: targetVersionRecord?.sourceRequirementId ?? testCase.sourceRequirementId,
      sourceRequirementKey:
        targetVersionRecord?.sourceRequirementKey ?? testCase.sourceRequirementKey,
      sourceRequirementVersionNumber:
        targetVersionRecord?.sourceRequirementVersionNumber ??
        testCase.sourceRequirementVersionNumber,
      overallExpectedResult:
        targetVersionRecord?.overallExpectedResult ?? testCase.overallExpectedResult,
      assumptions: (targetVersionRecord?.assumptionsJson ?? testCase.assumptions) as any,
      unknowns: (targetVersionRecord?.unknownsJson ?? testCase.unknowns) as any,
      tags: testCase.tags,
      preconditionCount: testCase.preconditions.length,
      stepCount: testCase.steps.length,
      testDataCount: testCase.testData.length,
      createdAt: testCase.createdAt.toISOString(),
      updatedAt: testCase.updatedAt.toISOString(),
      preconditions: (targetVersionRecord?.preconditionsJson ?? testCase.preconditions) as any,
      steps: (targetVersionRecord?.stepsJson ?? testCase.steps) as any,
      testData: (targetVersionRecord?.testDataJson ?? testCase.testData) as any,
    };

    const compiledPlan = this.compiler.compile({
      testCase: testCasePayload,
      context,
      isRequirementStale,
      sourceRequirementIds,
      sourceRequirementKeys,
    });

    if (previewOnly) {
      return compiledPlan;
    }

    // 7. Check Idempotency & Database Persistence Transaction
    const existingPlan = await this.prisma.executableTestPlan.findFirst({
      where: {
        projectId,
        testCaseId,
        testCaseVersionNumber: targetVersionNumber,
        environmentId: resolvedEnv?.id ?? null,
      },
    });

    if (
      existingPlan &&
      !forceRecompile &&
      existingPlan.planFingerprint === compiledPlan.planFingerprint
    ) {
      return this.mapToDto(existingPlan);
    }

    // Persist atomically via Prisma transaction
    const savedRecord = await this.prisma.$transaction(async tx => {
      // Remove any existing plan for this specific version/env slot
      if (existingPlan) {
        await tx.executableTestPlan.delete({
          where: { id: existingPlan.id },
        });
      }

      return tx.executableTestPlan.create({
        data: {
          id: compiledPlan.id,
          projectId: compiledPlan.projectId,
          testCaseId: compiledPlan.testCaseId,
          testCaseVersionId: compiledPlan.testCaseVersionId,
          testCaseVersionNumber: compiledPlan.testCaseVersionNumber,
          environmentId: compiledPlan.environmentId,
          targetApplicationId: compiledPlan.targetApplicationId,
          compilerVersion: compiledPlan.compilerVersion,
          planSchemaVersion: compiledPlan.planSchemaVersion,
          status: compiledPlan.status as any,
          planFingerprint: compiledPlan.planFingerprint,
          sourceRequirementIds: [...compiledPlan.sourceRequirementIds],
          sourceRequirementKeys: [...compiledPlan.sourceRequirementKeys],
          summary: compiledPlan.summary,
          preconditionsJson: compiledPlan.preconditions as any,
          stepsJson: compiledPlan.steps as any,
          assertionsJson: compiledPlan.assertions as any,
          postconditionsJson: compiledPlan.postconditions as any,
          diagnosticsJson: compiledPlan.diagnostics as any,
          hasErrors: compiledPlan.hasErrors,
          hasWarnings: compiledPlan.hasWarnings,
          isExecutable: compiledPlan.isExecutable,
          compiledAt: new Date(compiledPlan.compiledAt),
        },
      });
    });

    this.logger?.info('executable_plan.compiled', {
      projectId,
      testCaseId,
      testCaseVersionNumber: targetVersionNumber,
      planId: savedRecord.id,
      fingerprint: savedRecord.planFingerprint,
      isExecutable: savedRecord.isExecutable,
      diagnosticsCount: compiledPlan.diagnostics.length,
    });

    return this.mapToDto(savedRecord);
  }

  /**
   * Retrieves an ExecutableTestPlan by ID.
   */
  public async getPlan(input: GetExecutablePlanInputDto): Promise<ExecutableTestPlanDto> {
    const parseResult = getExecutablePlanInputSchema.safeParse(input);
    if (!parseResult.success) {
      throw new CompilerValidationError('Invalid get plan input', {
        errors: parseResult.error.errors,
      });
    }

    const { projectId, planId } = parseResult.data;

    const plan = await this.prisma.executableTestPlan.findUnique({
      where: { id: planId },
    });

    if (!plan) {
      throw new TestPlanNotFoundError(planId, projectId);
    }

    if (plan.projectId !== projectId) {
      throw new CompilerProjectMismatchError(planId, projectId, plan.projectId);
    }

    return this.mapToDto(plan);
  }

  /**
   * Retrieves the latest ExecutableTestPlan for a given test case.
   */
  public async getPlanByTestCase(
    input: GetExecutablePlanByTestCaseInputDto,
  ): Promise<ExecutableTestPlanDto | null> {
    const parseResult = getExecutablePlanByTestCaseInputSchema.safeParse(input);
    if (!parseResult.success) {
      throw new CompilerValidationError('Invalid get plan by test case input', {
        errors: parseResult.error.errors,
      });
    }

    const { projectId, testCaseId, testCaseVersionNumber, environmentId } = parseResult.data;

    const whereClause: any = {
      projectId,
      testCaseId,
    };

    if (testCaseVersionNumber !== undefined) {
      whereClause.testCaseVersionNumber = testCaseVersionNumber;
    }
    if (environmentId !== undefined) {
      whereClause.environmentId = environmentId;
    }

    const plan = await this.prisma.executableTestPlan.findFirst({
      where: whereClause,
      orderBy: [{ testCaseVersionNumber: 'desc' }, { compiledAt: 'desc' }],
    });

    return plan ? this.mapToDto(plan) : null;
  }

  /**
   * Lists executable test plans for a project with optional filtering.
   */
  public async listPlans(
    input: ListExecutablePlansInputDto,
  ): Promise<readonly ExecutableTestPlanDto[]> {
    const parseResult = listExecutablePlansInputSchema.safeParse(input);
    if (!parseResult.success) {
      throw new CompilerValidationError('Invalid list plans input', {
        errors: parseResult.error.errors,
      });
    }

    const { projectId, testCaseId, environmentId, status, limit, offset } = parseResult.data;

    const whereClause: any = { projectId };
    if (testCaseId) {
      whereClause.testCaseId = testCaseId;
    }
    if (environmentId) {
      whereClause.environmentId = environmentId;
    }
    if (status) {
      whereClause.status = status;
    }

    const plans = await this.prisma.executableTestPlan.findMany({
      where: whereClause,
      orderBy: { compiledAt: 'desc' },
      take: limit,
      skip: offset,
    });

    return plans.map(p => this.mapToDto(p));
  }

  /**
   * Generates an in-memory preview of a test plan without persisting it.
   */
  public async previewPlan(input: PreviewTestPlanInputDto): Promise<ExecutableTestPlanDto> {
    const parseResult = previewTestPlanInputSchema.safeParse(input);
    if (!parseResult.success) {
      throw new CompilerValidationError('Invalid preview test plan input', {
        errors: parseResult.error.errors,
      });
    }

    return this.compilePlan({
      ...parseResult.data,
      previewOnly: true,
      forceRecompile: true,
    });
  }

  private mapToDto(record: any): ExecutableTestPlanDto {
    return {
      id: record.id,
      projectId: record.projectId,
      testCaseId: record.testCaseId,
      testCaseVersionId: record.testCaseVersionId,
      testCaseVersionNumber: record.testCaseVersionNumber,
      environmentId: record.environmentId,
      targetApplicationId: record.targetApplicationId,
      compilerVersion: record.compilerVersion,
      planSchemaVersion: record.planSchemaVersion,
      status: record.status as any,
      planFingerprint: record.planFingerprint,
      sourceRequirementIds: record.sourceRequirementIds ?? [],
      sourceRequirementKeys: record.sourceRequirementKeys ?? [],
      summary: record.summary,
      preconditions: (record.preconditionsJson as any) ?? [],
      steps: (record.stepsJson as any) ?? [],
      assertions: (record.assertionsJson as any) ?? [],
      postconditions: (record.postconditionsJson as any) ?? [],
      diagnostics: (record.diagnosticsJson as any) ?? [],
      hasErrors: record.hasErrors,
      hasWarnings: record.hasWarnings,
      isExecutable: record.isExecutable,
      compiledAt: record.compiledAt.toISOString
        ? record.compiledAt.toISOString()
        : record.compiledAt,
      createdAt: record.createdAt.toISOString ? record.createdAt.toISOString() : record.createdAt,
      updatedAt: record.updatedAt.toISOString ? record.updatedAt.toISOString() : record.updatedAt,
    };
  }
}
