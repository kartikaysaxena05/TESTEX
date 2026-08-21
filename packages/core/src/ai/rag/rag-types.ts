/**
 * @file packages/core/src/ai/rag/rag-types.ts
 * Constants, default limits, authority tier rankings, and reason codes for RAG context retrieval.
 */

import type {
  RequirementContextPurpose,
  RagAuthorityTier,
  RagRetrievalLimitsDto,
  RagRetrievalConfigDto,
} from '@ai-quality/contracts';

export const DEFAULT_RAG_STRATEGY = 'requirement-rag-v1';
export const DEFAULT_RAG_STRATEGY_VERSION = '1.0.0';
export const DEFAULT_RAG_PURPOSE: RequirementContextPurpose = 'GENERAL_REQUIREMENT_REASONING';

export const RAG_AUTHORITY_TIERS = {
  PRIMARY_REQUIREMENT: 1 as RagAuthorityTier,
  SOURCE_PROVENANCE: 2 as RagAuthorityTier,
  STRUCTURED_INTELLIGENCE: 3 as RagAuthorityTier,
  CONFIRMED_RELATIONSHIP: 4 as RagAuthorityTier,
  CONFIRMED_REPOSITORY_EVIDENCE: 5 as RagAuthorityTier,
  SEMANTIC_RELATED_CONTEXT: 6 as RagAuthorityTier,
  PROPOSED_CANDIDATE_CONTEXT: 7 as RagAuthorityTier,
} as const;

export const RAG_REASON_CODES = {
  PRIMARY_REQUIREMENT: 'PRIMARY_REQUIREMENT',
  DIRECT_SOURCE_PROVENANCE: 'DIRECT_SOURCE_PROVENANCE',
  STRUCTURED_REPRESENTATION: 'STRUCTURED_REPRESENTATION',
  CLASSIFICATION_METADATA: 'CLASSIFICATION_METADATA',
  QUALITY_FINDING_CONTEXT: 'QUALITY_FINDING_CONTEXT',
  CONFIRMED_DEPENDENCY: 'CONFIRMED_DEPENDENCY',
  CONFIRMED_RELATIONSHIP: 'CONFIRMED_RELATIONSHIP',
  PROPOSED_RELATIONSHIP: 'PROPOSED_RELATIONSHIP',
  CONFIRMED_REPOSITORY_EVIDENCE: 'CONFIRMED_REPOSITORY_EVIDENCE',
  SEMANTIC_REQUIREMENT_MATCH: 'SEMANTIC_REQUIREMENT_MATCH',
  SEMANTIC_DOCUMENT_SECTION_MATCH: 'SEMANTIC_DOCUMENT_SECTION_MATCH',
  NEARBY_DOCUMENT_SECTION: 'NEARBY_DOCUMENT_SECTION',
} as const;

export const DEFAULT_RAG_LIMITS: Required<RagRetrievalLimitsDto> = {
  maxItems: 25,
  maxCharacters: 32000,
  maxEstimatedTokens: 8000,
  maxRelatedRequirements: 5,
  maxDocumentItems: 5,
  maxRepositoryItems: 5,
  maxRelationshipDepth: 1,
  minimumSimilarity: 0.45,
  includeStale: false,
};

export const RAG_PLATFORM_LIMITS = {
  MIN_ITEMS: 1,
  MAX_ITEMS: 100,
  MIN_CHARACTERS: 100,
  MAX_CHARACTERS: 200000,
  MIN_ESTIMATED_TOKENS: 50,
  MAX_ESTIMATED_TOKENS: 50000,
  MAX_RELATED_REQUIREMENTS: 20,
  MAX_DOCUMENT_ITEMS: 20,
  MAX_REPOSITORY_ITEMS: 20,
  MAX_RELATIONSHIP_DEPTH: 3,
  MAX_PER_ITEM_CHARACTERS: 8000,
  MAX_QUERY_CHARACTERS: 2000,
} as const;

export const DEFAULT_RAG_CONFIG: RagRetrievalConfigDto = {
  defaultStrategy: DEFAULT_RAG_STRATEGY,
  defaultStrategyVersion: DEFAULT_RAG_STRATEGY_VERSION,
  defaultPurpose: DEFAULT_RAG_PURPOSE,
  defaultLimits: DEFAULT_RAG_LIMITS,
};
