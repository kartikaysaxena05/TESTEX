/**
 * @file packages/core/src/post-fix/post-fix-comment-builder.test.ts
 * Tests for Post-Fix Comment Builder formatting, secret redaction, and outcome templates.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PostFixCommentBuilder } from './post-fix-comment-builder.js';
import type { AuthoritativeVerificationFacts } from './post-fix-types.js';
import { SecretRedactor } from '../execution/sessions/secret-redactor.js';

describe('PostFixCommentBuilder', () => {
  const baseFacts: AuthoritativeVerificationFacts = {
    outcome: 'VERIFIED_FIXED',
    testCaseId: '00000000-0000-0000-0000-000000000001',
    testCaseKey: 'TC-AUTH-001',
    testCaseTitle: 'User Login with 2FA Authentication',
    testCaseVersionNumber: 2,
    requirementId: '00000000-0000-0000-0000-000000000002',
    requirementKey: 'REQ-SEC-01',
    targetEnvironmentName: 'Staging Environment',
    originalExecutionId: '00000000-0000-0000-0000-000000000003',
    verificationExecutionId: '00000000-0000-0000-0000-000000000004',
    verificationTestRunId: '00000000-0000-0000-0000-000000000005',
    verificationAttemptNumber: 1,
    isSignatureMatch: true,
    completedAt: new Date('2026-09-12T10:00:00Z'),
    evidenceReferences: [
      { type: 'SCREENSHOT', name: 'login_success.png', uri: 'file:///storage/screenshots/1.png' },
      { type: 'HAR_LOG', name: 'network.har' },
    ],
  };

  it('builds a structured comment for VERIFIED_FIXED outcome', () => {
    const comment = PostFixCommentBuilder.buildComment({
      facts: baseFacts,
      actor: 'qa-engineer@enterprise.com',
      customNote: 'Regression pass 100% clean.',
    });

    assert.ok(comment.includes('h2. Automated Fix Verification'));
    assert.ok(comment.includes('*Result:* *VERIFIED_FIXED*'));
    assert.ok(comment.includes('TC-AUTH-001'));
    assert.ok(comment.includes('User Login with 2FA Authentication'));
    assert.ok(comment.includes('Staging Environment'));
    assert.ok(comment.includes('login_success.png'));
    assert.ok(comment.includes('network.har'));
    assert.ok(comment.includes('Regression pass 100% clean.'));
    assert.ok(comment.includes('qa-engineer@enterprise.com'));
    assert.ok(comment.includes('Defect successfully verified as fixed'));
  });

  it('builds a structured comment for STILL_FAILING outcome', () => {
    const facts: AuthoritativeVerificationFacts = {
      ...baseFacts,
      outcome: 'STILL_FAILING',
      verificationAttemptNumber: 2,
    };

    const comment = PostFixCommentBuilder.buildComment({
      facts,
      actor: 'test-runner',
    });

    assert.ok(comment.includes('*Result:* *STILL_FAILING*'));
    assert.ok(comment.includes('MATCHES original failure'));
    assert.ok(comment.includes('#2'));
  });

  it('builds a structured comment for REGRESSION_DETECTED with details', () => {
    const facts: AuthoritativeVerificationFacts = {
      ...baseFacts,
      outcome: 'REGRESSION_DETECTED',
      regressionDetails: {
        regressionCount: 2,
        regressedTestKeys: ['TC-PAY-002', 'TC-INV-005'],
      },
    };

    const comment = PostFixCommentBuilder.buildComment({
      facts,
      actor: 'ci-bot',
    });

    assert.ok(comment.includes('*Result:* *REGRESSION_DETECTED*'));
    assert.ok(comment.includes('New Regressions Count:* 2'));
    assert.ok(comment.includes('TC-PAY-002'));
    assert.ok(comment.includes('TC-INV-005'));
  });

  it('builds a structured comment for BLOCKED outcome with blocker reason', () => {
    const facts: AuthoritativeVerificationFacts = {
      ...baseFacts,
      outcome: 'BLOCKED',
      blockerReason: 'Database connection pool exhausted during rerun attempt',
    };

    const comment = PostFixCommentBuilder.buildComment({ facts });

    assert.ok(comment.includes('*Result:* *BLOCKED*'));
    assert.ok(comment.includes('Database connection pool exhausted during rerun attempt'));
  });

  it('builds a structured comment for INCONCLUSIVE, ROLLED_BACK, and CANCELLED', () => {
    for (const outcome of ['INCONCLUSIVE', 'ROLLED_BACK', 'CANCELLED'] as const) {
      const comment = PostFixCommentBuilder.buildComment({
        facts: { ...baseFacts, outcome },
      });
      assert.ok(comment.includes(`*Result:* *${outcome}*`));
    }
  });

  it('redacts registered secrets from custom notes and comment body', () => {
    const superSecretPassword = 'super-secret-api-token-xyz999';
    SecretRedactor.registerSecret(superSecretPassword);

    const comment = PostFixCommentBuilder.buildComment({
      facts: baseFacts,
      customNote: `Tested using key ${superSecretPassword} in session`,
    });

    assert.ok(!comment.includes(superSecretPassword));
    assert.ok(comment.includes('***'));
  });
});
