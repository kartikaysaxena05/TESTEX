/**
 * @file packages/core/src/execution/healing/healing-suggestion-service.test.ts
 * Unit tests for reviewable healing suggestion lifecycle management.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { HealingSuggestionService } from './healing-suggestion-service.js';

describe('HealingSuggestionService', () => {
  const suggestions: any[] = [];

  const mockPrisma: any = {
    locatorHealingSuggestion: {
      create: async (args: any) => {
        const item = {
          id: `00000000-0000-0000-0000-00000000000${suggestions.length + 1}`,
          ...args.data,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        suggestions.push(item);
        return item;
      },
      findMany: async (args: any) => {
        return suggestions.filter(s => {
          if (args.where.projectId && s.projectId !== args.where.projectId) return false;
          if (args.where.testCaseId && s.testCaseId !== args.where.testCaseId) return false;
          if (args.where.reviewStatus && s.reviewStatus !== args.where.reviewStatus) return false;
          return true;
        });
      },
      findUnique: async (args: any) => {
        return suggestions.find(s => s.id === args.where?.id) || null;
      },
      findFirst: async (args: any) => {
        return (
          suggestions.find(s => {
            if (args.where.projectId && s.projectId !== args.where.projectId) return false;
            if (args.where.testCaseId && s.testCaseId !== args.where.testCaseId) return false;
            if (args.where.stepIndex !== undefined && s.stepIndex !== args.where.stepIndex)
              return false;
            if (args.where.reviewStatus && s.reviewStatus !== args.where.reviewStatus) return false;
            return true;
          }) || null
        );
      },
      findUniqueOrThrow: async (args: any) => {
        const item = suggestions.find(s => s.id === args.where.id);
        if (!item) throw new Error('Not found');
        return item;
      },
      update: async (args: any) => {
        const item = suggestions.find(s => s.id === args.where.id);
        if (!item) throw new Error('Not found');
        Object.assign(item, args.data);
        return item;
      },
    },
  };

  const service = new HealingSuggestionService(mockPrisma);

  const projectId = '00000000-0000-0000-0000-000000000001';
  const testCaseId = '00000000-0000-0000-0000-000000000002';
  const runId = '00000000-0000-0000-0000-000000000003';

  it('records new reviewable suggestion with PENDING status', async () => {
    const suggestion = await service.recordSuggestion({
      projectId,
      testCaseId,
      testCaseVersionNumber: 1,
      stepIndex: 1,
      originalTarget: { kind: 'CONTROL', strategy: 'ROLE', role: 'button', name: 'Submit' },
      suggestedTarget: { kind: 'CONTROL', strategy: 'ROLE', role: 'button', name: 'Submit Order' },
      suggestedSelector: "page.getByRole('button', { name: 'Submit Order' })",
      reason: 'Confidence 92',
      score: 92,
      discoveredInRunId: runId,
    });

    assert.ok(suggestion.id);
    assert.equal(suggestion.reviewStatus, 'PENDING');
    assert.equal(suggestion.score, 92);
  });

  it('lists suggestions filtered by review status', async () => {
    const pending = await service.listSuggestions({
      projectId,
      reviewStatus: 'PENDING',
    });

    assert.equal(pending.length, 1);
    assert.equal(pending[0]?.testCaseId, testCaseId);
  });

  it('reviews and accepts suggestion with reviewer identity audit', async () => {
    const all = await service.listSuggestions({ projectId });
    const suggestionId = all[0]?.id;
    assert.ok(suggestionId);

    const reviewed = await service.reviewSuggestion({
      projectId,
      suggestionId,
      reviewStatus: 'ACCEPTED',
      reviewerId: 'lead-qa-engineer',
    });

    assert.equal(reviewed.reviewStatus, 'ACCEPTED');
    assert.equal(reviewed.reviewedBy, 'lead-qa-engineer');
    assert.ok(reviewed.reviewedAt);
  });
});
