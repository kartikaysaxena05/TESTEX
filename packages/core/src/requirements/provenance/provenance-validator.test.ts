/**
 * @file packages/core/src/requirements/provenance/provenance-validator.test.ts
 * Unit tests for pure ProvenanceValidator invariants and location derivation.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ProvenanceValidator } from './provenance-validator.js';

describe('ProvenanceValidator', () => {
  describe('MANUAL source invariants', () => {
    it('validates a valid manual requirement provenance', () => {
      const result = ProvenanceValidator.validate({
        projectId: '11111111-1111-1111-1111-111111111111',
        requirementId: '22222222-2222-2222-2222-222222222222',
        requirementSourceId: '33333333-3333-3333-3333-333333333333',
        sourceKind: 'MANUAL',
        sourceText: 'The user shall be able to reset password.',
      });

      assert.equal(result.isValid, true);
      assert.equal(result.completeness, 'MINIMAL');
      assert.equal(result.errors.length, 0);
    });

    it('rejects manual requirement with document reference', () => {
      const result = ProvenanceValidator.validate({
        projectId: '11111111-1111-1111-1111-111111111111',
        requirementId: '22222222-2222-2222-2222-222222222222',
        requirementSourceId: '33333333-3333-3333-3333-333333333333',
        sourceKind: 'MANUAL',
        documentId: '44444444-4444-4444-4444-444444444444',
      });

      assert.equal(result.isValid, false);
      assert.match(result.errors[0]!, /cannot reference a requirement document/i);
    });

    it('rejects manual requirement with page number or line bounds', () => {
      const result = ProvenanceValidator.validate({
        projectId: '11111111-1111-1111-1111-111111111111',
        requirementId: '22222222-2222-2222-2222-222222222222',
        requirementSourceId: '33333333-3333-3333-3333-333333333333',
        sourceKind: 'MANUAL',
        pageNumber: 12,
        lineStart: 5,
      });

      assert.equal(result.isValid, false);
      assert.equal(result.errors.length, 2);
    });
  });

  describe('PASTED_TEXT source invariants', () => {
    it('validates pasted text with line bounds as COMPLETE', () => {
      const result = ProvenanceValidator.validate({
        projectId: '11111111-1111-1111-1111-111111111111',
        requirementId: '22222222-2222-2222-2222-222222222222',
        requirementSourceId: '33333333-3333-3333-3333-333333333333',
        sourceKind: 'PASTED_TEXT',
        sourceText: 'The user shall be able to login with 2FA.',
        lineStart: 10,
        lineEnd: 12,
      });

      assert.equal(result.isValid, true);
      assert.equal(result.completeness, 'COMPLETE');
    });

    it('marks pasted text without line numbers as PARTIAL', () => {
      const result = ProvenanceValidator.validate({
        projectId: '11111111-1111-1111-1111-111111111111',
        requirementId: '22222222-2222-2222-2222-222222222222',
        requirementSourceId: '33333333-3333-3333-3333-333333333333',
        sourceKind: 'PASTED_TEXT',
        sourceText: 'The user shall be able to login with 2FA.',
      });

      assert.equal(result.isValid, true);
      assert.equal(result.completeness, 'PARTIAL');
    });

    it('rejects pasted text with documentId or pageNumber', () => {
      const result = ProvenanceValidator.validate({
        projectId: '11111111-1111-1111-1111-111111111111',
        requirementId: '22222222-2222-2222-2222-222222222222',
        requirementSourceId: '33333333-3333-3333-3333-333333333333',
        sourceKind: 'PASTED_TEXT',
        documentId: '44444444-4444-4444-4444-444444444444',
        pageNumber: 3,
      });

      assert.equal(result.isValid, false);
      assert.equal(result.errors.length, 2);
    });
  });

  describe('DOCUMENT source invariants', () => {
    it('validates a complete document requirement provenance', () => {
      const result = ProvenanceValidator.validate({
        projectId: '11111111-1111-1111-1111-111111111111',
        requirementId: '22222222-2222-2222-2222-222222222222',
        requirementSourceId: '33333333-3333-3333-3333-333333333333',
        sourceKind: 'DOCUMENT',
        documentId: '44444444-4444-4444-4444-444444444444',
        candidateId: '55555555-5555-5555-5555-555555555555',
        sourceBlockId: 'blk-001',
        sourceText: 'The system shall lock out accounts after 5 failed attempts.',
        sourceSha256: 'a'.repeat(64),
        pageNumber: 14,
      });

      assert.equal(result.isValid, true);
      assert.equal(result.completeness, 'COMPLETE');
    });

    it('rejects document provenance missing required fields', () => {
      const result = ProvenanceValidator.validate({
        projectId: '11111111-1111-1111-1111-111111111111',
        requirementId: '22222222-2222-2222-2222-222222222222',
        requirementSourceId: '33333333-3333-3333-3333-333333333333',
        sourceKind: 'DOCUMENT',
      });

      assert.equal(result.isValid, false);
      assert.ok(result.errors.some(e => e.includes('documentId')));
      assert.ok(result.errors.some(e => e.includes('sourceSha256')));
      assert.ok(result.errors.some(e => e.includes('sourceText')));
    });

    it('rejects invalid page number (less than 1 or non-integer)', () => {
      const result = ProvenanceValidator.validate({
        projectId: '11111111-1111-1111-1111-111111111111',
        requirementId: '22222222-2222-2222-2222-222222222222',
        requirementSourceId: '33333333-3333-3333-3333-333333333333',
        sourceKind: 'DOCUMENT',
        documentId: '44444444-4444-4444-4444-444444444444',
        sourceSha256: 'a'.repeat(64),
        sourceText: 'Text',
        pageNumber: 0,
      });

      assert.equal(result.isValid, false);
      assert.match(result.errors[0]!, /page number must be a positive integer/i);
    });
  });

  describe('deriveLocationKind', () => {
    it('derives TABLE_ROW when sourceTableId is present', () => {
      const kind = ProvenanceValidator.deriveLocationKind({
        projectId: '1',
        requirementId: '2',
        requirementSourceId: '3',
        sourceKind: 'DOCUMENT',
        sourceTableId: 'tbl-001',
        sourceBlockId: 'blk-001',
      });
      assert.equal(kind, 'TABLE_ROW');
    });

    it('derives DOCUMENT_BLOCK when sourceBlockId is present', () => {
      const kind = ProvenanceValidator.deriveLocationKind({
        projectId: '1',
        requirementId: '2',
        requirementSourceId: '3',
        sourceKind: 'DOCUMENT',
        sourceBlockId: 'blk-001',
      });
      assert.equal(kind, 'DOCUMENT_BLOCK');
    });

    it('derives PDF_PAGE when only pageNumber is present', () => {
      const kind = ProvenanceValidator.deriveLocationKind({
        projectId: '1',
        requirementId: '2',
        requirementSourceId: '3',
        sourceKind: 'DOCUMENT',
        pageNumber: 15,
      });
      assert.equal(kind, 'PDF_PAGE');
    });

    it('derives PASTE_LINE when lineStart is present on PASTED_TEXT', () => {
      const kind = ProvenanceValidator.deriveLocationKind({
        projectId: '1',
        requirementId: '2',
        requirementSourceId: '3',
        sourceKind: 'PASTED_TEXT',
        lineStart: 5,
      });
      assert.equal(kind, 'PASTE_LINE');
    });

    it('derives NONE when no specific location evidence is provided', () => {
      const kind = ProvenanceValidator.deriveLocationKind({
        projectId: '1',
        requirementId: '2',
        requirementSourceId: '3',
        sourceKind: 'MANUAL',
      });
      assert.equal(kind, 'NONE');
    });
  });
});
