import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { getPrismaClient } from '../database/index.js';
import { TestCaseService } from './test-case-service.js';
import {
  TestCaseProjectMismatchError,
  TestCaseValidationError,
  TestCaseNotFoundError,
} from './test-case-errors.js';

describe('TestCase Security & Isolation', () => {
  const prisma = getPrismaClient()!;
  let service: TestCaseService;
  let projectAlpha: string;
  let projectBeta: string;

  before(async () => {
    service = new TestCaseService(prisma);

    const projA = await prisma.project.create({
      data: { name: `Security Alpha ${Date.now()}` },
    });
    projectAlpha = projA.id;

    const projB = await prisma.project.create({
      data: { name: `Security Beta ${Date.now()}` },
    });
    projectBeta = projB.id;
  });

  after(async () => {
    await prisma.project.deleteMany({
      where: { id: { in: [projectAlpha, projectBeta] } },
    });
  });

  it('safely stores and retrieves text with special characters and HTML strings', async () => {
    const maliciousPayload = '<script>alert("xss")</script> & <img src=x onerror=alert(1)>';

    const created = await service.createTestCase({
      projectId: projectAlpha,
      title: maliciousPayload,
      objective: maliciousPayload,
      steps: [{ action: maliciousPayload }],
    });

    assert.equal(created.title, maliciousPayload);
    assert.equal(created.objective, maliciousPayload);
    assert.equal(created.steps[0]?.action, maliciousPayload);
  });

  it('rejects creation for non-existent project', async () => {
    const fakeProjectId = '00000000-0000-0000-0000-000000000000';

    await assert.rejects(
      () =>
        service.createTestCase({
          projectId: fakeProjectId,
          title: 'Test',
          objective: 'Test',
          steps: [{ action: 'Step' }],
        }),
      (err: unknown) => err instanceof TestCaseValidationError,
    );
  });

  it('prevents cross-tenant deletion', async () => {
    const createdInAlpha = await service.createTestCase({
      projectId: projectAlpha,
      title: 'Alpha Case',
      objective: 'Alpha Objective',
      steps: [{ action: 'Alpha Step' }],
    });

    // Attempting to delete from Project Beta must be rejected
    await assert.rejects(
      () =>
        service.deleteTestCase({
          projectId: projectBeta,
          testCaseId: createdInAlpha.id,
        }),
      (err: unknown) => err instanceof TestCaseProjectMismatchError,
    );

    // Verify it still exists in Alpha
    const fetched = await service.getTestCaseById({
      projectId: projectAlpha,
      testCaseId: createdInAlpha.id,
    });
    assert.ok(fetched);
  });

  it('throws TestCaseNotFoundError when deleting non-existent test case', async () => {
    const fakeCaseId = '11111111-1111-1111-1111-111111111111';

    await assert.rejects(
      () =>
        service.deleteTestCase({
          projectId: projectAlpha,
          testCaseId: fakeCaseId,
        }),
      (err: unknown) => err instanceof TestCaseNotFoundError,
    );
  });
});
