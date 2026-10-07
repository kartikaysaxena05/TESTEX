/**
 * @file packages/core/src/post-fix/post-fix-provider-contract.test.ts
 * Wire contract simulation tests for Jira API and Email notification formatting (Phase 107).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PostFixCommentBuilder } from './post-fix-comment-builder.js';
import { PostFixNotificationFormatter } from './post-fix-notification-formatter.js';
import type { AuthoritativeVerificationFacts } from './post-fix-types.js';

describe('Post-Fix Provider Wire Contracts', () => {
  const sampleFacts: AuthoritativeVerificationFacts = {
    outcome: 'VERIFIED_FIXED',
    testCaseId: '00000000-0000-0000-0000-000000000001',
    testCaseKey: 'TC-PAY-100',
    testCaseTitle: 'Process credit card payment checkout',
    testCaseVersionNumber: 3,
    requirementId: '00000000-0000-0000-0000-000000000002',
    requirementKey: 'REQ-PAY-01',
    targetEnvironmentName: 'Production Sandbox',
    originalExecutionId: '00000000-0000-0000-0000-000000000003',
    verificationExecutionId: '00000000-0000-0000-0000-000000000004',
    verificationTestRunId: '00000000-0000-0000-0000-000000000005',
    verificationAttemptNumber: 1,
    isSignatureMatch: false,
    completedAt: new Date('2026-09-12T12:00:00Z'),
    evidenceReferences: [
      { type: 'SCREENSHOT', name: 'payment_success.png', uri: 'file:///ev/payment_success.png' },
    ],
  };

  it('generates Jira ADF/markdown compliant comment structure', () => {
    const comment = PostFixCommentBuilder.buildComment({
      facts: sampleFacts,
      actor: 'qa-engineer@enterprise.org',
      customNote: 'All payment gateway checks confirmed passing.',
    });

    // Validates critical section markers
    assert.ok(comment.includes('h2. Automated Fix Verification'));
    assert.ok(comment.includes('*Result:* *VERIFIED_FIXED*'));
    assert.ok(comment.includes('TC-PAY-100'));
    assert.ok(comment.includes('Process credit card payment checkout'));
    assert.ok(comment.includes('Production Sandbox'));
    assert.ok(comment.includes('h3. Evidence & Artifacts'));
    assert.ok(comment.includes('payment_success.png'));
    assert.ok(comment.includes('h3. Engineering Note'));
    assert.ok(comment.includes('All payment gateway checks confirmed passing.'));
    assert.ok(comment.includes('AI-Driven Software Quality Engineering Platform'));
  });

  it('generates email notification with outcome-specific headers and body', () => {
    const formattedFixed = PostFixNotificationFormatter.format({
      facts: sampleFacts,
      bugKey: 'TC-PAY-100',
      projectName: 'Payment Gateway Platform',
    });

    assert.ok(formattedFixed.subject.includes('[VERIFIED_FIXED]'));
    assert.ok(formattedFixed.subject.includes('TC-PAY-100'));
    assert.ok(formattedFixed.htmlBody.includes('Automated fix verification succeeded'));
    assert.ok(formattedFixed.htmlBody.includes('Payment Gateway Platform'));
    assert.ok(formattedFixed.textBody.includes('TC-PAY-100'));

    const formattedRegression = PostFixNotificationFormatter.format({
      facts: {
        ...sampleFacts,
        outcome: 'REGRESSION_DETECTED',
        regressionDetails: {
          regressionCount: 1,
          regressedTestKeys: ['TC-PAY-102'],
        },
      },
      bugKey: 'TC-PAY-100',
      projectName: 'Payment Gateway Platform',
    });

    assert.ok(formattedRegression.subject.includes('[REGRESSION_DETECTED]'));
    assert.ok(formattedRegression.htmlBody.includes('regression tests detected new failures'));
    assert.ok(formattedRegression.textBody.includes('TC-PAY-100'));
  });
});
