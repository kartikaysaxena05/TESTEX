/**
 * @file packages/core/src/git/git-command-runner.ts
 * Low-level, privileged Git execution runner.
 *
 * CRITICAL SECURITY INVARIANTS:
 * 1. Process execution MUST strictly use `execFile` with argument arrays (NEVER shell strings).
 * 2. `shell: false` MUST ALWAYS be enforced to prevent shell command injection.
 * 3. Execution time is strictly bounded with a 3000ms timeout.
 * 4. Buffer size is strictly bounded with maxBuffer: 512KB.
 * 5. ONLY allowlisted, read-only local plumbing commands are executed.
 */

import { execFile } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import type { GitCommandResult, GitVersionInfo } from './git-types.js';
import { GitTimeoutError } from './git-errors.js';

const DEFAULT_GIT_TIMEOUT_MS = 3000;
const DEFAULT_GIT_MAX_BUFFER = 512 * 1024; // 512 KB

export class GitCommandRunner {
  constructor(
    private readonly gitBinary: string = 'git',
    private readonly timeoutMs: number = DEFAULT_GIT_TIMEOUT_MS,
    private readonly maxBuffer: number = DEFAULT_GIT_MAX_BUFFER,
  ) {}

  /**
   * Executes a Git command with explicit argument array and strict security boundaries.
   */
  async runGit(args: readonly string[]): Promise<GitCommandResult> {
    return new Promise<GitCommandResult>((resolve, reject) => {
      execFile(
        this.gitBinary,
        [...args],
        {
          shell: false,
          timeout: this.timeoutMs,
          maxBuffer: this.maxBuffer,
          windowsHide: true,
          env: {
            ...process.env,
            // Force English output for deterministic parsing
            LC_ALL: 'C',
            GIT_TERMINAL_PROMPT: '0',
          },
        },
        (error, stdout, stderr) => {
          if (error) {
            if (error.killed || (error as { code?: string }).code === 'ETIMEDOUT') {
              reject(new GitTimeoutError(`Git command timed out after ${this.timeoutMs}ms`));
              return;
            }

            // Normal non-zero exit codes (e.g. not a git repo, no HEAD) return result for handling
            resolve({
              exitCode: typeof error.code === 'number' ? error.code : 1,
              stdout: stdout?.toString().trim() ?? '',
              stderr: stderr?.toString().trim() ?? '',
            });
            return;
          }

          resolve({
            exitCode: 0,
            stdout: stdout.toString().trim(),
            stderr: stderr.toString().trim(),
          });
        },
      );
    });
  }

  /**
   * Verifies if Git executable is installed and returns its sanitized version string.
   */
  async checkGitVersion(): Promise<GitVersionInfo> {
    try {
      const result = await this.runGit(['--version']);
      if (result.exitCode === 0 && result.stdout.toLowerCase().includes('git version')) {
        return {
          available: true,
          version: result.stdout.replace(/^git version\s*/i, '').trim(),
        };
      }
      return { available: false, version: null };
    } catch {
      return { available: false, version: null };
    }
  }

  /**
   * Checks if a directory is inside a Git working tree.
   */
  async isInsideWorkTree(dirPath: string): Promise<boolean> {
    try {
      const result = await this.runGit(['-C', dirPath, 'rev-parse', '--is-inside-work-tree']);
      return result.exitCode === 0 && result.stdout.toLowerCase() === 'true';
    } catch {
      return false;
    }
  }

  /**
   * Obtains the canonical top-level root path of the Git repository.
   */
  async getShowTopLevel(dirPath: string): Promise<string | null> {
    try {
      const result = await this.runGit(['-C', dirPath, 'rev-parse', '--show-toplevel']);
      if (result.exitCode === 0 && result.stdout.length > 0) {
        const rawTopLevel = result.stdout.trim();
        if (fs.existsSync(rawTopLevel)) {
          return fs.realpathSync(rawTopLevel);
        }
        return path.normalize(rawTopLevel);
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Obtains the currently checked-out branch name (or null if detached HEAD / unborn / empty).
   */
  async getCurrentBranch(dirPath: string): Promise<string | null> {
    try {
      // 1. Try branch --show-current
      const result = await this.runGit(['-C', dirPath, 'branch', '--show-current']);
      if (result.exitCode === 0 && result.stdout.length > 0) {
        return result.stdout.trim();
      }

      // 2. Fallback to symbolic-ref --short HEAD (e.g. for unborn branches on initial repo)
      const symResult = await this.runGit(['-C', dirPath, 'symbolic-ref', '--short', 'HEAD']);
      if (symResult.exitCode === 0 && symResult.stdout.length > 0) {
        return symResult.stdout.trim();
      }

      return null;
    } catch {
      return null;
    }
  }

  /**
   * Obtains the full 40-character SHA-1/SHA-256 HEAD commit identifier.
   */
  async getHeadCommit(dirPath: string): Promise<string | null> {
    try {
      const result = await this.runGit(['-C', dirPath, 'rev-parse', 'HEAD']);
      if (result.exitCode === 0 && /^[0-9a-fA-F]{40,64}$/.test(result.stdout.trim())) {
        return result.stdout.trim().toLowerCase();
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Determines if HEAD is in a detached state.
   */
  async isDetachedHead(dirPath: string): Promise<boolean> {
    try {
      const symResult = await this.runGit(['-C', dirPath, 'symbolic-ref', '-q', 'HEAD']);
      // If symbolic-ref exits with non-zero (or empty), but HEAD resolves to a commit, it's detached
      if (symResult.exitCode !== 0) {
        const headCommit = await this.getHeadCommit(dirPath);
        return headCommit !== null;
      }
      return false;
    } catch {
      return false;
    }
  }
}
