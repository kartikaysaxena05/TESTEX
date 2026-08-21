/**
 * @file packages/core/src/requirements/evidence/requirement-repository-matcher.ts
 * Pure deterministic matcher between Requirements and indexed repository files/symbols.
 * Zero external AI/LLM, embeddings, or database dependencies.
 */

import type {
  RepositoryEvidenceType,
  EvidenceMatchMethod,
  EvidenceReasonCode,
} from '@ai-quality/contracts';
import {
  MATCHER_VERSION,
  MAX_EVIDENCE_CANDIDATES,
  MIN_EVIDENCE_SCORE_THRESHOLD,
  GENERIC_STOPWORDS,
  type IndexedEntityForMatching,
  type MatcherRequirementInput,
  type RepositoryEvidenceDraft,
} from './evidence-types.js';

export class RequirementRepositoryMatcher {
  /**
   * Deterministically matches a single requirement against the provided repository index.
   */
  static matchRequirement(
    requirement: MatcherRequirementInput,
    projectId: string,
    projectSourceId: string,
    repositorySnapshotId: string | null,
    indexedFiles: readonly IndexedEntityForMatching[],
  ): readonly RepositoryEvidenceDraft[] {
    const reqTokens = this.extractTokens(
      `${requirement.title} ${requirement.originalText} ${requirement.domain ?? ''} ${requirement.module ?? ''} ${(requirement.tags ?? []).join(' ')}`,
    );
    const reqTokenSet = new Set(reqTokens);

    const actionTokens = requirement.action ? this.extractTokens(requirement.action) : [];
    const objectTokens = requirement.object ? this.extractTokens(requirement.object) : [];
    const domainTokens = requirement.domain ? this.extractTokens(requirement.domain) : [];
    const moduleTokens = requirement.module ? this.extractTokens(requirement.module) : [];

    const candidates: RepositoryEvidenceDraft[] = [];
    const seenKeys = new Set<string>();

    for (const file of indexedFiles) {
      const fileTokens = this.extractTokens(file.relativePath);
      const fileBasename = file.relativePath.split('/').pop() ?? file.relativePath;
      const basenameTokens = this.extractTokens(fileBasename);

      // Check file-level matching
      const matchingFileTokens = basenameTokens.filter(t => reqTokenSet.has(t));
      let fileScore = 0;
      const fileReasons: EvidenceReasonCode[] = [];

      if (matchingFileTokens.length >= 2) {
        fileScore += 4;
        fileReasons.push('EXACT_FILE_TOKEN');
      } else if (
        matchingFileTokens.length === 1 &&
        matchingFileTokens[0] &&
        !this.isCommonKeyword(matchingFileTokens[0])
      ) {
        fileScore += 3;
        fileReasons.push('EXACT_FILE_TOKEN');
      }

      // Domain/module boost
      if (
        domainTokens.some(t => fileTokens.includes(t)) ||
        moduleTokens.some(t => fileTokens.includes(t))
      ) {
        fileScore += 2;
        if (!fileReasons.includes('DOMAIN_MATCH')) {
          fileReasons.push('DOMAIN_MATCH');
        }
      }

      // Action/object overlap
      if (actionTokens.some(t => fileTokens.includes(t))) {
        fileScore += 1;
        fileReasons.push('ACTION_TOKEN_MATCH');
      }
      if (objectTokens.some(t => fileTokens.includes(t))) {
        fileScore += 1;
        fileReasons.push('OBJECT_TOKEN_MATCH');
      }

      // Infer EvidenceType from file classification/path
      let fileEvidenceType: RepositoryEvidenceType = 'FILE';
      if (
        file.classification === 'TEST' ||
        file.relativePath.includes('.test.') ||
        file.relativePath.includes('.spec.')
      ) {
        fileEvidenceType = 'TEST_FILE';
        fileReasons.push('TEST_FILE_MATCH');
      } else if (file.classification === 'SERVICE' || file.relativePath.includes('.service.')) {
        fileEvidenceType = 'SERVICE';
      } else if (
        file.classification === 'COMPONENT' ||
        file.relativePath.includes('/components/')
      ) {
        fileEvidenceType = 'COMPONENT';
      } else if (file.classification === 'DATABASE' || file.relativePath.includes('/models/')) {
        fileEvidenceType = 'DATABASE_MODEL';
      } else if (
        file.classification === 'CONFIGURATION' ||
        file.relativePath.includes('.config.')
      ) {
        fileEvidenceType = 'CONFIGURATION';
      }

      if (fileScore >= MIN_EVIDENCE_SCORE_THRESHOLD) {
        const key = `${file.relativePath}:${fileEvidenceType}:`;
        if (!seenKeys.has(key)) {
          seenKeys.add(key);
          candidates.push({
            projectId,
            requirementId: requirement.id,
            projectSourceId,
            repositorySnapshotId,
            indexedFileId: file.fileId,
            symbolId: null,
            evidenceType: fileEvidenceType,
            filePath: file.relativePath,
            symbolName: null,
            lineStart: null,
            lineEnd: null,
            fileContentHash: file.contentHash,
            evidenceScore: Math.min(10, fileScore),
            reasonCodes: fileReasons,
            matchMethod: 'EXACT_FILE_TOKEN',
            status: 'CANDIDATE',
            sourceRequirementTextSha256: requirement.sha256,
            matcherVersion: MATCHER_VERSION,
          });
        }
      }

      // Check symbol-level matching
      for (const sym of file.symbols) {
        const symTokens = this.extractTokens(sym.name);
        const matchingSymTokens = symTokens.filter(t => reqTokenSet.has(t));
        let symScore = 0;
        const symReasons: EvidenceReasonCode[] = [];
        let symMethod: EvidenceMatchMethod = 'EXACT_SYMBOL';

        // Check exact match between symbol name and requirement text
        const normalizedSymName = sym.name.toLowerCase();
        const normalizedReqText = requirement.originalText.toLowerCase();

        if (
          normalizedReqText.includes(normalizedSymName) &&
          normalizedSymName.length > 3 &&
          !GENERIC_STOPWORDS.has(normalizedSymName)
        ) {
          symScore += 5;
          symReasons.push('EXACT_SYMBOL_NAME');
          symMethod = 'EXACT_SYMBOL';
        } else if (matchingSymTokens.length >= 3) {
          symScore += 5;
          symReasons.push('EXACT_SYMBOL_NAME');
        } else if (matchingSymTokens.length === 2) {
          symScore += 4;
          symReasons.push('EXACT_SYMBOL_NAME');
        } else if (
          matchingSymTokens.length === 1 &&
          matchingSymTokens[0] &&
          !this.isCommonKeyword(matchingSymTokens[0])
        ) {
          symScore += 3;
          symReasons.push('EXACT_SYMBOL_NAME');
        }

        // Containing file token relevance boost for symbol
        if (matchingFileTokens.length >= 1) {
          symScore += Math.min(3, matchingFileTokens.length);
          if (!symReasons.includes('EXACT_FILE_TOKEN')) {
            symReasons.push('EXACT_FILE_TOKEN');
          }
        }

        // Route / Endpoint check
        if (
          sym.name.startsWith('/') ||
          sym.name.startsWith('GET ') ||
          sym.name.startsWith('POST ') ||
          sym.name.startsWith('PUT ') ||
          sym.name.startsWith('DELETE ') ||
          file.relativePath.includes('/routes/') ||
          file.relativePath.includes('/api/')
        ) {
          if (matchingSymTokens.length >= 1 || matchingFileTokens.length >= 1) {
            symScore += 4;
            symReasons.push('ROUTE_TOKEN_MATCH');
            symMethod = 'ROUTE_TOKEN_MATCH';
          }
        }

        // Domain/module & action/object boost for symbol
        if (
          domainTokens.some(t => symTokens.includes(t)) ||
          moduleTokens.some(t => symTokens.includes(t))
        ) {
          symScore += 2;
          symReasons.push('DOMAIN_MATCH');
        }
        if (actionTokens.some(t => symTokens.includes(t))) {
          symScore += 1;
          symReasons.push('ACTION_TOKEN_MATCH');
        }
        if (objectTokens.some(t => symTokens.includes(t))) {
          symScore += 1;
          symReasons.push('OBJECT_TOKEN_MATCH');
        }

        let symEvidenceType: RepositoryEvidenceType = 'SYMBOL';
        if (sym.kind === 'CLASS' && sym.name.endsWith('Service')) {
          symEvidenceType = 'SERVICE';
        } else if (sym.kind === 'CLASS' || sym.kind === 'INTERFACE' || sym.kind === 'TYPE') {
          if (
            file.classification === 'DATABASE' ||
            sym.name.endsWith('Entity') ||
            sym.name.endsWith('Model')
          ) {
            symEvidenceType = 'DATABASE_MODEL';
            symReasons.push('DATABASE_MODEL_MATCH');
          }
        } else if (
          sym.name.startsWith('/') ||
          sym.name.startsWith('api') ||
          file.relativePath.includes('/routes/')
        ) {
          symEvidenceType = 'ROUTE';
        }

        if (symScore >= MIN_EVIDENCE_SCORE_THRESHOLD) {
          const symKey = `${file.relativePath}:${symEvidenceType}:${sym.name}`;
          if (!seenKeys.has(symKey)) {
            seenKeys.add(symKey);
            candidates.push({
              projectId,
              requirementId: requirement.id,
              projectSourceId,
              repositorySnapshotId,
              indexedFileId: file.fileId,
              symbolId: sym.id,
              evidenceType: symEvidenceType,
              filePath: file.relativePath,
              symbolName: sym.name,
              lineStart: sym.startLine,
              lineEnd: sym.endLine,
              fileContentHash: file.contentHash,
              evidenceScore: Math.min(10, symScore),
              reasonCodes: symReasons,
              matchMethod: symMethod,
              status: 'CANDIDATE',
              sourceRequirementTextSha256: requirement.sha256,
              matcherVersion: MATCHER_VERSION,
            });
          }
        }
      }
    }

    // Deterministic sort: evidenceScore DESC, then filePath ASC, then symbolName ASC
    candidates.sort((a, b) => {
      if (b.evidenceScore !== a.evidenceScore) {
        return b.evidenceScore - a.evidenceScore;
      }
      if (a.filePath !== b.filePath) {
        return a.filePath.localeCompare(b.filePath);
      }
      return (a.symbolName ?? '').localeCompare(b.symbolName ?? '');
    });

    return candidates.slice(0, MAX_EVIDENCE_CANDIDATES);
  }

  /**
   * Deterministically splits and normalizes text into identifier tokens.
   */
  static extractTokens(text: string): string[] {
    if (!text || text.trim().length === 0) return [];

    // Split on spaces, punctuation, underscores, dashes, slashes
    const rawTokens = text.split(/[\s,./\\:;=()[\]{}'"!<>?~`@#$%^&*+|_-]+/);
    const result: string[] = [];

    for (const raw of rawTokens) {
      if (!raw || raw.length < 2) continue;

      // Decompose camelCase and PascalCase
      const subTokens = raw.replace(/([a-z])([A-Z])/g, '$1 $2').split(' ');
      for (const sub of subTokens) {
        const lower = sub.trim().toLowerCase();
        if (lower.length >= 2 && !GENERIC_STOPWORDS.has(lower)) {
          result.push(lower);
        }
      }
    }

    return result;
  }

  /**
   * Identifies overly common generic software development tokens.
   */
  private static isCommonKeyword(token: string): boolean {
    const commonKeywords = new Set([
      'index',
      'main',
      'app',
      'utils',
      'helpers',
      'types',
      'model',
      'models',
      'service',
      'services',
      'controller',
      'controllers',
      'route',
      'routes',
      'test',
      'tests',
      'spec',
      'specs',
      'config',
      'setup',
      'common',
      'shared',
      'core',
      'base',
    ]);
    return commonKeywords.has(token);
  }
}
