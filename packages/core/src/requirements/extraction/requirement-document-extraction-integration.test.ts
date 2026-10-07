/**
 * @file packages/core/src/requirements/extraction/requirement-document-extraction-integration.test.ts
 * PostgreSQL integration tests for RequirementDocumentExtractionService.
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
import { RequirementDocumentExtractionRepository } from './requirement-document-extraction-repository.js';
import { RequirementDocumentExtractionService } from './requirement-document-extraction-service.js';
import {
  DocumentIntegrityMismatchError,
  DocumentFileMissingError,
  DocumentNotFoundError,
} from '../requirement-errors.js';
import { ProjectArchivedError } from '../../projects/project-errors.js';

describe('RequirementDocumentExtractionService PostgreSQL Integration Tests', () => {
  let tempDir: string;
  let projectRepo: ProjectRepository;
  let docRepo: RequirementDocumentRepository;
  let extractionRepo: RequirementDocumentExtractionRepository;
  let storage: DocumentStorage;
  let docService: RequirementDocumentService;
  let extractionService: RequirementDocumentExtractionService;
  const createdProjectIds: string[] = [];

  const prisma = getPrismaClient()!;

  before(async () => {
    tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'doc-extract-integ-'));
    projectRepo = new ProjectRepository();
    docRepo = new RequirementDocumentRepository();
    extractionRepo = new RequirementDocumentExtractionRepository();
    storage = new DocumentStorage(tempDir);
    docService = new RequirementDocumentService(projectRepo, docRepo, storage);
    extractionService = new RequirementDocumentExtractionService(
      projectRepo,
      docRepo,
      extractionRepo,
      storage,
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

  it('should extract document, persist extraction in PostgreSQL, and maintain ZERO requirement count invariant', async () => {
    // 1. Create active test project
    const project = await projectRepo.createProject({
      name: `Extraction Integ Project ${Date.now()}`,
      description: 'Project for document extraction testing',
    });
    createdProjectIds.push(project.id);

    // 2. Create markdown document fixture
    const fixturePath = path.join(tempDir, 'SRS_Spec.md');
    const mdContent = [
      '# 1. System Overview',
      'The platform manages QA testing.',
      '',
      '## 1.1 Requirements Module',
      '- Must support document ingestion.',
      '- Must extract structured text.',
      '',
      '| Feature | Scope |',
      '| --- | --- |',
      '| Ingestion | Phase 33 |',
      '| Extraction | Phase 34 |',
    ].join('\n');
    await fs.promises.writeFile(fixturePath, mdContent, 'utf8');

    // 3. Ingest document
    const ingestedDoc = await docService.ingestDocument({
      projectId: project.id,
      absoluteSourcePath: fixturePath,
    });

    // Verify 0 requirements exist before extraction
    const reqsBefore = await prisma.requirement.count({
      where: { projectId: project.id },
    });
    assert.equal(reqsBefore, 0);

    // 4. Run extraction
    const extraction = await extractionService.extractDocument({
      projectId: project.id,
      documentId: ingestedDoc.id,
    });

    // Verify extraction output
    assert.equal(extraction.projectId, project.id);
    assert.equal(extraction.requirementDocumentId, ingestedDoc.id);
    assert.equal(extraction.sourceSha256, ingestedDoc.sha256);
    assert.equal(extraction.extractorVersion, 'document-extractor-v1');
    assert.equal(extraction.format, 'md');
    assert.equal(extraction.status, 'COMPLETED');
    assert.equal(extraction.headingCount, 2);
    assert.equal(extraction.sectionCount, 2);
    assert.equal(extraction.tableCount, 1);
    assert.ok(extraction.blockCount >= 3);

    // CRITICAL INVARIANT: Verify 0 requirement records exist after extraction
    const reqsAfter = await prisma.requirement.count({
      where: { projectId: project.id },
    });
    assert.equal(reqsAfter, 0);

    // 5. Test getExtraction
    const fetched = await extractionService.getExtraction({
      projectId: project.id,
      documentId: ingestedDoc.id,
    });
    assert.ok(fetched);
    assert.equal(fetched.id, extraction.id);
    assert.equal(fetched.headingCount, 2);

    // 6. Test deterministic re-extraction (reuse without force)
    const reExtracted = await extractionService.extractDocument({
      projectId: project.id,
      documentId: ingestedDoc.id,
      force: false,
    });
    assert.equal(reExtracted.id, extraction.id);
  });

  it('should reject extraction with DOCUMENT_INTEGRITY_MISMATCH when managed file is tampered', async () => {
    const project = await projectRepo.createProject({
      name: `Tamper Test Project ${Date.now()}`,
    });
    createdProjectIds.push(project.id);

    const fixturePath = path.join(tempDir, 'tamper_source.txt');
    await fs.promises.writeFile(fixturePath, 'Original un-tampered document text.', 'utf8');

    const ingestedDoc = await docService.ingestDocument({
      projectId: project.id,
      absoluteSourcePath: fixturePath,
    });

    // Tamper with the managed storage copy
    const managedPath = storage.getManagedFilePath(project.id, ingestedDoc.storageKey);
    // Make writable temporarily to tamper
    await fs.promises.chmod(managedPath, 0o666);
    await fs.promises.writeFile(managedPath, 'MALICIOUS MODIFIED BYTES');
    await fs.promises.chmod(managedPath, 0o444);

    await assert.rejects(
      async () =>
        await extractionService.extractDocument({
          projectId: project.id,
          documentId: ingestedDoc.id,
          force: true,
        }),
      (err: unknown) =>
        err instanceof DocumentIntegrityMismatchError && err.code === 'DOCUMENT_INTEGRITY_MISMATCH',
    );
  });

  it('should reject extraction with DOCUMENT_FILE_MISSING when managed file is deleted from disk', async () => {
    const project = await projectRepo.createProject({
      name: `Missing File Project ${Date.now()}`,
    });
    createdProjectIds.push(project.id);

    const fixturePath = path.join(tempDir, 'to_be_missing.txt');
    await fs.promises.writeFile(fixturePath, 'Will be missing on disk.', 'utf8');

    const ingestedDoc = await docService.ingestDocument({
      projectId: project.id,
      absoluteSourcePath: fixturePath,
    });

    // Delete the managed file
    const managedPath = storage.getManagedFilePath(project.id, ingestedDoc.storageKey);
    await fs.promises.chmod(managedPath, 0o666);
    await fs.promises.unlink(managedPath);

    await assert.rejects(
      async () =>
        await extractionService.extractDocument({
          projectId: project.id,
          documentId: ingestedDoc.id,
          force: true,
        }),
      (err: unknown) =>
        err instanceof DocumentFileMissingError && err.code === 'DOCUMENT_FILE_MISSING',
    );
  });

  it('should enforce project isolation and reject cross-project extraction', async () => {
    const projectA = await projectRepo.createProject({ name: 'Project A' });
    const projectB = await projectRepo.createProject({ name: 'Project B' });
    createdProjectIds.push(projectA.id, projectB.id);

    const fixturePath = path.join(tempDir, 'project_a.txt');
    await fs.promises.writeFile(fixturePath, 'Project A text content.', 'utf8');

    const docA = await docService.ingestDocument({
      projectId: projectA.id,
      absoluteSourcePath: fixturePath,
    });

    // Project B attempts to extract Document A
    await assert.rejects(
      async () =>
        await extractionService.extractDocument({
          projectId: projectB.id,
          documentId: docA.id,
        }),
      (err: unknown) => err instanceof DocumentNotFoundError && err.code === 'DOCUMENT_NOT_FOUND',
    );
  });

  it('should reject extraction on an ARCHIVED project', async () => {
    const project = await projectRepo.createProject({ name: 'Project to Archive' });
    createdProjectIds.push(project.id);

    const fixturePath = path.join(tempDir, 'archived_test.txt');
    await fs.promises.writeFile(fixturePath, 'Archived test text.', 'utf8');

    const doc = await docService.ingestDocument({
      projectId: project.id,
      absoluteSourcePath: fixturePath,
    });

    await projectRepo.updateStatus(project.id, 'ARCHIVED');

    await assert.rejects(
      async () =>
        await extractionService.extractDocument({
          projectId: project.id,
          documentId: doc.id,
        }),
      (err: unknown) => err instanceof ProjectArchivedError && err.code === 'PROJECT_ARCHIVED',
    );
  });
});
