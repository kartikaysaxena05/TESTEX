/**
 * @file packages/core/src/sources/run-config/command-safety-checker.ts
 * Deterministic command string safety inspector and executable/arg structure parser.
 */

import type { RunConfigSafety } from '@ai-quality/contracts';

export interface ParsedCommandResult {
  readonly executable: string;
  readonly args: readonly string[];
  readonly safety: RunConfigSafety;
  readonly reason: string;
}

export class CommandSafetyChecker {
  /**
   * Evaluates a command string for shell chaining, piping, redirection, or dangerous primitives.
   */
  static inspectCommand(rawCommand: string): ParsedCommandResult {
    const trimmed = rawCommand.trim();
    if (!trimmed) {
      return {
        executable: '',
        args: [],
        safety: 'UNSUPPORTED',
        reason: 'Empty command string.',
      };
    }

    // Check for shell meta-characters & chaining operators
    const shellMetaRegex = /(&&|\|\||;|\||>|<|`|\$\(|\r|\n)/;
    if (shellMetaRegex.test(trimmed)) {
      return {
        executable: trimmed.split(/\s+/)[0] ?? '',
        args: [],
        safety: 'REQUIRES_REVIEW',
        reason:
          'Command contains shell chaining, pipelines, redirects, or variable expansions requiring complex shell interpretation.',
      };
    }

    // Check for dangerous / destructive commands
    const dangerousPatterns = [
      /\brm\s+-rf\b/i,
      /\bcurl\b/i,
      /\bwget\b/i,
      /\bpowershell\b/i,
      /\bcmd\.exe\b/i,
      /\beval\b/i,
      /\bsh\b/i,
      /\bbash\b/i,
    ];

    for (const pattern of dangerousPatterns) {
      if (pattern.test(trimmed)) {
        return {
          executable: trimmed.split(/\s+/)[0] ?? '',
          args: [],
          safety: 'REQUIRES_REVIEW',
          reason:
            'Command references potentially high-risk utilities or system shell interpreters.',
        };
      }
    }

    // Tokenize simple space-separated arguments (supporting simple quoted tokens)
    const tokens: string[] = [];
    let currentToken = '';
    let inQuotes = false;
    let quoteChar = '';

    for (let i = 0; i < trimmed.length; i++) {
      const char = trimmed[i]!;

      if ((char === '"' || char === "'") && !inQuotes) {
        inQuotes = true;
        quoteChar = char;
      } else if (char === quoteChar && inQuotes) {
        inQuotes = false;
        quoteChar = '';
      } else if (/\s/.test(char) && !inQuotes) {
        if (currentToken.length > 0) {
          tokens.push(currentToken);
          currentToken = '';
        }
      } else {
        currentToken += char;
      }
    }

    if (currentToken.length > 0) {
      tokens.push(currentToken);
    }

    if (tokens.length === 0) {
      return {
        executable: '',
        args: [],
        safety: 'UNSUPPORTED',
        reason: 'Unable to extract valid executable from command.',
      };
    }

    const executable = tokens[0]!;
    const args = tokens.slice(1);

    // Repository wrapper scripts like ./mvnw or ./gradlew require review
    const isRepoWrapper = executable.startsWith('./') || executable.startsWith('.\\');
    const safety: RunConfigSafety = isRepoWrapper ? 'REQUIRES_REVIEW' : 'SAFE_STRUCTURE';

    return {
      executable,
      args,
      safety,
      reason: isRepoWrapper
        ? 'Command invokes repository-controlled wrapper script.'
        : 'Structured command derived cleanly without shell interpretation.',
    };
  }
}
