/**
 * @file packages/core/src/patch/sandbox/sandbox-patch-applicator.ts
 * Pure, deterministic filesystem patch applicator operating strictly inside a sandbox root.
 * Enforces atomic line edits, conflict detection, before/after SHA-256 capture, and change-set calculation.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import type { StructuredEditOperationDto } from '@ai-quality/contracts';
import { PatchParser } from '../diff/patch-parser.js';
import { SandboxContainmentValidator } from './sandbox-containment-validator.js';
import { PatchSandboxConflictError, PatchSandboxNotFoundError } from './sandbox-errors.js';
import type { ApplyPatchExecutionOptions, SandboxChangeSet } from './sandbox-types.js';

export class SandboxPatchApplicator {
  /**
   * Applies structured edit operations inside sandboxRoot, verifying clean hunk application,
   * calculating before/after hashes, and generating the actual resulting change-set.
   */
  static applyPatchToSandbox(options: ApplyPatchExecutionOptions): SandboxChangeSet {
    const {
      sandboxRoot,
      structuredEdits,
      targetFiles,
      claimedFilesCount,
      claimedLinesAdded,
      claimedLinesRemoved,
    } = options;

    const fileHashesBefore: Record<string, string> = {};
    const fileHashesAfter: Record<string, string> = {};
    const modifiedFiles: string[] = [];
    const createdFiles: string[] = [];
    const deletedFiles: string[] = [];
    const renamedFiles: string[] = [];

    let totalLinesAdded = 0;
    let totalLinesRemoved = 0;
    const diffsPerFile: string[] = [];

    // Group edits by relative file path
    const editsByFile = new Map<string, StructuredEditOperationDto[]>();
    for (const edit of structuredEdits) {
      const normalized = edit.filePath.trim().replace(/\\/g, '/').replace(/^\.\//, '');
      const existing = editsByFile.get(normalized) ?? [];
      existing.push(edit);
      editsByFile.set(normalized, existing);
    }

    // Process each target file
    for (const file of targetFiles) {
      const normalizedFile = file.trim().replace(/\\/g, '/').replace(/^\.\//, '');
      const targetPath = SandboxContainmentValidator.validatePathContainment(
        sandboxRoot,
        normalizedFile,
      );

      if (!fs.existsSync(targetPath)) {
        throw new PatchSandboxNotFoundError(
          `Target file '${normalizedFile}' does not exist inside sandbox at '${targetPath}'.`,
        );
      }

      // 1. Read original content and compute before-hash
      const originalContent = fs.readFileSync(targetPath, 'utf8');
      SandboxContainmentValidator.validateBinaryContent(originalContent, normalizedFile);

      const beforeHash = crypto.createHash('sha256').update(originalContent, 'utf8').digest('hex');
      fileHashesBefore[normalizedFile] = beforeHash;

      const fileEdits = editsByFile.get(normalizedFile) ?? [];
      if (fileEdits.length === 0) {
        fileHashesAfter[normalizedFile] = beforeHash;
        continue;
      }

      // 2. Sort edits descending by startLine to avoid shifting lines
      const sortedEdits = [...fileEdits].sort((a, b) => b.startLine - a.startLine);
      const originalLines = originalContent.split(/\r?\n/);
      let workingLines = [...originalLines];

      for (const edit of sortedEdits) {
        // If line-targeted replacement
        if (edit.startLine > 0 && edit.endLine >= edit.startLine) {
          const zeroIndexedStart = edit.startLine - 1;
          const zeroIndexedEnd = edit.endLine; // slice is non-inclusive

          const existingSlice = workingLines.slice(zeroIndexedStart, zeroIndexedEnd).join('\n');
          const normalizedExisting = existingSlice.trim();
          const normalizedExpected = edit.originalContent.trim();

          // Conflict detection: verify target lines match expected original content
          if (
            normalizedExpected.length > 0 &&
            normalizedExisting !== normalizedExpected &&
            !existingSlice.includes(normalizedExpected)
          ) {
            throw new PatchSandboxConflictError(
              `Patch conflict in '${normalizedFile}' at lines ${edit.startLine}-${edit.endLine}: Content on disk does not match expected patch hunk.\nExpected: '${normalizedExpected.substring(0, 80)}'\nActual: '${normalizedExisting.substring(0, 80)}'`,
            );
          }

          const replacementLines =
            edit.replacementContent.length > 0 ? edit.replacementContent.split(/\r?\n/) : [];

          workingLines.splice(
            zeroIndexedStart,
            zeroIndexedEnd - zeroIndexedStart,
            ...replacementLines,
          );
        } else {
          // Text-level substring replacement fallback
          if (!workingLines.join('\n').includes(edit.originalContent)) {
            throw new PatchSandboxConflictError(
              `Patch conflict in '${normalizedFile}': Original content block to replace was not found in file.`,
            );
          }
          const fullText = workingLines.join('\n');
          const replaced = fullText.replace(edit.originalContent, edit.replacementContent);
          workingLines = replaced.split(/\r?\n/);
        }
      }

      const updatedContent = workingLines.join('\n');

      // 3. Write updated content strictly inside sandbox
      fs.writeFileSync(targetPath, updatedContent, 'utf8');

      // 4. Compute after-hash and diff metrics
      const afterHash = crypto.createHash('sha256').update(updatedContent, 'utf8').digest('hex');
      fileHashesAfter[normalizedFile] = afterHash;

      if (beforeHash !== afterHash) {
        modifiedFiles.push(normalizedFile);
        const fileDiff = PatchParser.generateUnifiedDiff(
          normalizedFile,
          originalContent,
          fileEdits,
        );
        diffsPerFile.push(fileDiff);

        // Count added and removed lines from applied edits
        for (const edit of fileEdits) {
          const added =
            edit.replacementContent.length > 0 ? edit.replacementContent.split(/\r?\n/).length : 0;
          const removed =
            edit.originalContent.length > 0 ? edit.originalContent.split(/\r?\n/).length : 0;
          totalLinesAdded += added;
          totalLinesRemoved += removed;
        }
      }
    }

    const actualUnifiedDiff = diffsPerFile.join('\n');
    const changeSetHash = crypto
      .createHash('sha256')
      .update(actualUnifiedDiff, 'utf8')
      .digest('hex');

    const totalChangedLines = totalLinesAdded + totalLinesRemoved;

    // Verify claim vs actual diff
    const claimedVsActualDiffMatch =
      claimedFilesCount === modifiedFiles.length &&
      claimedLinesAdded === totalLinesAdded &&
      claimedLinesRemoved === totalLinesRemoved;

    return {
      filesModified: modifiedFiles,
      filesCreated: createdFiles,
      filesDeleted: deletedFiles,
      filesRenamed: renamedFiles,
      linesAdded: totalLinesAdded,
      linesRemoved: totalLinesRemoved,
      totalChangedLines,
      actualUnifiedDiff,
      changeSetHash,
      fileHashesBefore,
      fileHashesAfter,
      claimedVsActualDiffMatch,
    };
  }
}
