/**
 * @file packages/core/src/failures/impact/failure-impact-assessment-service.ts
 * Core domain service orchestrating Severity, Priority & Impact Intelligence (V6 Phase 84).
 */

import type { PrismaClient } from '@prisma/client';
import {
  assessImpactInputSchema,
  getImpactAssessmentInputSchema,
  reassessImpactInputSchema,
  listImpactHistoryInputSchema,
  type AssessImpactInputDto,
  type GetImpactAssessmentInputDto,
  type ReassessImpactInputDto,
  type ListImpactHistoryInputDto,
  type FailureImpactAssessmentDto,
  type ImpactSupportingEvidenceItemDto,
  type DefectSeverityDto,
  type DefectPriorityDto,
  type ReleaseRecommendationDto,
  type UserImpactScopeDto,
  type DataImpactDto,
  type SecurityImpactDto,
  type AvailabilityImpactDto,
  type BlastRadiusDto,
  type WorkaroundStatusDto,
} from '@ai-quality/contracts';
import {
  IMPACT_BOUNDS,
  type IFailureImpactAssessmentService,
  type ImpactRawFacts,
} from './impact-types.js';
import {
  ImpactAssessmentCrossProjectError,
  ImpactAssessmentBlockedError,
} from './impact-errors.js';
import { FailureCaseNotFoundError } from '../failure-errors.js';
import { SeverityRulesEngine } from './severity-rules-engine.js';
import { PriorityRulesEngine } from './priority-rules-engine.js';
import { ImpactDimensionAnalyzer } from './impact-dimension-analyzer.js';
import { generateImpactFingerprint, type ImpactFingerprintFacts } from './impact-fingerprint.js';

export class FailureImpactAssessmentService implements IFailureImpactAssessmentService {
  private readonly severityEngine: SeverityRulesEngine;
  private readonly priorityEngine: PriorityRulesEngine;
  private readonly impactAnalyzer: ImpactDimensionAnalyzer;
  private readonly caseLocks = new Map<string, Promise<void>>();

  constructor(
    private readonly prisma: PrismaClient,
    options: {
      severityEngine?: SeverityRulesEngine;
      priorityEngine?: PriorityRulesEngine;
      impactAnalyzer?: ImpactDimensionAnalyzer;
    } = {},
  ) {
    this.severityEngine = options.severityEngine ?? new SeverityRulesEngine();
    this.priorityEngine = options.priorityEngine ?? new PriorityRulesEngine();
    this.impactAnalyzer = options.impactAnalyzer ?? new ImpactDimensionAnalyzer();
  }

  /**
   * Serializes concurrent impact assessment operations on the same failure case.
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
   * Assesses severity, priority, and 9 impact dimensions for a failure case.
   */
  public async assessImpact(input: AssessImpactInputDto): Promise<FailureImpactAssessmentDto> {
    const validated = assessImpactInputSchema.parse(input);
    const lockKey = `${validated.projectId}:${validated.failureCaseId}`;

    return this.withLock(lockKey, async () => {
      return this.executeImpactAssessment({
        projectId: validated.projectId,
        failureCaseId: validated.failureCaseId,
        environmentOverride: validated.environmentOverride,
        releaseBlockingOverride: validated.releaseBlockingOverride,
        isReassessment: false,
      });
    });
  }

  /**
   * Retrieves current authoritative impact assessment with dynamic staleness check.
   */
  public async getImpactAssessment(
    input: GetImpactAssessmentInputDto,
  ): Promise<FailureImpactAssessmentDto | null> {
    const validated = getImpactAssessmentInputSchema.parse(input);

    const failureCase = await this.prisma.failureCase.findUnique({
      where: { id: validated.failureCaseId },
      select: { id: true, projectId: true },
    });

    if (!failureCase) {
      throw new FailureCaseNotFoundError(validated.failureCaseId, validated.projectId);
    }

    if (failureCase.projectId !== validated.projectId) {
      throw new ImpactAssessmentCrossProjectError();
    }

    const record = await this.prisma.failureImpactAssessment.findFirst({
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

    // Dynamic staleness check without full recomputation
    let isStale = record.isStale;
    let stalenessReason = record.stalenessReason;

    if (!isStale) {
      // 1. Check if newer evidence references were attached
      const newerEvidenceCount = await this.prisma.failureEvidenceReference.count({
        where: {
          failureCaseId: validated.failureCaseId,
          attachedAt: { gt: record.assessedAt },
        },
      });
      if (newerEvidenceCount > 0) {
        isStale = true;
        stalenessReason = `${newerEvidenceCount} new evidence artifact(s) attached since impact assessment.`;
      }

      // 2. Check if classification was updated
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
          stalenessReason = 'Deterministic failure classification updated since impact assessment.';
        }
      }

      // 3. Check if domain separation was re-evaluated
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
          stalenessReason = 'Failure domain separation updated since impact assessment.';
        }
      }

      // 4. Check if technical localization was updated
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
          stalenessReason = 'Technical localization updated since impact assessment.';
        }
      }

      // 5. Check if AI assessment was updated
      if (!isStale) {
        const newerAi = await this.prisma.failureAiAssessment.findFirst({
          where: {
            failureCaseId: validated.failureCaseId,
            isAuthoritative: true,
            assessedAt: { gt: record.assessedAt },
          },
        });
        if (newerAi) {
          isStale = true;
          stalenessReason = 'AI classification assessment updated since impact assessment.';
        }
      }

      // 6. Check if root-cause analysis was updated
      if (!isStale) {
        const newerRca = await this.prisma.failureRootCauseAnalysis.findFirst({
          where: {
            failureCaseId: validated.failureCaseId,
            isAuthoritative: true,
            analyzedAt: { gt: record.assessedAt },
          },
        });
        if (newerRca) {
          isStale = true;
          stalenessReason = 'Root-cause analysis updated since impact assessment.';
        }
      }

      if (isStale) {
        await this.prisma.failureImpactAssessment.update({
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
   * Reassesses an existing failure case with updated parameters and audit reason.
   */
  public async reassessImpact(input: ReassessImpactInputDto): Promise<FailureImpactAssessmentDto> {
    const validated = reassessImpactInputSchema.parse(input);
    const lockKey = `${validated.projectId}:${validated.failureCaseId}`;

    return this.withLock(lockKey, async () => {
      return this.executeImpactAssessment({
        projectId: validated.projectId,
        failureCaseId: validated.failureCaseId,
        reassessmentReason: validated.reassessmentReason,
        environmentOverride: validated.environmentOverride,
        releaseBlockingOverride: validated.releaseBlockingOverride,
        isReassessment: true,
      });
    });
  }

  /**
   * Lists all historical impact assessments for a failure case.
   */
  public async listImpactHistory(
    input: ListImpactHistoryInputDto,
  ): Promise<readonly FailureImpactAssessmentDto[]> {
    const validated = listImpactHistoryInputSchema.parse(input);

    const failureCase = await this.prisma.failureCase.findUnique({
      where: { id: validated.failureCaseId },
      select: { id: true, projectId: true },
    });

    if (!failureCase) {
      throw new FailureCaseNotFoundError(validated.failureCaseId, validated.projectId);
    }

    if (failureCase.projectId !== validated.projectId) {
      throw new ImpactAssessmentCrossProjectError();
    }

    const records = await this.prisma.failureImpactAssessment.findMany({
      where: {
        failureCaseId: validated.failureCaseId,
        projectId: validated.projectId,
      },
      orderBy: { createdAt: 'desc' },
    });

    return records.map(r => this.mapToDto(r));
  }

  // ---------------------------------------------------------------------------
  // Internal Execution
  // ---------------------------------------------------------------------------

  private async executeImpactAssessment(params: {
    projectId: string;
    failureCaseId: string;
    environmentOverride?: string | null;
    releaseBlockingOverride?: boolean | null;
    isReassessment: boolean;
    reassessmentReason?: string;
  }): Promise<FailureImpactAssessmentDto> {
    const {
      projectId,
      failureCaseId,
      environmentOverride,
      releaseBlockingOverride,
      isReassessment,
      reassessmentReason,
    } = params;

    // 1. Fetch failure case and verify project isolation
    const failureCase = await this.prisma.failureCase.findUnique({
      where: { id: failureCaseId },
      include: {
        testCase: {
          select: {
            id: true,
            title: true,
            priority: true,
            sourceRequirementId: true,
          },
        },
      },
    });

    if (!failureCase) {
      throw new FailureCaseNotFoundError(failureCaseId, projectId);
    }

    if (failureCase.projectId !== projectId) {
      throw new ImpactAssessmentCrossProjectError();
    }

    // Check eligibility
    if (!failureCase.isEligible) {
      throw new ImpactAssessmentBlockedError(
        failureCase.ineligibilityReason ??
          'Failure case marked ineligible for failure intelligence.',
        failureCaseId,
      );
    }

    // 2. Fetch execution record
    const execution = await this.prisma.testCaseExecution.findUnique({
      where: { id: failureCase.executionId },
      select: {
        id: true,
        browserEngine: true,
        status: true,
        errorMessage: true,
        environmentSnapshotJson: true,
      },
    });

    // 3. Fetch requirement metadata if available
    let requirement: {
      id: string;
      requirementKey: string;
      title: string;
      criticality?: string | null;
    } | null = null;
    if (failureCase.testCase?.sourceRequirementId) {
      requirement = await this.prisma.requirement.findUnique({
        where: { id: failureCase.testCase.sourceRequirementId },
        select: {
          id: true,
          requirementKey: true,
          title: true,
        },
      });
    }

    // 4. Fetch upstream pipeline artifacts
    const [
      deterministicClassification,
      domainSeparation,
      technicalLocalization,
      aiAssessment,
      rootCauseAnalysis,
      reproductionAttempt,
      flakinessAnalysis,
      evidenceRefs,
    ] = await Promise.all([
      this.prisma.failureClassification.findFirst({
        where: { failureCaseId, projectId, isAuthoritative: true },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.failureDomainSeparation.findFirst({
        where: { failureCaseId, projectId, isAuthoritative: true },
        orderBy: { evaluatedAt: 'desc' },
      }),
      this.prisma.failureTechnicalLocalization.findFirst({
        where: { failureCaseId, projectId, isAuthoritative: true },
        orderBy: { localizedAt: 'desc' },
      }),
      this.prisma.failureAiAssessment.findFirst({
        where: { failureCaseId, projectId, isAuthoritative: true },
        orderBy: { assessedAt: 'desc' },
      }),
      this.prisma.failureRootCauseAnalysis.findFirst({
        where: { failureCaseId, projectId, isAuthoritative: true },
        orderBy: { analyzedAt: 'desc' },
      }),
      this.prisma.failureReproductionAttempt.findFirst({
        where: { failureCaseId, projectId },
        orderBy: { attemptNumber: 'desc' },
      }),
      this.prisma.flakinessAnalysis.findFirst({
        where: { failureCaseId, projectId },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.failureEvidenceReference.findMany({
        where: { failureCaseId, projectId },
        include: { sourceArtifact: true },
        orderBy: { attachedAt: 'asc' },
      }),
    ]);

    // 5. Parse evidence facts
    const consoleErrorSnippets: string[] = [];
    const failedHttpEndpoints: Array<{ url: string; method?: string; statusCode?: number }> = [];
    let hasDomSnapshot = false;
    const evidenceArtifactHashes: string[] = [];
    const evidenceItemReferences: Array<{
      id: string;
      type: string;
      logicalName: string;
      sha256?: string | null;
    }> = [];

    for (const ref of evidenceRefs) {
      if (ref.sha256) {
        evidenceArtifactHashes.push(ref.sha256);
      }
      evidenceItemReferences.push({
        id: ref.id,
        type: ref.artifactType,
        logicalName: ref.logicalName,
        sha256: ref.sha256,
      });

      const meta = (ref.metadataJson as Record<string, unknown>) ?? {};
      if (ref.artifactType === 'CONSOLE_LOG') {
        const messages = Array.isArray(meta.messages)
          ? (meta.messages as Array<Record<string, unknown>>)
          : [];
        for (const m of messages) {
          if (m.type === 'error' || m.level === 'error' || m.text) {
            consoleErrorSnippets.push(String(m.text || m.message || ''));
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
            failedHttpEndpoints.push({
              url: String(req.url || req.endpoint || ''),
              method: typeof req.method === 'string' ? req.method : undefined,
              statusCode: Number.isFinite(status) ? status : undefined,
            });
          }
        }
      } else if (ref.artifactType === 'DOM_SNAPSHOT') {
        hasDomSnapshot = true;
      }
    }

    const envSnapshot = (execution?.environmentSnapshotJson as Record<string, unknown>) ?? {};
    const environmentType =
      environmentOverride ??
      (typeof envSnapshot.environmentType === 'string'
        ? envSnapshot.environmentType
        : typeof envSnapshot.env === 'string'
          ? envSnapshot.env
          : 'TEST');

    // Check repository intelligence availability
    const repositoryFilesCount = await this.prisma.repositoryFile.count({
      where: { source: { projectId } },
    });
    const repositoryContextAvailable = repositoryFilesCount > 0;

    // 6. Build Raw Impact Facts
    const facts: ImpactRawFacts = {
      projectId,
      failureCaseId,
      testCaseId: failureCase.testCaseId,
      testCaseVersionNumber: failureCase.testCaseVersionNumber,

      failureTitle: failureCase.title,
      failureErrorMessage: failureCase.errorMessage,
      executionStatus: execution?.status,
      executionErrorMessage: execution?.errorMessage,
      browserEngine: execution?.browserEngine,
      environmentType,

      testCaseTitle: failureCase.testCase?.title ?? 'Test Case',
      testCasePriority: failureCase.testCase?.priority,
      requirementId: requirement?.id ?? null,
      requirementKey: requirement?.requirementKey ?? null,
      requirementTitle: requirement?.title ?? null,
      requirementCriticality: requirement?.criticality ?? null,

      evidenceArtifactCount: evidenceRefs.length,
      hasConsoleErrors: consoleErrorSnippets.length > 0,
      consoleErrorSnippets,
      hasNetworkFailures: failedHttpEndpoints.length > 0,
      failedHttpEndpoints,
      hasDomSnapshot,
      evidenceItemReferences,

      isReproductionAttempted: Boolean(reproductionAttempt),
      isReproducible: reproductionAttempt
        ? String(reproductionAttempt.status).includes('REPRODUCED')
        : null,
      reproductionRate:
        flakinessAnalysis?.reproducibilityRatio ??
        (reproductionAttempt && String(reproductionAttempt.status).includes('REPRODUCED')
          ? 1.0
          : null),
      reproductionEnvironmentDrift: reproductionAttempt
        ? reproductionAttempt.environmentEquivalence === 'DRIFTED'
        : null,

      classificationCategory: deterministicClassification?.category ?? null,
      classificationRuleId: deterministicClassification?.primaryRuleId ?? null,
      isIntegrityBlocked: null,

      isFlaky: flakinessAnalysis ? String(flakinessAnalysis.flakinessState) === 'FLAKY' : null,
      flakinessScore:
        flakinessAnalysis?.reproducibilityRatio != null
          ? 1 - flakinessAnalysis.reproducibilityRatio
          : null,

      domain: domainSeparation?.domain ?? null,
      domainSubreason: domainSeparation?.domainSubreason ?? null,

      technicalLayer: technicalLocalization?.primaryLayer ?? null,
      technicalTargetType: technicalLocalization?.primaryTargetType ?? null,
      technicalTargetIdentifier: technicalLocalization?.primaryTargetIdentifier ?? null,
      matchedFilePath: technicalLocalization?.matchedFilePath ?? null,
      httpStatusCode: technicalLocalization?.httpStatusCode ?? null,
      httpEndpoint: technicalLocalization?.httpEndpoint ?? null,

      aiCategory: aiAssessment?.aiCategory ?? null,
      aiConfidenceLevel: aiAssessment?.confidenceLevel ?? null,
      aiAgreementState: aiAssessment?.agreementState ?? null,

      rootCauseStatus: rootCauseAnalysis?.rootCauseStatus ?? null,
      rootCauseProbableLayer: rootCauseAnalysis?.probableLayer ?? null,
      rootCauseProbableComponent: rootCauseAnalysis?.probableComponent ?? null,
      rootCauseProbableCause: rootCauseAnalysis?.probableCause ?? null,
      repositoryContextAvailable,

      environmentOverride: environmentOverride ?? null,
      releaseBlockingOverride: releaseBlockingOverride ?? null,
    };

    // 7. Deterministic Severity Evaluation
    const severityEval = this.severityEngine.evaluate(facts);

    // 8. Deterministic Priority Evaluation (independent urgency)
    const priorityEval = this.priorityEngine.evaluate(facts, severityEval.severity);

    // 9. 9-Dimensional Impact Analysis
    const impactEval = this.impactAnalyzer.analyze(
      facts,
      severityEval.severity,
      priorityEval.priority,
    );

    // 10. Generate Invariant Fingerprint
    const fingerprintFacts: ImpactFingerprintFacts = {
      projectId,
      failureCaseId,
      testCaseId: failureCase.testCaseId,
      testCaseVersionNumber: failureCase.testCaseVersionNumber,
      severity: severityEval.severity,
      severityRuleId: severityEval.ruleId,
      priority: priorityEval.priority,
      priorityRuleId: priorityEval.ruleId,
      releaseRecommendation: impactEval.releaseRecommendation,
      userImpact: impactEval.userImpact,
      dataImpact: impactEval.dataImpact,
      securityImpact: impactEval.securityImpact,
      availabilityImpact: impactEval.availabilityImpact,
      blastRadius: impactEval.blastRadius,
      workaroundStatus: impactEval.workaroundStatus,
      domain: facts.domain,
      technicalLayer: facts.technicalLayer,
      rootCauseStatus: facts.rootCauseStatus,
      rootCauseProbableLayer: facts.rootCauseProbableLayer,
      evidenceArtifactHashes,
      severityModelVersion: IMPACT_BOUNDS.SEVERITY_MODEL_VERSION,
      priorityModelVersion: IMPACT_BOUNDS.PRIORITY_MODEL_VERSION,
      impactModelVersion: IMPACT_BOUNDS.IMPACT_MODEL_VERSION,
    };
    const fingerprint = generateImpactFingerprint(fingerprintFacts);

    // 11. Transactional Database Persistence
    const existingAuthoritative = await this.prisma.failureImpactAssessment.findFirst({
      where: { failureCaseId, projectId, isAuthoritative: true },
      orderBy: { assessedAt: 'desc' },
    });

    const newAssessment = await this.prisma.$transaction(async tx => {
      let previousRecordId: string | undefined;

      if (existingAuthoritative) {
        previousRecordId = existingAuthoritative.id;
        await tx.failureImpactAssessment.update({
          where: { id: existingAuthoritative.id },
          data: { isAuthoritative: false },
        });
      }

      const created = await tx.failureImpactAssessment.create({
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
          rootCauseAnalysisId: rootCauseAnalysis?.id,

          severity: severityEval.severity as any,
          severityRuleId: severityEval.ruleId,
          severityRationale: severityEval.rationale,
          severityReasons: [...severityEval.reasons] as any,

          priority: priorityEval.priority as any,
          priorityRuleId: priorityEval.ruleId,
          priorityRationale: priorityEval.rationale,
          priorityReasons: [...priorityEval.reasons] as any,

          releaseRecommendation: impactEval.releaseRecommendation as any,
          releaseRecommendationRationale: impactEval.releaseRecommendationRationale,

          userImpact: impactEval.userImpact as any,
          userImpactDetails: impactEval.userImpactDetails ?? null,
          functionalImpact: impactEval.functionalImpact,
          businessImpact: impactEval.businessImpact,
          businessCriticality: impactEval.businessCriticality,
          dataImpact: impactEval.dataImpact as any,
          dataImpactDetails: impactEval.dataImpactDetails ?? null,
          securityImpact: impactEval.securityImpact as any,
          securityImpactDetails: impactEval.securityImpactDetails ?? null,
          availabilityImpact: impactEval.availabilityImpact as any,
          integrationImpact: impactEval.integrationImpact,
          blastRadius: impactEval.blastRadius as any,
          workaroundStatus: impactEval.workaroundStatus as any,
          workaroundDetails: impactEval.workaroundDetails ?? null,

          supportingEvidence: severityEval.supportingEvidence as any,
          conflictingSignals: [...impactEval.conflictingSignals] as any,
          unknownFactors: [...impactEval.unknownFactors] as any,

          severityModelVersion: IMPACT_BOUNDS.SEVERITY_MODEL_VERSION,
          priorityModelVersion: IMPACT_BOUNDS.PRIORITY_MODEL_VERSION,
          impactModelVersion: IMPACT_BOUNDS.IMPACT_MODEL_VERSION,
          assessmentFingerprint: fingerprint,

          isAuthoritative: true,
          isStale: false,
          stalenessReason: null,
          reassessmentCount: isReassessment
            ? (existingAuthoritative?.reassessmentCount ?? 0) + 1
            : 0,
          lastReassessedAt: isReassessment ? new Date() : null,
          reassessmentReason: isReassessment ? (reassessmentReason ?? null) : null,
          supersededById: null,
        },
      });

      if (previousRecordId) {
        await tx.failureImpactAssessment.update({
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
    rootCauseAnalysisId: string | null;

    severity: unknown;
    severityRuleId: string;
    severityRationale: string;
    severityReasons: unknown;

    priority: unknown;
    priorityRuleId: string;
    priorityRationale: string;
    priorityReasons: unknown;

    releaseRecommendation: unknown;
    releaseRecommendationRationale: string;

    userImpact: unknown;
    userImpactDetails: string | null;
    functionalImpact: string;
    businessImpact: string;
    businessCriticality: string;
    dataImpact: unknown;
    dataImpactDetails: string | null;
    securityImpact: unknown;
    securityImpactDetails: string | null;
    availabilityImpact: unknown;
    integrationImpact: string;
    blastRadius: unknown;
    workaroundStatus: unknown;
    workaroundDetails: string | null;

    supportingEvidence: unknown;
    conflictingSignals: unknown;
    unknownFactors: unknown;

    severityModelVersion: string;
    priorityModelVersion: string;
    impactModelVersion: string;
    assessmentFingerprint: string;

    isAuthoritative: boolean;
    isStale: boolean;
    stalenessReason: string | null;
    reassessmentCount: number;
    lastReassessedAt: Date | null;
    reassessmentReason: string | null;
    supersededById: string | null;

    assessedAt: Date;
    createdAt: Date;
    updatedAt: Date;
  }): FailureImpactAssessmentDto {
    const parseArray = <T>(val: unknown): T[] => {
      if (Array.isArray(val)) return [...val] as T[];
      if (typeof val === 'string') {
        try {
          const parsed = JSON.parse(val);
          return Array.isArray(parsed) ? [...parsed] : [];
        } catch {
          return [];
        }
      }
      return [];
    };

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
      rootCauseAnalysisId: record.rootCauseAnalysisId,

      severity: record.severity as DefectSeverityDto,
      severityRuleId: record.severityRuleId,
      severityRationale: record.severityRationale,
      severityReasons: parseArray<string>(record.severityReasons),

      priority: record.priority as DefectPriorityDto,
      priorityRuleId: record.priorityRuleId,
      priorityRationale: record.priorityRationale,
      priorityReasons: parseArray<string>(record.priorityReasons),

      releaseRecommendation: record.releaseRecommendation as ReleaseRecommendationDto,
      releaseRecommendationRationale: record.releaseRecommendationRationale,

      userImpact: record.userImpact as UserImpactScopeDto,
      userImpactDetails: record.userImpactDetails,
      functionalImpact: record.functionalImpact,
      businessImpact: record.businessImpact,
      businessCriticality: record.businessCriticality,
      dataImpact: record.dataImpact as DataImpactDto,
      dataImpactDetails: record.dataImpactDetails,
      securityImpact: record.securityImpact as SecurityImpactDto,
      securityImpactDetails: record.securityImpactDetails,
      availabilityImpact: record.availabilityImpact as AvailabilityImpactDto,
      integrationImpact: record.integrationImpact,
      blastRadius: record.blastRadius as BlastRadiusDto,
      workaroundStatus: record.workaroundStatus as WorkaroundStatusDto,
      workaroundDetails: record.workaroundDetails,

      supportingEvidence: parseArray<ImpactSupportingEvidenceItemDto>(record.supportingEvidence),
      conflictingSignals: parseArray<string>(record.conflictingSignals),
      unknownFactors: parseArray<string>(record.unknownFactors),

      severityModelVersion: record.severityModelVersion,
      priorityModelVersion: record.priorityModelVersion,
      impactModelVersion: record.impactModelVersion,
      assessmentFingerprint: record.assessmentFingerprint,

      isAuthoritative: record.isAuthoritative,
      isStale: record.isStale,
      stalenessReason: record.stalenessReason,
      reassessmentCount: record.reassessmentCount,
      lastReassessedAt: record.lastReassessedAt?.toISOString() ?? null,
      reassessmentReason: record.reassessmentReason,
      supersededById: record.supersededById,

      assessedAt: record.assessedAt.toISOString(),
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    };
  }
}
