/**
 * @file packages/core/src/failures/reproduction/historical-test-resolver.test.ts
 * Unit tests for HistoricalTestResolver (V6 Phase 76).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { HistoricalTestResolver } from './historical-test-resolver.js';
import { HistoricalTestVersionUnavailableError } from './failure-reproduction-errors.js';

describe('HistoricalTestResolver (Phase 76)', () => {
  it('resolves historical test version from TestCaseVersion table', async () => {
    const mockPrisma = {
      testCaseVersion: {
        findFirst: async (args: any) => {
          if (args.where.testCaseId === 'tc-1' && args.where.versionNumber === 2) {
            return {
              id: 'tcv-2',
              versionNumber: 2,
              title: 'Checkout Flow v2',
              testCaseId: 'tc-1',
              requirementId: 'req-1',
              requirementVersionNumber: 1,
              steps: [
                { id: 's1', stepNumber: 1, action: 'navigate to "/cart"' },
                { id: 's2', stepNumber: 2, action: 'click "Checkout"' },
              ],
            };
          }
          return null;
        },
      },
      testCase: {
        findUnique: async () => null,
      },
    };

    const resolver = new HistoricalTestResolver(mockPrisma as any);
    const resolved = await resolver.resolveHistoricalTestVersion('tc-1', 2);

    assert.equal(resolved.testCaseId, 'tc-1');
    assert.equal(resolved.testCaseVersionId, 'tcv-2');
    assert.equal(resolved.testCaseVersionNumber, 2);
    assert.equal(resolved.title, 'Checkout Flow v2');
    assert.equal(resolved.isExecutable, true);
    assert.equal(resolved.steps.length, 2);
    assert.equal(resolved.steps[0]?.action, 'navigate to "/cart"');
  });

  it('falls back to TestCase table if version number matches current active version', async () => {
    const mockPrisma = {
      testCaseVersion: {
        findFirst: async () => null,
      },
      testCase: {
        findUnique: async (args: any) => {
          if (args.where.id === 'tc-fallback') {
            return {
              id: 'tc-fallback',
              title: 'Search Flow Current',
              versionNumber: 1,
              requirementId: 'req-2',
              steps: [
                { id: 's-fb-1', stepNumber: 1, action: 'navigate to "/search"' },
                { id: 's-fb-2', stepNumber: 2, action: 'type "widget"' },
              ],
            };
          }
          return null;
        },
      },
    };

    const resolver = new HistoricalTestResolver(mockPrisma as any);
    const resolved = await resolver.resolveHistoricalTestVersion('tc-fallback', 1);

    assert.equal(resolved.testCaseId, 'tc-fallback');
    assert.equal(resolved.testCaseVersionNumber, 1);
    assert.equal(resolved.title, 'Search Flow Current');
    assert.equal(resolved.isExecutable, true);
    assert.equal(resolved.steps.length, 2);
  });

  it('throws HistoricalTestVersionUnavailableError when version does not exist', async () => {
    const mockPrisma = {
      testCaseVersion: {
        findFirst: async () => null,
      },
      testCase: {
        findUnique: async () => null,
      },
    };

    const resolver = new HistoricalTestResolver(mockPrisma as any);

    await assert.rejects(
      async () => resolver.resolveHistoricalTestVersion('tc-missing', 99),
      (err: any) => {
        assert.ok(err instanceof HistoricalTestVersionUnavailableError);
        assert.equal(err.code, 'HISTORICAL_TEST_VERSION_UNAVAILABLE');
        assert.equal(err.testCaseId, 'tc-missing');
        assert.equal(err.versionNumber, 99);
        return true;
      },
    );
  });

  it('marks test as not executable when steps list is empty', async () => {
    const mockPrisma = {
      testCaseVersion: {
        findFirst: async () => ({
          id: 'tcv-empty',
          versionNumber: 3,
          title: 'Empty Test',
          testCaseId: 'tc-empty',
          steps: [],
        }),
      },
    };

    const resolver = new HistoricalTestResolver(mockPrisma as any);
    const resolved = await resolver.resolveHistoricalTestVersion('tc-empty', 3);

    assert.equal(resolved.isExecutable, false);
    assert.ok(resolved.blockerReason?.includes('contains no executable steps'));
  });
});
