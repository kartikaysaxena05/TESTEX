/**
 * @file packages/core/src/requirements/candidate-detection/requirement-candidate-detector.test.ts
 * Unit tests and precision/recall evaluation for RequirementCandidateDetector.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import type {
  RequirementDocumentExtractionDto,
  DocumentBlockDto,
  DocumentTableDto,
  DocumentSectionDto,
} from '@ai-quality/contracts';
import { RequirementCandidateDetector } from './requirement-candidate-detector.js';
import { DETECTOR_VERSION } from './detection-types.js';

describe('RequirementCandidateDetector Unit Tests', () => {
  const detector = new RequirementCandidateDetector();

  function createMockExtraction(options: {
    blocks?: Partial<DocumentBlockDto>[];
    sections?: Partial<DocumentSectionDto>[];
    tables?: Partial<DocumentTableDto>[];
    format?: 'pdf' | 'docx' | 'txt' | 'md';
  }): RequirementDocumentExtractionDto {
    const fullBlocks: DocumentBlockDto[] = (options.blocks || []).map((b, idx) => ({
      id: b.id || `blk-${idx + 1}`,
      orderIndex: idx + 1,
      type: b.type || 'PARAGRAPH',
      text: b.text || '',
      pageNumber: b.pageNumber !== undefined ? b.pageNumber : null,
      lineStart: b.lineStart || idx + 1,
      lineEnd: b.lineEnd || idx + 1,
      startOffset: b.startOffset || 0,
      endOffset: b.endOffset || (b.text || '').length,
      headingLevel: b.headingLevel,
      sectionId: b.sectionId || null,
      metadata: b.metadata,
    }));

    const fullSections: DocumentSectionDto[] = (options.sections || []).map((s, idx) => ({
      id: s.id || `sec-${idx + 1}`,
      title: s.title || `Section ${idx + 1}`,
      level: s.level || 1,
      orderIndex: idx + 1,
      parentSectionId: s.parentSectionId || null,
      headingId: s.headingId || `hd-${idx + 1}`,
      blockIds: s.blockIds || [],
      lineStart: s.lineStart || 1,
      lineEnd: s.lineEnd || 10,
      pageNumber: s.pageNumber !== undefined ? s.pageNumber : null,
    }));

    const fullTables: DocumentTableDto[] = (options.tables || []).map((t, idx) => ({
      id: t.id || `tbl-${idx + 1}`,
      orderIndex: idx + 1,
      pageNumber: t.pageNumber !== undefined ? t.pageNumber : null,
      sectionId: t.sectionId || null,
      rowCount: t.rowCount || (t.rows ? t.rows.length : 0),
      columnCount: t.columnCount || 2,
      rows: t.rows || [],
    }));

    return {
      id: crypto.randomUUID(),
      projectId: crypto.randomUUID(),
      requirementDocumentId: crypto.randomUUID(),
      sourceSha256: 'a'.repeat(64),
      extractorVersion: 'document-extractor-v1',
      format: options.format || 'txt',
      plainText: fullBlocks.map(b => b.text).join('\n\n'),
      characterCount: 1000,
      lineCount: 50,
      pageCount: options.format === 'pdf' ? 3 : null,
      blockCount: fullBlocks.length,
      headingCount: fullBlocks.filter(b => b.type === 'HEADING').length,
      sectionCount: fullSections.length,
      tableCount: fullTables.length,
      status: 'COMPLETED',
      warnings: [],
      blocks: fullBlocks,
      pages: [],
      headings: [],
      sections: fullSections,
      tables: fullTables,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  it('should detect explicit "shall" and "must" obligation statements', () => {
    const extraction = createMockExtraction({
      blocks: [
        { text: 'The system shall allow users to authenticate using email and password.' },
        { text: 'The application must encrypt all user credentials at rest.' },
      ],
    });

    const result = detector.detectCandidates(extraction);
    assert.equal(result.totalDetected, 2);
    assert.equal(result.detectorVersion, DETECTOR_VERSION);

    const c1 = result.candidates[0]!;
    assert.ok(c1.detectionReasons.some(r => r.code === 'EXPLICIT_SHALL'));
    assert.ok(c1.detectionScore >= 4);

    const c2 = result.candidates[1]!;
    assert.ok(c2.detectionReasons.some(r => r.code === 'EXPLICIT_MUST'));
    assert.ok(c2.detectionScore >= 4);
  });

  it('should detect prohibition constraints (shall not, must not, cannot)', () => {
    const extraction = createMockExtraction({
      blocks: [
        { text: 'The system shall not store plaintext passwords in logs or memory.' },
        { text: 'Users must not be allowed to perform transactions with a negative balance.' },
        { text: 'Unauthorized clients cannot access administrator endpoints.' },
      ],
    });

    const result = detector.detectCandidates(extraction);
    assert.equal(result.totalDetected, 3);

    for (const cand of result.candidates) {
      assert.ok(cand.detectionReasons.some(r => r.code === 'PROHIBITION_PATTERN'));
      assert.ok(cand.detectionScore >= 3);
    }
  });

  it('should extract explicit requirement IDs (REQ-001, FR-12, AUTH-REQ-02, BR-5)', () => {
    const extraction = createMockExtraction({
      blocks: [
        { text: 'FR-12: The system shall allow users to reset their passwords.' },
        { text: '[REQ-AUTH-004] The application must revoke tokens on logout.' },
        { text: 'BR-05 - An invoice must not be approved if total amount is zero.' },
      ],
    });

    const result = detector.detectCandidates(extraction);
    assert.equal(result.totalDetected, 3);

    assert.equal(result.candidates[0]!.externalKey, 'FR-12');
    assert.ok(result.candidates[0]!.detectionReasons.some(r => r.code === 'EXPLICIT_SOURCE_ID'));

    assert.equal(result.candidates[1]!.externalKey, 'REQ-AUTH-004');
    assert.equal(result.candidates[2]!.externalKey, 'BR-05');
  });

  it('should detect passive obligation ("is required to", "are required to")', () => {
    const extraction = createMockExtraction({
      blocks: [
        { text: 'Passwords are required to contain at least eight alphanumeric characters.' },
        { text: 'The application is required to maintain an audit trail for all changes.' },
      ],
    });

    const result = detector.detectCandidates(extraction);
    assert.equal(result.totalDetected, 2);

    for (const cand of result.candidates) {
      assert.ok(cand.detectionReasons.some(r => r.code === 'REQUIRED_TO_PATTERN'));
      assert.ok(cand.detectionScore >= 3);
    }
  });

  it('should detect User Story pattern and EARS templates', () => {
    const extraction = createMockExtraction({
      blocks: [
        {
          text: 'As an administrator, I want to disable an account so that terminated employees cannot sign in.',
        },
        {
          text: 'When the session expires, the system shall redirect the user to the login screen.',
        },
        {
          text: 'If invalid credentials are entered, the system shall display an error notification.',
        },
      ],
    });

    const result = detector.detectCandidates(extraction);
    assert.equal(result.totalDetected, 3);

    assert.ok(result.candidates[0]!.detectionReasons.some(r => r.code === 'USER_STORY_PATTERN'));
    assert.ok(result.candidates[1]!.detectionReasons.some(r => r.code === 'EARS_PATTERN'));
    assert.ok(result.candidates[2]!.detectionReasons.some(r => r.code === 'EARS_PATTERN'));
  });

  it('should detect requirement table rows with column ID and description extraction', () => {
    const extraction = createMockExtraction({
      tables: [
        {
          id: 'tbl-101',
          pageNumber: 2,
          rows: [
            {
              rowIndex: 0,
              cells: [
                { rowIndex: 0, columnIndex: 0, text: 'Requirement ID', isHeader: true },
                { rowIndex: 0, columnIndex: 1, text: 'Functional Specification', isHeader: true },
              ],
            },
            {
              rowIndex: 1,
              cells: [
                { rowIndex: 1, columnIndex: 0, text: 'FR-101', isHeader: false },
                {
                  rowIndex: 1,
                  columnIndex: 1,
                  text: 'The system shall allow users to upload profile pictures.',
                  isHeader: false,
                },
              ],
            },
            {
              rowIndex: 2,
              cells: [
                { rowIndex: 2, columnIndex: 0, text: 'FR-102', isHeader: false },
                {
                  rowIndex: 2,
                  columnIndex: 1,
                  text: 'The system must restrict uploaded file types to PNG and JPEG.',
                  isHeader: false,
                },
              ],
            },
          ],
        },
      ],
    });

    const result = detector.detectCandidates(extraction);
    assert.equal(result.totalDetected, 2);

    const c1 = result.candidates[0]!;
    assert.equal(c1.sourceTableId, 'tbl-101');
    assert.equal(c1.sourceRowIndex, 1);
    assert.equal(c1.externalKey, 'FR-101');
    assert.equal(c1.sourceText, 'The system shall allow users to upload profile pictures.');
    assert.equal(c1.pageNumber, 2);
    assert.ok(c1.detectionReasons.some(r => r.code === 'REQUIREMENT_TABLE_ROW'));

    const c2 = result.candidates[1]!;
    assert.equal(c2.externalKey, 'FR-102');
  });

  it('should flag exact identical candidate text duplicates within the same document', () => {
    const extraction = createMockExtraction({
      blocks: [
        { text: 'The application must encrypt all user credentials at rest.' },
        { text: 'The application must encrypt all user credentials at rest.' },
      ],
    });

    const result = detector.detectCandidates(extraction);
    assert.equal(result.totalDetected, 2);

    assert.equal(result.candidates[0]!.warnings.length, 0);
    assert.equal(result.candidates[1]!.warnings.length, 1);
    assert.equal(result.candidates[1]!.warnings[0]!.code, 'EXACT_DUPLICATE_CANDIDATE');
  });

  it('should reject non-requirement headings, Table of Contents, metadata, and boilerplate', () => {
    const extraction = createMockExtraction({
      blocks: [
        { type: 'HEADING', text: '3.2 Authentication Requirements' },
        { type: 'HEADING', text: '4.0 Security and Data Protection' },
        { text: '3.2 Authentication Requirements ....................... 14' },
        { text: 'Document Version: 2.1.0' },
        { text: 'Prepared By: QA Automation Engineering Team' },
        { text: 'Revision Date: 2026-08-21' },
        { text: 'This section describes the organization of this document.' },
        { text: 'Confidential — Company Internal' },
        { text: 'Software Requirements Specification' },
        { text: 'Short' },
        { text: 'shall' },
        { text: 'REQ-01' },
      ],
    });

    const result = detector.detectCandidates(extraction);
    assert.equal(result.totalDetected, 0);
  });

  it('should produce identical deterministic output on identical inputs', () => {
    const extraction = createMockExtraction({
      blocks: [
        { text: 'FR-01: The system shall support OAuth2 authentication.' },
        { text: 'FR-02: The application must restrict access by user role.' },
      ],
    });

    const run1 = detector.detectCandidates(extraction);
    const run2 = detector.detectCandidates(extraction);

    assert.equal(run1.totalDetected, run2.totalDetected);
    assert.deepEqual(
      run1.candidates.map(c => ({
        text: c.sourceText,
        reasons: c.detectionReasons,
        score: c.detectionScore,
      })),
      run2.candidates.map(c => ({
        text: c.sourceText,
        reasons: c.detectionReasons,
        score: c.detectionScore,
      })),
    );
  });

  // --------------------------------------------------------------------------
  // Precision & Recall Evaluation Test on Controlled Fixture Dataset
  // --------------------------------------------------------------------------
  it('should evaluate precision and recall against labeled fixture dataset', () => {
    interface LabeledSample {
      text: string;
      isRequirement: boolean;
      type?: 'HEADING' | 'PARAGRAPH' | 'LIST_ITEM';
    }

    const labeledDataset: LabeledSample[] = [
      // True Positives (Real Requirements)
      {
        text: 'The system shall allow registered users to log in using their email and password.',
        isRequirement: true,
      },
      {
        text: 'The application must enforce TLS 1.3 encryption on all external network communication.',
        isRequirement: true,
      },
      {
        text: 'The system shall not allow users to perform withdrawals exceeding their account balance.',
        isRequirement: true,
      },
      {
        text: 'FR-14: The platform shall notify administrators when disk usage exceeds 90%.',
        isRequirement: true,
      },
      {
        text: 'Passwords are required to be at least 12 characters in length.',
        isRequirement: true,
      },
      {
        text: 'As a customer, I want to export transaction history so that I can prepare taxes.',
        isRequirement: true,
      },
      {
        text: 'When the API rate limit is exceeded, the system shall return an HTTP 429 status.',
        isRequirement: true,
      },
      {
        text: 'The database must replicate data across at least three geographic regions.',
        isRequirement: true,
      },
      {
        text: 'The system shall lock an account after five consecutive failed authentication attempts.',
        isRequirement: true,
      },
      {
        text: 'AUTH-REQ-02: The authentication token shall expire after thirty minutes of inactivity.',
        isRequirement: true,
      },

      // True Negatives (Boilerplate, Headings, TOC, Metadata, Non-Requirements)
      { text: '1.0 Introduction and System Overview', isRequirement: false, type: 'HEADING' },
      { text: '2.3 Non-Functional Requirements', isRequirement: false, type: 'HEADING' },
      { text: 'Document Version: 1.4', isRequirement: false },
      { text: 'Prepared By: Quality Assurance Architecture Team', isRequirement: false },
      { text: '2.1 User Management .................................. 18', isRequirement: false },
      { text: 'This section describes the organization of this document.', isRequirement: false },
      { text: 'Confidential — Company Internal Use Only', isRequirement: false },
      { text: 'Software Requirements Specification', isRequirement: false },
      { text: 'See Section 4.2 for further implementation details.', isRequirement: false },
      { text: 'Short fragment', isRequirement: false },
    ];

    let truePositives = 0;
    let falsePositives = 0;
    let falseNegatives = 0;
    let trueNegatives = 0;

    for (const sample of labeledDataset) {
      const singleExtraction = createMockExtraction({
        blocks: [{ text: sample.text, type: sample.type || 'PARAGRAPH' }],
      });

      const res = detector.detectCandidates(singleExtraction);
      const isDetected = res.totalDetected > 0;

      if (sample.isRequirement && isDetected) {
        truePositives++;
      } else if (!sample.isRequirement && isDetected) {
        falsePositives++;
      } else if (sample.isRequirement && !isDetected) {
        falseNegatives++;
      } else if (!sample.isRequirement && !isDetected) {
        trueNegatives++;
      }
    }

    const precision = truePositives / (truePositives + falsePositives);
    const recall = truePositives / (truePositives + falseNegatives);

    // Assert high precision and recall on the controlled benchmark dataset
    assert.equal(truePositives, 10, 'Expected 10 True Positives');
    assert.equal(falsePositives, 0, 'Expected 0 False Positives');
    assert.equal(falseNegatives, 0, 'Expected 0 False Negatives');
    assert.equal(trueNegatives, 10, 'Expected 10 True Negatives');
    assert.equal(precision, 1.0, 'Expected 100% precision on labeled benchmark');
    assert.equal(recall, 1.0, 'Expected 100% recall on labeled benchmark');
  });
});
