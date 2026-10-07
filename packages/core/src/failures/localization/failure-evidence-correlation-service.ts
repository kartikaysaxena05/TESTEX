/**
 * @file packages/core/src/failures/localization/failure-evidence-correlation-service.ts
 * Core domain service orchestrating Failure Evidence Correlation & Technical Cause Localization (V6 Phase 81).
 */

import type { PrismaClient } from '@prisma/client';
import {
  localizeTechnicalCauseInputSchema,
  getTechnicalLocalizationInputSchema,
  relocalizeTechnicalCauseInputSchema,
  listLocalizationHistoryInputSchema,
} from '@ai-quality/contracts';
import {
  LOCALIZATION_BOUNDS,
  type IFailureEvidenceCorrelationService,
  type FailureTechnicalLocalizationDto,
  type LocalizeTechnicalCauseInputDto,
  type GetTechnicalLocalizationInputDto,
  type RelocalizeTechnicalCauseInputDto,
  type ListLocalizationHistoryInputDto,
  type TechnicalLocalizationFacts,
  type LocalizationResult,
} from './localization-types.js';
import { LocalizationCrossProjectError } from './localization-errors.js';
import { FailureCaseNotFoundError } from '../failure-errors.js';
import { TimelineCorrelationBuilder } from './timeline-correlation-builder.js';
import { StepNetworkCorrelator } from './step-network-correlator.js';
import { RepositoryRouteLinker } from './repository-route-linker.js';
import { TechnicalCauseLocalizer } from './technical-cause-localizer.js';
import { generateLocalizationFingerprint } from './localization-fingerprint.js';
import type { IFailureDomainSeparationService } from '../separation/separation-types.js';

export class FailureEvidenceCorrelationService implements IFailureEvidenceCorrelationService {
  private readonly timelineBuilder = new TimelineCorrelationBuilder();
  private readonly networkCorrelator = new StepNetworkCorrelator();
  private readonly routeLinker = new RepositoryRouteLinker();
  private readonly localizer = new TechnicalCauseLocalizer(this.routeLinker);
  private readonly caseLocks = new Map<string, Promise<void>>();

  constructor(
    private readonly prisma: PrismaClient,
    private readonly domainSeparationService?: IFailureDomainSeparationService,
  ) {}

  /**
   * Serializes concurrent localization operations on the same failure case.
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
   * Localizes the technical cause of a failure case.
   */
  public async localizeTechnicalCause(
    input: LocalizeTechnicalCauseInputDto,
  ): Promise<FailureTechnicalLocalizationDto> {
    const validated = localizeTechnicalCauseInputSchema.parse(input);
    const lockKey = `${validated.projectId}:${validated.failureCaseId}`;

    return this.withLock(lockKey, async () => {
      return this.executeLocalization(validated.projectId, validated.failureCaseId);
    });
  }

  /**
   * Idempotent read returning the authoritative technical cause localization.
   */
  public async getTechnicalLocalization(
    input: GetTechnicalLocalizationInputDto,
  ): Promise<FailureTechnicalLocalizationDto | null> {
    const validated = getTechnicalLocalizationInputSchema.parse(input);

    const failureCase = await this.prisma.failureCase.findUnique({
      where: { id: validated.failureCaseId },
      select: { id: true, projectId: true },
    });

    if (!failureCase) {
      throw new FailureCaseNotFoundError(validated.failureCaseId, validated.projectId);
    }

    if (failureCase.projectId !== validated.projectId) {
      throw new LocalizationCrossProjectError(
        'FailureCase',
        validated.failureCaseId,
        validated.projectId,
      );
    }

    const record = await this.prisma.failureTechnicalLocalization.findFirst({
      where: {
        failureCaseId: validated.failureCaseId,
        projectId: validated.projectId,
        isAuthoritative: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!record) {
      return null;
    }

    // Dynamic staleness check:
    let isStale = record.isStale;
    let stalenessReason = record.stalenessReason;

    if (!isStale) {
      // 1. Check if newer evidence was ingested
      const newerEvidenceCount = await this.prisma.failureEvidenceReference.count({
        where: {
          failureCaseId: validated.failureCaseId,
          attachedAt: { gt: record.localizedAt },
        },
      });

      if (newerEvidenceCount > 0) {
        isStale = true;
        stalenessReason = `${newerEvidenceCount} new evidence artifact(s) ingested since localization.`;
      }

      // 2. Check if Phase 80 domain separation was updated
      const domainSep = await this.prisma.failureDomainSeparation.findFirst({
        where: {
          failureCaseId: validated.failureCaseId,
          isAuthoritative: true,
        },
        orderBy: { evaluatedAt: 'desc' },
      });

      if (domainSep && domainSep.evaluatedAt > record.localizedAt) {
        isStale = true;
        stalenessReason = 'Phase 80 Failure domain separation re-evaluated since localization.';
      }

      if (isStale) {
        await this.prisma.failureTechnicalLocalization.update({
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
   * Re-evaluates technical cause localization, creating a new authoritative record.
   */
  public async relocalizeTechnicalCause(
    input: RelocalizeTechnicalCauseInputDto,
  ): Promise<FailureTechnicalLocalizationDto> {
    const validated = relocalizeTechnicalCauseInputSchema.parse(input);
    const lockKey = `${validated.projectId}:${validated.failureCaseId}`;

    return this.withLock(lockKey, async () => {
      const existing = await this.prisma.failureTechnicalLocalization.findFirst({
        where: {
          failureCaseId: validated.failureCaseId,
          projectId: validated.projectId,
          isAuthoritative: true,
        },
        orderBy: { createdAt: 'desc' },
      });

      const nextRelocalizationCount = (existing?.relocalizationCount ?? 0) + 1;

      return this.executeLocalization(
        validated.projectId,
        validated.failureCaseId,
        nextRelocalizationCount,
        validated.relocalizationReason,
      );
    });
  }

  /**
   * Lists localization history for a failure case.
   */
  public async listLocalizationHistory(
    input: ListLocalizationHistoryInputDto,
  ): Promise<readonly FailureTechnicalLocalizationDto[]> {
    const validated = listLocalizationHistoryInputSchema.parse(input);

    const failureCase = await this.prisma.failureCase.findUnique({
      where: { id: validated.failureCaseId },
      select: { id: true, projectId: true },
    });

    if (!failureCase) {
      throw new FailureCaseNotFoundError(validated.failureCaseId, validated.projectId);
    }

    if (failureCase.projectId !== validated.projectId) {
      throw new LocalizationCrossProjectError(
        'FailureCase',
        validated.failureCaseId,
        validated.projectId,
      );
    }

    const records = await this.prisma.failureTechnicalLocalization.findMany({
      where: {
        failureCaseId: validated.failureCaseId,
        projectId: validated.projectId,
      },
      orderBy: { createdAt: 'desc' },
    });

    return records.map(r => this.mapToDto(r));
  }

  /**
   * Internal execution pipeline for localization.
   */
  private async executeLocalization(
    projectId: string,
    failureCaseId: string,
    relocalizationCount = 0,
    relocalizationReason?: string,
  ): Promise<FailureTechnicalLocalizationDto> {
    // 1. Fetch failure case and verify tenant boundary
    const failureCase = await this.prisma.failureCase.findUnique({
      where: { id: failureCaseId },
      include: {
        testCase: { select: { id: true, title: true } },
        stepExecution: true,
      },
    });

    if (!failureCase) {
      throw new FailureCaseNotFoundError(failureCaseId, projectId);
    }

    if (failureCase.projectId !== projectId) {
      throw new LocalizationCrossProjectError('FailureCase', failureCaseId, projectId);
    }

    // 2. Fetch authoritative Phase 80 domain separation
    let domainSeparation = await this.prisma.failureDomainSeparation.findFirst({
      where: { failureCaseId, projectId, isAuthoritative: true },
      orderBy: { evaluatedAt: 'desc' },
    });

    // If domain separation service is available and separation doesn't exist, trigger it
    if (!domainSeparation && this.domainSeparationService) {
      const sepDto = await this.domainSeparationService.separateFailureDomain({
        projectId,
        failureCaseId,
      });
      domainSeparation = await this.prisma.failureDomainSeparation.findUnique({
        where: { id: sepDto.id },
      });
    }

    // 3. Load Phase 75 evidence items
    const evidenceRefs = await this.prisma.failureEvidenceReference.findMany({
      where: { failureCaseId, projectId },
      orderBy: { attachedAt: 'asc' },
    });

    // 4. Load Step Execution Records
    const stepRecords = await this.prisma.stepExecutionRecord.findMany({
      where: { executionId: failureCase.executionId },
      orderBy: { stepIndex: 'asc' },
    });

    // 5. Load Phase 76 reproduction
    const reproduction = await this.prisma.failureReproductionAttempt.findFirst({
      where: { failureCaseId, projectId },
      orderBy: { attemptNumber: 'desc' },
    });

    // 6. Load Phase 77 classification
    const classification = await this.prisma.failureClassification.findFirst({
      where: { failureCaseId, projectId, isAuthoritative: true },
      orderBy: { createdAt: 'desc' },
    });

    // 7. Load scoped Repository Files & Symbols from V2
    const repositoryFiles = await this.prisma.repositoryFile.findMany({
      where: {
        source: {
          projectId,
        },
      },
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
      take: 200,
    });

    // 8. Assemble facts
    const facts: TechnicalLocalizationFacts = {
      projectId,
      failureCaseId,
      testCaseId: failureCase.testCaseId,
      testCaseTitle: failureCase.testCase.title,
      testRunId: failureCase.testRunId,
      executionId: failureCase.executionId,
      failureSummary: failureCase.failureSummary,
      errorCode: failureCase.errorCode,
      errorMessage: failureCase.errorMessage,
      failureSignature: failureCase.failureSignature,
      stepIndex: failureCase.stepIndex,
      failedStepAction: failureCase.stepExecution?.actionType ?? null,
      failedStepTarget:
        failureCase.stepExecution?.targetSummary ??
        ((failureCase.stepExecution?.actionDataJson as Record<string, unknown> | null)?.target as
          string | null) ??
        null,
      failedStepValue:
        ((failureCase.stepExecution?.actionDataJson as Record<string, unknown> | null)?.value as
          string | null) ?? null,

      domainSeparation: domainSeparation
        ? {
            id: domainSeparation.id,
            domain: domainSeparation.domain,
            domainSubreason: domainSeparation.domainSubreason,
            primaryRationale: domainSeparation.primaryRationale,
            isAuthoritative: domainSeparation.isAuthoritative,
            evaluatedAt: domainSeparation.evaluatedAt,
          }
        : null,

      evidenceItems: evidenceRefs.map(e => ({
        id: e.id,
        artifactType: e.artifactType,
        logicalName: e.artifactType.toLowerCase(),
        integrityStatus: 'VALID',
        sha256: null,
        metadataJson: (e.metadataJson as Record<string, unknown>) ?? {},
        storagePath: null,
        createdAt: e.attachedAt,
      })),

      reproduction: reproduction
        ? {
            id: reproduction.id,
            attemptNumber: reproduction.attemptNumber,
            status: reproduction.status,
            environmentEquivalence: reproduction.environmentEquivalence,
            isSignatureMatch: reproduction.isSignatureMatch,
          }
        : null,

      classification: classification
        ? {
            id: classification.id,
            category: classification.category,
            subcategory: classification.subcategory,
            primaryRuleId: classification.primaryRuleId,
          }
        : null,

      steps: stepRecords.map(s => {
        const actionData = (s.actionDataJson as Record<string, unknown> | null) ?? {};
        return {
          id: s.id,
          stepIndex: s.stepIndex,
          actionType: s.actionType,
          status: s.status,
          targetLocator: s.targetSummary ?? (actionData.target as string | null) ?? null,
          actionValue: (actionData.value as string | null) ?? null,
          errorMessage: s.errorMessage,
          startedAt: s.startedAt ?? s.createdAt,
          completedAt: s.completedAt,
          durationMs: s.durationMs,
        };
      }),

      repositoryFiles: repositoryFiles.map(rf => ({
        id: rf.id,
        relativePath: rf.relativePath,
        name: rf.name,
        classification: rf.classification,
        language: rf.language,
        symbols: rf.symbols.map(sym => ({
          id: sym.id,
          name: sym.name,
          kind: sym.kind,
          startLine: sym.startLine,
          endLine: sym.endLine,
        })),
      })),
    };

    // 9. Build chronological timeline
    const timeline = this.timelineBuilder.buildTimeline(facts);

    // 10. Correlate network activity
    const networkCorrelation = this.networkCorrelator.correlate(facts, timeline);

    // 11. Run deterministic technical cause localizer
    const result: LocalizationResult = this.localizer.localize(facts, timeline, networkCorrelation);

    // 12. Compute invariant cryptographic fingerprint
    const fingerprint = generateLocalizationFingerprint({
      failureCaseId,
      testCaseId: failureCase.testCaseId,
      primaryLayer: result.primaryLayer,
      secondaryLayers: result.secondaryLayers,
      primaryTargetType: result.primaryTargetType,
      primaryTargetIdentifier: result.primaryTargetIdentifier,
      matchedFilePath: result.matchedFilePath,
      matchedSymbolName: result.matchedSymbolName,
      httpEndpoint: result.httpEndpoint,
      httpMethod: result.httpMethod,
      httpStatusCode: result.httpStatusCode,
      domSelector: result.domSelector,
      correlationSignals: result.correlationSignals,
      evidenceReferences: result.evidenceReferences,
    });

    const now = new Date();

    // 13. Persist transactionally
    const persisted = await this.prisma.$transaction(async tx => {
      // Demote previous authoritative records
      await tx.failureTechnicalLocalization.updateMany({
        where: { failureCaseId, isAuthoritative: true },
        data: { isAuthoritative: false },
      });

      return tx.failureTechnicalLocalization.create({
        data: {
          projectId,
          failureCaseId,
          testCaseId: failureCase.testCaseId,
          failureAnalysisRunId: null,
          domainSeparationId: domainSeparation?.id ?? null,
          primaryLayer: result.primaryLayer,
          secondaryLayers: result.secondaryLayers as unknown as object,
          primaryTargetType: result.primaryTargetType,
          primaryTargetIdentifier: result.primaryTargetIdentifier.slice(
            0,
            LOCALIZATION_BOUNDS.MAX_TARGET_IDENTIFIER_LENGTH,
          ),
          secondaryTargets: result.secondaryTargets as unknown as object,
          repositoryFileId: result.repositoryFileId ?? null,
          repositorySymbolId: result.repositorySymbolId ?? null,
          matchedFilePath: result.matchedFilePath ?? null,
          matchedSymbolName: result.matchedSymbolName ?? null,
          matchedLineNumber: result.matchedLineNumber ?? null,
          httpEndpoint: result.httpEndpoint ?? null,
          httpMethod: result.httpMethod ?? null,
          httpStatusCode: result.httpStatusCode ?? null,
          domSelector: result.domSelector ?? null,
          uiComponentName: result.uiComponentName ?? null,
          routePath: result.routePath ?? null,
          timelineSummary: result.timelineSummary as unknown as object,
          correlationSignals: result.correlationSignals as unknown as object,
          conflictingSignals: result.conflictingSignals as unknown as object,
          localizationRationale: result.localizationRationale.slice(
            0,
            LOCALIZATION_BOUNDS.MAX_RATIONALE_LENGTH,
          ),
          evidenceReferences: result.evidenceReferences as unknown as object,
          localizationFingerprint: fingerprint,
          isAuthoritative: true,
          isStale: false,
          relocalizationCount,
          lastRelocalizedAt: relocalizationCount > 0 ? now : null,
          relocalizationReason: relocalizationReason ?? null,
          localizedAt: now,
        },
      });
    });

    return this.mapToDto(persisted);
  }

  /**
   * Maps a Prisma record to a contract DTO.
   */
  private mapToDto(
    record: Record<string, unknown> & {
      id: string;
      projectId: string;
      failureCaseId: string;
      testCaseId: string;
      failureAnalysisRunId?: string | null;
      domainSeparationId?: string | null;
      primaryLayer: unknown;
      secondaryLayers: unknown;
      primaryTargetType: unknown;
      primaryTargetIdentifier: string;
      secondaryTargets: unknown;
      repositoryFileId?: string | null;
      repositorySymbolId?: string | null;
      matchedFilePath?: string | null;
      matchedSymbolName?: string | null;
      matchedLineNumber?: number | null;
      httpEndpoint?: string | null;
      httpMethod?: string | null;
      httpStatusCode?: number | null;
      domSelector?: string | null;
      uiComponentName?: string | null;
      routePath?: string | null;
      timelineSummary: unknown;
      correlationSignals: unknown;
      conflictingSignals: unknown;
      localizationRationale: string;
      evidenceReferences: unknown;
      localizationFingerprint: string;
      isAuthoritative: boolean;
      isStale: boolean;
      stalenessReason?: string | null;
      relocalizationCount: number;
      lastRelocalizedAt?: Date | null;
      relocalizationReason?: string | null;
      localizedAt: Date;
      createdAt: Date;
      updatedAt: Date;
    },
  ): FailureTechnicalLocalizationDto {
    return {
      id: record.id,
      projectId: record.projectId,
      failureCaseId: record.failureCaseId,
      testCaseId: record.testCaseId,
      failureAnalysisRunId: record.failureAnalysisRunId ?? null,
      domainSeparationId: record.domainSeparationId ?? null,
      primaryLayer: record.primaryLayer as FailureTechnicalLocalizationDto['primaryLayer'],
      secondaryLayers:
        (record.secondaryLayers as FailureTechnicalLocalizationDto['secondaryLayers']) ?? [],
      primaryTargetType:
        record.primaryTargetType as FailureTechnicalLocalizationDto['primaryTargetType'],
      primaryTargetIdentifier: record.primaryTargetIdentifier,
      secondaryTargets:
        (record.secondaryTargets as FailureTechnicalLocalizationDto['secondaryTargets']) ?? [],
      repositoryFileId: record.repositoryFileId ?? null,
      repositorySymbolId: record.repositorySymbolId ?? null,
      matchedFilePath: record.matchedFilePath ?? null,
      matchedSymbolName: record.matchedSymbolName ?? null,
      matchedLineNumber: record.matchedLineNumber ?? null,
      httpEndpoint: record.httpEndpoint ?? null,
      httpMethod: record.httpMethod ?? null,
      httpStatusCode: record.httpStatusCode ?? null,
      domSelector: record.domSelector ?? null,
      uiComponentName: record.uiComponentName ?? null,
      routePath: record.routePath ?? null,
      timelineSummary:
        (record.timelineSummary as FailureTechnicalLocalizationDto['timelineSummary']) ?? [],
      correlationSignals:
        (record.correlationSignals as FailureTechnicalLocalizationDto['correlationSignals']) ?? [],
      conflictingSignals:
        (record.conflictingSignals as FailureTechnicalLocalizationDto['conflictingSignals']) ?? [],
      localizationRationale: record.localizationRationale,
      evidenceReferences: (record.evidenceReferences as string[]) ?? [],
      localizationFingerprint: record.localizationFingerprint,
      isAuthoritative: record.isAuthoritative,
      isStale: record.isStale,
      stalenessReason: record.stalenessReason ?? null,
      relocalizationCount: record.relocalizationCount,
      lastRelocalizedAt: record.lastRelocalizedAt?.toISOString() ?? null,
      relocalizationReason: record.relocalizationReason ?? null,
      localizedAt: record.localizedAt.toISOString(),
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    };
  }
}
