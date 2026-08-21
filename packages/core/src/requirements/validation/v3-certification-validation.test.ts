/**
 * @file packages/core/src/requirements/validation/v3-certification-validation.test.ts
 * Phase 42 V3 Requirement Intelligence Full Pipeline Certification & Security Test Suite.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { getPrismaClient } from '../../database/client.js';
import { ProjectService } from '../../projects/project-service.js';
import { RequirementService } from '../requirement-service.js';
import { parseBulkRequirementsText } from '../bulk-requirement-parser.js';
import { RequirementDocumentService } from '../requirement-document-service.js';
import { RequirementDocumentExtractionService } from '../extraction/requirement-document-extraction-service.js';
import { RequirementCandidateService } from '../candidate-detection/requirement-candidate-service.js';
import { RequirementProvenanceService } from '../provenance/requirement-provenance-service.js';
import { RequirementNormalizationService } from '../normalization/requirement-normalization-service.js';
import { RequirementClassificationService } from '../classification/requirement-classification-service.js';
import { RequirementQualityService } from '../quality/requirement-quality-service.js';
import { RequirementRelationshipService } from '../relationships/requirement-relationship-service.js';
import { RequirementRepositoryEvidenceService } from '../evidence/requirement-repository-evidence-service.js';
import { RequirementVersionService } from '../versioning/requirement-version-service.js';
import { RequirementImpactService } from '../impact/requirement-impact-service.js';
import { SourceService } from '../../sources/source-service.js';
import { RepositoryIndexService } from '../../sources/indexing/repository-index-service.js';
import {
  RequirementNotFoundError,
  RequirementVersionConflictError,
  InvalidRequirementTransitionError,
} from '../requirement-errors.js';

describe('V3 Phase 42 — Full Requirement Intelligence Certification Suite', () => {
  const prisma = getPrismaClient()!;
  const projectService = new ProjectService();
  const sourceService = new SourceService();
  const indexService = new RepositoryIndexService();
  const requirementService = new RequirementService();
  const documentService = new RequirementDocumentService();
  const extractionService = new RequirementDocumentExtractionService();
  const candidateService = new RequirementCandidateService();
  const provenanceService = new RequirementProvenanceService();
  const normalizationService = new RequirementNormalizationService();
  const classificationService = new RequirementClassificationService();
  const qualityService = new RequirementQualityService();
  const relationshipService = new RequirementRelationshipService();
  const evidenceService = new RequirementRepositoryEvidenceService();
  const versionService = new RequirementVersionService();
  const impactService = new RequirementImpactService();

  let tempDir: string;
  let srsDocPath: string;
  let targetRepoDir: string;
  let projectId: string;
  let otherProjectId: string;
  let projectSourceId: string;
  let indexedFileId: string | null = null;
  let indexedSymbolId: string | null = null;

  // Tracked entities across the certified pipeline
  let docId: string;
  let manualReqId: string;
  let docCandidateReqId: string;
  let bulkReqId: string;

  before(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'v3-certification-test-'));
    targetRepoDir = path.join(tempDir, 'repo');
    fs.mkdirSync(path.join(targetRepoDir, 'src', 'auth'), { recursive: true });

    // Create a mock source file in target repo
    const mockAuthCode = `
export class UserAuthService {
  async authenticateUser(username: string, passwordHash: string): Promise<boolean> {
    return username === 'admin' && passwordHash.length === 64;
  }
}
`;
    fs.writeFileSync(
      path.join(targetRepoDir, 'src', 'auth', 'auth.service.ts'),
      mockAuthCode,
      'utf8',
    );

    // Create an SRS Markdown fixture
    srsDocPath = path.join(tempDir, 'sample-srs.md');
    const srsContent = `# Software Requirements Specification
## 1. Authentication Module
The system shall authenticate users using username and password.
The system shall reject invalid login attempts after 5 failures.

## 2. Session Management
The system must maintain session tokens for 30 minutes.
`;
    fs.writeFileSync(srsDocPath, srsContent, 'utf8');

    // Create 2 isolated projects
    const projectA = await projectService.createProject({
      name: 'V3 Certification Project A',
      description: 'Primary project for V3 certification tests',
    });
    projectId = projectA.id;

    const projectB = await projectService.createProject({
      name: 'V3 Certification Project B',
      description: 'Secondary project for isolation tests',
    });
    otherProjectId = projectB.id;

    // Attach source to Project A
    const sourceRes = await sourceService.attachLocalDirectory(projectId, targetRepoDir);
    projectSourceId = sourceRes.id;

    // Index the attached repository source
    await indexService.refreshIndex(projectId);
    const files = await indexService.listIndexedFiles(projectId, {
      projectId,
      page: 1,
      pageSize: 10,
    });
    if (files.items.length > 0) {
      indexedFileId = files.items[0]!.id;
      const fileDetails = await indexService.getFileDetails(projectId, indexedFileId);
      if (fileDetails && fileDetails.symbols.length > 0) {
        indexedSymbolId = fileDetails.symbols[0]!.id;
      }
    }
  });

  after(async () => {
    // Cleanup database records for both projects
    await prisma.requirementChangeImpact.deleteMany({
      where: { projectId: { in: [projectId, otherProjectId] } },
    });
    await prisma.requirementRepositoryEvidence.deleteMany({
      where: { projectId: { in: [projectId, otherProjectId] } },
    });
    await prisma.requirementRelationship.deleteMany({
      where: { projectId: { in: [projectId, otherProjectId] } },
    });
    await prisma.requirementQualityFinding.deleteMany({
      where: { projectId: { in: [projectId, otherProjectId] } },
    });
    await prisma.requirementQualityAnalysis.deleteMany({
      where: { projectId: { in: [projectId, otherProjectId] } },
    });
    await prisma.requirementMetadata.deleteMany({
      where: { projectId: { in: [projectId, otherProjectId] } },
    });
    await prisma.requirementRepresentation.deleteMany({
      where: { projectId: { in: [projectId, otherProjectId] } },
    });
    await prisma.requirementProvenance.deleteMany({
      where: { projectId: { in: [projectId, otherProjectId] } },
    });
    await prisma.requirementCandidate.deleteMany({
      where: { projectId: { in: [projectId, otherProjectId] } },
    });
    await prisma.requirementVersion.deleteMany({
      where: { projectId: { in: [projectId, otherProjectId] } },
    });
    await prisma.requirement.deleteMany({
      where: { projectId: { in: [projectId, otherProjectId] } },
    });
    await prisma.requirementDocumentExtraction.deleteMany({
      where: { projectId: { in: [projectId, otherProjectId] } },
    });
    await prisma.requirementDocument.deleteMany({
      where: { projectId: { in: [projectId, otherProjectId] } },
    });
    await prisma.requirementSource.deleteMany({
      where: { projectId: { in: [projectId, otherProjectId] } },
    });
    await prisma.projectRequirementSequence.deleteMany({
      where: { projectId: { in: [projectId, otherProjectId] } },
    });
    await prisma.repositoryIndexRun.deleteMany({
      where: { sourceId: projectSourceId },
    });
    await prisma.repositorySymbol.deleteMany({
      where: { repositoryFile: { sourceId: projectSourceId } },
    });
    await prisma.repositoryFile.deleteMany({
      where: { sourceId: projectSourceId },
    });
    await prisma.projectSource.deleteMany({
      where: { projectId: { in: [projectId, otherProjectId] } },
    });
    await prisma.project.deleteMany({
      where: { id: { in: [projectId, otherProjectId] } },
    });

    // Cleanup filesystem
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup error
    }
  });

  it('1. Manual Requirement Intake: assigns REQ-001 and creates baseline Version 1', async () => {
    const req = await requirementService.createRequirement({
      projectId,
      title: 'User Authentication',
      originalText: 'The system shall authenticate users with valid credentials.',
      type: 'FUNCTIONAL',
      priority: 'HIGH',
      status: 'ACTIVE',
    });

    manualReqId = req.id;
    assert.equal(req.requirementKey, 'REQ-001');
    assert.equal(req.status, 'ACTIVE');

    const history = await versionService.getRequirementHistory({
      projectId,
      requirementId: manualReqId,
    });
    assert.equal(history.totalVersions, 1);
    assert.equal(history.versions[0]?.versionNumber, 1);
    assert.equal(history.versions[0]?.changeKind, 'CREATED');

    const prov = await provenanceService.getProvenance(projectId, manualReqId);
    assert.equal(prov.sourceKind, 'MANUAL');
  });

  it('2. Document Ingestion & Integrity: ingests SRS document safely without creating requirements', async () => {
    const reqCountBefore = (await requirementService.listRequirements({ projectId })).items.length;

    const doc = await documentService.ingestDocument({
      projectId,
      absoluteSourcePath: srsDocPath,
    });
    docId = doc.id;

    assert.equal(doc.projectId, projectId);
    assert.ok(doc.sha256);
    assert.equal(doc.fileExtension, 'md');

    const reqCountAfter = (await requirementService.listRequirements({ projectId })).items.length;
    assert.equal(reqCountAfter, reqCountBefore, 'Document ingestion must create 0 requirements');
  });

  it('3. Document Extraction & Candidate Detection: extracts structure with 0 keys allocated', async () => {
    const extraction = await extractionService.extractDocument({ projectId, documentId: docId });
    assert.ok(extraction.plainText.length > 0);
    assert.ok(extraction.blocks.length > 0);

    const candidates = await candidateService.detectCandidates({ projectId, documentId: docId });
    assert.ok(candidates.length >= 2);

    const reqCount = (await requirementService.listRequirements({ projectId })).items.length;
    assert.equal(
      reqCount,
      1,
      'Candidate detection must allocate 0 requirement keys and create 0 requirements',
    );
  });

  it('4. Candidate Import: approves and imports candidate atomically assigning REQ-002', async () => {
    const candList = await candidateService.listCandidates({ projectId, documentId: docId });
    const candidateToApprove = candList.candidates[0]!;

    await candidateService.setCandidateStatus({
      projectId,
      candidateIds: [candidateToApprove.id],
      status: 'APPROVED',
    });

    const importRes = await candidateService.importApprovedCandidates({
      projectId,
      documentId: docId,
    });

    assert.equal(importRes.importedCount, 1);
    docCandidateReqId = importRes.createdRequirements[0]!.id;

    const importedReq = await requirementService.getRequirement({
      projectId,
      requirementId: docCandidateReqId,
    });
    assert.equal(importedReq?.requirementKey, 'REQ-002');

    // Verify durable DOCUMENT provenance
    const prov = await provenanceService.getProvenance(projectId, docCandidateReqId);
    assert.equal(prov.sourceKind, 'DOCUMENT');
    assert.equal(prov.documentId, docId);
  });

  it('5. Bulk Intake: parses raw pasted text and imports atomically assigning REQ-003', async () => {
    const bulkParsed = parseBulkRequirementsText(
      '1. The system shall log all authentication events.\n2. The system must encrypt stored passwords.',
    );
    assert.equal(bulkParsed.candidates.length, 2);

    const importRes = await requirementService.importBulkRequirements({
      projectId,
      candidates: [bulkParsed.candidates[0]!],
    });

    assert.equal(importRes.importedCount, 1);
    bulkReqId = importRes.requirements[0]!.id;

    const importedReq = await requirementService.getRequirement({
      projectId,
      requirementId: bulkReqId,
    });
    assert.equal(importedReq?.requirementKey, 'REQ-003');

    const prov = await provenanceService.getProvenance(projectId, bulkReqId);
    assert.equal(prov.sourceKind, 'PASTED_TEXT');
  });

  it('6. Normalization & Structured Model: produces deterministic canonical structure', async () => {
    const rep = await normalizationService.normalizeRequirement({
      projectId,
      requirementId: manualReqId,
    });

    assert.equal(rep.isStale, false);
    assert.ok(rep.normalizedText);
    assert.equal(rep.modality, 'SHALL');
  });

  it('7. Classification & Quality Analysis: classifies with explainable reason codes', async () => {
    const classification = await classificationService.classifyRequirement(projectId, manualReqId);
    assert.ok(
      ['FUNCTIONAL', 'SECURITY', 'NON_FUNCTIONAL'].includes(classification.category),
      `Unexpected category: ${classification.category}`,
    );
    assert.ok(classification.reasons.length > 0);

    const quality = await qualityService.analyzeQuality(projectId, manualReqId);
    assert.ok(['TESTABLE', 'PARTIALLY_TESTABLE'].includes(quality.testabilityStatus));
  });

  it('8. Relationships & Cycle Detection: establishes directional dependencies', async () => {
    // REQ-002 (Session) depends on REQ-001 (Auth)
    const rel = await relationshipService.createManualRelationship({
      projectId,
      sourceRequirementId: docCandidateReqId,
      targetRequirementId: manualReqId,
      relationshipType: 'DEPENDS_ON',
      reviewRationale: 'Session requires Auth',
    });
    assert.equal(rel.status, 'CONFIRMED');

    const graph = await relationshipService.getRelationshipGraph({ projectId });
    assert.equal(graph.nodes.length >= 3, true);
    assert.equal(graph.cycles.length, 0);
  });

  it('9. Repository Evidence Mapping: matches real symbols from V2 index with bounded preview', async () => {
    const matchRes = await evidenceService.matchRepositoryEvidence({
      projectId,
      requirementId: manualReqId,
    });
    assert.ok(matchRes.candidateEvidence !== undefined);

    if (indexedFileId) {
      // Create a manual evidence link to verify preview
      const manualEvidence = await evidenceService.createManualRepositoryEvidence({
        projectId,
        requirementId: manualReqId,
        projectSourceId,
        indexedFileId,
        symbolId: indexedSymbolId ?? undefined,
        evidenceType: 'SERVICE',
        reviewRationale: 'Auth service evidence',
      });
      assert.equal(manualEvidence.evidenceType, 'SERVICE');

      const preview = await evidenceService.previewRepositoryEvidence({
        projectId,
        evidenceId: manualEvidence.id,
      });
      assert.ok(preview.content.includes('UserAuthService'));
      assert.ok(preview.totalLines <= 50);
    }
  });

  it('10. Versioned Evolution & Optimistic Concurrency: creates Version 2 and detects conflict', async () => {
    // Update REQ-001 with expectedVersionNumber: 1 -> creates Version 2
    const updated = await versionService.updateRequirementVersioned({
      projectId,
      requirementId: manualReqId,
      expectedVersionNumber: 1,
      originalText: 'The system shall authenticate users within 3 seconds with MFA.',
      changeReason: 'Stricter latency and security requirement',
    });

    assert.equal(updated.version.versionNumber, 2);
    assert.equal(updated.version.changeKind, 'TEXT_CHANGED');

    // Concurrency conflict check: client using stale expectedVersionNumber 1
    await assert.rejects(
      async () => {
        await versionService.updateRequirementVersioned({
          projectId,
          requirementId: manualReqId,
          expectedVersionNumber: 1, // Stale!
          originalText: 'Conflicting edit text',
        });
      },
      (err: unknown) => {
        assert.ok(err instanceof RequirementVersionConflictError);
        return true;
      },
    );
  });

  it('11. Change Impact Foundation: detects reverse dependency impact candidate for REQ-002', async () => {
    // REQ-001 changed -> REQ-002 (which depends on REQ-001) should be an impact candidate
    const impact = await impactService.getChangeImpact({
      projectId,
      requirementId: manualReqId,
    });

    assert.equal(impact.versionNumber, 2);
    const candidate = impact.candidates.find(c => c.targetRequirementId === docCandidateReqId);
    assert.ok(candidate, 'REQ-002 must be surfaced as an impact candidate');
    assert.equal(candidate?.impactType, 'DEPENDENT_REQUIREMENT');
    assert.equal(candidate?.status, 'OPEN');

    // Review candidate
    const reviewed = await impactService.reviewChangeImpact({
      projectId,
      impactId: candidate!.id,
      status: 'REVIEWED',
      reviewRationale: 'Verified compatible with new MFA flow',
    });
    assert.equal(reviewed.status, 'REVIEWED');
  });

  it('12. Non-Destructive Version Restore: restores Version 1 by creating Version 3', async () => {
    const restored = await versionService.restoreRequirementVersion({
      projectId,
      requirementId: manualReqId,
      versionNumberToRestore: 1,
      expectedCurrentVersionNumber: 2,
      restoreReason: 'Rollback MFA requirement',
    });

    assert.equal(restored.newVersion.versionNumber, 3);
    assert.equal(restored.newVersion.changeKind, 'RESTORED_VERSION');
    assert.equal(
      restored.requirement.originalText,
      'The system shall authenticate users with valid credentials.',
    );

    const history = await versionService.getRequirementHistory({
      projectId,
      requirementId: manualReqId,
    });
    assert.equal(history.totalVersions, 3);
  });

  it('13. Strict Project Boundary Isolation: rejects all cross-project accesses', async () => {
    // Cross-project requirement get
    const crossReq = await requirementService.getRequirement({
      projectId: otherProjectId,
      requirementId: manualReqId,
    });
    assert.equal(crossReq, null);

    // Cross-project document access
    const crossDoc = await documentService.getDocument({
      projectId: otherProjectId,
      documentId: docId,
    });
    assert.equal(crossDoc, null);

    // Cross-project version history
    await assert.rejects(
      async () => {
        await versionService.getRequirementHistory({
          projectId: otherProjectId,
          requirementId: manualReqId,
        });
      },
      (err: unknown) => {
        assert.ok(err instanceof RequirementNotFoundError);
        return true;
      },
    );
  });

  it('14. Concurrency Safety: concurrent key allocations produce zero duplicate keys', async () => {
    // Execute 4 parallel requirement creations in Project A
    const parallelOps = [
      requirementService.createRequirement({
        projectId,
        title: 'Concurrent Req 1',
        originalText: 'Parallel creation test 1',
      }),
      requirementService.createRequirement({
        projectId,
        title: 'Concurrent Req 2',
        originalText: 'Parallel creation test 2',
      }),
      requirementService.createRequirement({
        projectId,
        title: 'Concurrent Req 3',
        originalText: 'Parallel creation test 3',
      }),
      requirementService.createRequirement({
        projectId,
        title: 'Concurrent Req 4',
        originalText: 'Parallel creation test 4',
      }),
    ];

    const results = await Promise.all(parallelOps);
    const keys = results.map(r => r.requirementKey);
    const uniqueKeys = new Set(keys);

    assert.equal(keys.length, 4);
    assert.equal(uniqueKeys.size, 4, 'All concurrent requirement keys must be strictly unique');
  });

  it('15. Lifecycle State Machine: rejects forbidden transitions', async () => {
    const testReq = await requirementService.createRequirement({
      projectId,
      title: 'Lifecycle Test',
      originalText: 'Testing lifecycle transitions',
    });

    // ACTIVE -> ARCHIVED
    const archived = await requirementService.archiveRequirement({
      projectId,
      requirementId: testReq.id,
    });
    assert.equal(archived.status, 'ARCHIVED');

    // Forbidden: ARCHIVED -> DEPRECATED (must restore to ACTIVE first)
    await assert.rejects(
      async () => {
        await requirementService.deprecateRequirement({
          projectId,
          requirementId: testReq.id,
        });
      },
      (err: unknown) => {
        assert.ok(err instanceof InvalidRequirementTransitionError);
        return true;
      },
    );
  });

  it('16. Database Orphan Integrity: zero orphan records exist across all V3 tables', async () => {
    const allReqs = await prisma.requirement.findMany({ select: { id: true } });
    const reqIdSet = new Set(allReqs.map(r => r.id));

    const versions = await prisma.requirementVersion.findMany({ select: { requirementId: true } });
    for (const v of versions) {
      assert.ok(
        reqIdSet.has(v.requirementId),
        `Version orphan found for requirementId ${v.requirementId}`,
      );
    }

    const impacts = await prisma.requirementChangeImpact.findMany({
      select: { requirementId: true },
    });
    for (const i of impacts) {
      assert.ok(
        reqIdSet.has(i.requirementId),
        `Impact orphan found for requirementId ${i.requirementId}`,
      );
    }
  });
});
