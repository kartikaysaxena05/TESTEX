import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { getPrismaClient } from '../database/index.js';
import { TestCaseKeyAllocator } from './test-case-key-allocator.js';

describe('TestCaseKeyAllocator', () => {
  const prisma = getPrismaClient()!;
  let allocator: TestCaseKeyAllocator;
  let testProjectId: string;

  before(async () => {
    allocator = new TestCaseKeyAllocator(prisma);
  });

  beforeEach(async () => {
    // Create a fresh test project
    const proj = await prisma.project.create({
      data: {
        name: `Test Project TC Allocator ${Date.now()}`,
      },
    });
    testProjectId = proj.id;
  });

  after(async () => {
    // Cleanup projects created for allocator tests
    await prisma.project.deleteMany({
      where: {
        name: { contains: 'Test Project TC Allocator' },
      },
    });
  });

  it('allocates TC-001 as the initial key when no test cases exist', async () => {
    const key1 = await allocator.allocateNextKey(testProjectId);
    assert.equal(key1, 'TC-001');

    const key2 = await allocator.allocateNextKey(testProjectId);
    assert.equal(key2, 'TC-002');

    const key3 = await allocator.allocateNextKey(testProjectId);
    assert.equal(key3, 'TC-003');
  });

  it('correctly initializes sequence from existing highest test case key', async () => {
    // Manually insert test cases TC-005 and TC-012 without sequence record
    await prisma.testCase.create({
      data: {
        projectId: testProjectId,
        testCaseKey: 'TC-005',
        title: 'Manual Test Case 5',
        objective: 'Test obj',
      },
    });

    await prisma.testCase.create({
      data: {
        projectId: testProjectId,
        testCaseKey: 'TC-012',
        title: 'Manual Test Case 12',
        objective: 'Test obj',
      },
    });

    const allocatedKey = await allocator.allocateNextKey(testProjectId);
    assert.equal(allocatedKey, 'TC-013');

    const nextKey = await allocator.allocateNextKey(testProjectId);
    assert.equal(nextKey, 'TC-014');
  });
});
