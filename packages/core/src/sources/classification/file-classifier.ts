/**
 * @file packages/core/src/sources/classification/file-classifier.ts
 * Deterministic source file classification engine.
 */

import path from 'node:path';
import type { FileClassificationDto } from '@ai-quality/contracts';
import { CLASSIFICATION_RULES } from './classification-rules.js';
import type { ClassificationRule } from './classification-types.js';

export class FileClassifier {
  private readonly sortedRules: readonly ClassificationRule[];

  constructor(rules: readonly ClassificationRule[] = CLASSIFICATION_RULES) {
    this.sortedRules = [...rules].sort((a, b) => b.priority - a.priority);
  }

  /**
   * Classifies a single file given its repository-relative path.
   */
  classify(relativePath: string): FileClassificationDto {
    const normalizedPath = relativePath.replace(/\\/g, '/');
    const fileName = path.posix.basename(normalizedPath);
    const extension = path.posix.extname(normalizedPath).toLowerCase();

    for (const rule of this.sortedRules) {
      const match = rule.match(normalizedPath, fileName, extension);
      if (match && match.matched) {
        return {
          relativePath,
          category: match.category,
          confidence: match.confidence,
          evidence: match.evidence,
        };
      }
    }

    return {
      relativePath,
      category: 'UNKNOWN',
      confidence: 'LOW',
      evidence: [
        {
          type: 'PATH_PATTERN',
          detail: `No classification rule matched path: "${relativePath}"`,
        },
      ],
    };
  }
}
