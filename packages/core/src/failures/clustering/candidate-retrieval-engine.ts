/**
 * @file packages/core/src/failures/clustering/candidate-retrieval-engine.ts
 * Candidate retrieval and fact extraction engine for V6 Phase 85 Defect Clustering.
 */

import type { PrismaClient } from '@prisma/client';
import { CLUSTERING_BOUNDS, type FailureComparisonFacts } from './clustering-types.js';

export class CandidateRetrievalEngine {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Loads normalized comparison facts for a single failure case.
   */
  public async loadFailureFacts(
    projectId: string,
    failureCaseId: string,
  ): Promise<FailureComparisonFacts | null> {
    const fc = await this.prisma.failureCase.findFirst({
      where: { id: failureCaseId, projectId },
      include: {
        testCase: {
          include: {
            requirementTraces: {
              include: {
                requirement: true,
              },
            },
          },
        },
        environment: true,
        stepExecution: true,
        evidenceReferences: {
          take: 10,
        },
        reproductionAttempts: {
          orderBy: { attemptNumber: 'desc' },
          take: 1,
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
      },
    });

    if (!fc) return null;

    return this.mapToFacts(fc);
  }

  /**
   * Retrieves candidate failure cases for a project, narrowed by scope and eligibility.
   */
  public async retrieveCandidates(
    projectId: string,
    specificFailureCaseIds?: readonly string[],
  ): Promise<FailureComparisonFacts[]> {
    const whereClause: Record<string, unknown> = {
      projectId,
      isEligible: true,
    };

    if (specificFailureCaseIds && specificFailureCaseIds.length > 0) {
      whereClause.id = { in: [...specificFailureCaseIds] };
    }

    const failureCases = await this.prisma.failureCase.findMany({
      where: whereClause,
      take: CLUSTERING_BOUNDS.MAX_CANDIDATES,
      orderBy: { createdAt: 'asc' },
      include: {
        testCase: {
          include: {
            requirementTraces: {
              include: {
                requirement: true,
              },
            },
          },
        },
        environment: true,
        stepExecution: true,
        evidenceReferences: {
          take: 10,
        },
        reproductionAttempts: {
          orderBy: { attemptNumber: 'desc' },
          take: 1,
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
      },
    });

    return failureCases.map(fc => this.mapToFacts(fc));
  }

  private mapToFacts(fc: any): FailureComparisonFacts {
    const primaryTrace = fc.testCase?.requirementTraces?.[0];
    const repro = fc.reproductionAttempts?.[0];
    const flakiness = fc.flakinessAnalyses?.[0];
    const domain = fc.domainSeparations?.[0];
    const localization = fc.technicalLocalizations?.[0];
    const rootCause = fc.rootCauseAnalyses?.[0];
    const impact = fc.impactAssessments?.[0];

    // Extract HTTP endpoint and status if present in metadata or evidence
    let httpEndpoint: string | null = null;
    let httpStatus: number | null = null;
    if (fc.metadataJson && typeof fc.metadataJson === 'object') {
      const meta = fc.metadataJson as Record<string, any>;
      httpEndpoint = meta.failingEndpoint || meta.httpEndpoint || meta.endpoint || null;
      httpStatus = typeof meta.httpStatus === 'number' ? meta.httpStatus : null;
    }
    if (!httpEndpoint && localization?.httpEndpoint) {
      httpEndpoint = localization.httpEndpoint;
    }
    if (!httpEndpoint && localization?.httpRoute) {
      httpEndpoint = localization.httpRoute;
    }
    if (!httpStatus && localization?.httpStatusCode) {
      httpStatus = localization.httpStatusCode;
    }

    const consoleErrors: string[] = [];
    if (fc.metadataJson && typeof fc.metadataJson === 'object') {
      const meta = fc.metadataJson as Record<string, any>;
      if (Array.isArray(meta.consoleErrors)) {
        consoleErrors.push(...meta.consoleErrors.map(String));
      }
    }

    const evidenceFingerprints: string[] = (fc.evidenceReferences || [])
      .map((e: any) => e.sha256 || e.sha256Hash)
      .filter(Boolean);

    return {
      failureCaseId: fc.id,
      projectId: fc.projectId,
      testCaseId: fc.testCaseId,
      testCaseTitle: fc.testCase?.title || 'Unknown Test Case',
      testRunId: fc.testRunId,
      executionId: fc.executionId,
      stepIndex: fc.stepIndex ?? null,
      stepAction: fc.stepExecution?.actionType ?? null,
      stepTarget:
        (fc.stepExecution as any)?.targetSelector ?? fc.stepExecution?.targetSummary ?? null,
      title: fc.title,
      failureSummary: fc.failureSummary ?? null,
      errorCode: fc.errorCode ?? null,
      errorMessage: fc.errorMessage ?? null,
      failureSignature: fc.failureSignature ?? null,
      evidenceCompleteness: fc.evidenceCompleteness ?? null,
      environmentId: fc.environmentId ?? null,
      environmentName: fc.environment?.name ?? null,
      appBuildVersion: fc.environment?.targetAppVersion ?? null,
      requirementId: primaryTrace?.requirementId ?? null,
      requirementKey: primaryTrace?.requirement?.key ?? null,

      failureDomain: domain?.domain ?? domain?.classificationDomain ?? null,
      domainConfidence: domain?.domain ? 1.0 : (domain?.confidenceScore ?? null),

      failureCategory: domain?.failureCategory ?? null,

      primarySuspectLayer: localization?.primaryLayer ?? localization?.primarySuspectLayer ?? null,
      localizedFilePath:
        localization?.matchedFilePath ??
        (localization?.primaryTargetType === 'REPOSITORY_FILE'
          ? localization?.primaryTargetIdentifier
          : null) ??
        localization?.probableSourceFile ??
        null,
      localizedSymbol:
        localization?.matchedSymbolName ??
        (localization?.primaryTargetType === 'REPOSITORY_SYMBOL'
          ? localization?.primaryTargetIdentifier
          : null) ??
        localization?.probableFunctionSymbol ??
        null,
      localizedStackTraceSnippet:
        localization?.localizationRationale ?? localization?.stackTraceSnippet ?? null,

      probableLayer: rootCause?.probableLayer ?? null,
      probableComponent: rootCause?.probableComponent ?? null,
      probableCause: rootCause?.probableCause ?? null,
      rootCauseStatus: rootCause?.rootCauseStatus ?? null,

      isReproduced:
        repro?.status === 'REPRODUCED' ||
        repro?.status === 'REPRODUCED_CONFIRMED' ||
        Boolean(repro?.reproduced),
      reproductionSignature: repro?.reproductionFailureSignature ?? repro?.failureSignature ?? null,

      isFlaky:
        repro?.status === 'FLAKY_INTERMITTENT' ||
        flakiness?.flakinessState === 'INTERMITTENT_FLAKY' ||
        Boolean(flakiness?.isFlaky),
      flakinessScore:
        flakiness?.reproducibilityRatio != null
          ? 1.0 - flakiness.reproducibilityRatio
          : (flakiness?.flakinessScore ?? null),

      severity: impact?.severity ?? null,
      priority: impact?.priority ?? null,

      failingHttpEndpoint: httpEndpoint,
      failingHttpStatus: httpStatus,
      consoleErrors,
      evidenceFingerprints,

      createdAt: fc.createdAt,
    };
  }
}
