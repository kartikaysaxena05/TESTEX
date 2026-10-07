/**
 * @file packages/core/src/failures/clustering/clustering-types.ts
 * Type definitions and contracts for V6 Phase 85: Duplicate Failure Detection & Defect Clustering.
 */

import type {
  DefectClusterDto,
  DefectClusterMembershipDto,
  DefectClusterHistoryDto,
  DuplicateComparisonResultDto,
  CompareDuplicatesInputDto,
  ClusterDefectsInputDto,
  GetClusterInputDto,
  ListClustersInputDto,
  GetFailureMembershipInputDto,
  MergeClustersInputDto,
  SplitClusterInputDto,
  OverrideMembershipInputDto,
  ListClusterHistoryInputDto,
  DuplicateRelationshipTypeDto,
  ClusterRelationshipStrengthDto,
  MatchedSignalItemDto,
  ContradictorySignalItemDto,
} from '@ai-quality/contracts';

/**
 * Bounds and thresholds for clustering and similarity analysis.
 */
export const CLUSTERING_BOUNDS = {
  MAX_CANDIDATES: 500,
  MAX_ACTIVE_MEMBERS_PER_CLUSTER: 200,
  MAX_EXPLANATION_LENGTH: 4000,
  MAX_SIGNAL_NAME_LENGTH: 64,
  EXACT_DUPLICATE_THRESHOLD: 0.95,
  PROBABLE_DUPLICATE_THRESHOLD: 0.8,
  RELATED_FAILURE_THRESHOLD: 0.5,
  DISTINCT_FAILURE_CEILING: 0.35,
} as const;

/**
 * Normalized facts representing a single failure case used during pairwise comparison.
 */
export interface FailureComparisonFacts {
  readonly failureCaseId: string;
  readonly projectId: string;
  readonly testCaseId: string;
  readonly testCaseTitle: string;
  readonly testRunId: string;
  readonly executionId: string;
  readonly stepIndex: number | null;
  readonly stepAction: string | null;
  readonly stepTarget: string | null;
  readonly title: string;
  readonly failureSummary: string | null;
  readonly errorCode: string | null;
  readonly errorMessage: string | null;
  readonly failureSignature: string | null;
  readonly evidenceCompleteness: string | null;
  readonly environmentId: string | null;
  readonly environmentName: string | null;
  readonly appBuildVersion: string | null;
  readonly requirementId: string | null;
  readonly requirementKey: string | null;

  // Domain Separation (Phase 80)
  readonly failureDomain: string | null;
  readonly domainConfidence: number | null;

  // Deterministic Classification (Phase 77/78)
  readonly failureCategory: string | null;

  // Technical Localization (Phase 81)
  readonly primarySuspectLayer: string | null;
  readonly localizedFilePath: string | null;
  readonly localizedSymbol: string | null;
  readonly localizedStackTraceSnippet: string | null;

  // Root-Cause Analysis (Phase 83)
  readonly probableLayer: string | null;
  readonly probableComponent: string | null;
  readonly probableCause: string | null;
  readonly rootCauseStatus: string | null;

  // Reproduction (Phase 76)
  readonly isReproduced: boolean;
  readonly reproductionSignature: string | null;

  // Flakiness (Phase 79)
  readonly isFlaky: boolean;
  readonly flakinessScore: number | null;

  // Severity & Impact (Phase 84)
  readonly severity: string | null;
  readonly priority: string | null;

  // Network & Telemetry (Phase 75)
  readonly failingHttpEndpoint: string | null;
  readonly failingHttpStatus: number | null;
  readonly consoleErrors: readonly string[];
  readonly evidenceFingerprints: readonly string[];

  readonly createdAt: Date;
}

/**
 * Result of pairwise failure comparison.
 */
export interface DuplicateComparisonEvaluation {
  readonly relationshipType: DuplicateRelationshipTypeDto;
  readonly relationshipStrength: ClusterRelationshipStrengthDto;
  readonly similarityScore: number;
  readonly matchedSignals: readonly MatchedSignalItemDto[];
  readonly contradictorySignals: readonly ContradictorySignalItemDto[];
  readonly explanation: string;
}

/**
 * Service interface for Defect Clustering & Duplicate Detection.
 */
export interface IDefectClusteringService {
  compareDuplicates(input: CompareDuplicatesInputDto): Promise<DuplicateComparisonResultDto>;
  clusterDefects(input: ClusterDefectsInputDto): Promise<readonly DefectClusterDto[]>;
  getCluster(input: GetClusterInputDto): Promise<DefectClusterDto | null>;
  listClusters(input: ListClustersInputDto): Promise<readonly DefectClusterDto[]>;
  getFailureMembership(
    input: GetFailureMembershipInputDto,
  ): Promise<DefectClusterMembershipDto | null>;
  mergeClusters(input: MergeClustersInputDto): Promise<DefectClusterDto>;
  splitCluster(
    input: SplitClusterInputDto,
  ): Promise<{ remainingCluster: DefectClusterDto; newCluster: DefectClusterDto }>;
  overrideMembership(input: OverrideMembershipInputDto): Promise<DefectClusterMembershipDto | null>;
  listClusterHistory(
    input: ListClusterHistoryInputDto,
  ): Promise<readonly DefectClusterHistoryDto[]>;
}
