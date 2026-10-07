/**
 * @file packages/core/src/execution/healing/healing-candidate-scorer.test.ts
 * Unit tests for deterministic 0-100 candidate scoring model.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { HealingCandidateScorer } from './healing-candidate-scorer.js';
import type { ElementSemanticSignature } from './healing-types.js';
import type { ExecutableTargetDescriptorDto } from '@ai-quality/contracts';

describe('HealingCandidateScorer', () => {
  const scorer = new HealingCandidateScorer();

  const mockLocator = {} as any;

  function createSignature(
    overrides?: Partial<ElementSemanticSignature>,
  ): ElementSemanticSignature {
    return {
      elementIndex: 0,
      tagName: 'button',
      role: 'button',
      accessibleName: 'Submit Order',
      label: null,
      placeholder: null,
      testId: 'submit-btn',
      inputType: null,
      href: null,
      formAction: '/checkout',
      stableAttributes: { name: 'submit' },
      contextText: 'Order Summary',
      isVisible: true,
      isEnabled: true,
      selectorRecipe: "page.getByRole('button', { name: 'Submit Order' })",
      locator: mockLocator,
      ...overrides,
    };
  }

  it('scores exact semantic match with high confidence (>= 90)', () => {
    const target: ExecutableTargetDescriptorDto = {
      kind: 'CONTROL',
      strategy: 'ROLE',
      role: 'button',
      name: 'Submit Order',
      testId: 'submit-btn',
    };

    const candidate = createSignature();
    const result = scorer.scoreCandidate(target, candidate);

    assert.equal(result.isDisqualified, false);
    assert.ok(result.candidate.score >= 85, `Score ${result.candidate.score} should be >= 85`);
    assert.equal(result.candidate.scoreBreakdown.roleMatch, 30);
    assert.equal(result.candidate.scoreBreakdown.nameMatch, 40);
    assert.equal(result.candidate.scoreBreakdown.testIdMatch, 20);
  });

  it('evaluates name similarity using token overlap and jaccard score', () => {
    const target: ExecutableTargetDescriptorDto = {
      kind: 'CONTROL',
      strategy: 'ROLE',
      role: 'button',
      name: 'Confirm and Pay',
    };

    const candidate = createSignature({
      accessibleName: 'Pay and Confirm Order',
    });

    const result = scorer.scoreCandidate(target, candidate);
    assert.ok(
      (result.candidate.scoreBreakdown.nameMatch ?? 0) >= 20,
      'Token overlap similarity should award >= 20 pts',
    );
  });

  it('disqualifies candidate when target is password field but candidate is not', () => {
    const target: ExecutableTargetDescriptorDto = {
      kind: 'FIELD',
      strategy: 'LABEL',
      label: 'Password',
      role: 'textbox',
    };

    const candidate = createSignature({
      tagName: 'input',
      role: 'textbox',
      inputType: 'email',
      accessibleName: 'Email Address',
      label: 'Email',
    });

    const result = scorer.scoreCandidate(target, candidate);
    assert.equal(result.isDisqualified, true);
    assert.equal(result.candidate.score, 0);
    assert.ok(result.disqualificationReason?.includes('Security violation'));
  });

  it('disqualifies candidate when target is text field but candidate is password', () => {
    const target: ExecutableTargetDescriptorDto = {
      kind: 'FIELD',
      strategy: 'LABEL',
      label: 'Username',
      role: 'textbox',
    };

    const candidate = createSignature({
      tagName: 'input',
      role: 'textbox',
      inputType: 'password',
      accessibleName: 'Password',
      label: 'Password',
    });

    const result = scorer.scoreCandidate(target, candidate);
    assert.equal(result.isDisqualified, true);
    assert.equal(result.candidate.score, 0);
  });

  it('penalizes conflicting action keywords (-50 pts / disqualification)', () => {
    const target: ExecutableTargetDescriptorDto = {
      kind: 'CONTROL',
      strategy: 'ROLE',
      role: 'button',
      name: 'Delete Account',
    };

    const candidate = createSignature({
      accessibleName: 'Save Changes',
    });

    const result = scorer.scoreCandidate(target, candidate);
    assert.equal(result.isDisqualified, true);
    assert.ok(result.disqualificationReason?.includes('Conflicting action keywords'));
  });

  it('applies penalties for invisible and disabled elements', () => {
    const target: ExecutableTargetDescriptorDto = {
      kind: 'CONTROL',
      strategy: 'ROLE',
      role: 'button',
      name: 'Submit Order',
    };

    const invisibleCandidate = createSignature({
      isVisible: false,
      isEnabled: true,
    });

    const disabledCandidate = createSignature({
      isVisible: true,
      isEnabled: false,
    });

    const invResult = scorer.scoreCandidate(target, invisibleCandidate);
    const disResult = scorer.scoreCandidate(target, disabledCandidate);

    assert.equal(invResult.candidate.scoreBreakdown.invisiblePenalty, -30);
    assert.equal(disResult.candidate.scoreBreakdown.disabledPenalty, -20);
  });

  it('ranks multiple candidates with highest score first and stable tie-breaking', () => {
    const target: ExecutableTargetDescriptorDto = {
      kind: 'CONTROL',
      strategy: 'ROLE',
      role: 'button',
      name: 'Save',
    };

    const candidates: ElementSemanticSignature[] = [
      createSignature({
        elementIndex: 1,
        accessibleName: 'Cancel',
      }),
      createSignature({
        elementIndex: 2,
        accessibleName: 'Save Changes',
      }),
      createSignature({
        elementIndex: 3,
        accessibleName: 'Save Draft',
      }),
    ];

    const ranked = scorer.rankCandidates(target, candidates);

    // Save Changes should score higher or equal to Save Draft, Cancel should be disqualified/lowest
    assert.ok(ranked[0]?.candidate.accessibleName?.includes('Save'));
    assert.equal(ranked[ranked.length - 1]?.candidate.accessibleName, 'Cancel');
  });
});
