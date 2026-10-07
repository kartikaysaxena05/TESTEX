/**
 * @file packages/core/src/requirements/candidate-detection/requirement-candidate-integration.test.ts
 * PostgreSQL integration tests for RequirementCandidateService.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { getPrismaClient } from '../../database/client.js';
import { ProjectRepository } from '../../projects/project-repository.js';
import { RequirementDocumentService } from '../requirement-document-service.js';
import { DocumentStorage } from '../document-storage.js';
import { RequirementDocumentRepository } from '../requirement-document-repository.js';
import { RequirementDocumentExtractionRepository } from '../extraction/requirement-document-extraction-repository.js';
import { RequirementDocumentExtractionService } from '../extraction/requirement-document-extraction-service.js';
import { RequirementCandidateRepository } from './requirement-candidate-repository.js';
import { RequirementCandidateService } from './requirement-candidate-service.js';
import { ProjectArchivedError } from '../../projects/project-errors.js';
import {
  ExtractionNotFoundError,
  NoApprovedCandidatesError,
  CandidateAlreadyImportedError,
} from '../requirement-errors.js';

describe('RequirementCandidateService PostgreSQL Integration Tests', () => {
  let tempDir: string;
  let projectRepo: ProjectRepository;
  let docRepo: RequirementDocumentRepository;
  let extractionRepo: RequirementDocumentExtractionRepository;
  let candidateRepo: RequirementCandidateRepository;
  let storage: DocumentStorage;
  let docService: RequirementDocumentService;
  let extractionService: RequirementDocumentExtractionService;
  let candidateService: RequirementCandidateService;
  const createdProjectIds: string[] = [];

  const prisma = getPrismaClient()!;

  before(async () => {
    tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'candidate-integ-'));
    projectRepo = new ProjectRepository();
    docRepo = new RequirementDocumentRepository();
    extractionRepo = new RequirementDocumentExtractionRepository();
    candidateRepo = new RequirementCandidateRepository();
    storage = new DocumentStorage(tempDir);
    docService = new RequirementDocumentService(projectRepo, docRepo, storage);
    extractionService = new RequirementDocumentExtractionService(
      projectRepo,
      docRepo,
      extractionRepo,
      storage,
    );
    candidateService = new RequirementCandidateService(
      projectRepo,
      docRepo,
      extractionRepo,
      candidateRepo,
    );
  });

  after(async () => {
    if (prisma && createdProjectIds.length > 0) {
      try {
        await prisma.project.deleteMany({
          where: { id: { in: createdProjectIds } },
        });
      } catch {
        // Ignore teardown errors
      }
    }
    if (tempDir && fs.existsSync(tempDir)) {
      await fs.promises.rm(tempDir, { recursive: true, force: true });
    }
  });

  it('should detect candidates without creating real requirements, allow review & edit, and atomically import approved candidates', async () => {
    // 1. Create active project
    const project = await projectRepo.createProject({
      name: `Candidate Integ Project ${Date.now()}`,
      description: 'Project for requirement candidate detection integration testing',
    });
    createdProjectIds.push(project.id);

    // 2. Prepare sample SRS markdown document
    const srsContent = `# Software Requirements Specification

## 1.0 Overview
This document specifies the requirements for the authentication subsystem.

## 2.0 Functional Requirements
FR-01: The system shall allow users to log in with email and password.
FR-02: The application must authenticate tokens on every API request.
The system shall not allow brute-force password guessing.

## 3.0 Non-Functional Requirements
Passwords are required to be at least 10 characters in length.
`;

    const sampleFilePath = path.join(tempDir, 'sample_srs.md');
    await fs.promises.writeFile(sampleFilePath, srsContent, 'utf-8');

    // 3. Ingest document
    const ingested = await docService.ingestDocument({
      projectId: project.id,
      absoluteSourcePath: sampleFilePath,
    });

    // 4. Verify candidate detection throws ExtractionNotFoundError before extraction
    await assert.rejects(
      () => candidateService.detectCandidates({ projectId: project.id, documentId: ingested.id }),
      (err: unknown) => err instanceof ExtractionNotFoundError,
    );

    // 5. Extract document text & structure
    const extraction = await extractionService.extractDocument({
      projectId: project.id,
      documentId: ingested.id,
    });
    assert.equal(extraction.status, 'COMPLETED');

    // 6. DETECT CANDIDATES (CRITICAL INVARIANT: 0 Requirement records must be created!)
    const detected = await candidateService.detectCandidates({
      projectId: project.id,
      documentId: ingested.id,
    });

    assert.ok(
      detected.length >= 4,
      `Expected at least 4 detected candidates, got ${detected.length}`,
    );

    // Check requirement records in database: MUST BE 0!
    const initialReqCount = await prisma.requirement.count({
      where: { projectId: project.id },
    });
    assert.equal(
      initialReqCount,
      0,
      'Zero requirement records must be created at candidate detection time!',
    );

    // Check candidate review statuses: all must be PENDING
    for (const cand of detected) {
      assert.equal(cand.reviewStatus, 'PENDING');
      assert.equal(cand.importedRequirementId, null);
      assert.ok(cand.detectionScore >= 3);
      assert.ok(cand.detectionReasons.length > 0);
    }

    // 7. LIST CANDIDATES
    const listRes = await candidateService.listCandidates({
      projectId: project.id,
      documentId: ingested.id,
    });
    assert.equal(listRes.totalCount, detected.length);
    assert.equal(listRes.pendingCount, detected.length);
    assert.equal(listRes.approvedCount, 0);

    // 8. UPDATE / EDIT A CANDIDATE (Preserve original sourceText)
    const firstCand = detected[0]!;
    const originalSourceText = firstCand.sourceText;
    const editedText =
      'FR-01: The system shall allow users to log in securely using verified email and password.';

    const updatedCand = await candidateService.updateCandidate({
      projectId: project.id,
      candidateId: firstCand.id,
      reviewedText: editedText,
    });

    assert.equal(updatedCand.sourceText, originalSourceText, 'Source text must remain immutable!');
    assert.equal(updatedCand.reviewedText, editedText);

    // 9. SET CANDIDATE STATUSES (Approve 2, Reject 1)
    const candToApprove1 = detected[0]!.id;
    const candToApprove2 = detected[1]!.id;
    const candToReject = detected[2]!.id;

    await candidateService.setCandidateStatus({
      projectId: project.id,
      candidateIds: [candToApprove1, candToApprove2],
      status: 'APPROVED',
    });

    await candidateService.setCandidateStatus({
      projectId: project.id,
      candidateIds: [candToReject],
      status: 'REJECTED',
    });

    const statusList = await candidateService.listCandidates({
      projectId: project.id,
      documentId: ingested.id,
    });
    assert.equal(statusList.approvedCount, 2);
    assert.equal(statusList.rejectedCount, 1);

    // 10. ATOMIC TRANSACTION IMPORT
    const importResult = await candidateService.importApprovedCandidates({
      projectId: project.id,
      documentId: ingested.id,
    });

    assert.equal(importResult.importedCount, 2);
    assert.equal(importResult.createdRequirements.length, 2);

    const [req1, req2] = importResult.createdRequirements;
    assert.equal(req1!.requirementKey, 'REQ-001');
    assert.equal(req2!.requirementKey, 'REQ-002');

    // Verify requirements exist in PostgreSQL and are linked to document's requirementSourceId
    const storedReq1 = await prisma.requirement.findUnique({
      where: { id: req1!.id },
    });
    assert.ok(storedReq1);
    assert.equal(storedReq1.requirementKey, 'REQ-001');
    assert.equal(storedReq1.status, 'DRAFT');
    assert.equal(storedReq1.originalText, editedText);
    assert.equal(storedReq1.requirementSourceId, ingested.requirementSourceId);

    const storedReq2 = await prisma.requirement.findUnique({
      where: { id: req2!.id },
    });
    assert.ok(storedReq2);
    assert.equal(storedReq2.requirementKey, 'REQ-002');
    assert.equal(storedReq2.requirementSourceId, ingested.requirementSourceId);

    // Verify candidates are marked IMPORTED
    const importedCand1 = await candidateRepo.findById(project.id, candToApprove1);
    assert.equal(importedCand1?.reviewStatus, 'IMPORTED');
    assert.equal(importedCand1?.importedRequirementId, req1!.id);

    // 11. IDEMPOTENCY & GUARDRAIL CHECKS
    // Attempting to re-import when 0 approved candidates remain should throw NoApprovedCandidatesError
    await assert.rejects(
      () =>
        candidateService.importApprovedCandidates({
          projectId: project.id,
          documentId: ingested.id,
        }),
      (err: unknown) => err instanceof NoApprovedCandidatesError,
    );

    // Attempting to edit an imported candidate should throw CandidateAlreadyImportedError
    await assert.rejects(
      () =>
        candidateService.updateCandidate({
          projectId: project.id,
          candidateId: candToApprove1,
          reviewedText: 'Another edit attempt',
        }),
      (err: unknown) => err instanceof CandidateAlreadyImportedError,
    );
  });

  it('should prevent operations on archived projects', async () => {
    const project = await projectRepo.createProject({
      name: `Archived Candidate Integ Project ${Date.now()}`,
    });
    createdProjectIds.push(project.id);

    const sampleFilePath = path.join(tempDir, 'sample_archived.txt');
    await fs.promises.writeFile(
      sampleFilePath,
      'The system shall support user authentication.',
      'utf-8',
    );

    const ingested = await docService.ingestDocument({
      projectId: project.id,
      absoluteSourcePath: sampleFilePath,
    });

    await extractionService.extractDocument({
      projectId: project.id,
      documentId: ingested.id,
    });

    // Archive project
    await projectRepo.updateStatus(project.id, 'ARCHIVED');

    // Attempt detection
    await assert.rejects(
      () => candidateService.detectCandidates({ projectId: project.id, documentId: ingested.id }),
      (err: unknown) => err instanceof ProjectArchivedError,
    );
  });
});
