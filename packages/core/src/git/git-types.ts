/**
 * @file packages/core/src/git/git-types.ts
 * Internal types for privileged Git process execution and repository inspection.
 */

import type { GitSourceRelation } from '@ai-quality/contracts';

export interface GitCommandResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

export interface GitVersionInfo {
  readonly available: boolean;
  readonly version: string | null;
}

export interface RawGitInspectionResult {
  readonly isGitRepository: boolean;
  readonly repositoryRoot: string | null;
  readonly sourceRelationToRepository: GitSourceRelation;
  readonly currentBranch: string | null;
  readonly headCommit: string | null;
  readonly isDetachedHead: boolean;
}
