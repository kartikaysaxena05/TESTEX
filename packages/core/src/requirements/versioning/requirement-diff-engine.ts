/**
 * @file packages/core/src/requirements/versioning/requirement-diff-engine.ts
 * Pure, deterministic text and structured diff engine for Requirement versions.
 * Zero external AI/LLM, embeddings, or network dependencies.
 */

import crypto from 'node:crypto';
import type {
  RequirementDiffDto,
  RequirementVersionDto,
  TextDiffTokenDto,
  StructuredDiffFieldDto,
  RequirementChangeKind,
} from '@ai-quality/contracts';
import { MAX_DIFF_TOKEN_LIMIT, type RequirementVersionSnapshotData } from './versioning-types.js';

export class RequirementDiffEngine {
  /**
   * Computes a deterministic SHA-256 canonical hash of the versioned requirement fields.
   */
  static computeCanonicalContentHash(data: RequirementVersionSnapshotData): string {
    const canonical = {
      originalText: (data.originalText ?? '').trim(),
      priority: data.priority,
      status: data.status,
      title: (data.title ?? '').trim(),
      type: data.type,
    };
    return crypto.createHash('sha256').update(JSON.stringify(canonical), 'utf8').digest('hex');
  }

  /**
   * Deterministically splits text into tokens (words, spaces, and punctuation).
   */
  static tokenizeText(text: string): string[] {
    if (!text) return [];
    const tokens = text.match(/(\s+|[^\s]+)/g);
    return tokens ?? [];
  }

  /**
   * Computes a deterministic word-level diff using Longest Common Subsequence (LCS).
   */
  static computeTextDiff(oldText: string, newText: string): TextDiffTokenDto[] {
    const safeOld = oldText ?? '';
    const safeNew = newText ?? '';

    if (safeOld === safeNew) {
      return safeOld ? [{ type: 'UNCHANGED', value: safeOld }] : [];
    }

    if (!safeOld) {
      return [{ type: 'ADDED', value: safeNew }];
    }

    if (!safeNew) {
      return [{ type: 'REMOVED', value: safeOld }];
    }

    const oldTokens = this.tokenizeText(safeOld);
    const newTokens = this.tokenizeText(safeNew);

    const m = oldTokens.length;
    const n = newTokens.length;

    // Safety guard against memory explosion for extreme text sizes
    if (m * n > MAX_DIFF_TOKEN_LIMIT * 1000) {
      return [
        { type: 'REMOVED', value: safeOld },
        { type: 'ADDED', value: safeNew },
      ];
    }

    // Classic LCS Matrix
    const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        if (oldTokens[i - 1] === newTokens[j - 1]) {
          dp[i]![j] = dp[i - 1]![j - 1]! + 1;
        } else {
          dp[i]![j] = Math.max(dp[i - 1]![j]!, dp[i]![j - 1]!);
        }
      }
    }

    // Backtrack to form token diff
    const rawDiff: TextDiffTokenDto[] = [];
    let i = m;
    let j = n;

    while (i > 0 || j > 0) {
      if (i > 0 && j > 0 && oldTokens[i - 1] === newTokens[j - 1]) {
        rawDiff.push({ type: 'UNCHANGED', value: oldTokens[i - 1]! });
        i--;
        j--;
      } else if (j > 0 && (i === 0 || dp[i]![j - 1]! >= dp[i - 1]![j]!)) {
        rawDiff.push({ type: 'ADDED', value: newTokens[j - 1]! });
        j--;
      } else if (i > 0 && (j === 0 || dp[i]![j - 1]! < dp[i - 1]![j]!)) {
        rawDiff.push({ type: 'REMOVED', value: oldTokens[i - 1]! });
        i--;
      }
    }

    rawDiff.reverse();

    // Consolidate adjacent tokens of the same type
    return this.consolidateTokens(rawDiff);
  }

  /**
   * Consolidates contiguous tokens of the same diff type.
   */
  private static consolidateTokens(tokens: readonly TextDiffTokenDto[]): TextDiffTokenDto[] {
    if (tokens.length === 0) return [];

    const result: TextDiffTokenDto[] = [];
    let current = { ...tokens[0]! };

    for (let idx = 1; idx < tokens.length; idx++) {
      const tok = tokens[idx]!;
      if (tok.type === current.type) {
        current.value += tok.value;
      } else {
        result.push(current);
        current = { ...tok };
      }
    }
    result.push(current);

    return result;
  }

  /**
   * Compares two requirement versions and generates structured and textual diffs.
   */
  static computeRequirementDiff(
    oldVersion: RequirementVersionDto | RequirementVersionSnapshotData,
    newVersion: RequirementVersionDto | RequirementVersionSnapshotData,
    sourceVersionNumber = 1,
    targetVersionNumber = 2,
  ): RequirementDiffDto {
    const changedFields: string[] = [];
    const changeKinds: RequirementChangeKind[] = [];
    const structuredDiff: StructuredDiffFieldDto[] = [];

    // Title diff
    const titleChanged = (oldVersion.title ?? '').trim() !== (newVersion.title ?? '').trim();
    structuredDiff.push({
      field: 'title',
      oldValue: oldVersion.title,
      newValue: newVersion.title,
      isChanged: titleChanged,
    });
    if (titleChanged) {
      changedFields.push('title');
      changeKinds.push('TITLE_CHANGED');
    }

    // Text diff
    const textChanged =
      (oldVersion.originalText ?? '').trim() !== (newVersion.originalText ?? '').trim();
    structuredDiff.push({
      field: 'originalText',
      oldValue: oldVersion.originalText,
      newValue: newVersion.originalText,
      isChanged: textChanged,
    });
    if (textChanged) {
      changedFields.push('originalText');
      changeKinds.push('TEXT_CHANGED');
    }

    // Type diff
    const typeChanged = oldVersion.type !== newVersion.type;
    structuredDiff.push({
      field: 'type',
      oldValue: oldVersion.type,
      newValue: newVersion.type,
      isChanged: typeChanged,
    });
    if (typeChanged) {
      changedFields.push('type');
      changeKinds.push('TYPE_CHANGED');
    }

    // Priority diff
    const priorityChanged = oldVersion.priority !== newVersion.priority;
    structuredDiff.push({
      field: 'priority',
      oldValue: oldVersion.priority,
      newValue: newVersion.priority,
      isChanged: priorityChanged,
    });
    if (priorityChanged) {
      changedFields.push('priority');
      changeKinds.push('PRIORITY_CHANGED');
    }

    // Status diff
    const statusChanged = oldVersion.status !== newVersion.status;
    structuredDiff.push({
      field: 'status',
      oldValue: oldVersion.status,
      newValue: newVersion.status,
      isChanged: statusChanged,
    });
    if (statusChanged) {
      changedFields.push('status');
      changeKinds.push('STATUS_CHANGED');
    }

    // Semantic text comparisons
    if (textChanged) {
      this.detectSemanticTextChanges(
        oldVersion.originalText,
        newVersion.originalText,
        structuredDiff,
      );
    }

    const isNoOp = changedFields.length === 0;

    return {
      sourceVersionNumber,
      targetVersionNumber,
      isNoOp,
      changedFields,
      changeKinds:
        changeKinds.length > 1
          ? ['MULTIPLE_FIELDS_CHANGED', ...changeKinds]
          : changeKinds.length === 1
            ? changeKinds
            : [],
      titleDiff: this.computeTextDiff(oldVersion.title ?? '', newVersion.title ?? ''),
      textDiff: this.computeTextDiff(oldVersion.originalText ?? '', newVersion.originalText ?? ''),
      structuredDiff,
    };
  }

  /**
   * Deterministically inspects text changes for quantitative, modality, or negation shifts.
   */
  private static detectSemanticTextChanges(
    oldText: string,
    newText: string,
    structuredDiff: StructuredDiffFieldDto[],
  ): void {
    // 1. Numeric / Quantitative constraint changes
    const oldNumbers = (oldText ?? '').match(/\b\d+(\.\d+)?\b/g) ?? [];
    const newNumbers = (newText ?? '').match(/\b\d+(\.\d+)?\b/g) ?? [];
    const numbersChanged =
      oldNumbers.length !== newNumbers.length ||
      oldNumbers.some((num, idx) => num !== newNumbers[idx]);

    if (numbersChanged) {
      structuredDiff.push({
        field: 'semantic:quantitativeConstraint',
        oldValue: oldNumbers,
        newValue: newNumbers,
        isChanged: true,
      });
    }

    // 2. Modality keyword changes
    const extractModality = (t: string): string => {
      const match = (t ?? '').match(/\b(shall not|must not|shall|must|should|may|can)\b/i);
      return match ? match[0].toLowerCase() : 'none';
    };
    const oldModality = extractModality(oldText);
    const newModality = extractModality(newText);
    if (oldModality !== newModality) {
      structuredDiff.push({
        field: 'semantic:modality',
        oldValue: oldModality,
        newValue: newModality,
        isChanged: true,
      });
    }

    // 3. Negation polarity changes
    const isNegated = (t: string): boolean =>
      /\b(not|never|no|neither|nor|shall not|must not|cannot|without)\b/i.test(t ?? '');
    const oldNegated = isNegated(oldText);
    const newNegated = isNegated(newText);
    if (oldNegated !== newNegated) {
      structuredDiff.push({
        field: 'semantic:negation',
        oldValue: oldNegated,
        newValue: newNegated,
        isChanged: true,
      });
    }
  }
}
