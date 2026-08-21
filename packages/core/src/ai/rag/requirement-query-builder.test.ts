/**
 * @file packages/core/src/ai/rag/requirement-query-builder.test.ts
 * Unit tests for deterministic query construction.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { RequirementQueryBuilder } from './requirement-query-builder.js';
import { RAG_PLATFORM_LIMITS } from './rag-types.js';

describe('RequirementQueryBuilder', () => {
  it('builds query from title and original text', () => {
    const query = RequirementQueryBuilder.buildQuery({
      title: 'User Login',
      originalText: 'The user must be able to log in using email and password.',
    });

    assert.ok(query.includes('User Login'));
    assert.ok(query.includes('The user must be able to log in using email and password.'));
  });

  it('prefers normalized text over original text when available', () => {
    const query = RequirementQueryBuilder.buildQuery({
      title: 'User Login',
      originalText: 'Informal raw login text',
      normalizedText:
        'System shall authenticate registered user upon submission of valid email and password.',
    });

    assert.ok(query.includes('User Login'));
    assert.ok(query.includes('System shall authenticate registered user'));
    assert.ok(!query.includes('Informal raw login text'));
  });

  it('enriches query with actor and conditions if not already present', () => {
    const query = RequirementQueryBuilder.buildQuery({
      title: 'Checkout Cart',
      originalText: 'Process cart items and charge payment method.',
      actor: 'Registered Customer',
      conditions: 'Cart is not empty and payment method is valid',
    });

    assert.ok(query.includes('Actor: Registered Customer'));
    assert.ok(query.includes('Conditions: Cart is not empty and payment method is valid'));
  });

  it('clamps excessive query strings to maximum platform limit', () => {
    const massiveText = 'A'.repeat(5000);
    const query = RequirementQueryBuilder.buildQuery({
      title: 'Massive Requirement',
      originalText: massiveText,
    });

    assert.ok(query.length <= RAG_PLATFORM_LIMITS.MAX_QUERY_CHARACTERS);
  });
});
