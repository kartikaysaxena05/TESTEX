/**
 * @file packages/core/src/failures/confidence/confidence-assessment-service.ts
 * Central orchestrator for Confidence Scoring, Explainability & Evidence Attribution.
 */

import crypto from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import {
  assessConfidenceInputSchema,
  getConfidenceInputSchema,
  reassessConfidenceInputSchema,
  listConfidenceHistoryInputSchema,
  listEvidenceAttributionsInputSchema,
  type AssessConfidenceInputDto,
  type GetConfidenceInputDto,
  type ReassessConfidenceInputDto,
  type ListConfidenceHistoryInputDto,
  type ListEvidenceAttributionsInputDto,
  type ConfidenceAssessmentDto,
  type EvidenceAttributionDto,
  type ConfidenceComponentScoreDto,
} from '@ai-quality/contracts';
import {
  CONFIDENCE_BOUNDS,
  type IConfidenceAssessmentService,
  type ConfidenceEvaluationFacts,
} from './confidence-types.js';
import {
  ConfidenceAssessmentNotFoundError,
  ConfidenceAssessmentCrossProjectError,
  ConfidenceAssessmentInvalidOperationError,
} from './confidence-errors.js';
import { EvidenceAttributionEngine } from './evidence-attribution-engine.js';
import { ConfidenceScoringEngine } from './confidence-scoring-engine.js';
import { ExplanationGenerator } from './explanation-generator.js';
import { generateConfidenceFingerprint } from './confidence-fingerprint.js';
import { FailureEvidenceRedactor } from '../evidence/failure-evidence-redactor.js';

export class ConfidenceAssessmentService implements IConfidenceAssessmentService {
  private readonly attributionEngine: EvidenceAttributionEngine;
  private readonly scoringEngine: ConfidenceScoringEngine;
  private readonly explanationGenerator: ExplanationGenerator;
  private readonly redactor: FailureEvidenceRedactor;
  private readonly caseLocks = new Map<string, Promise<void>>();

  constructor(private readonly prisma: PrismaClient) {
    this.attributionEngine = new EvidenceAttributionEngine();
    this.scoringEngine = new ConfidenceScoringEngine();
    this.explanationGenerator = new ExplanationGenerator();
    this.redactor = new FailureEvidenceRedactor();
  }

  /**
   * Serializes operations per failure case to prevent race conditions.
   */
  private async withLock<T>(caseId: string, fn: () => Promise<T>): Promise<T> {
    const currentLock = this.caseLocks.get(caseId) ?? Promise.resolve();
    let releaseLock: () => void;
    const nextLock = new Promise<void>(resolve => {
      releaseLock = resolve;
    });

    this.caseLocks.set(caseId, nextLock);

    try {
      await currentLock;
      return await fn();
    } finally {
      releaseLock!();
      if (this.caseLocks.get(caseId) === nextLock) {
        this.caseLocks.delete(caseId);
      }
    }
  }

  /**
   * Assesses or retrieves authoritative confidence assessment for a failure case.
   */
  public async assessConfidence(input: AssessConfidenceInputDto): Promise<ConfidenceAssessmentDto> {
    const validated = assessConfidenceInputSchema.parse(input);

    return this.withLock(validated.failureCaseId, async () => {
      await this.assertCaseAccess(validated.projectId, validated.failureCaseId);

      // Check for existing authoritative assessment
      const existing = await this.prisma.confidenceAssessment.findFirst({
        where: {
          projectId: validated.projectId,
          failureCaseId: validated.failureCaseId,
          isAuthoritative: true,
        },
        include: {
          attributions: {
            orderBy: [{ conclusionType: 'asc' }, { createdAt: 'asc' }],
          },
        },
      });

      const facts = await this.gatherEvaluationFacts(validated.projectId, validated.failureCaseId);

      const isStale = existing ? this.checkStaleness(existing.assessedAt, facts) : false;

      if (existing && !validated.forceReassess && !isStale) {
        return this.mapAssessmentToDto(existing, false);
      }

      // Compute fresh assessment
      const attributions = this.attributionEngine.extractAttributions(facts);
      const scoring = this.scoringEngine.computeConfidence(facts, attributions);
      const explanation = this.explanationGenerator.generateExplanation(
        facts,
        scoring,
        attributions,
      );

      const newAssessmentId = crypto.randomUUID();
      const revision = existing ? existing.revision + 1 : 1;

      const fingerprint = generateConfidenceFingerprint({
        projectId: validated.projectId,
        failureCaseId: validated.failureCaseId,
        revision,
        overallConfidence: scoring.overallConfidence,
        confidenceBand: scoring.confidenceBand,
        classificationConfidence: scoring.classificationConfidence,
        reproducibilityConfidence: scoring.reproducibilityConfidence,
        rootCauseConfidence: scoring.rootCauseConfidence,
        severityConfidence: scoring.severityConfidence,
        duplicateConfidence: scoring.duplicateConfidence,
        componentBreakdown: scoring.componentBreakdown,
        attributions: attributions.map(a => ({
          conclusionType: a.conclusionType,
          canonicalEvidenceKey: a.canonicalEvidenceKey,
          relationship: a.relationship,
          supportStrength: a.supportStrength,
        })),
        deterministicFacts: scoring.deterministicFacts,
        aiInferences: scoring.aiInferences,
        contradictions: scoring.contradictions,
      });

      const sanitizedExplanation = this.redactor.redactText(
        explanation.markdownExplanation,
      ).redacted;

      const saved = await this.prisma.$transaction(async tx => {
        const created = await tx.confidenceAssessment.create({
          data: {
            id: newAssessmentId,
            projectId: validated.projectId,
            failureCaseId: validated.failureCaseId,
            failureAnalysisRunId: facts.failureAnalysisRunId ?? null,
            revision,
            isAuthoritative: true,
            supersedesId: existing ? existing.id : null,
            supersededById: null,
            overallConfidence: scoring.overallConfidence,
            confidenceBand: scoring.confidenceBand,
            classificationConfidence: scoring.classificationConfidence,
            reproducibilityConfidence: scoring.reproducibilityConfidence,
            rootCauseConfidence: scoring.rootCauseConfidence,
            severityConfidence: scoring.severityConfidence,
            duplicateConfidence: scoring.duplicateConfidence,
            componentBreakdownJson: scoring.componentBreakdown as any,
            supportingFactors: scoring.supportingFactors as any,
            penalties: scoring.penalties as any,
            missingFactors: scoring.missingFactors as any,
            contradictions: scoring.contradictions as any,
            deterministicFacts: scoring.deterministicFacts as any,
            aiInferences: scoring.aiInferences as any,
            humanExplanation: sanitizedExplanation,
            confidenceFingerprint: fingerprint,
            confidenceEngineVersion: CONFIDENCE_BOUNDS.ENGINE_VERSION,
            scoringPolicyVersion: CONFIDENCE_BOUNDS.SCORING_POLICY_VERSION,
            explanationVersion: CONFIDENCE_BOUNDS.EXPLANATION_VERSION,
            isStale: false,
            stalenessReason: null,
            recalculationReason: validated.forceReassess ? 'Manual recalculation requested' : null,
            assessedAt: new Date(),
          },
        });

        if (existing) {
          await tx.confidenceAssessment.update({
            where: { id: existing.id },
            data: {
              isAuthoritative: false,
              supersededById: newAssessmentId,
            },
          });
        }

        if (attributions.length > 0) {
          await tx.evidenceAttribution.createMany({
            data: attributions.map(draft => ({
              id: crypto.randomUUID(),
              confidenceAssessmentId: newAssessmentId,
              projectId: validated.projectId,
              failureCaseId: validated.failureCaseId,
              conclusionType: draft.conclusionType,
              conclusionValue: draft.conclusionValue,
              evidenceReferenceId: draft.evidenceReferenceId,
              evidenceType: draft.evidenceType,
              relationship: draft.relationship,
              supportStrength: draft.supportStrength,
              sourceSubsystem: draft.sourceSubsystem,
              reason: this.redactor.redactText(draft.reason).redacted,
              epistemicType: draft.epistemicType,
              canonicalEvidenceKey: draft.canonicalEvidenceKey,
            })),
          });
        }

        return tx.confidenceAssessment.findUniqueOrThrow({
          where: { id: created.id },
          include: {
            attributions: {
              orderBy: [{ conclusionType: 'asc' }, { createdAt: 'asc' }],
            },
          },
        });
      });

      return this.mapAssessmentToDto(saved, false);
    });
  }

  /**
   * Retrieves authoritative confidence assessment for a failure case.
   */
  public async getConfidence(
    input: GetConfidenceInputDto,
  ): Promise<ConfidenceAssessmentDto | null> {
    const validated = getConfidenceInputSchema.parse(input);
    await this.assertCaseAccess(validated.projectId, validated.failureCaseId);

    const assessment = await this.prisma.confidenceAssessment.findFirst({
      where: {
        projectId: validated.projectId,
        failureCaseId: validated.failureCaseId,
        isAuthoritative: true,
      },
      include: {
        attributions: {
          orderBy: [{ conclusionType: 'asc' }, { createdAt: 'asc' }],
        },
      },
    });

    if (!assessment) return null;

    const facts = await this.gatherEvaluationFacts(validated.projectId, validated.failureCaseId);
    const isStale = this.checkStaleness(assessment.assessedAt, facts);

    return this.mapAssessmentToDto(
      assessment,
      isStale,
      isStale
        ? 'Underlying failure case or analysis artifacts updated since last assessment.'
        : null,
    );
  }

  /**
   * Explicitly reassesses confidence with an auditable reason.
   */
  public async reassessConfidence(
    input: ReassessConfidenceInputDto,
  ): Promise<ConfidenceAssessmentDto> {
    const validated = reassessConfidenceInputSchema.parse(input);
    if (!validated.reason || validated.reason.trim().length === 0) {
      throw new ConfidenceAssessmentInvalidOperationError('Reassessment requires a valid reason.');
    }

    return this.assessConfidence({
      projectId: validated.projectId,
      failureCaseId: validated.failureCaseId,
      forceReassess: true,
    });
  }

  /**
   * Lists the full audit and revision history of confidence assessments for a failure case.
   */
  public async listConfidenceHistory(
    input: ListConfidenceHistoryInputDto,
  ): Promise<readonly ConfidenceAssessmentDto[]> {
    const validated = listConfidenceHistoryInputSchema.parse(input);
    await this.assertCaseAccess(validated.projectId, validated.failureCaseId);

    const records = await this.prisma.confidenceAssessment.findMany({
      where: {
        projectId: validated.projectId,
        failureCaseId: validated.failureCaseId,
      },
      orderBy: { revision: 'desc' },
      include: {
        attributions: {
          orderBy: [{ conclusionType: 'asc' }, { createdAt: 'asc' }],
        },
      },
    });

    return records.map(r => this.mapAssessmentToDto(r, false));
  }

  /**
   * Lists evidence attributions for a failure case, optionally filtered by assessment or conclusion.
   */
  public async listEvidenceAttributions(
    input: ListEvidenceAttributionsInputDto,
  ): Promise<readonly EvidenceAttributionDto[]> {
    const validated = listEvidenceAttributionsInputSchema.parse(input);
    await this.assertCaseAccess(validated.projectId, validated.failureCaseId);

    const whereClause: Record<string, unknown> = {
      projectId: validated.projectId,
      failureCaseId: validated.failureCaseId,
    };

    if (validated.confidenceAssessmentId) {
      whereClause.confidenceAssessmentId = validated.confidenceAssessmentId;
    }
    if (validated.conclusionType) {
      whereClause.conclusionType = validated.conclusionType;
    }

    const attributions = await this.prisma.evidenceAttribution.findMany({
      where: whereClause,
      orderBy: [{ conclusionType: 'asc' }, { createdAt: 'asc' }],
    });

    return attributions.map(a => ({
      id: a.id,
      confidenceAssessmentId: a.confidenceAssessmentId,
      projectId: a.projectId,
      failureCaseId: a.failureCaseId,
      conclusionType: a.conclusionType,
      conclusionValue: a.conclusionValue,
      evidenceReferenceId: a.evidenceReferenceId,
      evidenceType: a.evidenceType,
      relationship: a.relationship,
      supportStrength: a.supportStrength,
      sourceSubsystem: a.sourceSubsystem,
      reason: a.reason,
      epistemicType: a.epistemicType,
      canonicalEvidenceKey: a.canonicalEvidenceKey,
      createdAt: a.createdAt,
    }));
  }

  /**
   * Verifies access to the failure case within the project boundary. Throws cross-project error if mismatch.
   */
  private async assertCaseAccess(projectId: string, failureCaseId: string): Promise<void> {
    const fc = await this.prisma.failureCase.findUnique({
      where: { id: failureCaseId },
      select: { id: true, projectId: true },
    });

    if (!fc) {
      throw new ConfidenceAssessmentNotFoundError(
        `Failure case '${failureCaseId}' not found.`,
        failureCaseId,
      );
    }

    if (fc.projectId !== projectId) {
      throw new ConfidenceAssessmentCrossProjectError(
        `Access denied: failure case '${failureCaseId}' belongs to project '${fc.projectId}', not '${projectId}'.`,
      );
    }
  }

  /**
   * Evaluates dynamic staleness between assessedAt and underlying evidence timestamps.
   */
  private checkStaleness(assessedAt: Date, facts: ConfidenceEvaluationFacts): boolean {
    const assessedTime = assessedAt.getTime();
    if (facts.caseUpdatedAt.getTime() > assessedTime) return true;

    for (const ref of facts.evidenceReferences) {
      if (ref.createdAt.getTime() > assessedTime) return true;
    }

    return false;
  }

  /**
   * Gathers all multi-phase evaluation facts across Phases 74–85.
   */
  private async gatherEvaluationFacts(
    projectId: string,
    failureCaseId: string,
  ): Promise<ConfidenceEvaluationFacts> {
    const fc = await this.prisma.failureCase.findUniqueOrThrow({
      where: { id: failureCaseId },
      include: {
        testCase: true,
        environment: true,
        stepExecution: true,
        evidenceReferences: true,
        reproductionAttempts: {
          orderBy: { attemptNumber: 'desc' },
          take: 5,
        },
        flakinessAnalyses: {
          where: { isAuthoritative: true },
          take: 1,
        },
        domainSeparations: {
          where: { isAuthoritative: true },
          take: 1,
        },
        technicalLocalizations: {
          where: { isAuthoritative: true },
          take: 1,
        },
        rootCauseAnalyses: {
          where: { isAuthoritative: true },
          take: 1,
        },
        impactAssessments: {
          where: { isAuthoritative: true },
          take: 1,
        },
        clusterMemberships: {
          where: { isActive: true },
          include: {
            cluster: true,
          },
          take: 1,
        },
      },
    });

    // Also check for deterministic classification or AI assessments
    const classification = await this.prisma.failureClassification.findFirst({
      where: { failureCaseId, isAuthoritative: true },
    });

    const aiAssessment = await this.prisma.failureAiAssessment.findFirst({
      where: { failureCaseId, isAuthoritative: true },
    });

    // Evidence artifacts
    const evidenceRefs = fc.evidenceReferences.map(r => ({
      id: r.id,
      evidenceType: String(r.artifactType),
      filePath: r.storageIdentity ?? r.logicalName ?? '',
      mimeType: r.mimeType ?? 'application/octet-stream',
      sha256: r.sha256 ?? 'unknown',
      byteSize: r.byteSize ?? 0,
      metadataJson: r.metadataJson as Record<string, unknown> | null,
      createdAt: r.attachedAt,
    }));

    const anyTampered = fc.evidenceReferences.some(
      r => r.integrityStatus === 'CORRUPT' || r.integrityStatus === 'MISMATCH',
    );
    const allVerified =
      fc.evidenceReferences.length > 0 &&
      fc.evidenceReferences.every(r => r.integrityStatus === 'VERIFIED');
    const evidenceIntegrityStatus = anyTampered
      ? 'TAMPERED'
      : allVerified
        ? 'VERIFIED'
        : 'UNVERIFIED';

    const hasScreenshot = evidenceRefs.some(
      r => r.evidenceType === 'SCREENSHOT' || r.mimeType.startsWith('image/'),
    );
    const hasDomSnapshot = evidenceRefs.some(
      r => r.evidenceType === 'DOM_SNAPSHOT' || r.evidenceType === 'DOM',
    );
    const hasConsoleLogs = evidenceRefs.some(
      r => r.evidenceType === 'CONSOLE_LOGS' || r.evidenceType === 'CONSOLE',
    );
    const hasNetworkTrace = evidenceRefs.some(
      r => r.evidenceType === 'NETWORK_TRACE' || r.evidenceType === 'NETWORK',
    );
    const hasTraceArchive = evidenceRefs.some(
      r => r.evidenceType === 'TRACE_ARCHIVE' || r.evidenceType === 'TRACE',
    );

    // Reproduction
    const reproAttempts = fc.reproductionAttempts;
    const isReproduced = reproAttempts.some(a => a.status === 'REPRODUCED');
    const reproductionSuccessCount = reproAttempts.filter(a => a.status === 'REPRODUCED').length;

    // Flakiness
    const flakiness = fc.flakinessAnalyses[0];

    // Domain separation
    const domainSep = fc.domainSeparations[0];

    // Technical localization
    const localization = fc.technicalLocalizations[0];

    // Root cause
    const rootCause = fc.rootCauseAnalyses[0];

    // Impact
    const impact = fc.impactAssessments[0];

    // Cluster membership
    const clusterMem = fc.clusterMemberships[0];

    return {
      projectId: fc.projectId,
      failureCaseId: fc.id,
      failureAnalysisRunId: null,
      testCaseId: fc.testCaseId,
      testCaseTitle: fc.testCase?.title ?? 'Unknown Test Case',
      testRunId: fc.testRunId,
      executionId: fc.executionId,
      failureTitle: fc.title,
      failureSummary: fc.failureSummary,
      errorCode: fc.errorCode,
      errorMessage: fc.errorMessage,
      failureSignature: fc.failureSignature,
      caseStatus: fc.status,
      caseCreatedAt: fc.createdAt,
      caseUpdatedAt: fc.updatedAt,

      // Evidence
      evidenceCompleteness: fc.evidenceCompleteness,
      evidenceIntegrityStatus,
      evidenceReferences: evidenceRefs,
      hasScreenshot,
      hasDomSnapshot,
      hasConsoleLogs,
      hasNetworkTrace,
      hasTraceArchive,

      // Reproduction
      isReproduced,
      reproductionStatus: reproAttempts[0]?.status ?? null,
      reproductionSignature: reproAttempts[0]?.reproductionFailureSignature ?? null,
      reproductionAttempts: reproAttempts.length,
      reproductionSuccessCount,

      // Classification
      deterministicCategory: classification?.category ?? null,
      deterministicConfidence: classification ? 0.9 : null,
      classificationRationale: (classification?.matchedRuleIds as string[])?.join(', ') ?? null,
      decisionIntegrityPassed: true,
      integrityViolations: [],

      // Flakiness
      isFlaky:
        flakiness?.flakinessState === 'CONFIRMED_FLAKY' ||
        flakiness?.flakinessState === 'FLAKY_CANDIDATE',
      flakinessScore:
        flakiness?.reproducibilityRatio != null
          ? 1.0 - flakiness.reproducibilityRatio
          : flakiness
            ? 0.0
            : null,
      flakinessPattern: flakiness?.flakinessState ?? null,

      // Domain Separation
      failureDomain: domainSep?.domain ?? null,
      domainConfidence: domainSep ? 0.9 : null,
      domainIndicators: (domainSep?.matchedRuleIds as string[]) ?? [],

      // Localization
      suspectLayer: localization?.primaryLayer ?? null,
      localizedFilePath: localization?.matchedFilePath ?? null,
      localizedSymbol: localization?.matchedSymbolName ?? null,
      localizedStackTraceSnippet: null,
      localizedFileExistsInRepo: Boolean(localization?.matchedFilePath),

      // AI Reasoning
      aiCategory: aiAssessment?.aiCategory ?? null,
      aiSelfReportedConfidence: aiAssessment?.confidenceScore ?? null,
      aiCalibratedConfidence: aiAssessment?.confidenceScore ?? null,
      aiReasoningExplanation: aiAssessment?.primaryReasoning ?? null,
      aiAuditLog: [],

      // Root Cause
      rootCauseStatus: rootCause?.rootCauseStatus ?? null,
      probableLayer: rootCause?.probableLayer ?? null,
      probableComponent: rootCause?.probableComponent ?? null,
      probableCause: rootCause?.probableCause ?? null,
      rootCauseConfidenceReported: null,
      verifiedRepositoryReferences: (rootCause?.repositoryReferences as string[]) ?? [],

      // Impact
      severity: impact?.severity ?? null,
      priority: impact?.priority ?? null,
      impactDimensions: impact
        ? [
            {
              dimension: 'userImpact',
              score: 0.8,
              rationale: impact.functionalImpact,
            },
            {
              dimension: 'dataImpact',
              score: 0.5,
              rationale: impact.businessImpact,
            },
          ]
        : [],

      // Cluster
      clusterId: clusterMem?.clusterId ?? null,
      clusterKey: clusterMem?.cluster?.clusterKey ?? null,
      clusterSimilarityScore:
        clusterMem?.relationshipStrength === 'EXACT'
          ? 1.0
          : clusterMem?.relationshipStrength === 'STRONG'
            ? 0.8
            : 0.5,
      clusterActiveMemberCount: clusterMem?.cluster?.memberCount ?? 0,
      isClusterRepresentative: clusterMem?.isRepresentative ?? false,
    };
  }

  /**
   * Maps a Prisma ConfidenceAssessment entity to a ConfidenceAssessmentDto.
   */
  private mapAssessmentToDto(
    entity: any,
    isStale: boolean,
    stalenessReason?: string | null,
  ): ConfidenceAssessmentDto {
    return {
      id: entity.id,
      projectId: entity.projectId,
      failureCaseId: entity.failureCaseId,
      failureAnalysisRunId: entity.failureAnalysisRunId,
      revision: entity.revision,
      isAuthoritative: entity.isAuthoritative,
      supersededById: entity.supersededById,
      supersedesId: entity.supersedesId,
      overallConfidence: entity.overallConfidence,
      confidenceBand: entity.confidenceBand,
      classificationConfidence: entity.classificationConfidence,
      reproducibilityConfidence: entity.reproducibilityConfidence,
      rootCauseConfidence: entity.rootCauseConfidence,
      severityConfidence: entity.severityConfidence,
      duplicateConfidence: entity.duplicateConfidence,
      componentBreakdown:
        (entity.componentBreakdownJson as unknown as ConfidenceComponentScoreDto[]) ?? [],
      supportingFactors: (entity.supportingFactors as string[]) ?? [],
      penalties: (entity.penalties as string[]) ?? [],
      missingFactors: (entity.missingFactors as string[]) ?? [],
      contradictions: (entity.contradictions as string[]) ?? [],
      deterministicFacts: (entity.deterministicFacts as string[]) ?? [],
      aiInferences: (entity.aiInferences as string[]) ?? [],
      humanExplanation: entity.humanExplanation,
      confidenceFingerprint: entity.confidenceFingerprint,
      confidenceEngineVersion: entity.confidenceEngineVersion,
      scoringPolicyVersion: entity.scoringPolicyVersion,
      explanationVersion: entity.explanationVersion,
      isStale: isStale || entity.isStale,
      stalenessReason: stalenessReason ?? entity.stalenessReason,
      recalculationReason: entity.recalculationReason,
      assessedAt: entity.assessedAt,
      createdAt: entity.createdAt,
      attributions: entity.attributions
        ? entity.attributions.map((a: any) => ({
            id: a.id,
            confidenceAssessmentId: a.confidenceAssessmentId,
            projectId: a.projectId,
            failureCaseId: a.failureCaseId,
            conclusionType: a.conclusionType,
            conclusionValue: a.conclusionValue,
            evidenceReferenceId: a.evidenceReferenceId,
            evidenceType: a.evidenceType,
            relationship: a.relationship,
            supportStrength: a.supportStrength,
            sourceSubsystem: a.sourceSubsystem,
            reason: a.reason,
            epistemicType: a.epistemicType,
            canonicalEvidenceKey: a.canonicalEvidenceKey,
            createdAt: a.createdAt,
          }))
        : undefined,
    };
  }
}
