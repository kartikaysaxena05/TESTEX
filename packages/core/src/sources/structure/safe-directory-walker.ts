/**
 * @file packages/core/src/sources/structure/safe-directory-walker.ts
 * Safe, iterative, bounded filesystem directory walker with hierarchical .gitignore and security filtering.
 *
 * CRITICAL SECURITY INVARIANTS:
 * 1. Traversal MUST strictly remain bounded within the authorized source root.
 * 2. Traversal MUST be iterative (stack-based DFS) to prevent call-stack overflow.
 * 3. Symlink directories MUST NEVER be followed (prevents loops and escaping).
 * 4. Traversal is strictly read-only. The ONLY file read permitted is .gitignore for rule extraction.
 * 5. Hard limits (max entries, max depth, timeout) are strictly enforced.
 * 6. Hard security exclusions (.git) ALWAYS override ignore rules/negations.
 * 7. Excluded directories are pruned early to prevent redundant descendant traversal.
 */

import fs from 'node:fs';
import path from 'node:path';
import type { TraversalLimits, DiscoveredEntry, RawStructureResult } from './structure-types.js';
import { DEFAULT_STRUCTURE_LIMITS } from './structure-limits.js';
import { InvalidDirectoryError } from '../source-errors.js';
import { ScopedIgnoreMatcher } from './ignore-matcher.js';
import { FilterPolicyEngine } from './filter-policy.js';

interface StackItem {
  readonly absoluteDir: string;
  readonly relativeDir: string;
  readonly depth: number;
  readonly matchers: readonly ScopedIgnoreMatcher[];
}

export class SafeDirectoryWalker {
  private readonly filterPolicy = new FilterPolicyEngine();

  constructor(private readonly limits: TraversalLimits = DEFAULT_STRUCTURE_LIMITS) {}

  /**
   * Boundedly and deterministically traverses and filters an authorized source directory.
   */
  async walk(authorizedRootPath: string): Promise<RawStructureResult> {
    const startTime = performance.now();
    const startTimestamp = new Date();

    if (!authorizedRootPath || typeof authorizedRootPath !== 'string') {
      throw new InvalidDirectoryError('Authorized root path is required.');
    }

    const normalizedRoot = path.normalize(authorizedRootPath.trim());
    if (!fs.existsSync(normalizedRoot)) {
      throw new InvalidDirectoryError(`Source directory does not exist: "${normalizedRoot}"`);
    }

    let canonicalRoot: string;
    try {
      canonicalRoot = fs.realpathSync(normalizedRoot);
    } catch {
      canonicalRoot = normalizedRoot;
    }

    let rootStat: fs.Stats;
    try {
      rootStat = fs.statSync(canonicalRoot);
      if (!rootStat.isDirectory()) {
        throw new InvalidDirectoryError(`Path is not a directory: "${canonicalRoot}"`);
      }
    } catch (err: unknown) {
      if (err instanceof InvalidDirectoryError) throw err;
      throw new InvalidDirectoryError(
        `Failed to stat root: ${err instanceof Error ? err.message : 'Filesystem error'}`,
      );
    }

    let rootName = path.basename(canonicalRoot);
    if (!rootName || rootName === '/' || rootName === '\\') {
      rootName = 'root';
    }

    const entries: DiscoveredEntry[] = [];
    const warnings: string[] = [];

    let filesDiscovered = 0;
    let directoriesDiscovered = 0;
    let symlinksDiscovered = 0;
    let includedFiles = 0;
    let includedDirectories = 0;
    let ignoredEntries = 0;
    let safetyExcludedEntries = 0;
    let earlyPrunedDirectories = 0;
    let ignoreFilesLoaded = 0;
    let ignoreRulesLoaded = 0;

    let truncated = false;
    let truncationReason: 'MAX_ENTRIES' | 'MAX_DEPTH' | 'TIMEOUT' | null = null;

    const stack: StackItem[] = [
      {
        absoluteDir: canonicalRoot,
        relativeDir: '',
        depth: 0,
        matchers: [],
      },
    ];

    let totalEncountered = 0;

    while (stack.length > 0) {
      // 1. Check timeout deadline
      if (performance.now() - startTime > this.limits.timeoutMs) {
        truncated = true;
        truncationReason = 'TIMEOUT';
        break;
      }

      const current = stack.pop()!;

      // 2. Read directory entries with Dirent types
      let dirents: fs.Dirent[];
      try {
        dirents = await fs.promises.readdir(current.absoluteDir, { withFileTypes: true });
      } catch {
        // Skip inaccessible directories or transient race conditions
        continue;
      }

      // 3. Check for .gitignore in this directory to establish local ignore scope
      let currentMatchers = current.matchers;
      const gitignoreDirent = dirents.find(d => d.name === '.gitignore' && d.isFile());
      if (gitignoreDirent) {
        const gitignorePath = path.join(current.absoluteDir, '.gitignore');
        try {
          // Strictly the only file read permitted in Phase 19
          const content = await fs.promises.readFile(gitignorePath, 'utf-8');
          const matcher = new ScopedIgnoreMatcher(current.relativeDir, content);
          // Prepend local matcher so it has highest priority for entries in this scope
          currentMatchers = [matcher, ...current.matchers];
          ignoreFilesLoaded++;
          ignoreRulesLoaded += matcher.ruleCount;
        } catch {
          warnings.push(
            `Unable to read .gitignore at ${current.relativeDir ? current.relativeDir : 'root'}`,
          );
        }
      }

      // 4. Deterministic lexicographical sorting
      dirents.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));

      // Temporary list for directories to push onto the stack in reverse order
      const subdirsToPush: StackItem[] = [];

      for (const dirent of dirents) {
        totalEncountered++;
        // Enforce max entry limit against total visited entries
        if (totalEncountered >= this.limits.maxEntries) {
          truncated = true;
          truncationReason = 'MAX_ENTRIES';
          break;
        }

        // Relative path normalized with forward slashes for cross-platform consistency
        const entryRelativePath = current.relativeDir
          ? `${current.relativeDir}/${dirent.name}`
          : dirent.name;

        const entryAbsolutePath = path.join(current.absoluteDir, dirent.name);

        // Path containment verification
        const relativeCheck = path.relative(canonicalRoot, entryAbsolutePath);
        if (relativeCheck.startsWith('..') || path.isAbsolute(relativeCheck)) {
          // Escaped authorized root -> skip immediately
          safetyExcludedEntries++;
          continue;
        }

        const isDir = dirent.isDirectory();
        const isSymlink = dirent.isSymbolicLink();
        const isFile = dirent.isFile();

        if (isFile) filesDiscovered++;
        else if (isDir) directoriesDiscovered++;
        else if (isSymlink) symlinksDiscovered++;

        const nextDepth = current.depth + 1;

        // 5. Evaluate through 4-tier filtering policy
        const decision = this.filterPolicy.evaluate(
          dirent.name,
          entryRelativePath,
          isDir,
          currentMatchers,
        );

        if (!decision.included) {
          if (decision.reason === 'IGNORE_RULE') {
            ignoredEntries++;
          } else {
            safetyExcludedEntries++;
          }

          if (isDir) {
            // Early directory pruning: do NOT recurse into excluded directories
            earlyPrunedDirectories++;
          }
          continue;
        }

        // 6. Entry is INCLUDED for repository intelligence
        if (isSymlink) {
          entries.push({
            relativePath: entryRelativePath,
            name: dirent.name,
            kind: 'SYMLINK',
            depth: nextDepth,
          });
          // NEVER follow directory symlinks
        } else if (isDir) {
          entries.push({
            relativePath: entryRelativePath,
            name: dirent.name,
            kind: 'DIRECTORY',
            depth: nextDepth,
          });
          includedDirectories++;

          if (nextDepth >= this.limits.maxDepth) {
            truncated = true;
            truncationReason = 'MAX_DEPTH';
            continue;
          }

          subdirsToPush.push({
            absoluteDir: entryAbsolutePath,
            relativeDir: entryRelativePath,
            depth: nextDepth,
            matchers: currentMatchers,
          });
        } else if (isFile) {
          entries.push({
            relativePath: entryRelativePath,
            name: dirent.name,
            kind: 'FILE',
            depth: nextDepth,
          });
          includedFiles++;
        }
      }

      if (truncated && truncationReason === 'MAX_ENTRIES') {
        break;
      }

      // Push subdirectories onto stack in reverse order so DFS visits in alphabetical order
      for (let i = subdirsToPush.length - 1; i >= 0; i--) {
        const item = subdirsToPush[i];
        if (item) {
          stack.push(item);
        }
      }
    }

    const durationMs = Math.round(performance.now() - startTime);

    return {
      authorizedRoot: canonicalRoot,
      rootName,
      entries,
      filesDiscovered,
      directoriesDiscovered,
      symlinksDiscovered,
      totalDiscovered: filesDiscovered + directoriesDiscovered + symlinksDiscovered,
      includedFiles,
      includedDirectories,
      totalIncluded: entries.length,
      ignoredEntries,
      safetyExcludedEntries,
      earlyPrunedDirectories,
      ignoreFilesLoaded,
      ignoreRulesLoaded,
      warnings,
      truncated,
      truncationReason,
      durationMs,
      scannedAt: startTimestamp,
    };
  }
}
