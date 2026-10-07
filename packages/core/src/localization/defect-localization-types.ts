/**
 * @file packages/core/src/localization/defect-localization-types.ts
 * Domain types and bounds for V7 Phase 100 Repository-Aware Defect Localization.
 */

import type {
  CandidateEvidenceItemDto,
  CandidateEvidenceSignalDto,
  CandidateSourceContentDto,
  DefectCandidateTypeDto,
  GetDefectLocalizationInputDto,
  InspectCandidateSourceInputDto,
  ListDefectLocalizationsInputDto,
  LocalizeDefectInputDto,
  RankedDefectCandidateDto,
  RepositoryDefectLocalizationDto,
  RepositoryRevisionStateDto,
} from '@ai-quality/contracts';

/**
 * Deterministic safety bounds to prevent runaway AST exploration,
 * memory bloat, or uncontrolled token explosion.
 */
export const DEFECT_LOCALIZATION_BOUNDS = {
  MAX_CANDIDATE_FILES: 20,
  MAX_CANDIDATE_SYMBOLS: 50,
  MAX_GRAPH_DEPTH: 3,
  MAX_INSPECT_BYTES: 512 * 1024, // 512 KB
  MAX_LINE_RANGE_WINDOW: 200,
  MAX_SUPPORTING_EVIDENCE_PER_CANDIDATE: 15,
  MIN_CANDIDATE_SCORE_THRESHOLD: 0.1,
} as const;

/**
 * Deterministic evidence signal weights for candidate scoring.
 * Strong signals carry higher weight than weak semantic/heuristic signals.
 */
export const EVIDENCE_SIGNAL_WEIGHTS: Record<CandidateEvidenceSignalDto, number> = {
  STACK_TRACE: 0.95,
  SOURCE_MAP: 0.9,
  NETWORK_ENDPOINT: 0.85,
  ROUTE_MAPPING: 0.8,
  DOM_COMPONENT: 0.75,
  UI_ACTION_TARGET: 0.7,
  ROOT_CAUSE_PROBABLE_LAYER: 0.65,
  ROOT_CAUSE_HYPOTHESIS: 0.6,
  REQUIREMENT_TRACEABILITY: 0.55,
  SYMBOL_GRAPH_IMPORT: 0.5,
  SYMBOL_GRAPH_CALLER: 0.45,
  RECENT_COMMIT_TOUCH: 0.25,
  KEYWORD_SIMILARITY: 0.2,
};

/**
 * Candidate entity discovery facts gathered across correlators.
 */
export interface RawCandidateFact {
  readonly filePath: string;
  readonly symbolName?: string | null;
  readonly symbolKind?: string | null;
  readonly candidateType: DefectCandidateTypeDto;
  readonly startLine?: number | null;
  readonly endLine?: number | null;
  readonly signal: CandidateEvidenceSignalDto;
  readonly strength: 'STRONG' | 'MODERATE' | 'WEAK';
  readonly description: string;
  readonly provenance: string;
  readonly rawReference?: string;
}

/**
 * Context aggregated for repository-aware localization.
 */
export interface LocalizationContext {
  readonly projectId: string;
  readonly failureCaseId: string;
  readonly repositoryId: string | null;
  readonly workspaceRoot: string | null;
  readonly branchName: string | null;
  readonly headCommit: string | null;
  readonly failureTimeCommit: string | null;
  readonly revisionState: RepositoryRevisionStateDto;
  readonly isDrifted: boolean;
  readonly driftDetails: string | null;

  // Failure and test execution facts
  readonly failureCase: {
    readonly id: string;
    readonly title: string;
    readonly status: string;
    readonly failureSignature?: string | null;
    readonly errorMessage?: string | null;
    readonly testCaseId: string;
    readonly testRunId?: string | null;
    readonly executionId?: string | null;
  };

  readonly testCase?: {
    readonly id: string;
    readonly key: string;
    readonly title: string;
    readonly priority?: string | null;
  } | null;

  readonly requirement?: {
    readonly id: string;
    readonly key: string;
    readonly title: string;
  } | null;

  readonly failedStep?: {
    readonly stepIndex: number;
    readonly action: string;
    readonly target?: string | null;
    readonly value?: string | null;
    readonly errorMessage?: string | null;
  } | null;

  readonly networkEvidence: readonly {
    readonly url: string;
    readonly method: string;
    readonly statusCode?: number | null;
    readonly requestBody?: string | null;
    readonly responseBody?: string | null;
  }[];

  readonly consoleEvidence: readonly {
    readonly level: string;
    readonly message: string;
    readonly stack?: string | null;
  }[];

  // V6 Failure Intelligence
  readonly technicalLocalization?: {
    readonly id: string;
    readonly primaryLayer: string;
    readonly primaryTargetIdentifier: string;
    readonly matchedFilePath?: string | null;
    readonly matchedSymbolName?: string | null;
    readonly matchedLineNumber?: number | null;
    readonly httpEndpoint?: string | null;
    readonly domSelector?: string | null;
    readonly uiComponentName?: string | null;
    readonly routePath?: string | null;
    readonly localizationRationale: string;
  } | null;

  readonly rootCauseAnalysis?: {
    readonly id: string;
    readonly rootCauseStatus: string;
    readonly probableLayer: string;
    readonly probableCause: string;
    readonly candidateFiles?: string[];
  } | null;

  readonly quickFixAssessment?: {
    readonly id: string;
    readonly decision: string;
    readonly candidateFiles: string[];
  } | null;

  // Repository records
  readonly repositoryFiles: readonly {
    readonly id: string;
    readonly relativePath: string;
    readonly name: string;
    readonly classification?: string | null;
    readonly symbols: readonly {
      readonly id: string;
      readonly name: string;
      readonly kind: string;
      readonly startLine: number;
      readonly endLine: number;
      readonly isExported: boolean;
    }[];
    readonly imports: readonly {
      readonly specifier: string;
      readonly resolvedRelativePath?: string | null;
      readonly isExternal: boolean;
      readonly lineNumber: number;
    }[];
  }[];
}

/**
 * Service interface for Defect Localization.
 */
export interface IDefectLocalizationService {
  localizeDefect(input: LocalizeDefectInputDto): Promise<RepositoryDefectLocalizationDto>;
  getLocalization(
    input: GetDefectLocalizationInputDto,
  ): Promise<RepositoryDefectLocalizationDto | null>;
  listLocalizations(
    input: ListDefectLocalizationsInputDto,
  ): Promise<readonly RepositoryDefectLocalizationDto[]>;
  inspectCandidateSource(input: InspectCandidateSourceInputDto): Promise<CandidateSourceContentDto>;
}
