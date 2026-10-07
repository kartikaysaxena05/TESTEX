/**
 * @file packages/core/src/patch/rollback/rollback-planner.ts
 * Dry-run and execution planner for V7 Phase 105 Patch Rollback & Recovery.
 * Computes exact reverse operations, hashes (S0, S1, S2), diffs, and non-destructive plan.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { StructuredEditOperationDto } from '@ai-quality/contracts';
import { PatchParser } from '../diff/patch-parser.js';
import { RollbackConflictDetector } from './rollback-conflict-detector.js';
import type { RollbackPlanOptions, RollbackPlanResult } from './rollback-types.js';

export class RollbackPlanner {
  /**
   * Plans the rollback of an applied patch proposal without modifying any files on disk.
   */
  public static planRollback(options: RollbackPlanOptions): RollbackPlanResult {
    const { workspaceRoot, approval, patchProposal, abortSignal } = options;

    if (abortSignal?.aborted) {
      throw new Error('Rollback planning was cancelled.');
    }

    const structuredEdits =
      (patchProposal.structuredEditsJson as unknown as StructuredEditOperationDto[]) || [];
    const targetFiles: string[] = patchProposal.targetFiles || approval.affectedFiles || [];

    // Run conflict detection
    const conflictResult = RollbackConflictDetector.detectConflicts({
      workspaceRoot,
      targetFiles,
      structuredEdits,
    });

    const preRollbackHashes: Record<string, string> = {};
    const expectedPostRollbackHashes: Record<string, string> = {};
    const targetPrePatchHashes: Record<string, string> = {};
    const allReverseEdits: StructuredEditOperationDto[] = [];
    const diffParts: string[] = [];

    if (!conflictResult.canRollback) {
      return {
        canRollback: false,
        conflicts: conflictResult.conflicts,
        targetFiles,
        reverseDiff: null,
        structuredReverseEdits: [],
        preRollbackHashes: {},
        expectedPostRollbackHashes: {},
        targetPrePatchHashes: {},
        preservedFiles: conflictResult.preservedFiles,
      };
    }

    // Process each target file
    for (const relFile of targetFiles) {
      const normalized = path.normalize(relFile).replace(/\\/g, '/').replace(/^\.\//, '');
      const absPath = path.resolve(workspaceRoot, normalized);

      if (!fs.existsSync(absPath)) {
        continue;
      }

      const currentContent = fs.readFileSync(absPath, 'utf8');
      const s1Hash = crypto.createHash('sha256').update(currentContent, 'utf8').digest('hex');
      preRollbackHashes[normalized] = s1Hash;

      const fileEdits = conflictResult.adjustedEditsByFile.get(normalized) ?? [];
      allReverseEdits.push(...fileEdits);

      if (fileEdits.length === 0) {
        expectedPostRollbackHashes[normalized] = s1Hash;
        targetPrePatchHashes[normalized] = s1Hash;
        continue;
      }

      // Simulate applying reverse edits in descending line order
      const workingLines = [...currentContent.split(/\r?\n/)];
      const sortedEdits = [...fileEdits].sort((a, b) => b.startLine - a.startLine);

      for (const edit of sortedEdits) {
        const sliceCount = Math.max(0, edit.endLine - edit.startLine + 1);
        const restoreLines =
          edit.replacementContent.length > 0 ? edit.replacementContent.split(/\r?\n/) : [];
        workingLines.splice(edit.startLine - 1, sliceCount, ...restoreLines);
      }

      const postRollbackContent = workingLines.join('\n');
      const s2Hash = crypto
        .createHash('sha256')
        .update(postRollbackContent, 'utf8')
        .digest('hex');
      expectedPostRollbackHashes[normalized] = s2Hash;
      targetPrePatchHashes[normalized] = s2Hash;

      // Generate reverse unified diff
      try {
        const fileDiff = PatchParser.generateUnifiedDiff(normalized, currentContent, fileEdits);
        if (fileDiff.trim().length > 0) {
          diffParts.push(fileDiff);
        }
      } catch {
        // diff formatting fallback
      }
    }

    return {
      canRollback: true,
      conflicts: [],
      targetFiles,
      reverseDiff: diffParts.join('\n'),
      structuredReverseEdits: allReverseEdits,
      preRollbackHashes,
      expectedPostRollbackHashes,
      targetPrePatchHashes,
      preservedFiles: conflictResult.preservedFiles,
    };
  }
}
