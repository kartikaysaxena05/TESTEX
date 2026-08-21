/**
 * @file packages/core/src/sources/classification/classification-types.ts
 * Type definitions and rule interfaces for repository source file classification.
 */

import type {
  FileCategory,
  LanguageConfidence,
  ClassificationEvidenceDto,
} from '@ai-quality/contracts';

export const CLASSIFICATION_RULE_VERSION = 1;

export interface ClassificationMatch {
  readonly matched: boolean;
  readonly category: FileCategory;
  readonly confidence: LanguageConfidence;
  readonly evidence: readonly ClassificationEvidenceDto[];
}

export interface ClassificationRule {
  readonly id: string;
  readonly category: FileCategory;
  readonly priority: number;
  readonly match: (
    normalizedPath: string,
    fileName: string,
    extension: string,
  ) => ClassificationMatch | null;
}
