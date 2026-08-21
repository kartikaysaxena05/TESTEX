/**
 * @file packages/core/src/requirements/evidence/requirement-repository-evidence-integration.test.ts
 * Integration tests for RequirementRepositoryEvidenceService with PostgreSQL and Prisma.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { getPrismaClient } from '../../database/client.js';
import { ProjectService } from '../../projects/project-service.js';
import { RequirementService } from '../requirement-service.js';
import { RequirementRepositoryEvidenceService } from './requirement-repository-evidence-service.js';
import { SourceService } from '../../sources/source-service.js';

describe('RequirementRepositoryEvidenceService Integration Tests', () => {
  const prisma = getPrismaClient()!;
  const projectService = new ProjectService();
  const sourceService = new SourceService();
  const requirementService = new RequirementService();
  const evidenceService = new RequirementRepositoryEvidenceService();

  let tempDir: string;
  let projectId: string;
  let otherProjectId: string;
  let sourceId: string;
  let requirementId: string;
  let indexedFileId: string;
  let symbolId: string;

  before(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'evidence-integration-test-'));
    fs.mkdirSync(path.join(tempDir, 'src', 'auth'), { recursive: true });

    // Create a real sample source file
    const sampleCode = `
export class UserAuthenticationService {
  async authenticate(email: string, password: string): Promise<boolean> {
    return email === 'admin@example.com' && password === 'secret';
  }
}
`;
    fs.writeFileSync(path.join(tempDir, 'src', 'auth', 'auth.service.ts'), sampleCode, 'utf8');

    const projectA = await projectService.createProject({
      name: 'Evidence Integration Project A',
      description: 'Testing repository evidence mapping',
    });
    projectId = projectA.id;

    const projectB = await projectService.createProject({
      name: 'Evidence Integration Project B',
      description: 'Testing project isolation',
    });
    otherProjectId = projectB.id;

    // Attach local source
    const src = await sourceService.attachLocalDirectory(projectId, tempDir);
    sourceId = src.id;

    // Create indexed file & symbol records
    const fileRecord = await prisma.repositoryFile.create({
      data: {
        sourceId,
        relativePath: 'src/auth/auth.service.ts',
        name: 'auth.service.ts',
        extension: '.ts',
        language: 'TypeScript',
        classification: 'SERVICE',
        sizeBytes: sampleCode.length,
        contentHash: 'hash-auth-service',
        indexStatus: 'INDEXED',
      },
    });
    indexedFileId = fileRecord.id;

    const symRecord = await prisma.repositorySymbol.create({
      data: {
        repositoryFileId: indexedFileId,
        name: 'UserAuthenticationService',
        kind: 'CLASS',
        startLine: 2,
        endLine: 6,
        isExported: true,
      },
    });
    symbolId = symRecord.id;

    // Create requirement
    const req = await requirementService.createRequirement({
      projectId,
      title: 'User Authentication Service',
      originalText:
        'The UserAuthenticationService shall authenticate users with email and password.',
      requirementKey: 'REQ-201',
    });
    requirementId = req.id;
  });

  after(async () => {
    if (projectId) {
      await prisma.project.deleteMany({ where: { id: projectId } });
    }
    if (otherProjectId) {
      await prisma.project.deleteMany({ where: { id: otherProjectId } });
    }
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('matches repository evidence candidates deterministically', async () => {
    const result = await evidenceService.matchRepositoryEvidence({
      projectId,
      requirementId,
    });

    assert.strictEqual(result.isIndexed, true);
    assert.ok(result.matchedCount >= 1);
    assert.ok(result.candidateEvidence.length >= 1);

    const match = result.candidateEvidence.find(c => c.symbolName === 'UserAuthenticationService');
    assert.ok(match);
    assert.strictEqual(match?.status, 'CANDIDATE');
    assert.strictEqual(match?.filePath, 'src/auth/auth.service.ts');
    assert.ok(match!.evidenceScore >= 5);
  });

  it('reviews candidate evidence to CONFIRMED and REJECTED status', async () => {
    const list = await evidenceService.getRepositoryEvidence({
      projectId,
      requirementId,
    });
    const item = list[0]!;

    const confirmed = await evidenceService.reviewRepositoryEvidence({
      projectId,
      evidenceId: item.id,
      status: 'CONFIRMED',
      reviewRationale: 'Verified code location corresponds to requirement',
    });

    assert.strictEqual(confirmed.status, 'CONFIRMED');
    assert.strictEqual(
      confirmed.reviewRationale,
      'Verified code location corresponds to requirement',
    );

    const rejected = await evidenceService.reviewRepositoryEvidence({
      projectId,
      evidenceId: item.id,
      status: 'REJECTED',
    });

    assert.strictEqual(rejected.status, 'REJECTED');
  });

  it('creates manual repository evidence with confirmed status', async () => {
    const manual = await evidenceService.createManualRepositoryEvidence({
      projectId,
      requirementId,
      projectSourceId: sourceId,
      indexedFileId,
      symbolId,
      evidenceType: 'SERVICE',
      reviewRationale: 'Manually verified architectural link',
    });

    assert.strictEqual(manual.status, 'CONFIRMED');
    assert.strictEqual(manual.matchMethod, 'MANUAL');
    assert.strictEqual(manual.evidenceScore, 10);
    assert.strictEqual(manual.filePath, 'src/auth/auth.service.ts');
  });

  it('rejects unauthorized or cross-project evidence linkage', async () => {
    await assert.rejects(
      async () => {
        await evidenceService.createManualRepositoryEvidence({
          projectId: otherProjectId,
          requirementId,
          projectSourceId: sourceId,
          indexedFileId,
          symbolId,
          evidenceType: 'SERVICE',
        });
      },
      { name: 'RequirementNotFoundError' },
    );
  });

  it('securely generates bounded source code preview for evidence', async () => {
    const list = await evidenceService.getRepositoryEvidence({
      projectId,
      requirementId,
    });
    const item = list[0]!;

    const preview = await evidenceService.previewRepositoryEvidence({
      projectId,
      evidenceId: item.id,
    });

    assert.strictEqual(preview.filePath, 'src/auth/auth.service.ts');
    assert.ok(preview.content.includes('UserAuthenticationService'));
    assert.ok(preview.totalLines >= 5);
  });

  it('deletes repository evidence record cleanly', async () => {
    const list = await evidenceService.getRepositoryEvidence({
      projectId,
      requirementId,
    });
    const item = list[0]!;

    const deleteRes = await evidenceService.deleteRepositoryEvidence({
      projectId,
      evidenceId: item.id,
    });

    assert.strictEqual(deleteRes.deleted, true);

    const check = await prisma.requirementRepositoryEvidence.findUnique({
      where: { id: item.id },
    });
    assert.strictEqual(check, null);
  });
});
