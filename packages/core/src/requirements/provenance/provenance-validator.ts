/**
 * @file packages/core/src/requirements/provenance/provenance-validator.ts
 * Pure validation rules enforcing requirement provenance invariants and completeness.
 */

import type { ProvenanceLocationKind, ProvenanceCompleteness } from '@ai-quality/contracts';
import type {
  RawRequirementProvenanceInput,
  ProvenanceValidationResult,
} from './provenance-types.js';

export class ProvenanceValidator {
  /**
   * Validates a raw provenance input against source-specific invariants and calculates completeness.
   */
  static validate(input: RawRequirementProvenanceInput): ProvenanceValidationResult {
    const errors: string[] = [];

    if (!input.projectId) errors.push('Project ID is required.');
    if (!input.requirementId) errors.push('Requirement ID is required.');
    if (!input.requirementSourceId) errors.push('Requirement source ID is required.');
    if (!input.sourceKind) errors.push('Source kind is required.');

    let completeness: ProvenanceCompleteness = 'MINIMAL';

    switch (input.sourceKind) {
      case 'MANUAL': {
        // Invariant: Manual requirements must NOT contain document or page references
        if (input.documentId) {
          errors.push('Manual requirements cannot reference a requirement document.');
        }
        if (input.candidateId) {
          errors.push('Manual requirements cannot reference a document candidate.');
        }
        if (input.pageNumber !== null && input.pageNumber !== undefined) {
          errors.push('Manual requirements cannot have a page number.');
        }
        if (input.lineStart !== null && input.lineStart !== undefined) {
          errors.push('Manual requirements cannot have line bounds.');
        }
        completeness = 'MINIMAL';
        break;
      }

      case 'PASTED_TEXT': {
        // Invariant: Pasted text requirements must NOT contain document references
        if (input.documentId) {
          errors.push('Pasted text requirements cannot reference a requirement document.');
        }
        if (input.pageNumber !== null && input.pageNumber !== undefined) {
          errors.push('Pasted text requirements cannot have a page number.');
        }

        // If line numbers exist, completeness is COMPLETE, otherwise PARTIAL
        if (input.lineStart !== null && input.lineStart !== undefined) {
          completeness = 'COMPLETE';
        } else {
          completeness = 'PARTIAL';
        }
        break;
      }

      case 'DOCUMENT': {
        // Invariant: Document requirements must reference a document, have a source text, and sha256
        if (!input.documentId) {
          errors.push('Document-derived requirement provenance must reference a documentId.');
        }
        if (!input.sourceSha256) {
          errors.push('Document-derived requirement provenance must include sourceSha256.');
        }
        if (!input.sourceText) {
          errors.push('Document-derived requirement provenance must include sourceText.');
        }

        // Check if page number is valid (if provided, must be positive integer)
        if (input.pageNumber !== null && input.pageNumber !== undefined) {
          if (!Number.isInteger(input.pageNumber) || input.pageNumber < 1) {
            errors.push('Page number must be a positive integer where applicable.');
          }
        }

        // Determine completeness
        if (
          input.documentId &&
          input.sourceSha256 &&
          input.sourceText &&
          (input.candidateId || input.sourceBlockId || input.sourceTableId)
        ) {
          completeness = 'COMPLETE';
        } else {
          completeness = 'PARTIAL';
        }
        break;
      }

      default: {
        errors.push(`Unknown provenance source kind: ${String(input.sourceKind)}`);
      }
    }

    return {
      isValid: errors.length === 0,
      completeness,
      errors,
    };
  }

  /**
   * Deterministically derives the location kind based on evidence fields.
   */
  static deriveLocationKind(input: RawRequirementProvenanceInput): ProvenanceLocationKind {
    if (input.sourceTableId !== null && input.sourceTableId !== undefined) {
      return 'TABLE_ROW';
    }
    if (input.sourceBlockId !== null && input.sourceBlockId !== undefined) {
      return 'DOCUMENT_BLOCK';
    }
    if (input.pageNumber !== null && input.pageNumber !== undefined) {
      return 'PDF_PAGE';
    }
    if (
      input.sourceKind === 'PASTED_TEXT' &&
      input.lineStart !== null &&
      input.lineStart !== undefined
    ) {
      return 'PASTE_LINE';
    }
    return 'NONE';
  }
}
