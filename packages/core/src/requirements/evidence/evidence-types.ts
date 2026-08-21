/**
 * @file packages/core/src/requirements/evidence/evidence-types.ts
 * Type definitions, scoring constants, limits, and stopwords for repository evidence mapping.
 */

import type {
  RepositoryEvidenceType,
  EvidenceMatchMethod,
  RepositoryEvidenceStatus,
  EvidenceReasonCode,
} from '@ai-quality/contracts';

export const MATCHER_VERSION = 'requirement-repository-matcher-v1';
export const MAX_EVIDENCE_CANDIDATES = 20;
export const MIN_EVIDENCE_SCORE_THRESHOLD = 4;
export const STRONG_EVIDENCE_SCORE_THRESHOLD = 7;
export const MAX_PREVIEW_LINES = 50;
export const MAX_PREVIEW_CHARS = 2000;

export const GENERIC_STOPWORDS = new Set<string>([
  'a',
  'about',
  'above',
  'after',
  'again',
  'against',
  'all',
  'allow',
  'allows',
  'allowed',
  'also',
  'am',
  'an',
  'and',
  'any',
  'app',
  'application',
  'appropriate',
  'are',
  'as',
  'at',
  'be',
  'because',
  'been',
  'before',
  'being',
  'below',
  'between',
  'both',
  'but',
  'by',
  'can',
  'could',
  'create',
  'created',
  'creates',
  'data',
  'delete',
  'deleted',
  'deletes',
  'did',
  'display',
  'displays',
  'do',
  'does',
  'doing',
  'down',
  'during',
  'each',
  'ensure',
  'ensures',
  'ensured',
  'few',
  'for',
  'from',
  'further',
  'get',
  'gets',
  'had',
  'handle',
  'handles',
  'handled',
  'has',
  'have',
  'having',
  'he',
  'her',
  'here',
  'hers',
  'herself',
  'him',
  'himself',
  'his',
  'how',
  'i',
  'if',
  'in',
  'into',
  'is',
  'it',
  'its',
  'itself',
  'let',
  'manage',
  'manages',
  'managed',
  'me',
  'more',
  'most',
  'must',
  'my',
  'myself',
  'no',
  'nor',
  'not',
  'of',
  'off',
  'on',
  'once',
  'only',
  'or',
  'other',
  'ought',
  'our',
  'ours',
  'ourselves',
  'out',
  'over',
  'own',
  'perform',
  'performs',
  'process',
  'processes',
  'provide',
  'provides',
  'provided',
  'record',
  'records',
  'same',
  'shall',
  'should',
  'so',
  'some',
  'such',
  'support',
  'supports',
  'system',
  'than',
  'that',
  'the',
  'their',
  'theirs',
  'them',
  'themselves',
  'then',
  'there',
  'these',
  'they',
  'this',
  'those',
  'through',
  'to',
  'too',
  'under',
  'until',
  'up',
  'update',
  'updates',
  'updated',
  'user',
  'users',
  'validate',
  'validates',
  'validated',
  'very',
  'view',
  'views',
  'was',
  'we',
  'were',
  'what',
  'when',
  'where',
  'which',
  'while',
  'who',
  'whom',
  'why',
  'with',
  'would',
  'you',
  'your',
  'yours',
  'yourself',
  'yourselves',
]);

export interface IndexedEntityForMatching {
  readonly fileId: string;
  readonly relativePath: string;
  readonly language: string | null;
  readonly classification: string;
  readonly contentHash: string | null;
  readonly symbols: readonly {
    readonly id: string;
    readonly name: string;
    readonly kind: string;
    readonly startLine: number;
    readonly endLine: number;
    readonly isExported: boolean;
  }[];
}

export interface MatcherRequirementInput {
  readonly id: string;
  readonly requirementKey: string;
  readonly title: string;
  readonly originalText: string;
  readonly sha256: string;
  readonly actor?: string | null;
  readonly action?: string | null;
  readonly object?: string | null;
  readonly domain?: string | null;
  readonly module?: string | null;
  readonly tags?: readonly string[];
}

export interface RepositoryEvidenceDraft {
  readonly projectId: string;
  readonly requirementId: string;
  readonly projectSourceId: string;
  readonly repositorySnapshotId: string | null;
  readonly indexedFileId: string | null;
  readonly symbolId: string | null;
  readonly evidenceType: RepositoryEvidenceType;
  readonly filePath: string;
  readonly symbolName: string | null;
  readonly lineStart: number | null;
  readonly lineEnd: number | null;
  readonly fileContentHash: string | null;
  readonly evidenceScore: number;
  readonly reasonCodes: readonly EvidenceReasonCode[];
  readonly matchMethod: EvidenceMatchMethod;
  readonly status: RepositoryEvidenceStatus;
  readonly sourceRequirementTextSha256: string;
  readonly matcherVersion: string;
}
