/**
 * @file packages/core/src/patch/diff/patch-parser.ts
 * Parser, validator, and generator for machine-verifiable unified diffs and structured edits.
 */

import type { StructuredEditOperationDto } from '@ai-quality/contracts';
import { PATCH_BOUNDS } from '../patch-types.js';
import { PatchProposalMalformedDiffError, PatchProposalOversizedError } from '../patch-errors.js';

export interface DiffHunk {
  readonly oldStart: number;
  readonly oldLines: number;
  readonly newStart: number;
  readonly newLines: number;
  readonly lines: readonly string[];
}

export interface FileDiffResult {
  readonly oldPath: string;
  readonly newPath: string;
  readonly filePath: string;
  readonly hunks: readonly DiffHunk[];
  readonly linesAdded: number;
  readonly linesRemoved: number;
  readonly totalChangedLines: number;
  readonly structuredEdits: readonly StructuredEditOperationDto[];
}

export interface ParsedDiffResult {
  readonly files: readonly FileDiffResult[];
  readonly totalFilesChanged: number;
  readonly totalLinesAdded: number;
  readonly totalLinesRemoved: number;
  readonly totalChangedLines: number;
}

export class PatchParser {
  /**
   * Parses unified diff text into machine-verifiable structured hunks and edit operations.
   * Throws PatchProposalMalformedDiffError if syntax is invalid or hunk line counts mismatch.
   */
  public static parseUnifiedDiff(
    diffText: string,
    originalFileContents?: Map<string, string>,
  ): ParsedDiffResult {
    if (!diffText || typeof diffText !== 'string' || !diffText.trim()) {
      throw new PatchProposalMalformedDiffError('Unified diff text cannot be empty.');
    }

    if (diffText.length > PATCH_BOUNDS.MAX_DIFF_BYTES) {
      throw new PatchProposalOversizedError(
        `Diff size (${diffText.length} bytes) exceeds limit of ${PATCH_BOUNDS.MAX_DIFF_BYTES} bytes.`,
      );
    }

    const lines = diffText.replace(/\r\n/g, '\n').split('\n');
    const files: FileDiffResult[] = [];

    let i = 0;
    while (i < lines.length) {
      // Find start of file diff: --- a/path or --- path
      const line = lines[i];
      if (line === undefined) {
        break;
      }
      if (!line.startsWith('--- ')) {
        i++;
        continue;
      }

      const oldPathRaw = line.substring(4).trim();
      i++;
      const nextPlusLine = lines[i];
      if (i >= lines.length || !nextPlusLine || !nextPlusLine.startsWith('+++ ')) {
        throw new PatchProposalMalformedDiffError(
          `Malformed diff: Expected '+++ ' header after line ${i}, but found: '${nextPlusLine ?? 'EOF'}'`,
        );
      }

      const newPathRaw = nextPlusLine.substring(4).trim();
      i++;

      // Sanitize paths: strip a/ or b/ prefixes if present
      const oldPath = oldPathRaw.replace(/^[ab]\//, '');
      const newPath = newPathRaw.replace(/^[ab]\//, '');
      const filePath = newPath === '/dev/null' ? oldPath : newPath;

      const hunks: DiffHunk[] = [];
      const structuredEdits: StructuredEditOperationDto[] = [];
      let fileLinesAdded = 0;
      let fileLinesRemoved = 0;

      // Parse hunks for this file
      while (i < lines.length) {
        const hunkLine = lines[i];
        if (hunkLine === undefined || hunkLine.startsWith('--- ')) {
          break;
        }
        if (!hunkLine.startsWith('@@ ')) {
          // If trailing diff comments or git metadata, advance
          i++;
          continue;
        }

        // Parse hunk header: @@ -oldStart[,oldLines] +newStart[,newLines] @@
        const hunkMatch = hunkLine.match(/^@@\s+-(\d+)(?:,(\d+))?\s+\+(\d+)(?:,(\d+))?\s+@@/);
        if (!hunkMatch) {
          throw new PatchProposalMalformedDiffError(
            `Malformed hunk header at line ${i + 1}: '${hunkLine}'`,
          );
        }

        const oldStart = parseInt(hunkMatch[1] ?? '1', 10);
        const oldLines = hunkMatch[2] !== undefined ? parseInt(hunkMatch[2], 10) : 1;
        const newStart = parseInt(hunkMatch[3] ?? '1', 10);
        const newLines = hunkMatch[4] !== undefined ? parseInt(hunkMatch[4], 10) : 1;

        i++;
        const hunkContentLines: string[] = [];
        let actualOldLines = 0;
        let actualNewLines = 0;
        const hunkRemovedLines: string[] = [];
        const hunkAddedLines: string[] = [];

        while (i < lines.length) {
          const contentLine = lines[i];
          if (contentLine === undefined) {
            break;
          }
          if (
            contentLine.startsWith('@@ ') ||
            contentLine.startsWith('--- ') ||
            (actualOldLines >= oldLines && actualNewLines >= newLines)
          ) {
            break;
          }

          const prefix = contentLine[0];
          if (prefix === ' ') {
            actualOldLines++;
            actualNewLines++;
            hunkContentLines.push(contentLine);
          } else if (prefix === '-') {
            actualOldLines++;
            fileLinesRemoved++;
            hunkRemovedLines.push(contentLine.substring(1));
            hunkContentLines.push(contentLine);
          } else if (prefix === '+') {
            actualNewLines++;
            fileLinesAdded++;
            hunkAddedLines.push(contentLine.substring(1));
            hunkContentLines.push(contentLine);
          } else if (
            contentLine === '' &&
            actualOldLines >= oldLines &&
            actualNewLines >= newLines
          ) {
            break;
          } else {
            // Unrecognized line inside hunk
            throw new PatchProposalMalformedDiffError(
              `Malformed line inside hunk at line ${i + 1}: expected ' ', '-', or '+' prefix, got '${contentLine.substring(0, 20)}'`,
            );
          }
          i++;
        }

        // Validate hunk line counts
        if (actualOldLines !== oldLines || actualNewLines !== newLines) {
          throw new PatchProposalMalformedDiffError(
            `Hunk header line count mismatch in ${filePath}: declared -${oldStart},${oldLines} +${newStart},${newLines}, but actual counts are -${actualOldLines} +${actualNewLines}`,
          );
        }

        hunks.push({
          oldStart,
          oldLines,
          newStart,
          newLines,
          lines: hunkContentLines,
        });

        // Convert hunk into structured edit operation
        structuredEdits.push({
          filePath,
          startLine: oldStart,
          endLine: oldStart + Math.max(oldLines - 1, 0),
          originalContent: hunkRemovedLines.join('\n'),
          replacementContent: hunkAddedLines.join('\n'),
        });
      }

      if (hunks.length === 0) {
        throw new PatchProposalMalformedDiffError(
          `File diff for '${filePath}' has no valid hunks.`,
        );
      }

      // Optional verification against original file content
      if (originalFileContents && originalFileContents.has(filePath)) {
        const fileContent = originalFileContents.get(filePath)!;
        PatchParser.validateHunksAgainstContent(filePath, fileContent, hunks);
      }

      files.push({
        oldPath,
        newPath,
        filePath,
        hunks,
        linesAdded: fileLinesAdded,
        linesRemoved: fileLinesRemoved,
        totalChangedLines: fileLinesAdded + fileLinesRemoved,
        structuredEdits,
      });
    }

    if (files.length === 0) {
      throw new PatchProposalMalformedDiffError(
        'No valid file diff headers (--- / +++) found in unified diff.',
      );
    }

    const totalLinesAdded = files.reduce((acc, f) => acc + f.linesAdded, 0);
    const totalLinesRemoved = files.reduce((acc, f) => acc + f.linesRemoved, 0);
    const totalChangedLines = totalLinesAdded + totalLinesRemoved;

    // Validate size bounds
    PatchParser.validateBounds({
      filesChanged: files.length,
      linesAdded: totalLinesAdded,
      linesRemoved: totalLinesRemoved,
      totalChangedLines,
      diffLength: diffText.length,
    });

    return {
      files,
      totalFilesChanged: files.length,
      totalLinesAdded,
      totalLinesRemoved,
      totalChangedLines,
    };
  }

  /**
   * Generates a canonical unified diff from original file content and structured edit operations.
   */
  public static generateUnifiedDiff(
    filePath: string,
    originalContent: string,
    structuredEdits: readonly StructuredEditOperationDto[],
  ): string {
    if (!structuredEdits || structuredEdits.length === 0) {
      throw new PatchProposalMalformedDiffError('Cannot generate diff without structured edits.');
    }

    const cleanContent = originalContent.replace(/\r\n/g, '\n');
    const fileLines = cleanContent.endsWith('\n')
      ? cleanContent.slice(0, -1).split('\n')
      : cleanContent.split('\n');
    const header = `--- a/${filePath}\n+++ b/${filePath}\n`;
    const hunkTexts: string[] = [];

    // Sort edits by startLine ascending
    const sortedEdits = [...structuredEdits].sort((a, b) => a.startLine - b.startLine);

    for (const edit of sortedEdits) {
      const startLine = edit.startLine;
      const endLine = edit.endLine;

      // Extract context: 2 lines before, 2 lines after if available
      const contextBeforeStart = Math.max(1, startLine - 2);
      const contextBefore = fileLines.slice(contextBeforeStart - 1, startLine - 1);

      const oldOriginalLines = fileLines.slice(startLine - 1, endLine);
      const replacementLines = edit.replacementContent.split('\n');

      const contextAfterEnd = Math.min(fileLines.length, endLine + 2);
      const contextAfter = fileLines.slice(endLine, contextAfterEnd);

      const oldLineCount = contextBefore.length + oldOriginalLines.length + contextAfter.length;
      const newLineCount = contextBefore.length + replacementLines.length + contextAfter.length;

      let hunk = `@@ -${contextBeforeStart},${oldLineCount} +${contextBeforeStart},${newLineCount} @@\n`;

      for (const line of contextBefore) {
        hunk += ` ${line}\n`;
      }
      for (const line of oldOriginalLines) {
        hunk += `-${line}\n`;
      }
      for (const line of replacementLines) {
        hunk += `+${line}\n`;
      }
      for (const line of contextAfter) {
        hunk += ` ${line}\n`;
      }

      hunkTexts.push(hunk.trimEnd());
    }

    return header + hunkTexts.join('\n') + '\n';
  }

  /**
   * Validates that hunk content matches original file content at the hunk line numbers.
   */
  public static validateHunksAgainstContent(
    filePath: string,
    content: string,
    hunks: readonly DiffHunk[],
  ): void {
    const lines = content.replace(/\r\n/g, '\n').split('\n');

    for (const hunk of hunks) {
      let currentLineNum = hunk.oldStart;
      for (const hunkLine of hunk.lines) {
        const prefix = hunkLine[0];
        const lineText = hunkLine.substring(1);

        if (prefix === ' ' || prefix === '-') {
          const originalLine = lines[currentLineNum - 1];
          if (originalLine === undefined) {
            throw new PatchProposalMalformedDiffError(
              `Diff references line ${currentLineNum} in ${filePath}, which exceeds file length (${lines.length} lines).`,
            );
          }
          if (originalLine !== lineText) {
            throw new PatchProposalMalformedDiffError(
              `Diff line content mismatch in ${filePath} at line ${currentLineNum}:\nExpected in file: '${originalLine}'\nActual in diff:   '${lineText}'`,
            );
          }
          currentLineNum++;
        }
      }
    }
  }

  /**
   * Enforces strict safety limits on diff size and changed lines.
   */
  public static validateBounds(metrics: {
    filesChanged: number;
    linesAdded: number;
    linesRemoved: number;
    totalChangedLines: number;
    diffLength: number;
  }): void {
    if (metrics.filesChanged > PATCH_BOUNDS.MAX_FILES_CHANGED) {
      throw new PatchProposalOversizedError(
        `Patch modifies ${metrics.filesChanged} files, exceeding limit of ${PATCH_BOUNDS.MAX_FILES_CHANGED} files.`,
      );
    }
    if (metrics.linesAdded > PATCH_BOUNDS.MAX_LINES_ADDED) {
      throw new PatchProposalOversizedError(
        `Patch adds ${metrics.linesAdded} lines, exceeding limit of ${PATCH_BOUNDS.MAX_LINES_ADDED} lines.`,
      );
    }
    if (metrics.linesRemoved > PATCH_BOUNDS.MAX_LINES_REMOVED) {
      throw new PatchProposalOversizedError(
        `Patch removes ${metrics.linesRemoved} lines, exceeding limit of ${PATCH_BOUNDS.MAX_LINES_REMOVED} lines.`,
      );
    }
    if (metrics.totalChangedLines > PATCH_BOUNDS.MAX_TOTAL_CHANGED_LINES) {
      throw new PatchProposalOversizedError(
        `Patch has ${metrics.totalChangedLines} total changed lines, exceeding limit of ${PATCH_BOUNDS.MAX_TOTAL_CHANGED_LINES} lines.`,
      );
    }
    if (metrics.diffLength > PATCH_BOUNDS.MAX_DIFF_BYTES) {
      throw new PatchProposalOversizedError(
        `Patch diff byte size (${metrics.diffLength}) exceeds limit of ${PATCH_BOUNDS.MAX_DIFF_BYTES} bytes.`,
      );
    }
  }
}
