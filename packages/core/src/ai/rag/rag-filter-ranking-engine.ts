/**
 * @file packages/core/src/ai/rag/rag-filter-ranking-engine.ts
 * Deterministic filtering, ranking by authority tier, deduplication, untrusted tagging, and budget enforcement.
 */

import crypto from 'node:crypto';
import type {
  RagContextItemDto,
  RagContextBudgetDto,
  RagRetrievalLimitsDto,
} from '@ai-quality/contracts';
import { DEFAULT_RAG_LIMITS, RAG_PLATFORM_LIMITS } from './rag-types.js';
import { TokenEstimator } from './token-estimator.js';

export interface ProcessContextItemsResult {
  readonly items: readonly RagContextItemDto[];
  readonly budget: RagContextBudgetDto;
  readonly candidateCount: number;
  readonly filteredCount: number;
  readonly deduplicatedCount: number;
}

export class RagFilterRankingEngine {
  /**
   * Computes SHA-256 of text for deduplication.
   */
  private static computeContentHash(text: string): string {
    return crypto.createHash('sha256').update(text.trim(), 'utf8').digest('hex');
  }

  /**
   * Processes raw candidate items through filtering, deduplication, tier-based ranking,
   * untrusted tagging, and budget limits.
   */
  public static process(
    rawCandidates: readonly RagContextItemDto[],
    limits?: RagRetrievalLimitsDto,
  ): ProcessContextItemsResult {
    const effectiveLimits: Required<RagRetrievalLimitsDto> = {
      ...DEFAULT_RAG_LIMITS,
      ...limits,
    };

    const candidateCount = rawCandidates.length;
    let filteredCount = 0;
    let deduplicatedCount = 0;

    // 1. Filtering (stale policy, empty text)
    const validItems: RagContextItemDto[] = [];

    for (const item of rawCandidates) {
      if (!item.text || item.text.trim().length === 0) {
        filteredCount++;
        continue;
      }

      if (item.state.stale && !effectiveLimits.includeStale) {
        filteredCount++;
        continue;
      }

      validItems.push(item);
    }

    // 2. Deduplication (by sourceType + sourceId, and content hash)
    const seenSourceKeys = new Set<string>();
    const seenContentHashes = new Set<string>();
    const uniqueItems: RagContextItemDto[] = [];

    for (const item of validItems) {
      const sourceKey = `${item.sourceType}:${item.sourceId}`;
      const contentHash = RagFilterRankingEngine.computeContentHash(item.text);

      if (seenSourceKeys.has(sourceKey)) {
        deduplicatedCount++;
        continue;
      }

      // If content is identical to an already included item, deduplicate
      if (seenContentHashes.has(contentHash)) {
        deduplicatedCount++;
        continue;
      }

      seenSourceKeys.add(sourceKey);
      seenContentHashes.add(contentHash);
      uniqueItems.push(item);
    }

    // 3. Deterministic Sorting & Ranking
    // Primary: Authority Tier ascending (Tier 1 is most authoritative)
    // Secondary: Similarity score descending (if present) or rank ascending
    // Tertiary: Stable tie-breaking on item ID
    uniqueItems.sort((a, b) => {
      if (a.authorityTier !== b.authorityTier) {
        return a.authorityTier - b.authorityTier;
      }

      if (a.relevance.similarityScore !== undefined && b.relevance.similarityScore !== undefined) {
        if (b.relevance.similarityScore !== a.relevance.similarityScore) {
          return b.relevance.similarityScore - a.relevance.similarityScore;
        }
      }

      if (a.relevance.rank !== b.relevance.rank) {
        return a.relevance.rank - b.relevance.rank;
      }

      return a.id.localeCompare(b.id);
    });

    // 4. Budget Enforcement & Truncation
    const budgetedItems: RagContextItemDto[] = [];
    let includedChars = 0;
    let includedTokens = 0;
    let truncated = false;
    let truncationReason: string | null = null;

    let relatedCount = 0;
    let docCount = 0;
    let repoCount = 0;

    for (let i = 0; i < uniqueItems.length; i++) {
      const item = uniqueItems[i]!;

      // Check max items limit
      if (budgetedItems.length >= effectiveLimits.maxItems) {
        truncated = true;
        truncationReason = `Exceeded maxItems limit (${effectiveLimits.maxItems})`;
        break;
      }

      // Check category-specific limits
      if (item.sourceType === 'RELATED_REQUIREMENT') {
        if (relatedCount >= effectiveLimits.maxRelatedRequirements) {
          filteredCount++;
          continue;
        }
        relatedCount++;
      } else if (item.sourceType === 'DOCUMENT_SECTION' || item.sourceType === 'DOCUMENT_BLOCK') {
        if (docCount >= effectiveLimits.maxDocumentItems) {
          filteredCount++;
          continue;
        }
        docCount++;
      } else if (item.sourceType === 'REPOSITORY_EVIDENCE') {
        if (repoCount >= effectiveLimits.maxRepositoryItems) {
          filteredCount++;
          continue;
        }
        repoCount++;
      }

      // Handle item text truncation if single item exceeds max per-item bounds
      let itemText = item.text;
      if (itemText.length > RAG_PLATFORM_LIMITS.MAX_PER_ITEM_CHARACTERS) {
        itemText =
          itemText.slice(0, RAG_PLATFORM_LIMITS.MAX_PER_ITEM_CHARACTERS) + '\n... [TRUNCATED]';
        truncated = true;
        truncationReason = `Item "${item.id}" truncated to ${RAG_PLATFORM_LIMITS.MAX_PER_ITEM_CHARACTERS} characters`;
      }

      const itemChars = itemText.length;
      const itemTokens = TokenEstimator.estimate(itemText);

      // Check cumulative character limit
      if (includedChars + itemChars > effectiveLimits.maxCharacters) {
        truncated = true;
        truncationReason = `Exceeded maxCharacters limit (${effectiveLimits.maxCharacters})`;
        break;
      }

      // Check cumulative token limit
      if (includedTokens + itemTokens > effectiveLimits.maxEstimatedTokens) {
        truncated = true;
        truncationReason = `Exceeded maxEstimatedTokens limit (${effectiveLimits.maxEstimatedTokens})`;
        break;
      }

      includedChars += itemChars;
      includedTokens += itemTokens;

      // Ensure untrusted context flag is always explicitly preserved
      budgetedItems.push({
        ...item,
        text: itemText,
        state: {
          ...item.state,
          isUntrustedContext: true,
        },
      });
    }

    const budget: RagContextBudgetDto = {
      maxItems: effectiveLimits.maxItems,
      includedItems: budgetedItems.length,
      maxCharacters: effectiveLimits.maxCharacters,
      includedCharacters: includedChars,
      estimatedTokens: includedTokens,
      truncated,
      truncationReason,
    };

    return {
      items: budgetedItems,
      budget,
      candidateCount,
      filteredCount,
      deduplicatedCount,
    };
  }
}
