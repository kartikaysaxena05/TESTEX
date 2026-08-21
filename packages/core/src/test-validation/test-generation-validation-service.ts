/**
 * @file packages/core/src/test-validation/test-generation-validation-service.ts
 * Central service for executing validation pipelines, checking staleness, and persisting validation findings.
 */

import { createHash } from 'node:crypto';
import type { Prisma, PrismaClient } from '@prisma/client';
import type {
  BatchValidationResultDto,
  GetLatestValidationInputDto,
  ListValidationHistoryInputDto,
  TestCaseValidationDto,
  TestValidationFindingDto,
  ValidateSpecificationInputDto,
  ValidateTestCaseInputDto,
  ValidateTestBatchInputDto,
} from '@ai-quality/contracts';
import {
  TestValidationError,
  TestValidationProjectMismatchError,
  TestValidationRequirementNotFoundError,
  TestValidationTestCaseNotFoundError,
} from './test-validation-errors.js';
import { TestValidationPolicyEngine } from './test-validation-policy.js';
import { TestValidationRulesEngine } from './test-validation-rules.js';
import type { TestSubjectToValidate, ValidationContext } from './test-validation-types.js';
import { VALIDATION_LIMITS, VALIDATOR_VERSION } from './test-validation-types.js';

export class TestGenerationValidationService {
  private readonly rulesEngine = new TestValidationRulesEngine();
  private readonly policyEngine = new TestValidationPolicyEngine();

  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Validates a persisted TestCase by ID against its authoritative source requirement.
   */
  async validateTestCase(input: ValidateTestCaseInputDto): Promise<TestCaseValidationDto> {
    const startTime = performance.now();

    // 1. Fetch test case with all relations
    const testCase = await this.prisma.testCase.findUnique({
      where: { id: input.testCaseId },
      include: {
        preconditions: { orderBy: { sequenceOrder: 'asc' } },
        steps: { orderBy: { stepNumber: 'asc' } },
        testData: { orderBy: { sequenceOrder: 'asc' } },
      },
    });

    if (!testCase) {
      throw new TestValidationTestCaseNotFoundError(
        `Test case with ID ${input.testCaseId} not found.`,
      );
    }

    if (testCase.projectId !== input.projectId) {
      throw new TestValidationProjectMismatchError(
        `Test case does not belong to project ${input.projectId}.`,
      );
    }

    // 2. Fetch authoritative requirement
    const requirementId = testCase.sourceRequirementId;
    if (!requirementId) {
      throw new TestValidationRequirementNotFoundError(
        'Test case is not linked to a source requirement.',
      );
    }

    const requirement = await this.prisma.requirement.findUnique({
      where: { id: requirementId },
      include: {
        qualityFindings: true,
        repositoryEvidence: true,
      },
    });

    if (!requirement) {
      throw new TestValidationRequirementNotFoundError(
        `Requirement with ID ${requirementId} not found.`,
      );
    }

    if (requirement.projectId !== input.projectId) {
      throw new TestValidationProjectMismatchError(
        `Requirement does not belong to project ${input.projectId}.`,
      );
    }

    // 3. Build validation context and test subject
    const validationContext: ValidationContext = {
      projectId: input.projectId,
      requirementId: requirement.id,
      requirementKey: requirement.requirementKey,
      requirementTitle: requirement.title,
      requirementText: requirement.originalText,
      requirementVersionNumber: testCase.sourceRequirementVersionNumber ?? 1,
      requirementQualityFindings: requirement.qualityFindings.map(q => ({
        code: q.code,
        message: q.message,
        severity: q.severity,
      })),
      repositoryEvidenceRefs: requirement.repositoryEvidence
        .map(e => e.symbolName ?? e.filePath ?? e.id)
        .filter(Boolean),
    };

    const testSubject = this.buildTestSubjectFromDb(testCase);

    // 4. Compute Content Hashes
    const testContentHash = this.computeContentHash(testSubject);
    const requirementContentHash = this.computeContentHash(requirement.originalText);

    // 5. Execute Rules & Policy
    const rawFindings = this.rulesEngine.executeAllRules(testSubject, validationContext);
    const elapsedMs = Math.round(performance.now() - startTime);
    const policyResult = this.policyEngine.evaluateFindings(rawFindings, elapsedMs);

    // 6. Persist Validation & Findings in Transaction
    return this.prisma.$transaction(async tx => {
      // Mark older validations for this test case as stale
      await tx.testCaseValidation.updateMany({
        where: { testCaseId: testCase.id, isStale: false },
        data: { isStale: true, staleReason: 'Superceded by newer validation run.' },
      });

      const validationRecord = await tx.testCaseValidation.create({
        data: {
          projectId: input.projectId,
          testCaseId: testCase.id,
          requirementId: requirement.id,
          requirementVersionNumber: testCase.sourceRequirementVersionNumber,
          validatorVersion: VALIDATOR_VERSION,
          status: policyResult.status,
          isStale: false,
          staleReason: null,
          testContentHash,
          requirementContentHash,
          summary: policyResult.summary,
          metricsJson: policyResult.metrics as unknown as Prisma.InputJsonValue,
          provenanceJson: {
            validatedAt: new Date().toISOString(),
            enableAiCritic: Boolean(input.enableAiCritic),
          },
        },
      });

      if (rawFindings.length > 0) {
        await tx.testCaseValidationFinding.createMany({
          data: rawFindings.map(f => ({
            validationId: validationRecord.id,
            code: f.code,
            severity: f.severity,
            fieldPath: f.fieldPath ?? null,
            message: f.message,
            evidence: f.evidence ?? null,
            source: f.source ?? null,
            suggestedAction: f.suggestedAction ?? null,
          })),
        });
      }

      const createdFindings = await tx.testCaseValidationFinding.findMany({
        where: { validationId: validationRecord.id },
        orderBy: { createdAt: 'asc' },
      });

      return this.mapToValidationDto(validationRecord, createdFindings, policyResult.metrics);
    });
  }

  /**
   * Validates an unpersisted GeneratedTestSpecificationDto against authoritative requirement.
   */
  async validateSpecification(
    input: ValidateSpecificationInputDto,
  ): Promise<TestCaseValidationDto> {
    const startTime = performance.now();

    const requirement = await this.prisma.requirement.findUnique({
      where: { id: input.requirementId },
      include: {
        qualityFindings: true,
        repositoryEvidence: true,
      },
    });

    if (!requirement) {
      throw new TestValidationRequirementNotFoundError(
        `Requirement with ID ${input.requirementId} not found.`,
      );
    }

    if (requirement.projectId !== input.projectId) {
      throw new TestValidationProjectMismatchError(
        `Requirement does not belong to project ${input.projectId}.`,
      );
    }

    const validationContext: ValidationContext = {
      projectId: input.projectId,
      requirementId: requirement.id,
      requirementKey: requirement.requirementKey,
      requirementTitle: requirement.title,
      requirementText: requirement.originalText,
      requirementVersionNumber: input.requirementVersionNumber ?? 1,
      requirementQualityFindings: requirement.qualityFindings.map(q => ({
        code: q.code,
        message: q.message,
        severity: q.severity,
      })),
      repositoryEvidenceRefs: requirement.repositoryEvidence
        .map(e => e.symbolName ?? e.filePath ?? e.id)
        .filter(Boolean),
    };

    const spec = input.specification;
    const testSubject: TestSubjectToValidate = {
      title: spec.title,
      type: spec.category,
      category: spec.category,
      preconditions: spec.preconditions.map(p => ({
        category: p.category,
        description: p.description,
        confidence: p.confidence,
      })),
      steps: [
        {
          stepNumber: 1,
          action: 'Establish preconditions and prepare test inputs',
        },
        {
          stepNumber: 2,
          action: `Execute action: ${spec.title}`,
          expectedResult: spec.expectedResults.map(e => e.description).join('; '),
        },
      ],
      testData: spec.testData.map(d => ({
        name: d.name,
        dataType: d.dataType,
        origin: d.origin,
        value: d.value,
        constraint: d.constraint,
        isSensitive: d.isSensitive,
      })),
      overallExpectedResult: spec.expectedResults.map(e => e.description).join('\n'),
      assumptions: spec.assumptions,
      unknowns: spec.unknowns,
    };

    const testContentHash = this.computeContentHash(testSubject);
    const requirementContentHash = this.computeContentHash(requirement.originalText);

    const rawFindings = this.rulesEngine.executeAllRules(testSubject, validationContext);
    const elapsedMs = Math.round(performance.now() - startTime);
    const policyResult = this.policyEngine.evaluateFindings(rawFindings, elapsedMs);

    return this.prisma.$transaction(async tx => {
      const validationRecord = await tx.testCaseValidation.create({
        data: {
          projectId: input.projectId,
          testCaseId: null,
          requirementId: requirement.id,
          requirementVersionNumber: input.requirementVersionNumber ?? null,
          validatorVersion: VALIDATOR_VERSION,
          status: policyResult.status,
          isStale: false,
          staleReason: null,
          testContentHash,
          requirementContentHash,
          summary: policyResult.summary,
          metricsJson: policyResult.metrics as unknown as Prisma.InputJsonValue,
          provenanceJson: {
            validatedAt: new Date().toISOString(),
            specificationId: spec.id,
          },
        },
      });

      if (rawFindings.length > 0) {
        await tx.testCaseValidationFinding.createMany({
          data: rawFindings.map(f => ({
            validationId: validationRecord.id,
            code: f.code,
            severity: f.severity,
            fieldPath: f.fieldPath ?? null,
            message: f.message,
            evidence: f.evidence ?? null,
            source: f.source ?? null,
            suggestedAction: f.suggestedAction ?? null,
          })),
        });
      }

      const createdFindings = await tx.testCaseValidationFinding.findMany({
        where: { validationId: validationRecord.id },
        orderBy: { createdAt: 'asc' },
      });

      return this.mapToValidationDto(validationRecord, createdFindings, policyResult.metrics);
    });
  }

  /**
   * Validates a batch of test cases or specifications.
   */
  async validateBatch(input: ValidateTestBatchInputDto): Promise<BatchValidationResultDto> {
    const validations: TestCaseValidationDto[] = [];

    if (input.testCaseIds && input.testCaseIds.length > 0) {
      if (input.testCaseIds.length > VALIDATION_LIMITS.MAX_BATCH_VALIDATION_SIZE) {
        throw new TestValidationError(
          `Batch size ${input.testCaseIds.length} exceeds limit of ${VALIDATION_LIMITS.MAX_BATCH_VALIDATION_SIZE}.`,
        );
      }

      for (const testCaseId of input.testCaseIds) {
        const val = await this.validateTestCase({
          projectId: input.projectId,
          testCaseId,
          enableAiCritic: input.enableAiCritic,
        });
        validations.push(val);
      }
    } else if (input.specifications && input.specifications.length > 0 && input.requirementId) {
      if (input.specifications.length > VALIDATION_LIMITS.MAX_BATCH_VALIDATION_SIZE) {
        throw new TestValidationError(
          `Batch size ${input.specifications.length} exceeds limit of ${VALIDATION_LIMITS.MAX_BATCH_VALIDATION_SIZE}.`,
        );
      }

      for (const spec of input.specifications) {
        const val = await this.validateSpecification({
          projectId: input.projectId,
          requirementId: input.requirementId,
          specification: spec,
          enableAiCritic: input.enableAiCritic,
        });
        validations.push(val);
      }
    } else {
      throw new TestValidationError('Either testCaseIds or specifications must be provided.');
    }

    const validCount = validations.filter(v => v.status === 'VALID').length;
    const reviewRequiredCount = validations.filter(v => v.status === 'REVIEW_REQUIRED').length;
    const rejectedCount = validations.filter(v => v.status === 'REJECTED').length;
    const errorCount = validations.filter(v => v.status === 'VALIDATION_ERROR').length;

    return {
      validations,
      summary: {
        total: validations.length,
        validCount,
        reviewRequiredCount,
        rejectedCount,
        errorCount,
      },
    };
  }

  /**
   * Retrieves the latest validation record for a test case or requirement, evaluating real-time staleness.
   */
  async getLatestValidation(
    input: GetLatestValidationInputDto,
  ): Promise<TestCaseValidationDto | null> {
    const where: Prisma.TestCaseValidationWhereInput = {
      projectId: input.projectId,
    };

    if (input.testCaseId) {
      where.testCaseId = input.testCaseId;
    } else if (input.requirementId) {
      where.requirementId = input.requirementId;
    } else {
      throw new TestValidationError('Either testCaseId or requirementId must be provided.');
    }

    const latest = await this.prisma.testCaseValidation.findFirst({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        findings: { orderBy: { createdAt: 'asc' } },
        testCase: {
          include: {
            steps: { orderBy: { stepNumber: 'asc' } },
            preconditions: { orderBy: { sequenceOrder: 'asc' } },
            testData: { orderBy: { sequenceOrder: 'asc' } },
          },
        },
        requirement: true,
      },
    });

    if (!latest) return null;

    // Check for Staleness:
    let isStale = latest.isStale;
    let staleReason = latest.staleReason;

    if (latest.testCase) {
      const currentSubject = this.buildTestSubjectFromDb(latest.testCase);
      const currentTestHash = this.computeContentHash(currentSubject);
      if (currentTestHash !== latest.testContentHash) {
        isStale = true;
        staleReason = 'Test case content modified after validation.';
      }
    }

    if (latest.requirement) {
      const currentReqHash = this.computeContentHash(latest.requirement.originalText);
      if (latest.requirementContentHash && currentReqHash !== latest.requirementContentHash) {
        isStale = true;
        staleReason = 'Source requirement modified after test validation.';
      }
    }

    return this.mapToValidationDto(
      { ...latest, isStale, staleReason },
      latest.findings,
      latest.metricsJson as unknown as TestCaseValidationDto['metrics'],
    );
  }

  /**
   * Lists historical validation runs.
   */
  async listValidationHistory(
    input: ListValidationHistoryInputDto,
  ): Promise<readonly TestCaseValidationDto[]> {
    const where: Prisma.TestCaseValidationWhereInput = {
      projectId: input.projectId,
    };

    if (input.testCaseId) {
      where.testCaseId = input.testCaseId;
    }
    if (input.requirementId) {
      where.requirementId = input.requirementId;
    }

    const pageSize = input.pageSize ?? 20;
    const page = input.page ?? 1;

    const records = await this.prisma.testCaseValidation.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        findings: { orderBy: { createdAt: 'asc' } },
      },
    });

    return records.map(r =>
      this.mapToValidationDto(
        r,
        r.findings,
        r.metricsJson as unknown as TestCaseValidationDto['metrics'],
      ),
    );
  }

  private computeContentHash(content: unknown): string {
    const serialized = typeof content === 'string' ? content : JSON.stringify(content);
    return createHash('sha256').update(serialized).digest('hex');
  }

  private mapToValidationDto(
    record: {
      id: string;
      projectId: string;
      testCaseId: string | null;
      requirementId: string;
      requirementVersionNumber: number | null;
      validatorVersion: string;
      status: string;
      isStale: boolean;
      staleReason: string | null;
      testContentHash: string;
      requirementContentHash: string | null;
      summary: string | null;
      provenanceJson: unknown;
      createdAt: Date;
      updatedAt: Date;
    },
    findings: {
      id: string;
      validationId: string;
      code: string;
      severity: string;
      fieldPath: string | null;
      message: string;
      evidence: string | null;
      source: string | null;
      suggestedAction: string | null;
      createdAt: Date;
    }[],
    metrics: TestCaseValidationDto['metrics'],
  ): TestCaseValidationDto {
    return {
      id: record.id,
      projectId: record.projectId,
      testCaseId: record.testCaseId,
      requirementId: record.requirementId,
      requirementVersionNumber: record.requirementVersionNumber,
      validatorVersion: record.validatorVersion,
      status: record.status as TestCaseValidationDto['status'],
      isStale: record.isStale,
      staleReason: record.staleReason,
      testContentHash: record.testContentHash,
      requirementContentHash: record.requirementContentHash,
      summary: record.summary,
      metrics: metrics ?? {
        totalFindings: findings.length,
        infoCount: findings.filter(f => f.severity === 'INFO').length,
        warningCount: findings.filter(f => f.severity === 'WARNING').length,
        errorCount: findings.filter(f => f.severity === 'ERROR').length,
        blockerCount: findings.filter(f => f.severity === 'BLOCKER').length,
        structuralValid: !findings.some(
          f => f.code === 'STRUCTURAL_INVALIDITY' && f.severity !== 'INFO',
        ),
        grounded: !findings.some(
          f => f.code.includes('UNSUPPORTED') || f.code.includes('INVENTED'),
        ),
        contradictionCount: findings.filter(f => f.code.includes('CONTRADICT')).length,
        hallucinationCount: findings.filter(
          f => f.code.includes('UNSUPPORTED') || f.code.includes('INVENTED'),
        ).length,
        durationMs: 0,
      },
      provenance: (record.provenanceJson as Record<string, unknown>) ?? {},
      findings: findings.map(f => ({
        id: f.id,
        validationId: f.validationId,
        code: f.code as TestValidationFindingDto['code'],
        severity: f.severity as TestValidationFindingDto['severity'],
        fieldPath: f.fieldPath,
        message: f.message,
        evidence: f.evidence,
        source: f.source,
        suggestedAction: f.suggestedAction,
        createdAt: f.createdAt.toISOString(),
      })),
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    };
  }

  private buildTestSubjectFromDb(testCase: {
    title: string;
    objective: string | null;
    description: string | null;
    type: string;
    overallExpectedResult: string | null;
    assumptions: unknown;
    unknowns: unknown;
    preconditions: Array<{
      sequenceOrder: number;
      category: string;
      description: string;
      isEnforced?: boolean;
      confidence?: string;
    }>;
    steps: Array<{
      stepNumber: number;
      action: string;
      expectedResult: string | null;
      testDataSummary: string | null;
      stateChangeFrom: string | null;
      stateChangeTo: string | null;
      stateEntity: string | null;
      isOptional: boolean;
    }>;
    testData: Array<{
      sequenceOrder: number;
      name: string;
      dataType: string;
      origin: string;
      valueJson: unknown;
      constraint: string | null;
      isSensitive: boolean;
      confidence?: string;
    }>;
  }): TestSubjectToValidate {
    return {
      title: testCase.title,
      objective: testCase.objective ?? undefined,
      description: testCase.description ?? undefined,
      type: testCase.type,
      preconditions: testCase.preconditions.map(p => ({
        sequenceOrder: p.sequenceOrder,
        category: p.category,
        description: p.description,
        isEnforced: p.isEnforced,
        confidence: p.confidence,
      })),
      steps: testCase.steps.map(s => ({
        stepNumber: s.stepNumber,
        action: s.action,
        expectedResult: s.expectedResult ?? undefined,
        testDataSummary: s.testDataSummary ?? undefined,
        stateChangeFrom: s.stateChangeFrom ?? undefined,
        stateChangeTo: s.stateChangeTo ?? undefined,
        stateEntity: s.stateEntity ?? undefined,
        isOptional: s.isOptional,
      })),
      testData: testCase.testData.map(d => ({
        sequenceOrder: d.sequenceOrder,
        name: d.name,
        dataType: d.dataType,
        origin: d.origin,
        value: d.valueJson,
        constraint: d.constraint ?? undefined,
        isSensitive: d.isSensitive,
        confidence: d.confidence,
      })),
      overallExpectedResult: testCase.overallExpectedResult ?? undefined,
      assumptions: (testCase.assumptions as string[]) ?? [],
      unknowns: (testCase.unknowns as unknown[]) ?? [],
    };
  }
}
