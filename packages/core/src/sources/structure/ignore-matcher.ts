/**
 * @file packages/core/src/sources/structure/ignore-matcher.ts
 * Scoped Git ignore matcher wrapping the standard gitignore implementation.
 */

import ignore, { type Ignore } from 'ignore';

export interface ScopedTestResult {
  readonly matched: boolean;
  readonly ignored: boolean;
  readonly unignored: boolean;
}

export class ScopedIgnoreMatcher {
  private readonly ig: Ignore;
  readonly relativeScope: string;
  readonly ruleCount: number;

  constructor(relativeScope: string, rawContent: string) {
    this.relativeScope = relativeScope.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
    this.ig = ignore();

    const lines = rawContent.split(/\r?\n/);
    let validRules = 0;

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.length > 0 && !trimmed.startsWith('#')) {
        this.ig.add(trimmed);
        validRules++;
      }
    }

    this.ruleCount = validRules;
  }

  /**
   * Tests whether a path is ignored, unignored (via negation), or unaffected by this scope.
   */
  test(repoRelativePath: string, isDirectory = false): ScopedTestResult {
    const normalizedPath = repoRelativePath.replace(/\\/g, '/').replace(/^\/+/, '');

    if (this.relativeScope.length > 0) {
      if (!normalizedPath.startsWith(`${this.relativeScope}/`)) {
        return { matched: false, ignored: false, unignored: false };
      }
      const scopedPath = normalizedPath.slice(this.relativeScope.length + 1);
      if (scopedPath.length === 0) {
        return { matched: false, ignored: false, unignored: false };
      }
      const testPath = isDirectory ? `${scopedPath}/` : scopedPath;
      const res = this.ig.test(testPath);
      return {
        matched: res.ignored || res.unignored,
        ignored: res.ignored,
        unignored: res.unignored,
      };
    }

    const testPath = isDirectory ? `${normalizedPath}/` : normalizedPath;
    const res = this.ig.test(testPath);
    return {
      matched: res.ignored || res.unignored,
      ignored: res.ignored,
      unignored: res.unignored,
    };
  }

  /**
   * Checks whether a repository-relative path matches the ignore rules defined at this scope.
   */
  ignores(repoRelativePath: string, isDirectory = false): boolean {
    const res = this.test(repoRelativePath, isDirectory);
    return res.ignored;
  }
}
