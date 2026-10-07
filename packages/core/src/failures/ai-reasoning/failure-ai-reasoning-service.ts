/**
 * @file packages/core/src/failures/ai-reasoning/failure-ai-reasoning-service.ts
 * Core domain service orchestrating AI-Assisted Failure Classification & Reasoning (V6 Phase 82).
 */

import type { PrismaClient } from '@prisma/client';
import {
  assessFailureWithAiInputSchema,
  getFailureAiAssessmentInputSchema,
  reassessFailureWithAiInputSchema,
  listFailureAiAssessmentHistoryInputSchema,
  type AssessFailureWithAiInputDto,
  type GetFailureAiAssessmentInputDto,
  type ReassessFailureWithAiInputDto,
  type ListFailureAiAssessmentHistoryInputDto,
  type FailureAiAssessmentDto,
  type ClassificationAgreement,
  type FailureCategory,
} from '@ai-quality/contracts';
import {
  AI_ASSESSMENT_BOUNDS,
  type IFailureAiReasoningService,
  type AiClassificationRawOutput,
} from './ai-reasoning-types.js';
import {
  AiAssessmentUnavailableError,
  AiAssessmentCrossProjectError,
  AiAssessmentInsufficientEvidenceError,
  AiAssessmentBlockedError,
} from './ai-reasoning-errors.js';
import { FailureCaseNotFoundError } from '../failure-errors.js';
import { AiContextSanitizer, type RawContextInputs } from './ai-context-sanitizer.js';
import { AiConfidenceCalibrator } from './ai-confidence-calibrator.js';
import { generateAiAssessmentFingerprint } from './ai-reasoning-fingerprint.js';
import {
  FAILURE_AI_CLASSIFICATION_PROMPT_ID,
  FAILURE_AI_CLASSIFICATION_PROMPT_VERSION,
  type FailureAiClassificationInput,
} from './ai-classification-prompt-definition.js';
import { AiPromptExecutionService } from '../../ai/ai-prompt-execution-service.js';

export class FailureAiReasoningService implements IFailureAiReasoningService {
  private readonly sanitizer: AiContextSanitizer;
  private readonly calibrator: AiConfidenceCalibrator;
  private readonly promptExecutionService: AiPromptExecutionService;
  private readonly caseLocks = new Map<string, Promise<void>>();

  constructor(
    private readonly prisma: PrismaClient,
    options: {
      promptExecutionService?: AiPromptExecutionService;
      sanitizer?: AiContextSanitizer;
      calibrator?: AiConfidenceCalibrator;
    } = {},
  ) {
    this.promptExecutionService = options.promptExecutionService ?? new AiPromptExecutionService();
    this.sanitizer = options.sanitizer ?? new AiContextSanitizer();
    this.calibrator = options.calibrator ?? new AiConfidenceCalibrator();
  }

  /**
   * Serializes concurrent AI reasoning operations on the same failure case.
   */
  private async withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const currentLock = this.caseLocks.get(key) ?? Promise.resolve();
    let releaseLock: () => void;
    const nextLock = new Promise<void>(resolve => {
      releaseLock = resolve;
    });
    this.caseLocks.set(key, nextLock);

    try {
      await currentLock;
      return await fn();
    } finally {
      releaseLock!();
      if (this.caseLocks.get(key) === nextLock) {
        this.caseLocks.delete(key);
      }
    }
  }

  /**
   * Evaluates agreement between AI classification and deterministic classification baseline.
   */
  public static evaluateAgreement(
    aiCategory: FailureCategory,
    deterministicCategory?: FailureCategory | null,
  ): ClassificationAgreement {
    if (!deterministicCategory) {
      return 'NOT_COMPARABLE';
    }
    if (aiCategory === deterministicCategory) {
      return 'AGREES';
    }
    if (
      deterministicCategory === 'INCONCLUSIVE' ||
      deterministicCategory === 'UNKNOWN' ||
      aiCategory === 'INCONCLUSIVE' ||
      aiCategory === 'UNKNOWN'
    ) {
      return 'PARTIAL_AGREEMENT';
    }
    return 'DISAGREES';
  }

  /**
   * Assesses a failure case with AI classification and advisory reasoning.
   */
  public async assessFailureWithAi(
    input: AssessFailureWithAiInputDto,
  ): Promise<FailureAiAssessmentDto> {
    const validated = assessFailureWithAiInputSchema.parse(input);
    const lockKey = `${validated.projectId}:${validated.failureCaseId}`;

    return this.withLock(lockKey, async () => {
      return this.executeAiAssessment({
        projectId: validated.projectId,
        failureCaseId: validated.failureCaseId,
        isReassessment: false,
        modelProviderOverride: validated.modelProviderOverride,
        modelNameOverride: validated.modelNameOverride,
      });
    });
  }

  /**
   * Retrieves current authoritative AI assessment with dynamic staleness detection.
   */
  public async getAiAssessment(
    input: GetFailureAiAssessmentInputDto,
  ): Promise<FailureAiAssessmentDto | null> {
    const validated = getFailureAiAssessmentInputSchema.parse(input);

    const failureCase = await this.prisma.failureCase.findUnique({
      where: { id: validated.failureCaseId },
      select: { id: true, projectId: true },
    });

    if (!failureCase) {
      throw new FailureCaseNotFoundError(validated.failureCaseId, validated.projectId);
    }

    if (failureCase.projectId !== validated.projectId) {
      throw new AiAssessmentCrossProjectError(
        'FailureCase',
        validated.failureCaseId,
        validated.projectId,
      );
    }

    const record = await this.prisma.failureAiAssessment.findFirst({
      where: {
        failureCaseId: validated.failureCaseId,
        projectId: validated.projectId,
        isAuthoritative: true,
      },
      orderBy: { assessedAt: 'desc' },
    });

    if (!record) {
      return null;
    }

    // Dynamic staleness check without calling LLM
    let isStale = record.isStale;
    let stalenessReason = record.stalenessReason;

    if (!isStale) {
      // 1. Check if newer evidence reference was attached
      const newerEvidenceCount = await this.prisma.failureEvidenceReference.count({
        where: {
          failureCaseId: validated.failureCaseId,
          attachedAt: { gt: record.assessedAt },
        },
      });

      if (newerEvidenceCount > 0) {
        isStale = true;
        stalenessReason = `${newerEvidenceCount} new evidence artifact(s) attached since AI assessment.`;
      }

      // 2. Check if Phase 77 deterministic classification changed
      if (!isStale) {
        const newerClassification = await this.prisma.failureClassification.findFirst({
          where: {
            failureCaseId: validated.failureCaseId,
            isAuthoritative: true,
            createdAt: { gt: record.assessedAt },
          },
        });
        if (newerClassification) {
          isStale = true;
          stalenessReason = 'Deterministic classification reclassified since AI assessment.';
        }
      }

      // 3. Check if Phase 80 domain separation was re-evaluated
      if (!isStale) {
        const newerDomainSep = await this.prisma.failureDomainSeparation.findFirst({
          where: {
            failureCaseId: validated.failureCaseId,
            isAuthoritative: true,
            evaluatedAt: { gt: record.assessedAt },
          },
        });
        if (newerDomainSep) {
          isStale = true;
          stalenessReason = 'Failure domain separation re-evaluated since AI assessment.';
        }
      }

      // 4. Check if Phase 81 technical localization was updated
      if (!isStale) {
        const newerLocalization = await this.prisma.failureTechnicalLocalization.findFirst({
          where: {
            failureCaseId: validated.failureCaseId,
            isAuthoritative: true,
            localizedAt: { gt: record.assessedAt },
          },
        });
        if (newerLocalization) {
          isStale = true;
          stalenessReason = 'Technical cause localization updated since AI assessment.';
        }
      }

      if (isStale) {
        await this.prisma.failureAiAssessment.update({
          where: { id: record.id },
          data: { isStale: true, stalenessReason },
        });
      }
    }

    return this.mapToDto({
      ...record,
      isStale,
      stalenessReason,
    });
  }

  /**
   * Re-evaluates AI classification assessment for an existing failure case.
   */
  public async reassessFailureWithAi(
    input: ReassessFailureWithAiInputDto,
  ): Promise<FailureAiAssessmentDto> {
    const validated = reassessFailureWithAiInputSchema.parse(input);
    const lockKey = `${validated.projectId}:${validated.failureCaseId}`;

    return this.withLock(lockKey, async () => {
      return this.executeAiAssessment({
        projectId: validated.projectId,
        failureCaseId: validated.failureCaseId,
        isReassessment: true,
        reanalysisReason: validated.reanalysisReason,
        modelProviderOverride: validated.modelProviderOverride,
        modelNameOverride: validated.modelNameOverride,
      });
    });
  }

  /**
   * Lists all historical AI assessments for a failure case.
   */
  public async listAiAssessmentHistory(
    input: ListFailureAiAssessmentHistoryInputDto,
  ): Promise<readonly FailureAiAssessmentDto[]> {
    const validated = listFailureAiAssessmentHistoryInputSchema.parse(input);

    const failureCase = await this.prisma.failureCase.findUnique({
      where: { id: validated.failureCaseId },
      select: { id: true, projectId: true },
    });

    if (!failureCase) {
      throw new FailureCaseNotFoundError(validated.failureCaseId, validated.projectId);
    }

    if (failureCase.projectId !== validated.projectId) {
      throw new AiAssessmentCrossProjectError(
        'FailureCase',
        validated.failureCaseId,
        validated.projectId,
      );
    }

    const records = await this.prisma.failureAiAssessment.findMany({
      where: {
        failureCaseId: validated.failureCaseId,
        projectId: validated.projectId,
      },
      orderBy: { createdAt: 'desc' },
    });

    return records.map(r => this.mapToDto(r));
  }

  // ---------------------------------------------------------------------------
  // Internal Orchestration
  // ---------------------------------------------------------------------------

  private async executeAiAssessment(params: {
    projectId: string;
    failureCaseId: string;
    isReassessment: boolean;
    reanalysisReason?: string;
    modelProviderOverride?: string;
    modelNameOverride?: string;
  }): Promise<FailureAiAssessmentDto> {
    const {
      projectId,
      failureCaseId,
      isReassessment,
      reanalysisReason,
      modelProviderOverride,
      modelNameOverride,
    } = params;

    // 1. Fetch failure case and verify multi-tenant isolation
    const failureCase = await this.prisma.failureCase.findUnique({
      where: { id: failureCaseId },
      include: {
        testCase: { select: { id: true, title: true } },
      },
    });

    if (!failureCase) {
      throw new FailureCaseNotFoundError(failureCaseId, projectId);
    }

    if (failureCase.projectId !== projectId) {
      throw new AiAssessmentCrossProjectError('FailureCase', failureCaseId, projectId);
    }

    // Blocked check: If failure case is marked ineligible
    if (!failureCase.isEligible) {
      throw new AiAssessmentBlockedError(
        failureCase.ineligibilityReason ??
          'Failure case marked ineligible for failure intelligence.',
        failureCaseId,
      );
    }

    // Fetch execution record directly
    const execution = await this.prisma.testCaseExecution.findUnique({
      where: { id: failureCase.executionId },
      select: {
        id: true,
        browserEngine: true,
        status: true,
        durationMs: true,
        errorMessage: true,
        environmentSnapshotJson: true,
      },
    });

    // 2. Fetch baseline pipeline artifacts:
    // 2a. Deterministic classification (Phase 77)
    const deterministicClassification = await this.prisma.failureClassification.findFirst({
      where: { failureCaseId, projectId, isAuthoritative: true },
      orderBy: { createdAt: 'desc' },
    });

    // 2b. Domain separation (Phase 80)
    const domainSeparation = await this.prisma.failureDomainSeparation.findFirst({
      where: { failureCaseId, projectId, isAuthoritative: true },
      orderBy: { evaluatedAt: 'desc' },
    });

    // 2c. Technical localization (Phase 81)
    const technicalLocalization = await this.prisma.failureTechnicalLocalization.findFirst({
      where: { failureCaseId, projectId, isAuthoritative: true },
      orderBy: { localizedAt: 'desc' },
    });

    // 2d. Reproduction facts (Phase 76)
    const reproductionAttempt = await this.prisma.failureReproductionAttempt.findFirst({
      where: { failureCaseId, projectId },
      orderBy: { attemptNumber: 'desc' },
    });

    // 2e. Flakiness facts (Phase 79)
    const flakinessAnalysis = await this.prisma.flakinessAnalysis.findFirst({
      where: { failureCaseId, projectId },
      orderBy: { createdAt: 'desc' },
    });

    // 2f. Evidence references (Phase 75)
    const evidenceRefs = await this.prisma.failureEvidenceReference.findMany({
      where: { failureCaseId, projectId },
      include: { sourceArtifact: true },
      orderBy: { attachedAt: 'asc' },
    });

    // Insufficient evidence check:
    const hasErrorMsg = Boolean(failureCase.errorMessage || execution?.errorMessage);
    if (evidenceRefs.length === 0 && !hasErrorMsg && !deterministicClassification) {
      throw new AiAssessmentInsufficientEvidenceError(
        'Failure case contains zero diagnostic evidence artifacts, no execution error message, and no deterministic classification.',
        failureCaseId,
      );
    }

    // 3. Extract and normalize evidence for context
    const consoleErrors: string[] = [];
    const networkFailures: Array<{ url: string; method: string; status?: number; error?: string }> =
      [];
    let domSnippet: string | undefined;
    const stackTrace: string | undefined =
      failureCase.errorMessage ?? execution?.errorMessage ?? undefined;
    const artifactSummaries: Array<{ artifactType: string; byteSize: number; mimeType: string }> =
      [];
    const evidenceArtifactHashes: string[] = [];

    for (const ref of evidenceRefs) {
      if (ref.sha256) {
        evidenceArtifactHashes.push(ref.sha256);
      }
      artifactSummaries.push({
        artifactType: ref.artifactType,
        byteSize: ref.byteSize ?? ref.sourceArtifact?.byteSize ?? 0,
        mimeType: ref.mimeType ?? ref.sourceArtifact?.mimeType ?? 'application/octet-stream',
      });

      const meta = (ref.metadataJson as Record<string, unknown>) ?? {};
      if (ref.artifactType === 'CONSOLE_LOG') {
        const messages = Array.isArray(meta.messages)
          ? (meta.messages as Array<Record<string, unknown>>)
          : [];
        for (const m of messages) {
          if (m.type === 'error' || m.level === 'error' || m.text) {
            consoleErrors.push(String(m.text || m.message || ''));
          }
        }
      } else if (
        ref.artifactType === 'NETWORK_LOG' ||
        ref.artifactType === 'NETWORK_REQUEST' ||
        ref.artifactType === 'NETWORK_RESPONSE'
      ) {
        const rawReqList = meta.requests || meta.records || meta.entries;
        const requests: Array<Record<string, unknown>> = Array.isArray(rawReqList)
          ? rawReqList
          : [];
        for (const req of requests) {
          const status = Number(req.status || req.statusCode);
          if (status >= 400 || req.error) {
            networkFailures.push({
              url: String(req.url || req.endpoint || ''),
              method: String(req.method || 'GET'),
              status: Number.isFinite(status) ? status : undefined,
              error: req.error ? String(req.error) : undefined,
            });
          }
        }
      } else if (ref.artifactType === 'DOM_SNAPSHOT' && !domSnippet) {
        domSnippet =
          typeof meta.htmlSnippet === 'string'
            ? meta.htmlSnippet
            : typeof meta.snapshotExcerpt === 'string'
              ? meta.snapshotExcerpt
              : undefined;
      }
    }

    const envSnapshot = (execution?.environmentSnapshotJson as Record<string, unknown>) ?? {};
    const osValue = typeof envSnapshot.os === 'string' ? envSnapshot.os : 'unknown';

    // 4. Sanitize context
    const rawContextInputs: RawContextInputs = {
      projectId,
      failureCaseId,
      caseTitle: failureCase.title,
      execution: {
        testName: failureCase.testCase?.title ?? 'Automated Web Test',
        browser: execution?.browserEngine ?? 'chromium',
        os: osValue,
        status: execution?.status ?? 'FAILED',
        durationMs: execution?.durationMs ?? 0,
        errorMessage: failureCase.errorMessage ?? execution?.errorMessage ?? undefined,
        stepIndex: failureCase.stepIndex ?? undefined,
      },
      deterministicClassification: deterministicClassification
        ? {
            category: deterministicClassification.category,
            subcategory: deterministicClassification.subcategory,
            confidenceScore: 0.9,
            ruleCitations: Array.isArray(deterministicClassification.ruleExplanationsJson)
              ? (deterministicClassification.ruleExplanationsJson as string[])
              : [deterministicClassification.primaryRuleId],
            ruleEngineVersion: deterministicClassification.classifierVersion,
          }
        : null,
      domainSeparation: domainSeparation
        ? {
            failureDomain: domainSeparation.domain,
            boundaryCrossing: false,
            suspectedComponent: domainSeparation.domainSubreason,
            networkResponsibility: null,
            domResponsibility: null,
            confidenceScore: 0.9,
          }
        : null,
      technicalLocalization: technicalLocalization
        ? {
            primaryLayer: technicalLocalization.primaryLayer,
            primaryTargetType: technicalLocalization.primaryTargetType,
            primaryTargetIdentifier: technicalLocalization.primaryTargetIdentifier,
            matchedFilePath: technicalLocalization.matchedFilePath,
            matchedSymbolName: technicalLocalization.matchedSymbolName,
            httpEndpoint: technicalLocalization.httpEndpoint,
            httpMethod: technicalLocalization.httpMethod,
            httpStatusCode: technicalLocalization.httpStatusCode,
            domSelector: technicalLocalization.domSelector,
            confidenceScore: 0.9,
          }
        : null,
      reproductionFacts: reproductionAttempt
        ? {
            isReproducible: reproductionAttempt.status === 'REPRODUCED',
            reproductionRate:
              reproductionAttempt.status === 'REPRODUCED'
                ? 1.0
                : reproductionAttempt.status === 'NOT_REPRODUCED'
                  ? 0.0
                  : 0.5,
            totalRuns: 1,
            passedRuns: reproductionAttempt.status === 'NOT_REPRODUCED' ? 1 : 0,
            failedRuns: reproductionAttempt.status === 'REPRODUCED' ? 1 : 0,
          }
        : null,
      flakinessFacts: flakinessAnalysis
        ? {
            isFlaky:
              flakinessAnalysis.flakinessState === 'CONFIRMED_FLAKY' ||
              flakinessAnalysis.flakinessState === 'FLAKY_CANDIDATE',
            flakinessScore: flakinessAnalysis.failureRate ?? 0.5,
            flakinessCategory: flakinessAnalysis.stabilityState,
          }
        : null,
      rawEvidence: {
        consoleErrors,
        networkFailures,
        domSnippet,
        stackTrace,
        artifactSummaries,
      },
    };

    const sanitizedContext = this.sanitizer.sanitizeContext(rawContextInputs);

    // 5. Existing authoritative check & Idempotency
    const existingAuthoritative = await this.prisma.failureAiAssessment.findFirst({
      where: { failureCaseId, projectId, isAuthoritative: true },
      orderBy: { assessedAt: 'desc' },
    });

    const targetProvider = (modelProviderOverride || 'fake').trim().toLowerCase();
    const targetModel = (modelNameOverride || 'mock-classifier-v1').trim().toLowerCase();

    const fingerprint = generateAiAssessmentFingerprint({
      projectId,
      failureCaseId,
      testCaseId: failureCase.testCaseId,
      testCaseVersionNumber: failureCase.testCaseVersionNumber,
      deterministicCategory: deterministicClassification?.category ?? null,
      deterministicSubcategory: deterministicClassification?.subcategory ?? null,
      domainSeparationDomain: domainSeparation?.domain ?? null,
      technicalLocalizationLayer: technicalLocalization?.primaryLayer ?? null,
      technicalCause: technicalLocalization?.primaryTargetIdentifier ?? null,
      reproductionRate: rawContextInputs.reproductionFacts?.reproductionRate ?? null,
      flakinessScore: rawContextInputs.flakinessFacts?.flakinessScore ?? null,
      evidenceArtifactHashes,
      promptVersion: AI_ASSESSMENT_BOUNDS.PROMPT_VERSION,
      schemaVersion: AI_ASSESSMENT_BOUNDS.SCHEMA_VERSION,
      modelProvider: targetProvider,
      modelName: targetModel,
    });

    if (
      !isReassessment &&
      existingAuthoritative &&
      existingAuthoritative.assessmentFingerprint === fingerprint &&
      !existingAuthoritative.isStale
    ) {
      return this.mapToDto(existingAuthoritative);
    }

    // 6. Build passive evidence block & prompt input
    const evidenceBlock = this.sanitizer.buildPassiveEvidenceBlock(sanitizedContext);

    const promptInput: FailureAiClassificationInput = {
      caseTitle: sanitizedContext.caseTitle,
      testName: sanitizedContext.executionDetails.testName,
      evidenceBlock,
      deterministicBaseline: deterministicClassification?.category,
    };

    // 7. Execute AI Generation via AiPromptExecutionService
    let rawOutput: AiClassificationRawOutput;
    let actualProvider = targetProvider;
    let actualModel = targetModel;

    try {
      const executionResult = await this.promptExecutionService.executePrompt<
        FailureAiClassificationInput,
        AiClassificationRawOutput
      >({
        promptId: FAILURE_AI_CLASSIFICATION_PROMPT_ID,
        version: FAILURE_AI_CLASSIFICATION_PROMPT_VERSION,
        input: promptInput,
        configOverride: {
          providerId: targetProvider as any,
          model: targetModel,
        },
      });

      rawOutput = executionResult.data;
      if (executionResult.providerId) {
        actualProvider = executionResult.providerId;
      }
      if (executionResult.modelReported || executionResult.modelRequested) {
        actualModel = executionResult.modelReported || executionResult.modelRequested;
      }
    } catch (err) {
      throw new AiAssessmentUnavailableError(
        `Failed to execute AI classification prompt: ${err instanceof Error ? err.message : String(err)}`,
        err,
      );
    }

    // 8. Deterministic Confidence Calibration
    const calibration = this.calibrator.calibrate({
      rawScore: rawOutput.confidenceScore,
      context: sanitizedContext,
      supportingCount: rawOutput.supportingEvidence.length,
      contradictingCount: rawOutput.contradictingEvidence.length,
    });

    // 9. Agreement State Evaluation
    const agreementState = FailureAiReasoningService.evaluateAgreement(
      rawOutput.aiCategory,
      deterministicClassification?.category,
    );

    // 10. Database Persistence in Transaction
    const newAssessment = await this.prisma.$transaction(async tx => {
      let previousRecordId: string | undefined;

      if (existingAuthoritative) {
        previousRecordId = existingAuthoritative.id;
        await tx.failureAiAssessment.update({
          where: { id: existingAuthoritative.id },
          data: { isAuthoritative: false },
        });
      }

      const created = await tx.failureAiAssessment.create({
        data: {
          projectId,
          failureCaseId,
          testCaseId: failureCase.testCaseId,
          testCaseVersionNumber: failureCase.testCaseVersionNumber,
          failureAnalysisRunId: failureCase.currentAnalysisRunId,
          deterministicClassificationId: deterministicClassification?.id,
          technicalLocalizationId: technicalLocalization?.id,
          domainSeparationId: domainSeparation?.id,

          aiCategory: rawOutput.aiCategory,
          aiSubcategory: rawOutput.aiSubcategory ?? null,
          agreementState,
          confidenceLevel: calibration.calibratedLevel,
          confidenceScore: calibration.calibratedScore,
          confidenceBasis: [...calibration.calibrationBasis],

          primaryReasoning: rawOutput.primaryReasoning,
          humanExplanation: rawOutput.humanExplanation,
          supportingEvidence: rawOutput.supportingEvidence as any,
          contradictingEvidence: rawOutput.contradictingEvidence as any,
          alternativeHypotheses: rawOutput.alternativeHypotheses as any,
          uncertainties: [...rawOutput.uncertainties],

          modelProvider: actualProvider,
          modelName: actualModel,
          promptVersion: AI_ASSESSMENT_BOUNDS.PROMPT_VERSION,
          schemaVersion: AI_ASSESSMENT_BOUNDS.SCHEMA_VERSION,
          assessmentFingerprint: fingerprint,

          isAuthoritative: true,
          isStale: false,
          stalenessReason: null,
          reanalysisCount: isReassessment ? (existingAuthoritative?.reanalysisCount ?? 0) + 1 : 0,
          lastReanalyzedAt: isReassessment ? new Date() : null,
          reanalysisReason: isReassessment ? reanalysisReason : null,
          supersededById: null,
        },
      });

      if (previousRecordId) {
        await tx.failureAiAssessment.update({
          where: { id: previousRecordId },
          data: { supersededById: created.id },
        });
      }

      await tx.failureCase.update({
        where: { id: failureCaseId },
        data: { updatedAt: new Date() },
      });

      return created;
    });

    return this.mapToDto(newAssessment);
  }

  /**
   * Maps Prisma database entity to DTO conforming to contracts package.
   */
  private mapToDto(record: any): FailureAiAssessmentDto {
    return {
      id: record.id,
      projectId: record.projectId,
      failureCaseId: record.failureCaseId,
      testCaseId: record.testCaseId,
      testCaseVersionNumber: record.testCaseVersionNumber,
      failureAnalysisRunId: record.failureAnalysisRunId ?? null,
      deterministicClassificationId: record.deterministicClassificationId ?? null,
      technicalLocalizationId: record.technicalLocalizationId ?? null,
      domainSeparationId: record.domainSeparationId ?? null,

      aiCategory: record.aiCategory,
      aiSubcategory: record.aiSubcategory ?? null,
      agreementState: record.agreementState,
      confidenceLevel: record.confidenceLevel,
      confidenceScore: record.confidenceScore,
      confidenceBasis: Array.isArray(record.confidenceBasis) ? record.confidenceBasis : [],

      primaryReasoning: record.primaryReasoning,
      humanExplanation: record.humanExplanation,
      supportingEvidence: Array.isArray(record.supportingEvidence) ? record.supportingEvidence : [],
      contradictingEvidence: Array.isArray(record.contradictingEvidence)
        ? record.contradictingEvidence
        : [],
      alternativeHypotheses: Array.isArray(record.alternativeHypotheses)
        ? record.alternativeHypotheses
        : [],
      uncertainties: Array.isArray(record.uncertainties) ? record.uncertainties : [],

      modelProvider: record.modelProvider,
      modelName: record.modelName,
      promptVersion: record.promptVersion,
      schemaVersion: record.schemaVersion,
      assessmentFingerprint: record.assessmentFingerprint,

      isAuthoritative: record.isAuthoritative,
      isStale: record.isStale,
      stalenessReason: record.stalenessReason ?? null,
      reanalysisCount: record.reanalysisCount,
      lastReanalyzedAt: record.lastReanalyzedAt ? record.lastReanalyzedAt.toISOString() : null,
      reanalysisReason: record.reanalysisReason ?? null,
      supersededById: record.supersededById ?? null,

      assessedAt: record.assessedAt.toISOString(),
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    };
  }
}
