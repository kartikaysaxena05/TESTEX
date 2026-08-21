/**
 * @file packages/core/src/sources/technology/language-detector.ts
 * Evidence-based programming language detection and distribution calculation.
 */

import type { SourceStructureEntryDto, LanguageDetectionDto } from '@ai-quality/contracts';
import { LanguageRegistry, type LanguageDefinition } from './language-registry.js';

export interface LanguageDetectionResult {
  readonly detectedLanguages: readonly LanguageDetectionDto[];
  readonly dominantLanguage: string | null;
  readonly totalIncludedFiles: number;
  readonly totalLanguageFiles: number;
  readonly unknownFiles: number;
}

export class LanguageDetector {
  constructor(private readonly registry: LanguageRegistry = new LanguageRegistry()) {}

  detect(entries: readonly SourceStructureEntryDto[]): LanguageDetectionResult {
    const fileEntries = entries.filter(e => e.kind === 'FILE');
    const totalIncludedFiles = fileEntries.length;

    const languageStats = new Map<
      string,
      {
        definition: LanguageDefinition;
        count: number;
        extensions: Set<string>;
      }
    >();

    let unknownFiles = 0;

    for (const file of fileEntries) {
      const match = this.registry.match(file.relativePath);
      if (!match) {
        unknownFiles++;
        continue;
      }

      const existing = languageStats.get(match.id);
      const ext = file.name.includes('.')
        ? `.${file.name.split('.').pop()!.toLowerCase()}`
        : file.name;

      if (existing) {
        existing.count++;
        existing.extensions.add(ext);
      } else {
        languageStats.set(match.id, {
          definition: match,
          count: 1,
          extensions: new Set([ext]),
        });
      }
    }

    const totalLanguageFiles = Array.from(languageStats.values()).reduce(
      (sum, item) => sum + item.count,
      0,
    );

    const detectedLanguages: LanguageDetectionDto[] = Array.from(languageStats.values())
      .map(({ definition, count, extensions }) => {
        const percentage =
          totalLanguageFiles > 0 ? Math.round((count / totalLanguageFiles) * 1000) / 10 : 0;

        return {
          language: definition.displayName,
          category: definition.category,
          fileCount: count,
          percentage,
          confidence: definition.defaultConfidence ?? 'HIGH',
          evidenceExtensions: Array.from(extensions).sort(),
        };
      })
      .sort((a, b) => {
        if (b.fileCount !== a.fileCount) {
          return b.fileCount - a.fileCount;
        }
        return a.language.localeCompare(b.language);
      });

    // Determine dominant programming language (restricted to PROGRAMMING and SCRIPT)
    const programmingCandidates = detectedLanguages.filter(
      l => l.category === 'PROGRAMMING' || l.category === 'SCRIPT',
    );

    let dominantLanguage: string | null = null;
    if (programmingCandidates.length > 0) {
      const topCount = programmingCandidates[0]!.fileCount;
      const topTied = programmingCandidates.filter(c => c.fileCount === topCount);
      // In case of a tie between multiple programming languages, return null (honest ambiguity)
      if (topTied.length === 1) {
        dominantLanguage = topTied[0]!.language;
      }
    }

    return {
      detectedLanguages,
      dominantLanguage,
      totalIncludedFiles,
      totalLanguageFiles,
      unknownFiles,
    };
  }
}
