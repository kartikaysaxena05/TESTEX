/**
 * @file packages/core/src/ai/rag/rag-filter-ranking-engine.test.ts
 * Unit tests for RAG filtering, tier-based ranking, deduplication, and budget truncation.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { RagFilterRankingEngine } from './rag-filter-ranking-engine.js';
import type { RagContextItemDto } from '@ai-quality/contracts';
import { RAG_AUTHORITY_TIERS } from './rag-types.js';

describe('RagFilterRankingEngine', () => {
  const sampleProjectId = '11111111-1111-1111-1111-111111111111';

  it('ranks items strictly by authority tier ascending', () => {
    const rawItems: RagContextItemDto[] = [
      {
        id: 'tier6-semantic',
        sourceType: 'RELATED_REQUIREMENT',
        sourceId: 'req-6',
        authorityTier: RAG_AUTHORITY_TIERS.SEMANTIC_RELATED_CONTEXT,
        text: 'Semantically related requirement text',
        relevance: { rank: 30, reasonCodes: ['SEMANTIC_REQUIREMENT_MATCH'] },
        provenance: { projectId: sampleProjectId },
        state: { stale: false, confirmed: true, isUntrustedContext: true },
      },
      {
        id: 'tier1-primary',
        sourceType: 'REQUIREMENT',
        sourceId: 'req-1',
        authorityTier: RAG_AUTHORITY_TIERS.PRIMARY_REQUIREMENT,
        text: 'Primary requirement text',
        relevance: { rank: 1, reasonCodes: ['PRIMARY_REQUIREMENT'] },
        provenance: { projectId: sampleProjectId },
        state: { stale: false, confirmed: true, isUntrustedContext: true },
      },
      {
        id: 'tier3-structured',
        sourceType: 'STRUCTURED_REQUIREMENT',
        sourceId: 'req-3',
        authorityTier: RAG_AUTHORITY_TIERS.STRUCTURED_INTELLIGENCE,
        text: 'Structured representation text',
        relevance: { rank: 3, reasonCodes: ['STRUCTURED_REPRESENTATION'] },
        provenance: { projectId: sampleProjectId },
        state: { stale: false, confirmed: true, isUntrustedContext: true },
      },
      {
        id: 'tier2-provenance',
        sourceType: 'REQUIREMENT_SOURCE',
        sourceId: 'req-2',
        authorityTier: RAG_AUTHORITY_TIERS.SOURCE_PROVENANCE,
        text: 'Source provenance text',
        relevance: { rank: 2, reasonCodes: ['DIRECT_SOURCE_PROVENANCE'] },
        provenance: { projectId: sampleProjectId },
        state: { stale: false, confirmed: true, isUntrustedContext: true },
      },
    ];

    const result = RagFilterRankingEngine.process(rawItems);

    assert.equal(result.items.length, 4);
    assert.equal(result.items[0]!.id, 'tier1-primary');
    assert.equal(result.items[1]!.id, 'tier2-provenance');
    assert.equal(result.items[2]!.id, 'tier3-structured');
    assert.equal(result.items[3]!.id, 'tier6-semantic');
  });

  it('filters out stale items by default, but includes them when includeStale is true', () => {
    const rawItems: RagContextItemDto[] = [
      {
        id: 'fresh-item',
        sourceType: 'REQUIREMENT',
        sourceId: 'req-1',
        authorityTier: RAG_AUTHORITY_TIERS.PRIMARY_REQUIREMENT,
        text: 'Fresh requirement text',
        relevance: { rank: 1, reasonCodes: ['PRIMARY_REQUIREMENT'] },
        provenance: { projectId: sampleProjectId },
        state: { stale: false, confirmed: true, isUntrustedContext: true },
      },
      {
        id: 'stale-item',
        sourceType: 'STRUCTURED_REQUIREMENT',
        sourceId: 'req-2',
        authorityTier: RAG_AUTHORITY_TIERS.STRUCTURED_INTELLIGENCE,
        text: 'Stale structured text',
        relevance: { rank: 2, reasonCodes: ['STRUCTURED_REPRESENTATION'] },
        provenance: { projectId: sampleProjectId },
        state: { stale: true, confirmed: true, isUntrustedContext: true },
      },
    ];

    // Default: exclude stale
    const resDefault = RagFilterRankingEngine.process(rawItems);
    assert.equal(resDefault.items.length, 1);
    assert.equal(resDefault.items[0]!.id, 'fresh-item');
    assert.equal(resDefault.filteredCount, 1);

    // With includeStale: true
    const resIncludeStale = RagFilterRankingEngine.process(rawItems, { includeStale: true });
    assert.equal(resIncludeStale.items.length, 2);
    assert.equal(resIncludeStale.filteredCount, 0);
  });

  it('deduplicates items with duplicate source keys and duplicate content hashes', () => {
    const rawItems: RagContextItemDto[] = [
      {
        id: 'item-1',
        sourceType: 'REQUIREMENT',
        sourceId: 'same-source-id',
        authorityTier: 1,
        text: 'Unique text 1',
        relevance: { rank: 1, reasonCodes: ['PRIMARY_REQUIREMENT'] },
        provenance: { projectId: sampleProjectId },
        state: { stale: false, isUntrustedContext: true },
      },
      {
        id: 'item-2',
        sourceType: 'REQUIREMENT',
        sourceId: 'same-source-id', // Duplicate source
        authorityTier: 1,
        text: 'Different text',
        relevance: { rank: 2, reasonCodes: ['PRIMARY_REQUIREMENT'] },
        provenance: { projectId: sampleProjectId },
        state: { stale: false, isUntrustedContext: true },
      },
      {
        id: 'item-3',
        sourceType: 'RELATED_REQUIREMENT',
        sourceId: 'different-source-id',
        authorityTier: 6,
        text: 'Unique text 1', // Duplicate content of item-1
        relevance: { rank: 3, reasonCodes: ['SEMANTIC_REQUIREMENT_MATCH'] },
        provenance: { projectId: sampleProjectId },
        state: { stale: false, isUntrustedContext: true },
      },
    ];

    const result = RagFilterRankingEngine.process(rawItems);
    assert.equal(result.items.length, 1);
    assert.equal(result.deduplicatedCount, 2);
  });

  it('enforces maximum item and character budget limits with truncation flags', () => {
    const rawItems: RagContextItemDto[] = Array.from({ length: 10 }).map((_, i) => ({
      id: `item-${i}`,
      sourceType: 'RELATED_REQUIREMENT',
      sourceId: `source-${i}`,
      authorityTier: 6,
      text: `Context item number ${i} with substantial text content.`,
      relevance: { rank: i + 1, reasonCodes: ['SEMANTIC_REQUIREMENT_MATCH'] },
      provenance: { projectId: sampleProjectId },
      state: { stale: false, isUntrustedContext: true },
    }));

    // Max 3 items
    const result = RagFilterRankingEngine.process(rawItems, { maxItems: 3 });
    assert.equal(result.items.length, 3);
    assert.equal(result.budget.truncated, true);
    assert.ok(result.budget.truncationReason?.includes('maxItems'));
  });

  it('ensures all output items are tagged with isUntrustedContext: true', () => {
    const rawItems: RagContextItemDto[] = [
      {
        id: 'item-1',
        sourceType: 'REQUIREMENT',
        sourceId: 'req-1',
        authorityTier: 1,
        text: 'Some prompt content',
        relevance: { rank: 1, reasonCodes: ['PRIMARY_REQUIREMENT'] },
        provenance: { projectId: sampleProjectId },
        state: { stale: false, isUntrustedContext: false }, // Intentionally false input
      },
    ];

    const result = RagFilterRankingEngine.process(rawItems);
    assert.equal(result.items[0]!.state.isUntrustedContext, true);
  });
});
