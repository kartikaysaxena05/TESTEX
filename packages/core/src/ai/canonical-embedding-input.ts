/**
 * @file packages/core/src/ai/canonical-embedding-input.ts
 * Deterministic canonical text builder and SHA-256 fingerprinting for vectorizable project intelligence.
 */

import crypto from 'node:crypto';
import { DEFAULT_CANONICALIZATION_VERSION } from './ai-types.js';

export interface CanonicalRequirementInput {
  readonly requirementKey: string;
  readonly title: string;
  readonly originalText: string;
  readonly type?: string;
  readonly priority?: string;
}

export interface CanonicalRequirementVersionInput {
  readonly requirementKey: string;
  readonly versionNumber: number;
  readonly title: string;
  readonly originalText: string;
  readonly type?: string;
  readonly priority?: string;
}

export interface CanonicalDocumentSectionInput {
  readonly documentFileName: string;
  readonly headingTitle?: string;
  readonly sectionTitle?: string;
  readonly contentText: string;
}

export interface CanonicalRepositoryEntityInput {
  readonly symbolOrEntityName: string;
  readonly kind: string;
  readonly relativeFilePath: string;
  readonly signatureOrDoc?: string;
}

export type VectorizableSubjectInput =
  | { readonly subjectType: 'REQUIREMENT'; readonly data: CanonicalRequirementInput }
  | { readonly subjectType: 'REQUIREMENT_VERSION'; readonly data: CanonicalRequirementVersionInput }
  | { readonly subjectType: 'DOCUMENT_SECTION'; readonly data: CanonicalDocumentSectionInput }
  | { readonly subjectType: 'REPOSITORY_ENTITY'; readonly data: CanonicalRepositoryEntityInput };

export interface CanonicalEmbeddingResult {
  readonly canonicalText: string;
  readonly inputSha256: string;
  readonly canonicalizationVersion: number;
}

export class CanonicalEmbeddingInputBuilder {
  public static readonly CURRENT_VERSION = DEFAULT_CANONICALIZATION_VERSION;

  /**
   * Computes SHA-256 hash of the canonical input string.
   */
  public static computeSha256(text: string): string {
    return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
  }

  /**
   * Builds canonical text for a Requirement.
   * Strips timestamps, volatile analysis IDs, and random UUIDs.
   */
  public static buildRequirementText(data: CanonicalRequirementInput): string {
    const lines: string[] = [
      `REQUIREMENT: ${data.requirementKey.trim()}`,
      `TITLE: ${data.title.trim()}`,
    ];

    if (data.type && data.type !== 'UNKNOWN') {
      lines.push(`TYPE: ${data.type.trim()}`);
    }

    if (data.priority && data.priority !== 'UNSPECIFIED') {
      lines.push(`PRIORITY: ${data.priority.trim()}`);
    }

    lines.push(`CONTENT:\n${data.originalText.trim()}`);

    return lines.join('\n');
  }

  /**
   * Builds canonical text for a RequirementVersion.
   */
  public static buildRequirementVersionText(data: CanonicalRequirementVersionInput): string {
    const lines: string[] = [
      `REQUIREMENT: ${data.requirementKey.trim()} (v${data.versionNumber})`,
      `TITLE: ${data.title.trim()}`,
    ];

    if (data.type && data.type !== 'UNKNOWN') {
      lines.push(`TYPE: ${data.type.trim()}`);
    }

    if (data.priority && data.priority !== 'UNSPECIFIED') {
      lines.push(`PRIORITY: ${data.priority.trim()}`);
    }

    lines.push(`CONTENT:\n${data.originalText.trim()}`);

    return lines.join('\n');
  }

  /**
   * Builds canonical text for a Document extraction section.
   */
  public static buildDocumentSectionText(data: CanonicalDocumentSectionInput): string {
    const lines: string[] = [`DOCUMENT: ${data.documentFileName.trim()}`];

    if (data.headingTitle) {
      lines.push(`HEADING: ${data.headingTitle.trim()}`);
    }

    if (data.sectionTitle) {
      lines.push(`SECTION: ${data.sectionTitle.trim()}`);
    }

    lines.push(`CONTENT:\n${data.contentText.trim()}`);

    return lines.join('\n');
  }

  /**
   * Builds canonical text for an indexed repository entity.
   */
  public static buildRepositoryEntityText(data: CanonicalRepositoryEntityInput): string {
    const lines: string[] = [
      `ENTITY: ${data.symbolOrEntityName.trim()}`,
      `KIND: ${data.kind.trim()}`,
      `FILE: ${data.relativeFilePath.trim()}`,
    ];

    if (data.signatureOrDoc) {
      lines.push(`SIGNATURE/DOC:\n${data.signatureOrDoc.trim()}`);
    }

    return lines.join('\n');
  }

  /**
   * High-level entry point building canonical text and SHA-256 fingerprint for any vectorizable subject.
   */
  public static buildCanonical(input: VectorizableSubjectInput): CanonicalEmbeddingResult {
    let canonicalText = '';

    switch (input.subjectType) {
      case 'REQUIREMENT':
        canonicalText = this.buildRequirementText(input.data);
        break;
      case 'REQUIREMENT_VERSION':
        canonicalText = this.buildRequirementVersionText(input.data);
        break;
      case 'DOCUMENT_SECTION':
        canonicalText = this.buildDocumentSectionText(input.data);
        break;
      case 'REPOSITORY_ENTITY':
        canonicalText = this.buildRepositoryEntityText(input.data);
        break;
      default: {
        const exhaustiveCheck: never = input;
        throw new Error(`Unsupported subject type: ${(exhaustiveCheck as any)?.subjectType}`);
      }
    }

    const inputSha256 = this.computeSha256(canonicalText);

    return Object.freeze({
      canonicalText,
      inputSha256,
      canonicalizationVersion: this.CURRENT_VERSION,
    });
  }
}
