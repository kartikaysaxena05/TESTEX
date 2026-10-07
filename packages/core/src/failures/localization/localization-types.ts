/**
 * @file packages/core/src/failures/localization/localization-types.ts
 * Type definitions and contracts for Failure Evidence Correlation & Technical Cause Localization (V6 Phase 81).
 */

import type {
  TechnicalLayer,
  LocalizationTargetType,
  SignalStrength,
  TimelineEventType,
  TimelineEventDto,
  CorrelationSignalDto,
  SecondaryTargetDto,
  FailureTechnicalLocalizationDto,
  LocalizeTechnicalCauseInputDto,
  GetTechnicalLocalizationInputDto,
  RelocalizeTechnicalCauseInputDto,
  ListLocalizationHistoryInputDto,
} from '@ai-quality/contracts';

export type {
  TechnicalLayer,
  LocalizationTargetType,
  SignalStrength,
  TimelineEventType,
  TimelineEventDto,
  CorrelationSignalDto,
  SecondaryTargetDto,
  FailureTechnicalLocalizationDto,
  LocalizeTechnicalCauseInputDto,
  GetTechnicalLocalizationInputDto,
  RelocalizeTechnicalCauseInputDto,
  ListLocalizationHistoryInputDto,
};

export const LOCALIZATION_BOUNDS = {
  VERSION: '1.0.0',
  MAX_RATIONALE_LENGTH: 4000,
  MAX_SIGNALS: 100,
  MAX_TIMELINE_EVENTS: 500,
  MAX_TARGET_IDENTIFIER_LENGTH: 512,
} as const;

export interface TechnicalLocalizationFacts {
  readonly projectId: string;
  readonly failureCaseId: string;
  readonly testCaseId: string;
  readonly testCaseTitle: string;
  readonly testRunId: string;
  readonly executionId: string;
  readonly failureSummary?: string | null;
  readonly errorCode?: string | null;
  readonly errorMessage?: string | null;
  readonly failureSignature?: string | null;
  readonly stepIndex?: number | null;
  readonly failedStepAction?: string | null;
  readonly failedStepTarget?: string | null;
  readonly failedStepValue?: string | null;

  // Phase 80 Domain Separation Facts (Authoritative)
  readonly domainSeparation?: {
    readonly id: string;
    readonly domain: string;
    readonly domainSubreason?: string | null;
    readonly primaryRationale: string;
    readonly isAuthoritative: boolean;
    readonly evaluatedAt: Date;
  } | null;

  // Phase 75 Evidence Facts
  readonly evidenceItems: readonly {
    readonly id: string;
    readonly artifactType: string;
    readonly logicalName: string;
    readonly integrityStatus: string;
    readonly sha256?: string | null;
    readonly metadataJson?: Record<string, unknown> | null;
    readonly storagePath?: string | null;
    readonly createdAt: Date;
  }[];

  // Phase 76 Reproduction Facts
  readonly reproduction?: {
    readonly id: string;
    readonly attemptNumber: number;
    readonly status: string;
    readonly environmentEquivalence: string;
    readonly isSignatureMatch?: boolean | null;
  } | null;

  // Phase 77 & 78 Classification Facts
  readonly classification?: {
    readonly id: string;
    readonly category: string;
    readonly subcategory?: string | null;
    readonly primaryRuleId: string;
  } | null;

  // Step Execution Records from V5
  readonly steps: readonly {
    readonly id: string;
    readonly stepIndex: number;
    readonly actionType: string;
    readonly status: string;
    readonly targetLocator?: string | null;
    readonly actionValue?: string | null;
    readonly errorMessage?: string | null;
    readonly startedAt?: Date | null;
    readonly completedAt?: Date | null;
    readonly durationMs?: number | null;
  }[];

  // Indexed Repository Files & Symbols from V2 (scoped to this project)
  readonly repositoryFiles: readonly {
    readonly id: string;
    readonly relativePath: string;
    readonly name: string;
    readonly classification: string;
    readonly language?: string | null;
    readonly symbols: readonly {
      readonly id: string;
      readonly name: string;
      readonly kind: string;
      readonly startLine: number;
      readonly endLine: number;
    }[];
  }[];
}

export interface LocalizationResult {
  readonly primaryLayer: TechnicalLayer;
  readonly secondaryLayers: readonly TechnicalLayer[];
  readonly primaryTargetType: LocalizationTargetType;
  readonly primaryTargetIdentifier: string;
  readonly secondaryTargets: readonly SecondaryTargetDto[];
  readonly repositoryFileId?: string | null;
  readonly repositorySymbolId?: string | null;
  readonly matchedFilePath?: string | null;
  readonly matchedSymbolName?: string | null;
  readonly matchedLineNumber?: number | null;
  readonly httpEndpoint?: string | null;
  readonly httpMethod?: string | null;
  readonly httpStatusCode?: number | null;
  readonly domSelector?: string | null;
  readonly uiComponentName?: string | null;
  readonly routePath?: string | null;
  readonly timelineSummary: readonly TimelineEventDto[];
  readonly correlationSignals: readonly CorrelationSignalDto[];
  readonly conflictingSignals: readonly CorrelationSignalDto[];
  readonly localizationRationale: string;
  readonly evidenceReferences: readonly string[];
}

export interface IFailureEvidenceCorrelationService {
  localizeTechnicalCause(
    input: LocalizeTechnicalCauseInputDto,
  ): Promise<FailureTechnicalLocalizationDto>;
  getTechnicalLocalization(
    input: GetTechnicalLocalizationInputDto,
  ): Promise<FailureTechnicalLocalizationDto | null>;
  relocalizeTechnicalCause(
    input: RelocalizeTechnicalCauseInputDto,
  ): Promise<FailureTechnicalLocalizationDto>;
  listLocalizationHistory(
    input: ListLocalizationHistoryInputDto,
  ): Promise<readonly FailureTechnicalLocalizationDto[]>;
}
