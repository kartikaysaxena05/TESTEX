/**
 * @file packages/core/src/localization/signals/stack-trace-correlator.ts
 * Parses runtime stack traces, normalizes paths, and correlates them directly with repository files and symbols.
 */

import type { LocalizationContext, RawCandidateFact } from '../defect-localization-types.js';

export interface StackTraceCorrelationResult {
  readonly facts: readonly RawCandidateFact[];
  readonly hasTrustedStack: boolean;
  readonly framesParsed: number;
  readonly topSourceFile?: string | null;
  readonly topLineNumber?: number | null;
  readonly topColumnNumber?: number | null;
  readonly topSymbolName?: string | null;
}

interface ParsedFrame {
  readonly raw: string;
  readonly filePath: string;
  readonly lineNumber: number;
  readonly columnNumber?: number | null;
  readonly symbolName?: string | null;
}

export class StackTraceCorrelator {
  /**
   * Regular expressions for parsing standard V8, Node, and browser stack frames.
   * e.g. "at Object.authenticateUser (/app/src/auth/login-service.ts:42:15)"
   * or "at /app/src/auth/login-service.ts:42:15"
   * or "login-service.ts:42:15"
   */
  private static readonly FRAME_REGEXES = [
    /at\s+(?:([a-zA-Z0-9_$<>.]+)\s+\()?([^:()]+):(\d+):(\d+)\)?/,
    /([a-zA-Z0-9_$/\\.-]+\.[a-zA-Z0-9]+):(\d+):(\d+)/,
  ];

  /**
   * Correlates execution console errors, failure signatures, and technical localization stack info.
   */
  public correlate(context: LocalizationContext): StackTraceCorrelationResult {
    const rawTraces: string[] = [];

    if (context.failureCase.errorMessage) {
      rawTraces.push(context.failureCase.errorMessage);
    }
    for (const log of context.consoleEvidence) {
      if (log.stack) rawTraces.push(log.stack);
      if (log.message) rawTraces.push(log.message);
    }
    if (context.failedStep?.errorMessage) {
      rawTraces.push(context.failedStep.errorMessage);
    }

    const frames: ParsedFrame[] = [];
    for (const text of rawTraces) {
      const parsed = this.parseFrames(text);
      frames.push(...parsed);
    }

    if (frames.length === 0) {
      return {
        facts: [],
        hasTrustedStack: false,
        framesParsed: 0,
        topSourceFile: null,
        topLineNumber: null,
        topColumnNumber: null,
        topSymbolName: null,
      };
    }

    const facts: RawCandidateFact[] = [];
    let topSourceFile: string | null = null;
    let topLineNumber: number | null = null;
    let topColumnNumber: number | null = null;
    let topSymbolName: string | null = null;

    // Filter out node_modules, internal node frames, and match against repo files
    for (const frame of frames) {
      if (
        frame.filePath.includes('node_modules') ||
        frame.filePath.startsWith('node:') ||
        frame.filePath.startsWith('internal/')
      ) {
        continue;
      }

      const normalizedFramePath = this.normalizeFilePath(frame.filePath);

      // Match against repository files
      const matchedFile = context.repositoryFiles.find(rf => {
        const normRf = this.normalizeFilePath(rf.relativePath);
        return (
          normRf === normalizedFramePath ||
          normRf.endsWith(normalizedFramePath) ||
          normalizedFramePath.endsWith(normRf)
        );
      });

      if (!matchedFile) continue;

      if (!topSourceFile) {
        topSourceFile = matchedFile.relativePath;
        topLineNumber = frame.lineNumber;
        topColumnNumber = frame.columnNumber ?? null;
        topSymbolName = frame.symbolName ?? null;
      }

      // Check if line falls within any indexed symbol range
      const symbolAtLine = matchedFile.symbols.find(
        s => frame.lineNumber >= s.startLine && frame.lineNumber <= s.endLine,
      );

      const resolvedSymbolName = frame.symbolName ?? symbolAtLine?.name ?? null;

      facts.push({
        filePath: matchedFile.relativePath,
        symbolName: resolvedSymbolName,
        symbolKind: symbolAtLine?.kind ?? 'FUNCTION',
        candidateType: 'FUNCTION',
        startLine: symbolAtLine?.startLine ?? frame.lineNumber,
        endLine: symbolAtLine?.endLine ?? frame.lineNumber,
        signal: 'STACK_TRACE',
        strength: 'STRONG',
        description: `Trusted runtime stack frame directly pinpoints '${matchedFile.relativePath}:${frame.lineNumber}'${resolvedSymbolName ? ` in '${resolvedSymbolName}'` : ''}.`,
        provenance: `Stack trace: ${frame.raw}`,
        rawReference: frame.raw,
      });
    }

    return {
      facts,
      hasTrustedStack: facts.length > 0,
      framesParsed: frames.length,
      topSourceFile,
      topLineNumber,
      topColumnNumber,
      topSymbolName,
    };
  }

  private parseFrames(text: string): ParsedFrame[] {
    const lines = text.split('\n');
    const result: ParsedFrame[] = [];

    for (const line of lines) {
      const trimmed = line.trim();
      for (const regex of StackTraceCorrelator.FRAME_REGEXES) {
        const match = trimmed.match(regex);
        if (match) {
          if (match.length >= 5) {
            // regex 1: symbol, path, line, col
            const symbolName = match[1]?.trim() || null;
            const filePath = match[2]?.trim();
            const lineNumber = parseInt(match[3] || '0', 10);
            const columnNumber = parseInt(match[4] || '0', 10);
            if (filePath && lineNumber > 0) {
              result.push({ raw: trimmed, filePath, lineNumber, columnNumber, symbolName });
            }
          } else if (match.length >= 4) {
            // regex 2: path, line, col
            const filePath = match[1]?.trim();
            const lineNumber = parseInt(match[2] || '0', 10);
            const columnNumber = parseInt(match[3] || '0', 10);
            if (filePath && lineNumber > 0) {
              result.push({ raw: trimmed, filePath, lineNumber, columnNumber, symbolName: null });
            }
          }
          break;
        }
      }
    }

    return result;
  }

  private normalizeFilePath(p: string): string {
    return p
      .replace(/\\/g, '/')
      .replace(/^webpack:\/\/\/?/, '')
      .replace(/^file:\/\/\/?/, '')
      .replace(/^\.\//, '')
      .toLowerCase();
  }
}
