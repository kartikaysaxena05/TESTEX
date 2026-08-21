import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { getPrismaClient } from '../database/index.js';
import { TestCaseService } from './test-case-service.js';

describe('TestCase Concurrency & Atomicity', () => {
  const prisma = getPrismaClient()!;
  let service: TestCaseService;
  let testProjectId: string;

  before(async () => {
    service = new TestCaseService(prisma);
    const proj = await prisma.project.create({
      data: {
        name: `TC Concurrency Project ${Date.now()}`,
      },
    });
    testProjectId = proj.id;
  });

  after(async () => {
    await prisma.project.deleteMany({
      where: { id: testProjectId },
    });
  });

  it('allocates strictly unique keys under high concurrent load', async () => {
    const CONCURRENCY = 15;
    const promises = Array.from({ length: CONCURRENCY }, (_, i) =>
      service.createTestCase({
        projectId: testProjectId,
        title: `Concurrent Test Case ${i + 1}`,
        objective: `Verify concurrent sequence incrementation #${i + 1}`,
        steps: [{ action: `Step for case ${i + 1}` }],
      }),
    );

    const results = await Promise.all(promises);
    assert.equal(results.length, CONCURRENCY);

    // Extract all allocated keys
    const keys = results.map(r => r.testCaseKey);
    const uniqueKeys = new Set(keys);

    // Check that all keys are unique (no duplicates)
    assert.equal(
      uniqueKeys.size,
      CONCURRENCY,
      `Expected ${CONCURRENCY} unique keys, got duplicate: ${Array.from(keys)}`,
    );

    // Verify all keys match TC-001..TC-015
    for (let i = 1; i <= CONCURRENCY; i++) {
      const expectedKey = `TC-${String(i).padStart(3, '0')}`;
      assert.ok(uniqueKeys.has(expectedKey), `Expected key set to contain ${expectedKey}`);
    }
  });
});
