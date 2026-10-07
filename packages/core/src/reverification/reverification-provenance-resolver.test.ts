/**
 * @file packages/core/src/reverification/reverification-provenance-resolver.test.ts
 * Unit tests for historical provenance and fix provenance resolution (V7 Phase 97).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ReverificationProvenanceResolver } from './reverification-provenance-resolver.js';
import {
  ReverificationCrossProjectForbiddenError,
  ReverificationHistoricalTestUnavailableError,
  ReverificationNotFoundError,
} from './reverification-errors.js';

describe('ReverificationProvenanceResolver (Phase 97)', () => {
  const projectIdA = '00000000-0000-0000-0000-000000000001';
  const projectIdB = '00000000-0000-0000-0000-000000000002';
  const failureCaseId = '00000000-0000-0000-0000-000000000010';
  const testCaseId = '00000000-0000-0000-0000-000000000020';

  it('throws ReverificationNotFoundError if failure case does not exist', async () => {
    const mockPrisma: any = {
      failureCase: {
        findUnique: async () => null,
      },
    };
    const resolver = new ReverificationProvenanceResolver(mockPrisma);
    await assert.rejects(
      resolver.resolveHistoricalProvenance(projectIdA, failureCaseId),
      ReverificationNotFoundError,
    );
  });

  it('throws ReverificationCrossProjectForbiddenError on cross-project access', async () => {
    const mockPrisma: any = {
      failureCase: {
        findUnique: async () => ({
          id: failureCaseId,
          projectId: projectIdB, // different project!
        }),
      },
    };
    const resolver = new ReverificationProvenanceResolver(mockPrisma);
    await assert.rejects(
      resolver.resolveHistoricalProvenance(projectIdA, failureCaseId),
      ReverificationCrossProjectForbiddenError,
    );
  });

  it('throws ReverificationHistoricalTestUnavailableError if historical version is missing and current version is newer', async () => {
    const mockPrisma: any = {
      failureCase: {
        findUnique: async () => ({
          id: failureCaseId,
          projectId: projectIdA,
          testCaseId,
          testCaseVersionNumber: 2, // Historical version is 2
          testRunId: 'run-1',
          executionId: 'exec-1',
          title: 'Test Login',
          testCase: {
            id: testCaseId,
            projectId: projectIdA,
            currentVersionNumber: 5, // Active version is 5
          },
          structuredBugReports: [],
          jiraIssueLinks: [],
        }),
      },
      testCaseVersion: {
        findFirst: async () => null, // Version 2 not archived in DB
      },
    };
    const resolver = new ReverificationProvenanceResolver(mockPrisma);
    await assert.rejects(
      resolver.resolveHistoricalProvenance(projectIdA, failureCaseId),
      ReverificationHistoricalTestUnavailableError,
    );
  });

  it('resolves exact historical test version and steps when archived record exists', async () => {
    const mockPrisma: any = {
      failureCase: {
        findUnique: async () => ({
          id: failureCaseId,
          projectId: projectIdA,
          testCaseId,
          testCaseVersionNumber: 2,
          testRunId: 'run-1',
          executionId: 'exec-1',
          stepIndex: 2,
          failureSignature: 'SIG-500',
          title: 'Test Login',
          testCase: {
            id: testCaseId,
            projectId: projectIdA,
            currentVersionNumber: 4,
          },
          structuredBugReports: [
            {
              id: 'bug-1',
              isAuthoritative: true,
              requirementId: 'req-1',
              requirementKey: 'REQ-101',
              requirementVersionNumber: 1,
              failedStepIndex: 2,
              failedStepAction: 'CLICK #submit',
              expectedResult: 'Redirected to dashboard',
              actualResult: '500 Error',
            },
          ],
          jiraIssueLinks: [],
        }),
      },
      testCaseVersion: {
        findFirst: async () => ({
          id: 'ver-2',
          projectId: projectIdA,
          testCaseId,
          versionNumber: 2,
          title: 'Historical Login Test v2',
          stepsJson: [
            { stepNumber: 1, action: 'NAVIGATE /login' },
            { stepNumber: 2, action: 'CLICK #submit', expectedResult: 'Dashboard' },
          ],
        }),
      },
    };
    const resolver = new ReverificationProvenanceResolver(mockPrisma);
    const prov = await resolver.resolveHistoricalProvenance(projectIdA, failureCaseId);

    assert.equal(prov.originalTestCaseVersionNumber, 2);
    assert.equal(prov.originalTestCaseVersionId, 'ver-2');
    assert.equal(prov.originalSteps.length, 2);
    assert.equal(prov.requirementKey, 'REQ-101');
    assert.equal(prov.failureSignature, 'SIG-500');
  });

  it('resolves fix provenance truthfully as UNKNOWN when no change reference is supplied', () => {
    const resolver = new ReverificationProvenanceResolver({} as any);
    const fix = resolver.resolveFixProvenance({});

    assert.equal(fix.isKnown, false);
    assert.equal(fix.source, 'UNKNOWN');
    assert.equal(fix.commitSha, null);
    assert.equal(fix.fixReference, null);
  });

  it('resolves fix provenance from git commit and PR references', () => {
    const resolver = new ReverificationProvenanceResolver({} as any);
    const fix = resolver.resolveFixProvenance({
      fixProvenance: {
        commitSha: '1a2b3c4d5e',
        branch: 'fix/bug-123',
        pullRequestUrl: 'https://github.com/org/repo/pull/123',
      },
      triggerType: 'PATCH_APPLIED',
    });

    assert.equal(fix.isKnown, true);
    assert.equal(fix.source, 'GIT_COMMIT');
    assert.equal(fix.commitSha, '1a2b3c4d5e');
    assert.equal(fix.branch, 'fix/bug-123');
    assert.equal(fix.pullRequestUrl, 'https://github.com/org/repo/pull/123');
  });
});
