/**
 * @file packages/core/src/patch/patch-types.ts
 * Domain types, bounds, and interfaces for V7 Phase 101 Limited AI Patch Generation.
 */

import type {
  DefectPatchProposalDto,
  GeneratePatchProposalInputDto,
  GetPatchProposalInputDto,
  ListPatchProposalsInputDto,
  PatchRiskLevelDto,
  PatchTestReferenceDto,
  StructuredEditOperationDto,
  WithdrawPatchProposalInputDto,
} from '@ai-quality/contracts';

/**
 * Strict safety bounds for minimal, controlled patch proposals.
 * Reject or escalate when any limit is exceeded.
 */
export const PATCH_BOUNDS = {
  MAX_FILES_CHANGED: 3,
  MAX_LINES_ADDED: 50,
  MAX_LINES_REMOVED: 30,
  MAX_TOTAL_CHANGED_LINES: 60,
  MAX_RATIONALE_LENGTH: 4000,
  MAX_DIFF_BYTES: 64 * 1024, // 64 KB
} as const;

/**
 * Security-sensitive patterns that mandate risk escalation to HIGH / CRITICAL
 * or automatic generation blockage.
 */
export const SECURITY_SENSITIVE_KEYWORDS = [
  'auth',
  'login',
  'password',
  'secret',
  'token',
  'api_key',
  'apikey',
  'private_key',
  'payment',
  'billing',
  'stripe',
  'credential',
  'session',
  'permission',
  'rbac',
  'crypto',
  'encrypt',
  'decrypt',
  'migration',
] as const;

/**
 * High-risk operation patterns within patch edits that must be rejected or escalated.
 */
export const HIGH_RISK_DIFF_PATTERNS = [
  /drop\s+table/i,
  /truncate\s+table/i,
  /rm\s+-rf/i,
  /child_process/i,
  /exec\s*\(/i,
  /spawn\s*\(/i,
  /eval\s*\(/i,
  /new\s+Function\s*\(/i,
  /process\.exit/i,
] as const;

/**
 * Context snippet of candidate source file.
 */
export interface PatchCandidateSnippet {
  readonly filePath: string;
  readonly content: string;
  readonly sha256: string;
  readonly totalLines: number;
  readonly startLine: number;
  readonly endLine: number;
}

/**
 * Aggregated contextual intelligence grounded in Phases 99, 100, and V6.
 */
export interface PatchContext {
  readonly projectId: string;
  readonly failureCaseId: string;
  readonly repositoryId: string | null;
  readonly workspaceRoot: string;
  readonly repositoryRevision: string;
  readonly branchName: string | null;
  readonly isDrifted: boolean;
  readonly driftDetails?: string | null;

  readonly quickFixAssessment: {
    readonly id: string;
    readonly eligibility: string;
    readonly safetyPolicy: string;
    readonly riskLevel: string;
    readonly reasons: readonly string[];
    readonly suggestedActions: readonly string[];
  };

  readonly defectLocalization: {
    readonly id: string;
    readonly candidateFiles: readonly string[];
    readonly topCandidateFilePath?: string | null;
    readonly topCandidateSymbolName?: string | null;
    readonly rankedCandidates: readonly unknown[];
    readonly repositoryRevision: string;
    readonly isDrifted: boolean;
  };

  readonly rootCauseAnalysis?: {
    readonly id: string;
    readonly probableLayer: string;
    readonly hypothesis: string;
    readonly confidenceScore: number;
  } | null;

  readonly failureCase: {
    readonly id: string;
    readonly title: string;
    readonly errorMessage?: string | null;
    readonly stackTrace?: string | null;
    readonly failureSignature?: string | null;
    readonly testCaseId: string;
  };

  readonly requirementTraceability?: {
    readonly requirementId?: string | null;
    readonly requirementKey?: string | null;
    readonly requirementTitle?: string | null;
    readonly testCaseId?: string | null;
    readonly testCaseKey?: string | null;
    readonly testCaseTitle?: string | null;
  };

  readonly snippets: readonly PatchCandidateSnippet[];
  readonly userGuidance?: string;
}

/**
 * Raw output produced by the patch generation engine before DB persistence.
 */
export interface PatchGenerationEngineResult {
  readonly targetFiles: readonly string[];
  readonly primaryFilePath: string;
  readonly primarySymbolName?: string | null;
  readonly startLine?: number | null;
  readonly endLine?: number | null;
  readonly linesAdded: number;
  readonly linesRemoved: number;
  readonly totalChangedLines: number;
  readonly unifiedDiff: string;
  readonly structuredEdits: readonly StructuredEditOperationDto[];
  readonly rationale: string;
  readonly expectedBehaviorChange: string;
  readonly assumptions: readonly string[];
  readonly riskFactors: readonly string[];
  readonly uncertainties: readonly string[];
  readonly riskLevel: PatchRiskLevelDto;
  readonly evidenceReferences: readonly string[];
  readonly testReferences: readonly PatchTestReferenceDto[];
  readonly traceabilityJson?: unknown;
  readonly modelProvider: string;
  readonly modelName: string;
  readonly promptVersion: string;
  readonly patchFingerprint: string;
  readonly promptTokens?: number;
  readonly completionTokens?: number;
  readonly durationMs: number;
}

/**
 * Service contract for Limited AI Patch Generation.
 */
export interface IPatchProposalService {
  generateProposal(input: GeneratePatchProposalInputDto): Promise<DefectPatchProposalDto>;
  getProposal(input: GetPatchProposalInputDto): Promise<DefectPatchProposalDto | null>;
  listProposals(input: ListPatchProposalsInputDto): Promise<readonly DefectPatchProposalDto[]>;
  withdrawProposal(input: WithdrawPatchProposalInputDto): Promise<DefectPatchProposalDto>;
}
