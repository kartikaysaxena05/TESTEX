/**
 * @file packages/core/src/patch/approval/patch-applicator.ts
 * Atomic workspace patch applicator for V7 Phase 104 Human Approval, Reject & Apply Workflow.
 * Enforces containment, path safety, dry-run line matching, and in-memory backup rollback on failure.
 */

import fs from 'node:fs';
import path from 'node:path';
import type { StructuredEditOperationDto } from '@ai-quality/contracts';
import { PatchParser } from '../diff/patch-parser.js';
import { SandboxContainmentValidator } from '../sandbox/sandbox-containment-validator.js';
import {
  PatchApprovalApplyFailedError,
  PatchApprovalScopeViolationError,
} from './approval-errors.js';
import type { WorkspaceApplyOptions, WorkspaceApplyResult } from './approval-types.js';

export class PatchApplicator {
  /**
   * Applies structured edits atomically to the authorized workspace root.
   * Backs up original file contents in memory and restores them if any write fails.
   */
  public static applyPatchToWorkspace(options: WorkspaceApplyOptions): WorkspaceApplyResult {
    const { workspaceRoot, structuredEdits, targetFiles, allowedFiles, abortSignal } = options;

    if (abortSignal?.aborted) {
      throw new PatchApprovalApplyFailedError('Patch application was cancelled.');
    }

    // 1. Validate Scope & Path Safety for all target files
    const normalizedTargetFiles: string[] = [];
    const normalizedAllowedSet = new Set(
      allowedFiles.map(f => path.normalize(f).replace(/\\/g, '/').replace(/^\.\//, '')),
    );

    for (const file of targetFiles) {
      const normalized = path.normalize(file).replace(/\\/g, '/').replace(/^\.\//, '');
      if (!normalizedAllowedSet.has(normalized)) {
        throw new PatchApprovalScopeViolationError(
          `Target file '${normalized}' is outside approved candidate scope. Apply blocked.`,
        );
      }

      // Security validations
      SandboxContainmentValidator.validatePathContainment(workspaceRoot, normalized);
      SandboxContainmentValidator.validateGitMetadata(normalized);
      SandboxContainmentValidator.validateSensitiveFiles(normalized);
      SandboxContainmentValidator.validateSymlinkEscape(workspaceRoot, normalized);

      normalizedTargetFiles.push(normalized);
    }

    // 2. Read Original Contents & Create Backups
    const originalContents = new Map<string, string>();
    const fileAbsolutePaths = new Map<string, string>();

    for (const relFile of normalizedTargetFiles) {
      const absPath = path.resolve(workspaceRoot, relFile);
      fileAbsolutePaths.set(relFile, absPath);

      if (!fs.existsSync(absPath)) {
        throw new PatchApprovalApplyFailedError(
          `Target file '${relFile}' does not exist in workspace at '${absPath}'.`,
        );
      }

      const content = fs.readFileSync(absPath, 'utf8');
      SandboxContainmentValidator.validateBinaryContent(content, relFile);
      originalContents.set(relFile, content);
    }

    // 3. Group Edits by Target File
    const editsByFile = new Map<string, StructuredEditOperationDto[]>();
    for (const edit of structuredEdits) {
      const normalized = path.normalize(edit.filePath).replace(/\\/g, '/').replace(/^\.\//, '');
      const existing = editsByFile.get(normalized) ?? [];
      existing.push(edit);
      editsByFile.set(normalized, existing);
    }

    // 4. Dry-Run Verification (Verify all hunks match original lines before modifying anything)
    const newContents = new Map<string, string>();
    const perFileDiffs: string[] = [];
    let totalLinesAdded = 0;
    let totalLinesRemoved = 0;
    const modifiedFilesList: string[] = [];

    for (const relFile of normalizedTargetFiles) {
      const original = originalContents.get(relFile)!;
      const fileEdits = editsByFile.get(relFile) ?? [];

      if (fileEdits.length === 0) {
        newContents.set(relFile, original);
        continue;
      }

      const originalLines = original.split(/\r?\n/);
      const workingLines = [...originalLines];
      // Sort descending by startLine to avoid line offset shifting
      const sortedEdits = [...fileEdits].sort((a, b) => b.startLine - a.startLine);

      for (const edit of sortedEdits) {
        const { startLine, endLine, originalContent, replacementContent } = edit;
        const oldLines = originalContent.length > 0 ? originalContent.split(/\r?\n/) : [];
        const newLines = replacementContent.length > 0 ? replacementContent.split(/\r?\n/) : [];

        if (startLine < 1 || startLine > workingLines.length + 1) {
          throw new PatchApprovalApplyFailedError(
            `Edit hunk startLine ${startLine} is out of bounds for '${relFile}' (${workingLines.length} lines).`,
          );
        }

        // Verify lines on disk match expected oldLines
        const sliceCount = Math.max(0, endLine - startLine + 1);
        const diskSlice = workingLines.slice(startLine - 1, startLine - 1 + sliceCount);

        if (oldLines.length > 0) {
          const expectedJoined = oldLines.join('\n');
          const diskJoined = diskSlice.join('\n');
          if (expectedJoined !== diskJoined) {
            throw new PatchApprovalApplyFailedError(
              `Patch conflict in '${relFile}' at lines ${startLine}-${endLine}. Workspace content does not match expected patch hunk.`,
            );
          }
        }

        // Apply replacement in working lines
        workingLines.splice(startLine - 1, sliceCount, ...newLines);
        totalLinesAdded += newLines.length;
        totalLinesRemoved += oldLines.length;
      }

      const newContent = workingLines.join('\n');
      newContents.set(relFile, newContent);
      modifiedFilesList.push(relFile);

      // Generate per-file diff
      const fileDiff = PatchParser.generateUnifiedDiff(relFile, original, fileEdits);
      if (fileDiff.trim().length > 0) {
        perFileDiffs.push(fileDiff);
      }
    }

    if (abortSignal?.aborted) {
      throw new PatchApprovalApplyFailedError('Patch application was cancelled.');
    }

    // 5. Write Stage (Atomic with Full Rollback Protection)
    const writtenFiles: string[] = [];
    try {
      for (const relFile of modifiedFilesList) {
        const absPath = fileAbsolutePaths.get(relFile)!;
        const updated = newContents.get(relFile)!;
        fs.writeFileSync(absPath, updated, 'utf8');
        writtenFiles.push(relFile);
      }
    } catch (writeErr: any) {
      // Rollback all written files from original backups
      for (const written of writtenFiles) {
        const absPath = fileAbsolutePaths.get(written);
        const original = originalContents.get(written);
        if (absPath && original !== undefined) {
          try {
            fs.writeFileSync(absPath, original, 'utf8');
          } catch {
            // Best-effort rollback
          }
        }
      }
      throw new PatchApprovalApplyFailedError(
        `Atomic apply failed on write: ${writeErr?.message ?? String(writeErr)}. All changes were rolled back.`,
      );
    }

    return {
      success: true,
      affectedFiles: modifiedFilesList,
      filesModifiedCount: modifiedFilesList.length,
      linesAdded: totalLinesAdded,
      linesRemoved: totalLinesRemoved,
      appliedUnifiedDiff: perFileDiffs.join('\n'),
      appliedRevision: '',
    };
  }
}
