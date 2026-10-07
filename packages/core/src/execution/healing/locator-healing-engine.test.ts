/**
 * @file packages/core/src/execution/healing/locator-healing-engine.test.ts
 * Unit tests for LocatorHealingEngine coordination, safety thresholding, and ambiguity guardrails.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { LocatorHealingEngine } from './locator-healing-engine.js';
import type {
  IHealingCandidateDiscovery,
  ElementSemanticSignature,
  HealingExecutionContext,
} from './healing-types.js';

describe('LocatorHealingEngine', () => {
  const mockLocator = {} as any;
  const mockPage = {} as any;
  const mockSession = {} as any;

  function createSignature(
    overrides?: Partial<ElementSemanticSignature>,
  ): ElementSemanticSignature {
    return {
      elementIndex: 0,
      tagName: 'button',
      role: 'button',
      accessibleName: 'Login Button',
      label: null,
      placeholder: null,
      testId: 'login-btn',
      inputType: null,
      href: null,
      formAction: '/login',
      stableAttributes: { name: 'submit' },
      contextText: 'Login Form',
      isVisible: true,
      isEnabled: true,
      selectorRecipe: "page.getByRole('button', { name: 'Login Button' })",
      locator: mockLocator,
      ...overrides,
    };
  }

  function createContext(overrides?: Partial<HealingExecutionContext>): HealingExecutionContext {
    return {
      projectId: '00000000-0000-0000-0000-000000000001',
      testRunId: '00000000-0000-0000-0000-000000000002',
      executionId: '00000000-0000-0000-0000-000000000003',
      stepIndex: 1,
      attempt: 1,
      actionType: 'CLICK',
      originalTarget: {
        kind: 'CONTROL',
        strategy: 'ROLE',
        role: 'button',
        name: 'Log In',
      },
      originalSelector: "page.getByRole('button', { name: 'Log In' })",
      failureReason: 'Element not found',
      session: mockSession,
      page: mockPage,
      ...overrides,
    };
  }

  it('successfully heals when a single candidate exceeds confidence threshold', async () => {
    const mockCandidate = createSignature({ accessibleName: 'Log In Now' });
    const mockDiscovery: IHealingCandidateDiscovery = {
      discoverCandidates: async () => [mockCandidate],
    };

    const engine = new LocatorHealingEngine(undefined, {
      discovery: mockDiscovery,
    });

    const result = await engine.healLocator(createContext());

    assert.equal(result.healingResult, 'HEALED');
    assert.ok(result.selectedLocator);
    assert.ok((result.selectedScore ?? 0) >= 75);
    assert.equal(result.candidateCount, 1);
  });

  it('rejects ambiguous candidates when top 2 candidates score within ambiguity margin', async () => {
    const candidateA = createSignature({
      elementIndex: 1,
      accessibleName: 'Save Changes',
      contextText: 'Save Form Settings',
    });
    const candidateB = createSignature({
      elementIndex: 2,
      accessibleName: 'Save Draft',
      contextText: 'Save Form Settings',
    });

    const mockDiscovery: IHealingCandidateDiscovery = {
      discoverCandidates: async () => [candidateA, candidateB],
    };

    const engine = new LocatorHealingEngine(undefined, {
      discovery: mockDiscovery,
    });

    const context = createContext({
      originalTarget: {
        kind: 'CONTROL',
        strategy: 'ROLE',
        role: 'button',
        name: 'Save',
      },
    });

    const result = await engine.healLocator(context);

    assert.equal(result.healingResult, 'AMBIGUOUS');
    assert.equal(result.selectedLocator, undefined);
    assert.ok(result.reason.includes('Ambiguous candidates detected'));
  });

  it('returns HEAL_FAILED when candidate score is below threshold', async () => {
    const weakCandidate = createSignature({
      tagName: 'div',
      role: 'generic',
      accessibleName: 'Something Unrelated',
      testId: null,
    });

    const mockDiscovery: IHealingCandidateDiscovery = {
      discoverCandidates: async () => [weakCandidate],
    };

    const engine = new LocatorHealingEngine(undefined, {
      discovery: mockDiscovery,
    });

    const result = await engine.healLocator(createContext());

    assert.equal(result.healingResult, 'HEAL_FAILED');
    assert.equal(result.selectedLocator, undefined);
    assert.ok(result.reason.includes('below required threshold'));
  });

  it('enforces higher threshold (90) for destructive actions', async () => {
    const candidate = createSignature({
      accessibleName: 'Delete Item',
    });

    const mockDiscovery: IHealingCandidateDiscovery = {
      discoverCandidates: async () => [candidate],
    };

    const engine = new LocatorHealingEngine(undefined, {
      discovery: mockDiscovery,
      destructiveThreshold: 95,
    });

    const context = createContext({
      isDestructiveAction: true,
      actionType: 'CLICK',
      originalTarget: {
        kind: 'CONTROL',
        strategy: 'ROLE',
        role: 'button',
        name: 'Delete Item Permanently',
      },
    });

    const result = await engine.healLocator(context);

    assert.equal(result.healingResult, 'HEAL_FAILED');
    assert.equal(result.confidenceThreshold, 95);
  });
});
