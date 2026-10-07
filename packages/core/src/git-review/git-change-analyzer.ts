/**
 * @file packages/core/src/git-review/git-change-analyzer.ts
 * Deterministic change analysis, secret redaction, and dangerous file detection engine.
 *
 * Guarantees:
 * 1. Categorizes modified, added, deleted, renamed, untracked files.
 * 2. Flags dangerous files (CI configs, system files, root build scripts, security configs).
 * 3. Flags dependency and configuration changes (package.json, lockfiles, env templates, tsconfig).
 * 4. Flags test files (*.test.ts, *.spec.ts, __tests__/).
 * 5. Flags generated files (dist/, build/, coverage/, artifacts).
 * 6. Redacts detected credentials, tokens, passwords, private keys from diff contents.
 * 7. Never claims a change is safe merely because the diff parses successfully.
 */

import path from 'node:path';
import type {
  GitFileChangeItemDto,
  GitChangeAnalysisMetadataDto,
  GitFileChangeStatus,
} from '@ai-quality/contracts';
import { SecretRedactor } from '../execution/sessions/secret-redactor.js';

// Dangerous file patterns: modifications to these can affect system security, CI, or execution environment
export const DANGEROUS_FILE_PATTERNS: readonly RegExp[] = [
  /^\.github\/(workflows|actions)\//i,
  /^\.gitlab-ci\.yml$/i,
  /^azure-pipelines\.ya?ml$/i,
  /^docker-compose(\..+)?\.ya?ml$/i,
  /^Dockerfile(\..+)?$/i,
  /^\.dockerignore$/i,
  /^Makefile$/i,
  /^(setup|install|deploy|build)\.(sh|bash|ps1|bat|cmd)$/i,
  /^\.npmrc$/i,
  /^\.yarnrc(\.yml)?$/i,
  /^\.env(\..+)?$/i,
  /credentials/i,
  /id_rsa/i,
  /\.(pem|key|pfx|p12)$/i,
];

// Dependency and configuration file patterns
export const DEPENDENCY_CONFIG_PATTERNS: readonly RegExp[] = [
  /^package(-lock)?\.json$/i,
  /^pnpm-lock\.yaml$/i,
  /^yarn\.lock$/i,
  /^requirements(\..+)?\.txt$/i,
  /^Pipfile(\.lock)?$/i,
  /^pyproject\.toml$/i,
  /^pom\.xml$/i,
  /^build\.gradle(\.kts)?$/i,
  /^Cargo\.(toml|lock)$/i,
  /^go\.(mod|sum)$/i,
  /^tsconfig(\..+)?\.json$/i,
  /^vite\.config\.(ts|js|mjs)$/i,
  /^webpack\.config\.(ts|js|mjs)$/i,
  /^next\.config\.(ts|js|mjs)$/i,
];

// Test file patterns
export const TEST_FILE_PATTERNS: readonly RegExp[] = [
  /\.(test|spec)\.[a-z0-9]+$/i,
  /(^|\/)__tests__\//i,
  /(^|\/)tests?\//i,
  /(^|\/)e2e\//i,
];

// Generated file patterns
export const GENERATED_FILE_PATTERNS: readonly RegExp[] = [
  /(^|\/)dist\//i,
  /(^|\/)build\//i,
  /(^|\/)out\//i,
  /(^|\/)\.next\//i,
  /(^|\/)coverage\//i,
  /(^|\/)bundle\.[a-z0-9]+$/i,
  /\.min\.(js|css)$/i,
  /\.map$/i,
];

// Secret detection patterns in diff lines
export const SECRET_CONTENT_PATTERNS: readonly RegExp[] = [
  /(?:api[_-]?key|apikey|secret|token|password|passwd|auth[_-]?token|private[_-]?key)\s*[:=]\s*["']?([A-Za-z0-9_\-.~+/=]{8,})["']?/gi,
  /Bearer\s+([A-Za-z0-9_\-.~+/=]{16,})/gi,
  /ghp_[A-Za-z0-9]{36}/gi,
  /xox[baprs]-[A-Za-z0-9-]{10,}/gi,
  /AKIA[0-9A-Z]{16}/gi,
  /-----BEGIN\s+(RSA|EC|DSA|OPENSSH|PRIVATE)\s+KEY-----/gi,
];

export class GitChangeAnalyzer {
  /**
   * Analyzes an individual file path for danger, config, test, and generated classification.
   */
  public static classifyFile(filePath: string): {
    isDangerous: boolean;
    dangerReason: string | null;
    isDependencyOrConfig: boolean;
    isTestFile: boolean;
    isGeneratedFile: boolean;
  } {
    const normalized = path.normalize(filePath).replace(/\\/g, '/').replace(/^\.\//, '');

    let isDangerous = false;
    let dangerReason: string | null = null;

    for (const pattern of DANGEROUS_FILE_PATTERNS) {
      if (pattern.test(normalized)) {
        isDangerous = true;
        dangerReason = `Matches sensitive or infrastructure file pattern '${pattern.source}'`;
        break;
      }
    }

    const isDependencyOrConfig = DEPENDENCY_CONFIG_PATTERNS.some((p) => p.test(normalized));
    const isTestFile = TEST_FILE_PATTERNS.some((p) => p.test(normalized));
    const isGeneratedFile = GENERATED_FILE_PATTERNS.some((p) => p.test(normalized));

    return {
      isDangerous,
      dangerReason,
      isDependencyOrConfig,
      isTestFile,
      isGeneratedFile,
    };
  }

  /**
   * Redacts credentials, tokens, and sensitive patterns from raw diff strings.
   * Returns sanitized diff and statistics on redacted occurrences.
   */
  public static redactSecrets(rawDiff: string): {
    sanitizedDiff: string;
    hasRedactions: boolean;
    redactionCount: number;
  } {
    if (!rawDiff || rawDiff.trim().length === 0) {
      return { sanitizedDiff: '', hasRedactions: false, redactionCount: 0 };
    }

    let count = 0;
    let text = rawDiff;

    // 1. Run pattern-based secret masking
    for (const pattern of SECRET_CONTENT_PATTERNS) {
      pattern.lastIndex = 0;
      const matches = text.match(pattern);
      if (matches) {
        count += matches.length;
        text = text.replace(pattern, (match) => {
          // Keep key name if present, mask value
          const colonIdx = match.indexOf(':');
          const eqIdx = match.indexOf('=');
          const splitIdx = colonIdx !== -1 ? colonIdx : eqIdx;
          if (splitIdx !== -1) {
            const prefix = match.slice(0, splitIdx + 1);
            return `${prefix} "[REDACTED_SECRET]"`;
          }
          return '[REDACTED_SECRET]';
        });
      }
    }

    // 2. Run existing SecretRedactor
    const redactorResult = SecretRedactor.redactText(text);
    if (redactorResult !== text) {
      count++;
      text = redactorResult;
    }

    return {
      sanitizedDiff: text,
      hasRedactions: count > 0,
      redactionCount: count,
    };
  }

  /**
   * Produces a comprehensive metadata analysis from a list of changed items and redaction info.
   */
  public static generateAnalysis(
    items: readonly GitFileChangeItemDto[],
    redactionStats: { hasRedactions: boolean; redactionCount: number },
  ): GitChangeAnalysisMetadataDto {
    const newFiles: string[] = [];
    const deletedFiles: string[] = [];
    const modifiedFiles: string[] = [];
    const potentiallyDangerousFiles: string[] = [];
    const dependencyConfigFiles: string[] = [];
    const testFiles: string[] = [];
    const generatedFiles: string[] = [];

    let totalAdditions = 0;
    let totalDeletions = 0;

    for (const item of items) {
      totalAdditions += item.additions;
      totalDeletions += item.deletions;

      if (item.status === 'ADDED' || item.status === 'UNTRACKED') {
        newFiles.push(item.filePath);
      } else if (item.status === 'DELETED') {
        deletedFiles.push(item.filePath);
      } else {
        modifiedFiles.push(item.filePath);
      }

      if (item.isDangerous) {
        potentiallyDangerousFiles.push(item.filePath);
      }
      if (item.isDependencyOrConfig) {
        dependencyConfigFiles.push(item.filePath);
      }
      if (item.isTestFile) {
        testFiles.push(item.filePath);
      }
      if (item.isGeneratedFile) {
        generatedFiles.push(item.filePath);
      }
    }

    let safetyAssessment = 'STANDARD';
    if (potentiallyDangerousFiles.length > 0) {
      safetyAssessment = `ATTENTION_REQUIRED: Contains ${potentiallyDangerousFiles.length} potentially dangerous or infrastructure file(s).`;
    } else if (redactionStats.hasRedactions) {
      safetyAssessment = `ATTENTION_REQUIRED: Redacted ${redactionStats.redactionCount} secret(s) from diff content.`;
    } else if (dependencyConfigFiles.length > 0) {
      safetyAssessment = `REVIEW_DEPENDENCIES: Modifies ${dependencyConfigFiles.length} package or build configuration file(s).`;
    }

    return {
      filesChangedCount: items.length,
      linesAddedCount: totalAdditions,
      linesRemovedCount: totalDeletions,
      newFiles,
      deletedFiles,
      modifiedFiles,
      potentiallyDangerousFiles,
      dependencyConfigFiles,
      testFiles,
      generatedFiles,
      hasSecretRedactions: redactionStats.hasRedactions,
      redactedSecretOccurrences: redactionStats.redactionCount,
      safetyAssessment,
    };
  }
}
