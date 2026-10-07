/**
 * @file packages/core/src/git-review/git-diff-service.ts
 * Low-level, privileged Git Diff engine wrapping GitCommandRunner.
 *
 * Guarantees:
 * 1. Executes safe, allowlisted git status, git diff, git diff --cached, git diff <commit>..<commit>.
 * 2. Never runs arbitrary shell commands.
 * 3. Enforces worktree containment and path safety.
 * 4. Parses unified diffs, numstats, and status into structured DTOs.
 * 5. Redacts secrets and flags dangerous files via GitChangeAnalyzer.
 */

import fs from 'node:fs';
import path from 'node:path';
import type {
  GitWorkingStatusDto,
  GitDiffResultDto,
  GitFileChangeItemDto,
  GitFileChangeStatus,
} from '@ai-quality/contracts';
import { GitCommandRunner } from '../git/git-command-runner.js';
import {
  GitReviewNotGitRepoError,
  GitReviewPathTraversalError,
  GitReviewOutsideWorktreeError,
  GitReviewValidationError,
} from './git-review-errors.js';
import { GitChangeAnalyzer } from './git-change-analyzer.js';

export interface GitDiffServiceOptions {
  readonly gitRunner?: GitCommandRunner;
}

export class GitDiffService {
  private readonly gitRunner: GitCommandRunner;

  constructor(options: GitDiffServiceOptions = {}) {
    this.gitRunner = options.gitRunner ?? new GitCommandRunner('git', 5000, 1024 * 1024);
  }

  /**
   * Resolves and verifies canonical worktree root.
   */
  public async getCanonicalWorktree(dirPath: string): Promise<string> {
    if (!dirPath || typeof dirPath !== 'string' || dirPath.trim().length === 0) {
      throw new GitReviewValidationError('Directory path is required.');
    }

    if (!fs.existsSync(dirPath)) {
      throw new GitReviewNotGitRepoError(dirPath);
    }

    const isInside = await this.gitRunner.isInsideWorkTree(dirPath);
    if (!isInside) {
      throw new GitReviewNotGitRepoError(dirPath);
    }

    const topLevel = await this.gitRunner.getShowTopLevel(dirPath);
    if (!topLevel || !fs.existsSync(topLevel)) {
      throw new GitReviewNotGitRepoError(dirPath);
    }

    return fs.realpathSync(topLevel);
  }

  /**
   * Validates that requested file paths stay strictly within the worktree boundary.
   */
  public validatePathsWithinWorktree(worktreeRoot: string, filePaths?: readonly string[]): string[] {
    if (!filePaths || filePaths.length === 0) return [];

    const validated: string[] = [];
    for (const raw of filePaths) {
      if (!raw || typeof raw !== 'string') {
        throw new GitReviewValidationError('File path must be a non-empty string.');
      }

      if (raw.includes('\0')) {
        throw new GitReviewPathTraversalError(raw, 'Null bytes detected');
      }

      if (/%2e|%2f|%5c/i.test(raw)) {
        throw new GitReviewPathTraversalError(raw, 'Encoded path traversal characters');
      }

      if (path.isAbsolute(raw) || /^[a-zA-Z]:/i.test(raw)) {
        throw new GitReviewPathTraversalError(raw, 'Absolute paths not permitted');
      }

      const normalized = path.normalize(raw).replace(/\\/g, '/').replace(/^\.\//, '');
      const segments = normalized.split('/');
      if (segments.includes('..')) {
        throw new GitReviewPathTraversalError(raw, "Sequence '..' detected");
      }

      const resolved = path.resolve(worktreeRoot, normalized);
      if (!resolved.startsWith(worktreeRoot + path.sep) && resolved !== worktreeRoot) {
        throw new GitReviewOutsideWorktreeError(raw, worktreeRoot);
      }

      validated.push(normalized);
    }
    return validated;
  }

  /**
   * Retrieves structured working tree status: staged, unstaged, untracked files.
   */
  public async getWorkingStatus(worktreeRoot: string): Promise<GitWorkingStatusDto> {
    const canonicalRoot = await this.getCanonicalWorktree(worktreeRoot);

    const isGit = true;
    const currentBranch = await this.gitRunner.getCurrentBranch(canonicalRoot);
    const headCommit = await this.gitRunner.getHeadCommit(canonicalRoot);

    // Run porcelain status
    const statusResult = await this.gitRunner.runGit([
      '-C',
      canonicalRoot,
      'status',
      '--porcelain=v1',
      '-uall',
    ]);

    const stagedFiles: GitFileChangeItemDto[] = [];
    const unstagedFiles: GitFileChangeItemDto[] = [];
    const untrackedFiles: GitFileChangeItemDto[] = [];

    // Parse status lines
    const lines = statusResult.stdout.split('\n');
    for (const rawLine of lines) {
      if (!rawLine || rawLine.trim().length === 0) continue;

      let indexCode = ' ';
      let workCode = ' ';
      let filePath = '';

      if (rawLine.startsWith('??')) {
        indexCode = '?';
        workCode = '?';
        filePath = rawLine.slice(2).trim();
      } else if (rawLine.length >= 3 && rawLine[2] === ' ') {
        // Standard un-trimmed line: "XY path"
        indexCode = rawLine[0] ?? ' ';
        workCode = rawLine[1] ?? ' ';
        filePath = rawLine.slice(3).trim();
      } else if (rawLine.length >= 2 && rawLine[1] === ' ') {
        // Line where leading space was trimmed by runner: "Y path" (unstaged only)
        indexCode = ' ';
        workCode = rawLine[0] ?? ' ';
        filePath = rawLine.slice(2).trim();
      } else {
        continue;
      }

      // Handle quoted paths (e.g. "path/with spaces")
      if (filePath.startsWith('"') && filePath.endsWith('"')) {
        filePath = filePath.slice(1, -1);
      }

      // Staged changes
      if (indexCode && indexCode !== ' ' && indexCode !== '?') {
        const status = this.mapStatusCode(indexCode);
        const classification = GitChangeAnalyzer.classifyFile(filePath);
        stagedFiles.push({
          filePath,
          status,
          staged: true,
          additions: 0,
          deletions: 0,
          binary: false,
          ...classification,
        });
      }

      // Unstaged changes
      if (workCode && workCode !== ' ' && workCode !== '?') {
        const status = this.mapStatusCode(workCode);
        const classification = GitChangeAnalyzer.classifyFile(filePath);
        unstagedFiles.push({
          filePath,
          status,
          staged: false,
          additions: 0,
          deletions: 0,
          binary: false,
          ...classification,
        });
      }

      // Untracked changes
      if (indexCode === '?' && workCode === '?') {
        const classification = GitChangeAnalyzer.classifyFile(filePath);
        untrackedFiles.push({
          filePath,
          status: 'UNTRACKED',
          staged: false,
          additions: 0,
          deletions: 0,
          binary: false,
          ...classification,
        });
      }
    }

    const isClean = stagedFiles.length === 0 && unstagedFiles.length === 0 && untrackedFiles.length === 0;
    const totalChangedFiles = stagedFiles.length + unstagedFiles.length + untrackedFiles.length;

    return {
      isGitRepository: isGit,
      repositoryRoot: canonicalRoot,
      currentBranch,
      headCommit,
      isClean,
      stagedFiles,
      unstagedFiles,
      untrackedFiles,
      totalChangedFiles,
    };
  }

  /**
   * Retrieves diff (working tree vs index, index vs HEAD, or between two commit hashes).
   */
  public async getDiff(
    worktreeRoot: string,
    options: {
      staged?: boolean;
      commitBaseRef?: string;
      commitTargetRef?: string;
      filePaths?: readonly string[];
    } = {},
  ): Promise<GitDiffResultDto> {
    const canonicalRoot = await this.getCanonicalWorktree(worktreeRoot);
    const validPaths = this.validatePathsWithinWorktree(canonicalRoot, options.filePaths);

    const gitArgs: string[] = ['-C', canonicalRoot, 'diff', '--no-color'];

    if (options.commitBaseRef && options.commitTargetRef) {
      gitArgs.push(`${options.commitBaseRef}..${options.commitTargetRef}`);
    } else if (options.commitBaseRef) {
      gitArgs.push(options.commitBaseRef);
    } else if (options.staged) {
      gitArgs.push('--cached');
    }

    if (validPaths.length > 0) {
      gitArgs.push('--', ...validPaths);
    }

    const diffResult = await this.gitRunner.runGit(gitArgs);

    // Get numstat stats
    const numstatArgs: string[] = ['-C', canonicalRoot, 'diff', '--numstat'];
    if (options.commitBaseRef && options.commitTargetRef) {
      numstatArgs.push(`${options.commitBaseRef}..${options.commitTargetRef}`);
    } else if (options.commitBaseRef) {
      numstatArgs.push(options.commitBaseRef);
    } else if (options.staged) {
      numstatArgs.push('--cached');
    }
    if (validPaths.length > 0) {
      numstatArgs.push('--', ...validPaths);
    }

    const numstatResult = await this.gitRunner.runGit(numstatArgs);
    const fileStats = this.parseNumstat(numstatResult.stdout, options.staged ?? false);

    // Redact secrets
    const redaction = GitChangeAnalyzer.redactSecrets(diffResult.stdout);
    const analysis = GitChangeAnalyzer.generateAnalysis(fileStats, {
      hasRedactions: redaction.hasRedactions,
      redactionCount: redaction.redactionCount,
    });

    return {
      diff: redaction.sanitizedDiff,
      staged: options.staged ?? false,
      commitBaseRef: options.commitBaseRef ?? null,
      commitTargetRef: options.commitTargetRef ?? null,
      files: fileStats,
      analysis,
      redacted: redaction.hasRedactions,
    };
  }

  private mapStatusCode(code: string): GitFileChangeStatus {
    switch (code.toUpperCase()) {
      case 'A':
        return 'ADDED';
      case 'D':
        return 'DELETED';
      case 'R':
        return 'RENAMED';
      case 'C':
        return 'COPIED';
      case '?':
        return 'UNTRACKED';
      default:
        return 'MODIFIED';
    }
  }

  private parseNumstat(stdout: string, staged: boolean): GitFileChangeItemDto[] {
    const items: GitFileChangeItemDto[] = [];
    const lines = stdout.split('\n').filter((l) => l.trim().length > 0);

    for (const line of lines) {
      const parts = line.split('\t');
      if (parts.length < 3) continue;

      const additionsStr = parts[0]?.trim();
      const deletionsStr = parts[1]?.trim();
      const filePath = parts[2]?.trim() ?? '';

      const binary = additionsStr === '-' || deletionsStr === '-';
      const additions = binary ? 0 : parseInt(additionsStr ?? '0', 10) || 0;
      const deletions = binary ? 0 : parseInt(deletionsStr ?? '0', 10) || 0;

      const classification = GitChangeAnalyzer.classifyFile(filePath);

      items.push({
        filePath,
        status: 'MODIFIED',
        staged,
        additions,
        deletions,
        binary,
        ...classification,
      });
    }

    return items;
  }
}
