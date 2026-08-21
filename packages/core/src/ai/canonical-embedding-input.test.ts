/**
 * @file packages/core/src/ai/canonical-embedding-input.test.ts
 * Unit tests for deterministic canonicalization and SHA-256 fingerprinting.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { CanonicalEmbeddingInputBuilder } from './canonical-embedding-input.js';

describe('CanonicalEmbeddingInputBuilder', () => {
  it('generates deterministic SHA-256 fingerprints for identical requirement inputs', () => {
    const res1 = CanonicalEmbeddingInputBuilder.buildCanonical({
      subjectType: 'REQUIREMENT',
      data: {
        requirementKey: 'REQ-101',
        title: 'User Authentication',
        originalText: 'Users shall be able to login using email and password.',
        type: 'FUNCTIONAL',
        priority: 'HIGH',
      },
    });

    const res2 = CanonicalEmbeddingInputBuilder.buildCanonical({
      subjectType: 'REQUIREMENT',
      data: {
        requirementKey: 'REQ-101',
        title: 'User Authentication',
        originalText: 'Users shall be able to login using email and password.',
        type: 'FUNCTIONAL',
        priority: 'HIGH',
      },
    });

    assert.strictEqual(res1.canonicalText, res2.canonicalText);
    assert.strictEqual(res1.inputSha256, res2.inputSha256);
    assert.strictEqual(res1.canonicalizationVersion, 1);
  });

  it('produces different fingerprints when requirement text changes', () => {
    const res1 = CanonicalEmbeddingInputBuilder.buildCanonical({
      subjectType: 'REQUIREMENT',
      data: {
        requirementKey: 'REQ-101',
        title: 'User Authentication',
        originalText: 'Users shall be able to login using email and password.',
      },
    });

    const res2 = CanonicalEmbeddingInputBuilder.buildCanonical({
      subjectType: 'REQUIREMENT',
      data: {
        requirementKey: 'REQ-101',
        title: 'User Authentication',
        originalText: 'Users shall be able to login using OAuth2 and SAML SSO.',
      },
    });

    assert.notStrictEqual(res1.canonicalText, res2.canonicalText);
    assert.notStrictEqual(res1.inputSha256, res2.inputSha256);
  });

  it('formats requirement version canonical input accurately', () => {
    const res = CanonicalEmbeddingInputBuilder.buildCanonical({
      subjectType: 'REQUIREMENT_VERSION',
      data: {
        requirementKey: 'REQ-101',
        versionNumber: 2,
        title: 'Payment Gateway',
        originalText: 'Process payments securely via Stripe.',
        type: 'SECURITY',
        priority: 'CRITICAL',
      },
    });

    assert.ok(res.canonicalText.includes('REQUIREMENT: REQ-101 (v2)'));
    assert.ok(res.canonicalText.includes('TYPE: SECURITY'));
    assert.ok(res.canonicalText.includes('PRIORITY: CRITICAL'));
    assert.ok(res.canonicalText.includes('Process payments securely via Stripe.'));
    assert.strictEqual(res.inputSha256.length, 64);
  });

  it('formats document extraction section canonical input accurately', () => {
    const res = CanonicalEmbeddingInputBuilder.buildCanonical({
      subjectType: 'DOCUMENT_SECTION',
      data: {
        documentFileName: 'architecture_spec.pdf',
        headingTitle: 'Security Architecture',
        sectionTitle: 'Token Storage',
        contentText: 'Tokens must be stored encrypted at rest.',
      },
    });

    assert.ok(res.canonicalText.includes('DOCUMENT: architecture_spec.pdf'));
    assert.ok(res.canonicalText.includes('HEADING: Security Architecture'));
    assert.ok(res.canonicalText.includes('SECTION: Token Storage'));
    assert.ok(res.canonicalText.includes('Tokens must be stored encrypted at rest.'));
  });
});
