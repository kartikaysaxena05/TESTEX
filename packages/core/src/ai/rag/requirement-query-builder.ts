/**
 * @file packages/core/src/ai/rag/requirement-query-builder.ts
 * Deterministic query construction for semantic RAG vector retrieval.
 */

import { RAG_PLATFORM_LIMITS } from './rag-types.js';

export interface QueryBuilderInput {
  readonly title: string;
  readonly originalText: string;
  readonly normalizedText?: string | null;
  readonly actor?: string | null;
  readonly action?: string | null;
  readonly conditions?: string | null;
  readonly category?: string | null;
}

export class RequirementQueryBuilder {
  /**
   * Constructs a focused semantic search query for retrieving related context.
   */
  public static buildQuery(input: QueryBuilderInput): string {
    const parts: string[] = [];

    // Always include title
    const cleanTitle = input.title.trim();
    if (cleanTitle.length > 0) {
      parts.push(cleanTitle);
    }

    // Prefer normalized text if available and distinct, else original text
    const textToUse = input.normalizedText?.trim() || input.originalText.trim();
    if (textToUse.length > 0 && textToUse !== cleanTitle) {
      parts.push(textToUse);
    }

    // Add structured components if they provide additional discriminating context
    if (input.actor && !textToUse.toLowerCase().includes(input.actor.toLowerCase())) {
      parts.push(`Actor: ${input.actor.trim()}`);
    }

    if (input.conditions && !textToUse.toLowerCase().includes(input.conditions.toLowerCase())) {
      parts.push(`Conditions: ${input.conditions.trim()}`);
    }

    let query = parts.join(' ').replace(/\s+/g, ' ').trim();

    // Bound maximum query length to prevent excessive embedding load
    if (query.length > RAG_PLATFORM_LIMITS.MAX_QUERY_CHARACTERS) {
      query = query.slice(0, RAG_PLATFORM_LIMITS.MAX_QUERY_CHARACTERS).trim();
    }

    return query;
  }
}
