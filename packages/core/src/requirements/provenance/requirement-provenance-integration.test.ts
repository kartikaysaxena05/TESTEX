/**
 * @file packages/core/src/requirements/provenance/requirement-provenance-integration.test.ts
 * End-to-end PostgreSQL integration tests for Requirement Source Provenance & Auditability (V3 Phase 36).
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { getPrismaClient } from '../../database/client.js';
import { ProjectRepository } from '../../projects/project-repository.js';
import { RequirementService } from '../requirement-service.js';
import { RequirementRepository } from '../requirement-repository.js';
import { RequirementDocumentService } from '../requirement-document-service.js';
import { RequirementDocumentExtractionService } from '../extraction/requirement-document-extraction-service.js';
import { RequirementCandidateService } from '../candidate-detection/requirement-candidate-service.js';
import { RequirementProvenanceService } from './requirement-provenance-service.js';
import { RequirementProvenanceRepository } from './requirement-provenance-repository.js';
import { DocumentStorage } from '../document-storage.js';
import { DocumentInUseError, ProvenanceNotFoundError } from '../requirement-errors.js';

describe('Requirement Source Provenance & Auditability (V3 Phase 36) Integration', () => {
  let projectRepo: ProjectRepository;
  let requirementRepo: RequirementRepository;
  let requirementService: RequirementService;
  let docService: RequirementDocumentService;
  let extractionService: RequirementDocumentExtractionService;
  let candidateService: RequirementCandidateService;
  let provenanceService: RequirementProvenanceService;
  let provenanceRepo: RequirementProvenanceRepository;
  let documentStorage: DocumentStorage;

  let testProjectId: string;
  let otherProjectId: string;
  let testTempDir: string;

  before(async () => {
    projectRepo = new ProjectRepository();
    requirementRepo = new RequirementRepository();
    requirementService = new RequirementService(requirementRepo, undefined, projectRepo);
    provenanceRepo = new RequirementProvenanceRepository();
    documentStorage = new DocumentStorage();
    docService = new RequirementDocumentService(
      projectRepo,
      undefined,
      documentStorage,
      provenanceRepo,
    );
    extractionService = new RequirementDocumentExtractionService();
    candidateService = new RequirementCandidateService(projectRepo);
    provenanceService = new RequirementProvenanceService(
      provenanceRepo,
      projectRepo,
      documentStorage,
    );

    testTempDir = path.join(os.tmpdir(), `collage-provenance-test-${crypto.randomUUID()}`);
    fs.mkdirSync(testTempDir, { recursive: true });

    // Create test projects
    const p1 = await projectRepo.createProject({
      name: `Provenance Test Project ${Date.now()}`,
      description: 'Phase 36 Integration Test',
    });
    testProjectId = p1.id;

    const p2 = await projectRepo.createProject({
      name: `Other Test Project ${Date.now()}`,
      description: 'Phase 36 Cross-project Isolation Test',
    });
    otherProjectId = p2.id;
  });

  after(async () => {
    const prisma = getPrismaClient();
    if (prisma) {
      if (testProjectId) {
        await prisma.project.deleteMany({ where: { id: { in: [testProjectId, otherProjectId] } } });
      }
    }
    if (fs.existsSync(testTempDir)) {
      fs.rmSync(testTempDir, { recursive: true, force: true });
    }
  });

  it('atomically creates truthful MANUAL provenance upon manual requirement creation', async () => {
    const req = await requirementService.createRequirement({
      projectId: testProjectId,
      title: 'Manual Requirement for Audit',
      originalText: 'The system shall allow administrators to view audit logs.',
      type: 'FUNCTIONAL',
      priority: 'HIGH',
    });

    const prov = await provenanceService.getProvenance(testProjectId, req.id);

    assert.equal(prov.requirementId, req.id);
    assert.equal(prov.sourceKind, 'MANUAL');
    assert.equal(prov.locationKind, 'NONE');
    assert.equal(prov.completeness, 'MINIMAL');
    assert.equal(prov.integrityStatus, 'VERIFIED');
    assert.equal(prov.documentId, null);
    assert.equal(prov.candidateId, null);
    assert.equal(prov.pageNumber, null);
    assert.equal(prov.lineStart, null);
  });

  it('atomically creates truthful PASTED_TEXT provenance with line bounds upon bulk import', async () => {
    const bulkResult = await requirementService.importBulkRequirements({
      projectId: testProjectId,
      sourceName: 'Security Requirements Paste',
      candidates: [
        {
          title: 'Enforce strong passwords',
          originalText: 'Users shall set passwords with at least 12 characters.',
          type: 'FUNCTIONAL',
          priority: 'CRITICAL',
          detectedExternalKey: 'SEC-01',
          lineStart: 10,
          lineEnd: 12,
        },
      ],
    });

    assert.equal(bulkResult.importedCount, 1);
    const importedReq = bulkResult.requirements[0]!;

    const prov = await provenanceService.getProvenance(testProjectId, importedReq.id);

    assert.equal(prov.requirementId, importedReq.id);
    assert.equal(prov.sourceKind, 'PASTED_TEXT');
    assert.equal(prov.locationKind, 'PASTE_LINE');
    assert.equal(prov.lineStart, 10);
    assert.equal(prov.lineEnd, 12);
    assert.equal(prov.externalRequirementKey, 'SEC-01');
    assert.equal(prov.completeness, 'COMPLETE');
    assert.equal(prov.integrityStatus, 'VERIFIED');
    assert.equal(prov.sourceText, 'Users shall set passwords with at least 12 characters.');
  });

  it('atomically creates complete DOCUMENT provenance upon candidate detection & import', async () => {
    // 1. Write sample SRS markdown file
    const srsFile = path.join(testTempDir, 'SRS-Auth.md');
    fs.writeFileSync(
      srsFile,
      `# System Requirements Specification

## 3. Security Requirements
### 3.1 Authentication
REQ-SEC-01: The system shall enforce multi-factor authentication for all remote administrative sessions.

REQ-SEC-02: The system shall lockout accounts after 5 failed password attempts.
`,
      'utf-8',
    );

    // 2. Ingest document
    const doc = await docService.ingestDocument({
      projectId: testProjectId,
      absoluteSourcePath: srsFile,
      sourceName: 'SRS Auth Spec',
    });

    // 3. Extract text & structure
    const extraction = await extractionService.extractDocument({
      projectId: testProjectId,
      documentId: doc.id,
    });

    // 4. Detect candidates
    const candidates = await candidateService.detectCandidates({
      projectId: testProjectId,
      documentId: doc.id,
    });
    assert.ok(candidates.length >= 2, 'Should detect at least 2 candidates');

    // 5. Approve candidate
    const targetCand = candidates[0]!;
    await candidateService.setCandidateStatus({
      projectId: testProjectId,
      candidateIds: [targetCand.id],
      status: 'APPROVED',
    });

    // 6. Import approved candidate
    const importResult = await candidateService.importApprovedCandidates({
      projectId: testProjectId,
      documentId: doc.id,
      candidateIds: [targetCand.id],
    });
    assert.equal(importResult.importedCount, 1);
    const createdSummary = importResult.createdRequirements[0]!;

    // 7. Verify full DOCUMENT provenance
    const prov = await provenanceService.getProvenance(testProjectId, createdSummary.id);

    assert.equal(prov.requirementId, createdSummary.id);
    assert.equal(prov.sourceKind, 'DOCUMENT');
    assert.equal(prov.candidateId, targetCand.id);
    assert.equal(prov.documentId, doc.id);
    assert.equal(prov.extractionId, extraction.id);
    assert.equal(prov.sourceSha256, doc.sha256);
    assert.equal(prov.detectorVersion, targetCand.detectorVersion);
    assert.equal(prov.completeness, 'COMPLETE');
    assert.equal(prov.integrityStatus, 'VERIFIED');
    assert.equal(prov.documentMetadata?.originalFileName, 'SRS-Auth.md');
    assert.equal(prov.sourceText, targetCand.sourceText);

    // DOCX/MD page number must NOT be fabricated (null)
    assert.equal(prov.pageNumber, null);
  });

  it('guarantees source text immutability when Requirement text is edited', async () => {
    // 1. Create requirement with provenance
    const req = await requirementService.createRequirement({
      projectId: testProjectId,
      title: 'Original Title',
      originalText: 'The system shall log every login attempt.',
    });

    const provBefore = await provenanceService.getProvenance(testProjectId, req.id);
    assert.equal(provBefore.sourceText, 'The system shall log every login attempt.');

    // 2. Edit requirement in Phase 30
    await requirementService.updateRequirement({
      projectId: testProjectId,
      requirementId: req.id,
      title: 'Updated Title',
      originalText: 'MODIFIED TEXT: The system shall log every login and logout attempt.',
    });

    // 3. Verify provenance sourceText remains strictly unchanged
    const provAfter = await provenanceService.getProvenance(testProjectId, req.id);
    assert.equal(provAfter.sourceText, 'The system shall log every login attempt.');
    assert.equal(
      provAfter.currentRequirementText,
      'MODIFIED TEXT: The system shall log every login and logout attempt.',
    );
  });

  it('retains provenance unchanged across requirement lifecycle transitions', async () => {
    const req = await requirementService.createRequirement({
      projectId: testProjectId,
      title: 'Lifecycle Provenance Test',
      originalText: 'The system shall retain provenance forever.',
    });

    await requirementService.activateRequirement({
      projectId: testProjectId,
      requirementId: req.id,
    });
    await requirementService.deprecateRequirement({
      projectId: testProjectId,
      requirementId: req.id,
    });
    await requirementService.archiveRequirement({
      projectId: testProjectId,
      requirementId: req.id,
    });
    await requirementService.restoreRequirement({
      projectId: testProjectId,
      requirementId: req.id,
    });

    const prov = await provenanceService.getProvenance(testProjectId, req.id);
    assert.equal(prov.sourceKind, 'MANUAL');
    assert.equal(prov.integrityStatus, 'VERIFIED');
  });

  it('detects MISSING_FILE and HASH_MISMATCH in document source integrity verification', async () => {
    // 1. Create test file and ingest
    const testFile = path.join(testTempDir, 'Integrity-Test.txt');
    fs.writeFileSync(
      testFile,
      'REQ-INT-01: The system shall verify cryptographic source integrity.',
      'utf-8',
    );

    const doc = await docService.ingestDocument({
      projectId: testProjectId,
      absoluteSourcePath: testFile,
      sourceName: 'Integrity Doc',
    });

    await extractionService.extractDocument({
      projectId: testProjectId,
      documentId: doc.id,
    });

    const candidates = await candidateService.detectCandidates({
      projectId: testProjectId,
      documentId: doc.id,
    });
    assert.ok(candidates.length >= 1, 'Should detect at least 1 candidate');

    await candidateService.setCandidateStatus({
      projectId: testProjectId,
      candidateIds: [candidates[0]!.id],
      status: 'APPROVED',
    });

    const importRes = await candidateService.importApprovedCandidates({
      projectId: testProjectId,
      documentId: doc.id,
      candidateIds: [candidates[0]!.id],
    });

    const reqId = importRes.createdRequirements[0]!.id;

    // Verify initially VERIFIED
    let prov = await provenanceService.getProvenance(testProjectId, reqId);
    assert.equal(prov.integrityStatus, 'VERIFIED');

    // Tamper with file in storage
    const managedPath = documentStorage.getManagedFilePath(testProjectId, doc.storageKey);
    fs.chmodSync(managedPath, 0o666);
    fs.writeFileSync(managedPath, 'TAMPERED FILE CONTENT');

    prov = await provenanceService.getProvenance(testProjectId, reqId);
    assert.equal(prov.integrityStatus, 'HASH_MISMATCH');

    // Delete managed file from storage
    fs.unlinkSync(managedPath);
    prov = await provenanceService.getProvenance(testProjectId, reqId);
    assert.equal(prov.integrityStatus, 'MISSING_FILE');
  });

  it('blocks hard deletion of RequirementDocument when live provenance depends on it (DocumentInUseError)', async () => {
    const testFile = path.join(testTempDir, 'Delete-Protected.txt');
    fs.writeFileSync(
      testFile,
      'REQ-DEL-01: The system shall protect documents from live deletion.',
      'utf-8',
    );

    const doc = await docService.ingestDocument({
      projectId: testProjectId,
      absoluteSourcePath: testFile,
      sourceName: 'Protected Doc',
    });

    await extractionService.extractDocument({
      projectId: testProjectId,
      documentId: doc.id,
    });

    const candidates = await candidateService.detectCandidates({
      projectId: testProjectId,
      documentId: doc.id,
    });
    assert.ok(candidates.length >= 1, 'Should detect at least 1 candidate');

    await candidateService.setCandidateStatus({
      projectId: testProjectId,
      candidateIds: [candidates[0]!.id],
      status: 'APPROVED',
    });

    await candidateService.importApprovedCandidates({
      projectId: testProjectId,
      documentId: doc.id,
      candidateIds: [candidates[0]!.id],
    });

    // Attempting to delete document must be blocked
    await assert.rejects(
      async () => {
        await docService.deleteDocument({
          projectId: testProjectId,
          documentId: doc.id,
        });
      },
      (err: unknown) => {
        assert.ok(err instanceof DocumentInUseError);
        assert.equal(err.code, 'DOCUMENT_IN_USE');
        return true;
      },
    );
  });

  it('enforces strict project isolation for provenance retrieval', async () => {
    const reqInProjectA = await requirementService.createRequirement({
      projectId: testProjectId,
      title: 'Project A Requirement',
      originalText: 'Secret requirement text in Project A.',
    });

    // Attempt to access Project A's requirement provenance from Project B
    await assert.rejects(
      async () => {
        await provenanceService.getProvenance(otherProjectId, reqInProjectA.id);
      },
      (err: unknown) => {
        assert.ok(err instanceof ProvenanceNotFoundError);
        assert.equal(err.code, 'PROVENANCE_NOT_FOUND');
        return true;
      },
    );
  });
});
