import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { getPrismaClient } from '../database/client.js';
import { ProjectRepository } from '../projects/project-repository.js';
import { RequirementDocumentService } from './requirement-document-service.js';
import { DocumentStorage } from './document-storage.js';
import { DocumentDuplicateError } from './requirement-errors.js';
import { ProjectArchivedError } from '../projects/project-errors.js';

describe('RequirementDocumentService PostgreSQL Integration Tests', () => {
  let tempDir: string;
  let projectRepo: ProjectRepository;
  let documentService: RequirementDocumentService;
  let documentStorage: DocumentStorage;

  let activeProjectId: string;
  let archivedProjectId: string;
  let secondActiveProjectId: string;

  before(async () => {
    tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'req-doc-integ-test-'));
    documentStorage = new DocumentStorage(tempDir);
    projectRepo = new ProjectRepository();
    documentService = new RequirementDocumentService(projectRepo, undefined, documentStorage);

    const prisma = getPrismaClient();
    if (!prisma) throw new Error('Database client not available.');

    // Create test active project
    const p1 = await prisma.project.create({
      data: {
        name: `ReqDoc Test Active Proj ${Date.now()}`,
        status: 'ACTIVE',
      },
    });
    activeProjectId = p1.id;

    // Create test archived project
    const p2 = await prisma.project.create({
      data: {
        name: `ReqDoc Test Archived Proj ${Date.now()}`,
        status: 'ARCHIVED',
      },
    });
    archivedProjectId = p2.id;

    // Create second active project for isolation tests
    const p3 = await prisma.project.create({
      data: {
        name: `ReqDoc Test Proj 2 ${Date.now()}`,
        status: 'ACTIVE',
      },
    });
    secondActiveProjectId = p3.id;
  });

  after(async () => {
    const prisma = getPrismaClient();
    if (prisma) {
      if (activeProjectId) {
        await prisma.project.delete({ where: { id: activeProjectId } }).catch(() => {});
      }
      if (archivedProjectId) {
        await prisma.project.delete({ where: { id: archivedProjectId } }).catch(() => {});
      }
      if (secondActiveProjectId) {
        await prisma.project.delete({ where: { id: secondActiveProjectId } }).catch(() => {});
      }
    }

    try {
      await fs.promises.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup error
    }
  });

  it('should securely ingest a valid text requirement document and persist metadata', async () => {
    const sourceFilePath = path.join(tempDir, 'SRS_v1.txt');
    const content =
      '1. The system shall process user authentication.\n2. The system shall log security events.';
    await fs.promises.writeFile(sourceFilePath, content, 'utf8');

    const expectedSha256 = crypto.createHash('sha256').update(content).digest('hex');

    const doc = await documentService.ingestDocument({
      projectId: activeProjectId,
      absoluteSourcePath: sourceFilePath,
      sourceName: 'System Requirement Specification v1',
    });

    assert.ok(doc.id);
    assert.equal(doc.projectId, activeProjectId);
    assert.equal(doc.originalFileName, 'SRS_v1.txt');
    assert.equal(doc.fileExtension, 'txt');
    assert.equal(doc.mimeType, 'text/plain');
    assert.equal(doc.fileSize, Buffer.byteLength(content));
    assert.equal(doc.sha256, expectedSha256);

    // Verify parent RequirementSource record
    const prisma = getPrismaClient();
    const source = await prisma?.requirementSource.findUnique({
      where: { id: doc.requirementSourceId },
    });
    assert.ok(source);
    assert.equal(source?.sourceType, 'DOCUMENT');
    assert.equal(source?.name, 'System Requirement Specification v1');

    // Verify ZERO automatic requirements generated (Phase 33 scope boundary)
    const requirementCount = await prisma?.requirement.count({
      where: { requirementSourceId: doc.requirementSourceId },
    });
    assert.equal(requirementCount, 0);

    // Verify managed file exists on disk
    const exists = await documentService.verifyManagedFile(activeProjectId, doc.id);
    assert.equal(exists, true);

    // Verify user original file remains untouched
    assert.ok(fs.existsSync(sourceFilePath));
  });

  it('should reject exact duplicate document (same SHA-256) within the same project', async () => {
    const sourceFilePath = path.join(tempDir, 'SRS_duplicate.txt');
    const content =
      '1. The system shall process user authentication.\n2. The system shall log security events.';
    await fs.promises.writeFile(sourceFilePath, content, 'utf8');

    await assert.rejects(
      async () =>
        await documentService.ingestDocument({
          projectId: activeProjectId,
          absoluteSourcePath: sourceFilePath,
        }),
      (err: unknown) => err instanceof DocumentDuplicateError,
    );
  });

  it('should allow same SHA-256 document in a different project (project-scoped uniqueness)', async () => {
    const sourceFilePath = path.join(tempDir, 'SRS_v1.txt');

    const docProj2 = await documentService.ingestDocument({
      projectId: secondActiveProjectId,
      absoluteSourcePath: sourceFilePath,
    });

    assert.ok(docProj2.id);
    assert.equal(docProj2.projectId, secondActiveProjectId);
  });

  it('should enforce project isolation when listing and getting documents', async () => {
    const listProj1 = await documentService.listDocuments({ projectId: activeProjectId });
    const listProj2 = await documentService.listDocuments({ projectId: secondActiveProjectId });

    assert.equal(listProj1.length, 1);
    assert.equal(listProj2.length, 1);
    assert.notEqual(listProj1[0]!.id, listProj2[0]!.id);

    // Cross-project get should return null
    const crossGet = await documentService.getDocument({
      projectId: secondActiveProjectId,
      documentId: listProj1[0]!.id,
    });
    assert.equal(crossGet, null);
  });

  it('should reject ingestion on an ARCHIVED project', async () => {
    const sourceFilePath = path.join(tempDir, 'archived-doc.md');
    await fs.promises.writeFile(sourceFilePath, '# Archived Specs', 'utf8');

    await assert.rejects(
      async () =>
        await documentService.ingestDocument({
          projectId: archivedProjectId,
          absoluteSourcePath: sourceFilePath,
        }),
      (err: unknown) => err instanceof ProjectArchivedError,
    );
  });

  it('should delete requirement document, database record, and managed file copy without touching original', async () => {
    const sourceFilePath = path.join(tempDir, 'doc-to-delete.md');
    await fs.promises.writeFile(sourceFilePath, '# Temporary Specs to Delete', 'utf8');

    const doc = await documentService.ingestDocument({
      projectId: activeProjectId,
      absoluteSourcePath: sourceFilePath,
    });

    // Delete document
    const deleteResult = await documentService.deleteDocument({
      projectId: activeProjectId,
      documentId: doc.id,
    });
    assert.equal(deleteResult.deleted, true);

    // Verify DB records deleted
    const prisma = getPrismaClient();
    const docAfter = await prisma?.requirementDocument.findUnique({ where: { id: doc.id } });
    assert.equal(docAfter, null);

    const sourceAfter = await prisma?.requirementSource.findUnique({
      where: { id: doc.requirementSourceId },
    });
    assert.equal(sourceAfter, null);

    // Verify managed file removed
    const managedExists = await documentService.verifyManagedFile(activeProjectId, doc.id);
    assert.equal(managedExists, false);

    // Verify user's original file is still untouched on disk
    assert.ok(fs.existsSync(sourceFilePath));
  });
});
