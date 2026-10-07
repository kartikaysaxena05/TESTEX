/**
 * @file packages/core/src/patch/validation/targeted-regression-selector.test.ts
 * Unit and requirement-correlation tests for TargetedRegressionSelector (V7 Phase 103).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { PrismaClient } from '@prisma/client';
import { TargetedRegressionSelector } from './targeted-regression-selector.js';

describe('TargetedRegressionSelector', () => {
  const projectId = '11111111-1111-1111-1111-111111111111';
  const targetTestCaseId = 'target-tc-001';
  const reqId1 = 'req-auth-01';

  it('ranks sibling test cases sharing requirements with target defect highest', async () => {
    const mockPrisma = {
      requirementTestTrace: {
        findMany: async (args: any) => {
          if (args.where.testCaseId === targetTestCaseId) {
            return [{ requirementId: reqId1 }];
          }
          if (args.where.requirementId?.in) {
            return [{ testCaseId: 'sibling-tc-002', requirementId: reqId1 }];
          }
          return [];
        },
      },
      testCase: {
        findMany: async () => {
          return [
            {
              id: 'sibling-tc-002',
              testCaseKey: 'TC-002',
              title: 'Sibling requirement test',
              priority: 'HIGH',
              type: 'POSITIVE',
              description: 'Checks related requirement',
              createdAt: new Date(),
            },
            {
              id: 'unrelated-tc-003',
              testCaseKey: 'TC-003',
              title: 'Unrelated feature test',
              priority: 'LOW',
              type: 'POSITIVE',
              description: 'Other area',
              createdAt: new Date(),
            },
          ];
        },
      },
    } as unknown as PrismaClient;

    const selector = new TargetedRegressionSelector(mockPrisma);
    const result = await selector.selectRegressionTests({
      projectId,
      targetTestCaseId,
      targetFiles: ['src/auth/login.ts'],
    });

    assert.equal(result.targetTestCaseId, targetTestCaseId);
    assert.equal(result.regressionTestCases.length, 2);
    const firstCase = result.regressionTestCases[0];
    assert.ok(firstCase);
    assert.equal(firstCase.testCaseId, 'sibling-tc-002');
    assert.equal(firstCase.score >= 60, true);
    assert.ok(firstCase.matchReason.includes('Shares requirement with defect'));
  });

  it('ranks tests referencing target files higher', async () => {
    const mockPrisma = {
      requirementTestTrace: {
        findMany: async () => [],
      },
      testCase: {
        findMany: async () => {
          return [
            {
              id: 'file-matching-tc',
              testCaseKey: 'TC-AUTH-10',
              title: 'Login module test for login.ts',
              priority: 'MEDIUM',
              type: 'POSITIVE',
              description: 'Validates auth flow',
              createdAt: new Date(),
            },
            {
              id: 'generic-tc',
              testCaseKey: 'TC-GEN-01',
              title: 'General settings test',
              priority: 'MEDIUM',
              type: 'POSITIVE',
              description: 'Profile updates',
              createdAt: new Date(),
            },
          ];
        },
      },
    } as unknown as PrismaClient;

    const selector = new TargetedRegressionSelector(mockPrisma);
    const result = await selector.selectRegressionTests({
      projectId,
      targetTestCaseId,
      targetFiles: ['src/auth/login.ts'],
    });

    const matchedCase = result.regressionTestCases[0];
    assert.ok(matchedCase);
    assert.equal(matchedCase.testCaseId, 'file-matching-tc');
    assert.ok(matchedCase.matchReason.includes("References affected file 'login.ts'"));
  });

  it('strictly bounds selected regression tests to maximum limit', async () => {
    const testCases = Array.from({ length: 25 }, (_, i) => ({
      id: `tc-${i}`,
      testCaseKey: `TC-${String(i).padStart(3, '0')}`,
      title: `Generated test ${i}`,
      priority: 'MEDIUM',
      type: 'POSITIVE',
      description: null,
      createdAt: new Date(),
    }));

    const mockPrisma = {
      requirementTestTrace: {
        findMany: async () => [],
      },
      testCase: {
        findMany: async () => testCases,
      },
    } as unknown as PrismaClient;

    const selector = new TargetedRegressionSelector(mockPrisma);
    const result = await selector.selectRegressionTests({
      projectId,
      targetTestCaseId,
      limit: 5,
    });

    assert.equal(result.regressionTestCases.length, 5);
  });
});
