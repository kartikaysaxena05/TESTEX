/**
 * @file packages/core/src/failures/root-cause/failure-root-cause-service.ts
 * Core domain service orchestrating Root-Cause Analysis & Probable Layer Identification (V6 Phase 83).
 */

import type { PrismaClient } from '@prisma/client';
import {
  analyzeRootCauseInputSchema,
  getRootCauseAnalysisInputSchema,
  reanalyzeRootCauseInputSchema,
  listRootCauseHistoryInputSchema,
  type AnalyzeRootCauseInputDto,
  type GetRootCauseAnalysisInputDto,
  type ReanalyzeRootCauseInputDto,
  type ListRootCauseHistoryInputDto,
  type FailureRootCauseAnalysisDto,
  type RootCauseProbableLayer,
  type RootCauseStatus,
} from '@ai-quality/contracts';
import {
  ROOT_CAUSE_BOUNDS,
  type IFailureRootCauseService,
  type RootCauseRawOutput,
} from './root-cause-types.js';
import {
  RootCauseUnavailableError,
  RootCauseCrossProjectError,
  RootCauseInsufficientEvidenceError,
  RootCauseBlockedError,
} from './root-cause-errors.js';
import { FailureCaseNotFoundError } from '../failure-errors.js';
import {
  RootCauseContextSanitizer,
  type RawRootCauseContextInputs,
} from './root-cause-context-sanitizer.js';
import { RepositoryReferenceValidator } from './repository-reference-validator.js';
import { generateRootCauseFingerprint } from './root-cause-fingerprint.js';
import {
  FAILURE_ROOT_CAUSE_ANALYSIS_PROMPT_ID,
  FAILURE_ROOT_CAUSE_ANALYSIS_PROMPT_VERSION,
  type FailureRootCauseAnalysisInput,
} from './root-cause-prompt-definition.js';
import { AiPromptExecutionService } from '../../ai/ai-prompt-execution-service.js';

export class FailureRootCauseService implements IFailureRootCauseService {
  private readonly sanitizer: RootCauseContextSanitizer;
  private readonly repoValidator: RepositoryReferenceValidator;
  private readonly promptExecutionService: AiPromptExecutionService;
  private readonly caseLocks = new Map<string, Promise<void>>();

  constructor(
    private readonly prisma: PrismaClient,
    options: {
      promptExecutionService?: AiPromptExecutionService;
      sanitizer?: RootCauseContextSanitizer;
      repoValidator?: RepositoryReferenceValidator;
    } = {},
  ) {
    this.promptExecutionService = options.promptExecutionService ?? new AiPromptExecutionService();
    this.sanitizer = options.sanitizer ?? new RootCauseContextSanitizer();
    this.repoValidator = options.repoValidator ?? new RepositoryReferenceValidator();
  }

  /**
   * Serializes concurrent root-cause analysis operations on the same failure case.
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
   * Analyzes a failure case to formulate root-cause hypothesis and probable layer.
   */
  public async analyzeRootCause(
    input: AnalyzeRootCauseInputDto,
  ): Promise<FailureRootCauseAnalysisDto> {
    const validated = analyzeRootCauseInputSchema.parse(input);
    const lockKey = `${validated.projectId}:${validated.failureCaseId}`;

    return this.withLock(lockKey, async () => {
      return this.executeRootCauseAnalysis({
        projectId: validated.projectId,
        failureCaseId: validated.failureCaseId,
        isReassessment: false,
        modelProviderOverride: validated.modelProviderOverride,
        modelNameOverride: validated.modelNameOverride,
      });
    });
  }

  /**
   * Retrieves current authoritative root-cause analysis with dynamic staleness detection.
   */
  public async getRootCauseAnalysis(
    input: GetRootCauseAnalysisInputDto,
  ): Promise<FailureRootCauseAnalysisDto | null> {
    const validated = getRootCauseAnalysisInputSchema.parse(input);

    const failureCase = await this.prisma.failureCase.findUnique({
      where: { id: validated.failureCaseId },
      select: { id: true, projectId: true },
    });

    if (!failureCase) {
      throw new FailureCaseNotFoundError(validated.failureCaseId, validated.projectId);
    }

    if (failureCase.projectId !== validated.projectId) {
      throw new RootCauseCrossProjectError(
        'FailureCase',
        validated.failureCaseId,
        validated.projectId,
      );
    }

    const record = await this.prisma.failureRootCauseAnalysis.findFirst({
      where: {
        failureCaseId: validated.failureCaseId,
        projectId: validated.projectId,
        isAuthoritative: true,
      },
      orderBy: { analyzedAt: 'desc' },
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
          attachedAt: { gt: record.analyzedAt },
        },
      });

      if (newerEvidenceCount > 0) {
        isStale = true;
        stalenessReason = `${newerEvidenceCount} new evidence artifact(s) attached since root-cause analysis.`;
      }

      // 2. Check if deterministic classification changed
      if (!isStale) {
        const newerClassification = await this.prisma.failureClassification.findFirst({
          where: {
            failureCaseId: validated.failureCaseId,
            isAuthoritative: true,
            createdAt: { gt: record.analyzedAt },
          },
        });
        if (newerClassification) {
          isStale = true;
          stalenessReason = 'Deterministic classification updated since root-cause analysis.';
        }
      }

      // 3. Check if domain separation was re-evaluated
      if (!isStale) {
        const newerDomainSep = await this.prisma.failureDomainSeparation.findFirst({
          where: {
            failureCaseId: validated.failureCaseId,
            isAuthoritative: true,
            evaluatedAt: { gt: record.analyzedAt },
          },
        });
        if (newerDomainSep) {
          isStale = true;
          stalenessReason = 'Failure domain separation re-evaluated since root-cause analysis.';
        }
      }

      // 4. Check if technical localization was updated
      if (!isStale) {
        const newerLocalization = await this.prisma.failureTechnicalLocalization.findFirst({
          where: {
            failureCaseId: validated.failureCaseId,
            isAuthoritative: true,
            localizedAt: { gt: record.analyzedAt },
          },
        });
        if (newerLocalization) {
          isStale = true;
          stalenessReason = 'Technical cause localization updated since root-cause analysis.';
        }
      }

      // 5. Check if AI assessment was updated
      if (!isStale) {
        const newerAiAssessment = await this.prisma.failureAiAssessment.findFirst({
          where: {
            failureCaseId: validated.failureCaseId,
            isAuthoritative: true,
            assessedAt: { gt: record.analyzedAt },
          },
        });
        if (newerAiAssessment) {
          isStale = true;
          stalenessReason = 'AI classification assessment updated since root-cause analysis.';
        }
      }

      if (isStale) {
        await this.prisma.failureRootCauseAnalysis.update({
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
   * Re-evaluates root-cause analysis for an existing failure case.
   */
  public async reanalyzeRootCause(
    input: ReanalyzeRootCauseInputDto,
  ): Promise<FailureRootCauseAnalysisDto> {
    const validated = reanalyzeRootCauseInputSchema.parse(input);
    const lockKey = `${validated.projectId}:${validated.failureCaseId}`;

    return this.withLock(lockKey, async () => {
      return this.executeRootCauseAnalysis({
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
   * Lists all historical root-cause analyses for a failure case.
   */
  public async listRootCauseHistory(
    input: ListRootCauseHistoryInputDto,
  ): Promise<readonly FailureRootCauseAnalysisDto[]> {
    const validated = listRootCauseHistoryInputSchema.parse(input);

    const failureCase = await this.prisma.failureCase.findUnique({
      where: { id: validated.failureCaseId },
      select: { id: true, projectId: true },
    });

    if (!failureCase) {
      throw new FailureCaseNotFoundError(validated.failureCaseId, validated.projectId);
    }

    if (failureCase.projectId !== validated.projectId) {
      throw new RootCauseCrossProjectError(
        'FailureCase',
        validated.failureCaseId,
        validated.projectId,
      );
    }

    const records = await this.prisma.failureRootCauseAnalysis.findMany({
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

  private async executeRootCauseAnalysis(params: {
    projectId: string;
    failureCaseId: string;
    isReassessment: boolean;
    reanalysisReason?: string;
    modelProviderOverride?: string;
    modelNameOverride?: string;
  }): Promise<FailureRootCauseAnalysisDto> {
    const {
      projectId,
      failureCaseId,
      isReassessment,
      reanalysisReason,
      modelProviderOverride,
      modelNameOverride,
    } = params;

    // 1. Fetch failure case and verify tenant isolation
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
      throw new RootCauseCrossProjectError('FailureCase', failureCaseId, projectId);
    }

    // Blocked check: If failure case is marked ineligible
    if (!failureCase.isEligible) {
      throw new RootCauseBlockedError(
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

    // 2d. AI Assessment (Phase 82)
    const aiAssessment = await this.prisma.failureAiAssessment.findFirst({
      where: { failureCaseId, projectId, isAuthoritative: true },
      orderBy: { assessedAt: 'desc' },
    });

    // 2e. Reproduction facts (Phase 76)
    const reproductionAttempt = await this.prisma.failureReproductionAttempt.findFirst({
      where: { failureCaseId, projectId },
      orderBy: { attemptNumber: 'desc' },
    });

    // 2f. Flakiness facts (Phase 79)
    const flakinessAnalysis = await this.prisma.flakinessAnalysis.findFirst({
      where: { failureCaseId, projectId },
      orderBy: { createdAt: 'desc' },
    });

    // 2g. Evidence references (Phase 75)
    const evidenceRefs = await this.prisma.failureEvidenceReference.findMany({
      where: { failureCaseId, projectId },
      include: { sourceArtifact: true },
      orderBy: { attachedAt: 'asc' },
    });

    // Insufficient evidence check:
    const hasErrorMsg = Boolean(failureCase.errorMessage || execution?.errorMessage);
    if (
      evidenceRefs.length === 0 &&
      !hasErrorMsg &&
      !deterministicClassification &&
      !aiAssessment
    ) {
      throw new RootCauseInsufficientEvidenceError(
        'Failure case contains zero diagnostic evidence artifacts, no execution error message, and no classification assessment.',
        failureCaseId,
      );
    }

    // 3. Query repository intelligence (V2)
    const repositoryFiles = await this.prisma.repositoryFile.findMany({
      where: { source: { projectId } },
      include: {
        symbols: {
          select: {
            id: true,
            name: true,
            kind: true,
            startLine: true,
            endLine: true,
          },
        },
      },
      take: 100,
    });

    const repositoryContextAvailable = repositoryFiles.length > 0;
    const knownFilesSummary = repositoryFiles.slice(0, 30).map(file => ({
      path: file.relativePath,
      symbols: (file.symbols ?? []).slice(0, 10).map(s => s.name),
    }));

    // 4. Extract and normalize evidence for context
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

    // 5. Sanitize context
    const rawContextInputs: RawRootCauseContextInputs = {
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
            suspectedComponent: domainSeparation.domainSubreason,
            networkResponsibility: null,
            domResponsibility: null,
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
          }
        : null,
      aiAssessment: aiAssessment
        ? {
            aiCategory: aiAssessment.aiCategory,
            aiSubcategory: aiAssessment.aiSubcategory,
            agreementState: aiAssessment.agreementState,
            confidenceLevel: aiAssessment.confidenceLevel,
            primaryReasoning: aiAssessment.primaryReasoning,
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
      repositoryContext: {
        available: repositoryContextAvailable,
        knownFilesSummary,
      },
      rawEvidence: {
        consoleErrors,
        networkFailures,
        domSnippet,
        stackTrace,
        artifactSummaries,
      },
    };

    const sanitizedContext = this.sanitizer.sanitizeContext(rawContextInputs);

    // 6. Existing authoritative check & Idempotency
    const existingAuthoritative = await this.prisma.failureRootCauseAnalysis.findFirst({
      where: { failureCaseId, projectId, isAuthoritative: true },
      orderBy: { analyzedAt: 'desc' },
    });

    const targetProvider = (modelProviderOverride || 'fake').trim().toLowerCase();
    const targetModel = (modelNameOverride || 'mock-rca-v1').trim().toLowerCase();

    const fingerprint = generateRootCauseFingerprint({
      projectId,
      failureCaseId,
      testCaseId: failureCase.testCaseId,
      testCaseVersionNumber: failureCase.testCaseVersionNumber,
      deterministicCategory: deterministicClassification?.category ?? null,
      deterministicSubcategory: deterministicClassification?.subcategory ?? null,
      domainSeparationDomain: domainSeparation?.domain ?? null,
      technicalLocalizationLayer: technicalLocalization?.primaryLayer ?? null,
      technicalCause: technicalLocalization?.primaryTargetIdentifier ?? null,
      aiAssessmentCategory: aiAssessment?.aiCategory ?? null,
      reproductionRate: rawContextInputs.reproductionFacts?.reproductionRate ?? null,
      flakinessScore: rawContextInputs.flakinessFacts?.flakinessScore ?? null,
      evidenceArtifactHashes,
      repositoryContextAvailable,
      promptVersion: ROOT_CAUSE_BOUNDS.PROMPT_VERSION,
      schemaVersion: ROOT_CAUSE_BOUNDS.SCHEMA_VERSION,
      modelProvider: targetProvider,
      modelName: targetModel,
    });

    if (
      !isReassessment &&
      existingAuthoritative &&
      existingAuthoritative.rootCauseFingerprint === fingerprint &&
      !existingAuthoritative.isStale
    ) {
      return this.mapToDto(existingAuthoritative);
    }

    // 7. Build passive evidence block & prompt input
    const evidenceBlock = this.sanitizer.buildPassiveEvidenceBlock(sanitizedContext);

    const promptInput: FailureRootCauseAnalysisInput = {
      caseTitle: sanitizedContext.caseTitle,
      testName: sanitizedContext.executionDetails.testName,
      evidenceBlock,
      repositoryAvailable: repositoryContextAvailable,
    };

    // 8. Execute AI Generation via AiPromptExecutionService
    let rawOutput: RootCauseRawOutput;
    let actualProvider = targetProvider;
    let actualModel = targetModel;

    try {
      const executionResult = await this.promptExecutionService.executePrompt<
        FailureRootCauseAnalysisInput,
        RootCauseRawOutput
      >({
        promptId: FAILURE_ROOT_CAUSE_ANALYSIS_PROMPT_ID,
        version: FAILURE_ROOT_CAUSE_ANALYSIS_PROMPT_VERSION,
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
      throw new RootCauseUnavailableError(
        `Failed to execute root-cause analysis prompt: ${err instanceof Error ? err.message : String(err)}`,
        err,
      );
    }

    // 9. Strict anti-hallucination verification of repository references
    const validationResult = this.repoValidator.validateReferences(
      rawOutput.repositoryReferences,
      repositoryFiles,
    );

    // Merge validation rejection reasons into limitations if any hallucinations were caught
    const effectiveLimitations = [...rawOutput.limitations];
    if (validationResult.omittedHallucinationsCount > 0) {
      effectiveLimitations.push(
        `${validationResult.omittedHallucinationsCount} unverified / hallucinated repository reference(s) omitted during anti-hallucination validation.`,
      );
    }

    // If repository context is unavailable and status wasn't set to NO_REPOSITORY_CONTEXT or another status, adjust if needed
    const finalStatus: RootCauseStatus = rawOutput.rootCauseStatus;
    if (
      !repositoryContextAvailable &&
      finalStatus === 'SUPPORTED_HYPOTHESIS' &&
      validationResult.validatedReferences.length === 0
    ) {
      // It can remain SUPPORTED_HYPOTHESIS if supported by diagnostic logs/network without repository, but if prompt explicitly set NO_REPOSITORY_CONTEXT that's fine
    }

    // 10. Database Persistence in Transaction
    const newAnalysis = await this.prisma.$transaction(async tx => {
      let previousRecordId: string | undefined;

      if (existingAuthoritative) {
        previousRecordId = existingAuthoritative.id;
        await tx.failureRootCauseAnalysis.update({
          where: { id: existingAuthoritative.id },
          data: { isAuthoritative: false },
        });
      }

      const created = await tx.failureRootCauseAnalysis.create({
        data: {
          projectId,
          failureCaseId,
          testCaseId: failureCase.testCaseId,
          testCaseVersionNumber: failureCase.testCaseVersionNumber,
          failureAnalysisRunId: failureCase.currentAnalysisRunId,
          deterministicClassificationId: deterministicClassification?.id,
          technicalLocalizationId: technicalLocalization?.id,
          domainSeparationId: domainSeparation?.id,
          aiAssessmentId: aiAssessment?.id,

          rootCauseStatus: finalStatus,
          probableLayer: rawOutput.probableLayer,
          probableComponent: rawOutput.probableComponent ?? null,
          relatedEndpoint: rawOutput.relatedEndpoint ?? null,

          probableCause: rawOutput.probableCause,
          humanExplanation: rawOutput.humanExplanation,
          affectedExecutionPath: [...rawOutput.affectedExecutionPath],
          supportingEvidence: rawOutput.supportingEvidence as any,
          contradictingEvidence: rawOutput.contradictingEvidence as any,
          alternativeHypotheses: rawOutput.alternativeHypotheses as any,
          repositoryReferences: validationResult.validatedReferences as any,
          repositoryContextAvailable,
          limitations: effectiveLimitations,
          uncertainties: [...rawOutput.uncertainties],

          modelProvider: actualProvider,
          modelName: actualModel,
          promptVersion: ROOT_CAUSE_BOUNDS.PROMPT_VERSION,
          schemaVersion: ROOT_CAUSE_BOUNDS.SCHEMA_VERSION,
          rootCauseFingerprint: fingerprint,

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
        await tx.failureRootCauseAnalysis.update({
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

    return this.mapToDto(newAnalysis);
  }

  /**
   * Maps Prisma database entity to DTO conforming to contracts package.
   */
  public mapToDto(record: {
    id: string;
    projectId: string;
    failureCaseId: string;
    testCaseId: string;
    testCaseVersionNumber: number;
    failureAnalysisRunId: string | null;
    deterministicClassificationId: string | null;
    technicalLocalizationId: string | null;
    domainSeparationId: string | null;
    aiAssessmentId: string | null;
    rootCauseStatus: string;
    probableLayer: string;
    probableComponent: string | null;
    relatedEndpoint: string | null;
    probableCause: string;
    humanExplanation: string;
    affectedExecutionPath: unknown;
    supportingEvidence: unknown;
    contradictingEvidence: unknown;
    alternativeHypotheses: unknown;
    repositoryReferences: unknown;
    repositoryContextAvailable: boolean;
    limitations: unknown;
    uncertainties: unknown;
    modelProvider: string;
    modelName: string;
    promptVersion: string;
    schemaVersion: string;
    rootCauseFingerprint: string;
    isAuthoritative: boolean;
    isStale: boolean;
    stalenessReason: string | null;
    reanalysisCount: number;
    lastReanalyzedAt: Date | null;
    reanalysisReason: string | null;
    supersededById: string | null;
    analyzedAt: Date;
    createdAt: Date;
    updatedAt: Date;
  }): FailureRootCauseAnalysisDto {
    return {
      id: record.id,
      projectId: record.projectId,
      failureCaseId: record.failureCaseId,
      testCaseId: record.testCaseId,
      testCaseVersionNumber: record.testCaseVersionNumber,
      failureAnalysisRunId: record.failureAnalysisRunId,
      deterministicClassificationId: record.deterministicClassificationId,
      technicalLocalizationId: record.technicalLocalizationId,
      domainSeparationId: record.domainSeparationId,
      aiAssessmentId: record.aiAssessmentId,

      rootCauseStatus: record.rootCauseStatus as RootCauseStatus,
      probableLayer: record.probableLayer as RootCauseProbableLayer,
      probableComponent: record.probableComponent,
      relatedEndpoint: record.relatedEndpoint,

      probableCause: record.probableCause,
      humanExplanation: record.humanExplanation,
      affectedExecutionPath: Array.isArray(record.affectedExecutionPath)
        ? (record.affectedExecutionPath as string[])
        : [],
      supportingEvidence: Array.isArray(record.supportingEvidence)
        ? (record.supportingEvidence as any)
        : [],
      contradictingEvidence: Array.isArray(record.contradictingEvidence)
        ? (record.contradictingEvidence as any)
        : [],
      alternativeHypotheses: Array.isArray(record.alternativeHypotheses)
        ? (record.alternativeHypotheses as any)
        : [],
      repositoryReferences: Array.isArray(record.repositoryReferences)
        ? (record.repositoryReferences as any)
        : [],
      repositoryContextAvailable: record.repositoryContextAvailable,
      limitations: Array.isArray(record.limitations) ? (record.limitations as string[]) : [],
      uncertainties: Array.isArray(record.uncertainties) ? (record.uncertainties as string[]) : [],

      modelProvider: record.modelProvider,
      modelName: record.modelName,
      promptVersion: record.promptVersion,
      schemaVersion: record.schemaVersion,
      rootCauseFingerprint: record.rootCauseFingerprint,

      isAuthoritative: record.isAuthoritative,
      isStale: record.isStale,
      stalenessReason: record.stalenessReason,
      reanalysisCount: record.reanalysisCount,
      lastReanalyzedAt: record.lastReanalyzedAt?.toISOString() ?? null,
      reanalysisReason: record.reanalysisReason,
      supersededById: record.supersededById,

      analyzedAt: record.analyzedAt.toISOString(),
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    };
  }
}
