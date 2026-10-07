/**
 * @file packages/core/src/failures/failure-types.ts
 * Domain contracts, service interfaces, and bounds for V6 Failure Intelligence foundation.
 */

import type {
  FailureCaseDto,
  FailureAnalysisRunDto,
  FailureEvidenceReferenceDto,
  CreateFailureCaseInputDto,
  EnsureFailureCaseInputDto,
  GetFailureCaseInputDto,
  ListFailureCasesInputDto,
  StartFailureAnalysisInputDto,
  CompleteFailureAnalysisInputDto,
  FailFailureAnalysisInputDto,
  CancelFailureAnalysisInputDto,
  MarkFailureCaseStaleInputDto,
  ListFailureAnalysisRunsInputDto,
  ListFailureEvidenceReferencesInputDto,
} from '@ai-quality/contracts';

export const FAILURE_BOUNDS = {
  MAX_FAILURE_SUMMARY_CHARS: 5000,
  MAX_ERROR_MESSAGE_CHARS: 5000,
  MAX_FAILURE_REASON_CHARS: 5000,
  MAX_METADATA_JSON_BYTES: 64 * 1024,
  MAX_ANALYSIS_RUNS_PER_CASE: 50,
  MAX_EVIDENCE_REFERENCES_PER_CASE: 100,
  DEFAULT_PAGE_SIZE: 25,
  MAX_PAGE_SIZE: 100,
} as const;

export interface PaginatedFailureCasesDto {
  readonly items: readonly FailureCaseDto[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
  readonly totalPages: number;
}

export interface IFailureCaseService {
  createFailureCase(input: CreateFailureCaseInputDto): Promise<FailureCaseDto>;
  ensureFailureCaseFromExecution(input: EnsureFailureCaseInputDto): Promise<FailureCaseDto>;
  getFailureCase(input: GetFailureCaseInputDto): Promise<FailureCaseDto>;
  listFailureCases(input: ListFailureCasesInputDto): Promise<PaginatedFailureCasesDto>;
  startAnalysis(input: StartFailureAnalysisInputDto): Promise<FailureAnalysisRunDto>;
  completeAnalysis(input: CompleteFailureAnalysisInputDto): Promise<FailureAnalysisRunDto>;
  failAnalysis(input: FailFailureAnalysisInputDto): Promise<FailureAnalysisRunDto>;
  cancelAnalysis(input: CancelFailureAnalysisInputDto): Promise<FailureCaseDto>;
  markStale(input: MarkFailureCaseStaleInputDto): Promise<FailureCaseDto>;
  listAnalysisRuns(
    input: ListFailureAnalysisRunsInputDto,
  ): Promise<readonly FailureAnalysisRunDto[]>;
  listEvidenceReferences(
    input: ListFailureEvidenceReferencesInputDto,
  ): Promise<readonly FailureEvidenceReferenceDto[]>;
}
