/**
 * @file packages/core/src/patch/sandbox/sandbox-types.ts
 * Domain types, options, and service interfaces for V7 Phase 102 Secure Patch Sandbox & Change Isolation.
 */

import type {
  ApplyPatchToSandboxInputDto,
  CreatePatchSandboxInputDto,
  DefectPatchSandboxDto,
  DestroyPatchSandboxInputDto,
  GetPatchSandboxInputDto,
  ListPatchSandboxesInputDto,
  PatchSandboxSecurityChecksDto,
  StructuredEditOperationDto,
} from '@ai-quality/contracts';

/**
 * Supported sandbox repository snapshot isolation strategies.
 */
export type SandboxIsolationStrategy = 'SNAPSHOT_COPY_ISOLATION';

/**
 * Result of validating patch containment and security boundaries before application.
 */
export interface SandboxContainmentValidationResult {
  readonly isValid: boolean;
  readonly securityChecks: PatchSandboxSecurityChecksDto;
  readonly errors: readonly string[];
}

/**
 * Change-set computed from actual disk and git state inside the sandbox after patch application.
 */
export interface SandboxChangeSet {
  readonly filesModified: readonly string[];
  readonly filesCreated: readonly string[];
  readonly filesDeleted: readonly string[];
  readonly filesRenamed: readonly string[];
  readonly linesAdded: number;
  readonly linesRemoved: number;
  readonly totalChangedLines: number;
  readonly actualUnifiedDiff: string;
  readonly changeSetHash: string;
  readonly fileHashesBefore: Record<string, string>;
  readonly fileHashesAfter: Record<string, string>;
  readonly claimedVsActualDiffMatch: boolean;
}

/**
 * Authoritative repository baseline integrity snapshot captured prior to sandbox operations.
 */
export interface AuthoritativeBaselineSnapshot {
  readonly repositoryId: string;
  readonly workspaceRoot: string;
  readonly headCommit: string;
  readonly branchName: string | null;
  readonly isClean: boolean;
  readonly statusPorcelain: string;
  readonly targetFileHashes: Record<string, string>;
  readonly capturedAt: Date;
}

/**
 * Options for executing patch application inside sandbox.
 */
export interface ApplyPatchExecutionOptions {
  readonly sandboxId: string;
  readonly sandboxRoot: string;
  readonly structuredEdits: readonly StructuredEditOperationDto[];
  readonly targetFiles: readonly string[];
  readonly claimedFilesCount: number;
  readonly claimedLinesAdded: number;
  readonly claimedLinesRemoved: number;
}

/**
 * Service contract for Phase 102 Secure Patch Sandbox & Change Isolation.
 */
export interface IPatchSandboxService {
  createSandbox(input: CreatePatchSandboxInputDto): Promise<DefectPatchSandboxDto>;
  applyPatch(input: ApplyPatchToSandboxInputDto): Promise<DefectPatchSandboxDto>;
  getSandbox(input: GetPatchSandboxInputDto): Promise<DefectPatchSandboxDto | null>;
  listSandboxes(input: ListPatchSandboxesInputDto): Promise<readonly DefectPatchSandboxDto[]>;
  destroySandbox(input: DestroyPatchSandboxInputDto): Promise<DefectPatchSandboxDto>;
}
