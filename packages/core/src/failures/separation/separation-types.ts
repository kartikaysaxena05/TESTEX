/**
 * @file packages/core/src/failures/separation/separation-types.ts
 * Type definitions and contracts for Failure Domain Separation (V6 Phase 80).
 */

import type {
  FailureDomain,
  FailureDomainSeparationDto,
  SeparateFailureDomainInputDto,
  GetDomainSeparationInputDto,
  ReevaluateDomainSeparationInputDto,
  ListDomainSeparationHistoryInputDto,
} from '@ai-quality/contracts';

export type {
  FailureDomain,
  FailureDomainSeparationDto,
  SeparateFailureDomainInputDto,
  GetDomainSeparationInputDto,
  ReevaluateDomainSeparationInputDto,
  ListDomainSeparationHistoryInputDto,
};

export const SEPARATION_BOUNDS = {
  RULES_VERSION: '1.0.0',
  MAX_EXPLANATION_LENGTH: 4000,
  MAX_RATIONALE_LENGTH: 500,
} as const;

export interface DomainSeparationFacts {
  readonly projectId: string;
  readonly failureCaseId: string;
  readonly testCaseId: string;
  readonly testCaseTitle: string;
  readonly testCaseVersionNumber: number;
  readonly testRunId: string;
  readonly executionId: string;
  readonly failureSummary?: string | null;
  readonly errorCode?: string | null;
  readonly errorMessage?: string | null;
  readonly failureSignature?: string | null;
  readonly stepIndex?: number | null;

  // Phase 75 Evidence Facts
  readonly evidenceItems: readonly {
    readonly id: string;
    readonly artifactType: string;
    readonly logicalName: string;
    readonly integrityStatus: string;
    readonly sha256?: string | null;
    readonly metadataJson?: Record<string, unknown> | null;
  }[];

  // Phase 76 Reproduction Facts
  readonly reproduction?: {
    readonly id: string;
    readonly attemptNumber: number;
    readonly status: string;
    readonly environmentEquivalence: string;
    readonly isSignatureMatch?: boolean | null;
    readonly isFailedStepMatch?: boolean | null;
    readonly reproductionFailureSignature?: string | null;
    readonly blockerReason?: string | null;
  } | null;

  // Phase 77 Classification Facts
  readonly classification?: {
    readonly id: string;
    readonly category: string;
    readonly subcategory?: string | null;
    readonly primaryRuleId: string;
    readonly isAuthoritative: boolean;
  } | null;

  // Phase 78 Decision Integrity Facts
  readonly decisionIntegrity?: {
    readonly id: string;
    readonly decisionState: string;
    readonly evidenceFreshnessState: string;
    readonly consistencyState: string;
    readonly arbitrationState: string;
    readonly blockingReasons: readonly string[];
    readonly conflictDetails?: Record<string, unknown> | null;
  } | null;

  // Phase 79 Flakiness Facts
  readonly flakiness?: {
    readonly id: string;
    readonly flakinessState: string;
    readonly stabilityState: string;
    readonly flakinessScore?: number | null;
    readonly passRate?: number | null;
    readonly dominantFailureSignature?: string | null;
  } | null;

  // Execution Diagnostics
  readonly executionMetadata?: {
    readonly browserCrash?: boolean;
    readonly networkErrors?: readonly string[];
    readonly consoleErrors?: readonly string[];
    readonly assertionFailure?: {
      readonly expected?: string | null;
      readonly actual?: string | null;
      readonly operator?: string | null;
    } | null;
    readonly locatorFailure?: {
      readonly selector?: string | null;
      readonly isAmbiguous?: boolean;
      readonly isElementMissingInDom?: boolean;
    } | null;
    readonly timeoutDetails?: {
      readonly phase?: 'BROWSER' | 'NETWORK' | 'APPLICATION' | 'UNKNOWN';
      readonly durationMs?: number;
    } | null;
    readonly testDataProvenance?: {
      readonly fixtureName?: string | null;
      readonly isFixtureMissing?: boolean;
      readonly isCredentialInvalid?: boolean;
      readonly isPreconditionFailed?: boolean;
    } | null;
    readonly environmentDiagnostics?: {
      readonly isTargetUnreachable?: boolean;
      readonly isDnsFailure?: boolean;
      readonly isConfigMissing?: boolean;
      readonly isHealthCheckFailed?: boolean;
    } | null;
  } | null;
}

export interface DomainSeparationResult {
  readonly domain: FailureDomain;
  readonly domainSubreason?: string | null;
  readonly primaryRationale: string;
  readonly decisionExplanation: string;
  readonly matchedRuleIds: readonly string[];
  readonly excludedDomains: readonly FailureDomain[];
  readonly exclusionReasons: Record<string, string>;
  readonly conflictingSignals: readonly string[];
  readonly evidenceReferences: readonly string[];
  readonly reproductionSummary: Record<string, unknown>;
  readonly flakinessSummary: Record<string, unknown>;
}

export interface IFailureDomainSeparationService {
  separateFailureDomain(input: SeparateFailureDomainInputDto): Promise<FailureDomainSeparationDto>;
  getDomainSeparation(
    input: GetDomainSeparationInputDto,
  ): Promise<FailureDomainSeparationDto | null>;
  reevaluateDomainSeparation(
    input: ReevaluateDomainSeparationInputDto,
  ): Promise<FailureDomainSeparationDto>;
  listDomainSeparationHistory(
    input: ListDomainSeparationHistoryInputDto,
  ): Promise<readonly FailureDomainSeparationDto[]>;
}
