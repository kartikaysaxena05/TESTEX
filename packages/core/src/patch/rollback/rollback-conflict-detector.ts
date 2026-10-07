/**
 * @file packages/core/src/patch/rollback/rollback-conflict-detector.ts
 * Conflict detection engine for V7 Phase 105 Patch Rollback & Recovery.
 * Distinguishes between independent non-overlapping user edits (which are safely preserved)
 * and overlapping / conflicting edits (which block rollback to prevent silent corruption).
 */

import fs from 'node:fs';
import path from 'node:path';
import type {
  PatchRollbackConflictTypeDto,
  RollbackConflictItemDto,
  StructuredEditOperationDto,
} from '@ai-quality/contracts';
import { SandboxContainmentValidator } from '../sandbox/sandbox-containment-validator.js';

export interface FileConflictCheckResult {
  hasConflicts: boolean;
  conflicts: RollbackConflictItemDto[];
  adjustedEdits: StructuredEditOperationDto[];
  hasIndependentUserEdits: boolean;
}

export class RollbackConflictDetector {
  /**
   * Evaluates target files and structured edits against current workspace disk state.
   */
  public static detectConflicts(options: {
    workspaceRoot: string;
    targetFiles: string[];
    structuredEdits: StructuredEditOperationDto[];
    newerAppliedApprovals?: Array<{ id: string; affectedFiles: string[]; appliedAt: Date | null }>;
  }): {
    canRollback: boolean;
    conflicts: RollbackConflictItemDto[];
    adjustedEditsByFile: Map<string, StructuredEditOperationDto[]>;
    preservedFiles: string[];
  } {
    const { workspaceRoot, targetFiles, structuredEdits, newerAppliedApprovals = [] } = options;
    const conflicts: RollbackConflictItemDto[] = [];
    const adjustedEditsByFile = new Map<string, StructuredEditOperationDto[]>();

    const normalizedTargetFiles = targetFiles.map(f =>
      path.normalize(f).replace(/\\/g, '/').replace(/^\.\//, ''),
    );
    const targetSet = new Set(normalizedTargetFiles);

    // 1. Check for newer applied patches that touched the same files
    for (const newer of newerAppliedApprovals) {
      const newerNormalized = (newer.affectedFiles || []).map(f =>
        path.normalize(f).replace(/\\/g, '/').replace(/^\.\//, ''),
      );
      const overlapping = newerNormalized.filter(f => targetSet.has(f));
      if (overlapping.length > 0) {
        for (const f of overlapping) {
          conflicts.push({
            type: 'NEWER_PATCH_CONFLICT',
            filePath: f,
            details: `A newer patch '${newer.id}' was applied to '${f}' after this patch. Rollback is blocked to prevent cascading regression.`,
          });
        }
      }
    }

    // 2. Group edits by file
    const editsByFile = new Map<string, StructuredEditOperationDto[]>();
    for (const edit of structuredEdits) {
      const normalized = path.normalize(edit.filePath).replace(/\\/g, '/').replace(/^\.\//, '');
      const existing = editsByFile.get(normalized) ?? [];
      existing.push(edit);
      editsByFile.set(normalized, existing);
    }

    // 3. Inspect each target file on disk
    for (const relFile of normalizedTargetFiles) {
      const absPath = path.resolve(workspaceRoot, relFile);

      // Check path containment & security
      try {
        SandboxContainmentValidator.validatePathContainment(workspaceRoot, relFile);
        SandboxContainmentValidator.validateGitMetadata(relFile);
        SandboxContainmentValidator.validateSensitiveFiles(relFile);
      } catch (secErr: any) {
        conflicts.push({
          type: 'SAME_FILE_CONFLICT',
          filePath: relFile,
          details: `Security validation failed for '${relFile}': ${secErr.message}`,
        });
        continue;
      }

      if (!fs.existsSync(absPath)) {
        conflicts.push({
          type: 'FILE_DELETED',
          filePath: relFile,
          details: `Target file '${relFile}' was deleted or moved after patch was applied. Cannot rollback automatically.`,
        });
        continue;
      }

      let diskContent: string;
      try {
        diskContent = fs.readFileSync(absPath, 'utf8');
      } catch (readErr: any) {
        conflicts.push({
          type: 'SAME_FILE_CONFLICT',
          filePath: relFile,
          details: `Could not read file '${relFile}': ${readErr.message}`,
        });
        continue;
      }

      const fileEdits = editsByFile.get(relFile) ?? [];
      if (fileEdits.length === 0) {
        adjustedEditsByFile.set(relFile, []);
        continue;
      }

      // Check hunk matching and detect user modifications
      const fileResult = this.checkFileEdits(relFile, diskContent, fileEdits);
      if (fileResult.hasConflicts) {
        conflicts.push(...fileResult.conflicts);
      } else {
        adjustedEditsByFile.set(relFile, fileResult.adjustedEdits);
      }
    }

    // 4. Determine preserved files (unrelated workspace files)
    const preservedFiles: string[] = [];
    try {
      const allFiles = this.findWorkspaceFiles(workspaceRoot);
      for (const f of allFiles) {
        const norm = path.normalize(f).replace(/\\/g, '/').replace(/^\.\//, '');
        if (!targetSet.has(norm)) {
          preservedFiles.push(norm);
        }
      }
    } catch {
      // Fallback
    }

    return {
      canRollback: conflicts.length === 0,
      conflicts,
      adjustedEditsByFile,
      preservedFiles,
    };
  }

  /**
   * Analyzes an individual file's edits against current disk content.
   */
  private static checkFileEdits(
    filePath: string,
    diskContent: string,
    edits: StructuredEditOperationDto[],
  ): FileConflictCheckResult {
    const diskLines = diskContent.split(/\r?\n/);
    const conflicts: RollbackConflictItemDto[] = [];
    const adjustedEdits: StructuredEditOperationDto[] = [];
    let hasIndependentUserEdits = false;

    // In a rollback, we want to REVERT each edit:
    // Original edit replaced originalContent with replacementContent.
    // Therefore, rollback expects disk to have replacementContent and restore originalContent.
    for (const edit of edits) {
      const { startLine, originalContent, replacementContent } = edit;
      const expectedOnDisk = replacementContent.length > 0 ? replacementContent.split(/\r?\n/) : [];

      if (expectedOnDisk.length === 0) {
        // The original edit was an insertion of nothing (or pure deletion).
        // Rollback needs to insert originalContent back.
        // Check if the insertion line is valid.
        if (startLine > diskLines.length + 1) {
          conflicts.push({
            type: 'SAME_FILE_CONFLICT',
            filePath,
            startLine,
            details: `Target line ${startLine} is beyond current file length (${diskLines.length} lines). File may have been truncated.`,
          });
          continue;
        }

        adjustedEdits.push({
          ...edit,
          // For rollback: replacementContent is what to write, originalContent is what was on disk
          originalContent: replacementContent,
          replacementContent: originalContent,
          startLine,
          endLine: startLine - 1,
        });
        continue;
      }

      // Check if diskLines contains expectedOnDisk at startLine
      const sliceCount = expectedOnDisk.length;
      const directSlice = diskLines.slice(startLine - 1, startLine - 1 + sliceCount);
      const directMatch = directSlice.join('\n') === expectedOnDisk.join('\n');

      if (directMatch) {
        // Direct match at original position!
        adjustedEdits.push({
          ...edit,
          originalContent: replacementContent,
          replacementContent: originalContent,
          startLine,
          endLine: startLine - 1 + sliceCount,
        });
        continue;
      }

      // If not matching at startLine, search if expectedOnDisk exists elsewhere in the file
      // (indicating independent user lines were added/removed elsewhere in the same file)
      const expectedJoined = expectedOnDisk.join('\n');
      let foundOffset: number | null = null;
      let matchOccurrences = 0;

      for (let i = 0; i <= diskLines.length - sliceCount; i++) {
        const slice = diskLines.slice(i, i + sliceCount).join('\n');
        if (slice === expectedJoined) {
          foundOffset = i + 1;
          matchOccurrences++;
        }
      }

      if (matchOccurrences === 1 && foundOffset !== null) {
        // Found exact match at shifted line! Independent user edits preserved!
        hasIndependentUserEdits = true;
        adjustedEdits.push({
          ...edit,
          originalContent: replacementContent,
          replacementContent: originalContent,
          startLine: foundOffset,
          endLine: foundOffset - 1 + sliceCount,
        });
        continue;
      }

      // If not found or multiple ambiguous matches, check if lines at startLine were modified
      const actualAtOriginal = directSlice.join('\n');
      conflicts.push({
        type: 'OVERLAPPING_USER_CHANGES',
        filePath,
        startLine,
        endLine: startLine + sliceCount - 1,
        details: `Conflict in '${filePath}' at lines ${startLine}-${startLine + sliceCount - 1}: Applied patch content was modified or displaced by subsequent user edits.`,
        conflictingContent: actualAtOriginal.slice(0, 500),
      });
    }

    return {
      hasConflicts: conflicts.length > 0,
      conflicts,
      adjustedEdits,
      hasIndependentUserEdits,
    };
  }

  /**
   * Recursively finds workspace files (skipping .git, node_modules, etc.).
   */
  private static findWorkspaceFiles(root: string, current = ''): string[] {
    const dir = path.resolve(root, current);
    if (!fs.existsSync(dir)) return [];

    const entries = fs.readdirSync(dir, { withFileTypes: true });
    const results: string[] = [];

    for (const entry of entries) {
      if (
        entry.name === '.git' ||
        entry.name === 'node_modules' ||
        entry.name === '.ai-recovery' ||
        entry.name === 'dist'
      ) {
        continue;
      }
      const rel = current ? `${current}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        results.push(...this.findWorkspaceFiles(root, rel));
      } else if (entry.isFile()) {
        results.push(rel);
      }
    }
    return results;
  }
}
