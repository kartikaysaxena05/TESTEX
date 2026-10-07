/**
 * @file packages/core/src/quick-fix/rules/quick-fix-rules-engine.test.ts
 * Comprehensive unit tests for all 16 Quick-Fix rules and decision precedence.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { QuickFixRulesEngine } from './quick-fix-rules-engine.js';
import type { QuickFixFacts } from '../quick-fix-types.js';

function createBaseFacts(overrides: Partial<QuickFixFacts> = {}): QuickFixFacts {
  return {
    failureCaseId: '00000000-0000-0000-0000-000000000001',
    projectId: '00000000-0000-0000-0000-000000000002',
    isReproduced: true,
    failureDomain: 'APPLICATION_DEFECT_CANDIDATE',
    candidateFiles: ['src/components/button.ts'],
    candidateSymbols: [
      {
        symbolName: 'renderButton',
        symbolType: 'FUNCTION',
        filePath: 'src/components/button.ts',
        line: 15,
      },
    ],
    blastRadius: {
      totalDependentFiles: 2,
      totalDependentSymbols: 4,
      affectedModules: ['components'],
      affectedEndpoints: [],
      dependencyGraphDepth: 1,
      highRiskDependents: [],
    },
    gitState: {
      branch: 'main',
      commitSha: 'a1b2c3d',
      isClean: true,
      modifiedFiles: [],
      untrackedFiles: [],
    },
    riskFactors: {
      isSecuritySensitive: false,
      isAuthOrPermission: false,
      isFinancialOrPayment: false,
      isDbMigrationOrSchema: false,
      isDependencyChange: false,
      isProductionConfigOrCi: false,
      isDataDestructive: false,
      isPublicApiBreaking: false,
      isDirtyWorktree: false,
      isLargeScope: false,
    },
    rootCauseConfidence: 0.9,
    rootCauseStatus: 'CONFIRMED',
    repositoryReferenceCount: 2,
    associatedTests: [
      {
        testId: 'test-1',
        testName: 'Button click test',
        testType: 'HISTORICAL',
        isRequired: true,
        reason: 'Original test',
      },
    ],
    ...overrides,
  };
}

describe('QuickFixRulesEngine (16 Rules Determinism)', () => {
  const engine = new QuickFixRulesEngine();

  it('evaluates completely clean small-scope defect as ELIGIBLE', () => {
    const facts = createBaseFacts();
    const result = engine.evaluate(facts);

    assert.equal(result.decision, 'ELIGIBLE');
    assert.equal(result.riskLevel, 'LOW');
    assert.equal(result.blockingRules.length, 0);
    assert.equal(result.matchedRules.length, 16);
    assert.ok(result.matchedRules.includes('QF_SMALL_SCOPE_ELIGIBLE_001'));
  });

  it('Rule 1 (QF_REPRODUCIBLE_REQUIRED_001): rejects when not reproduced', () => {
    const facts = createBaseFacts({ isReproduced: false });
    const result = engine.evaluate(facts);

    assert.equal(result.decision, 'NOT_ELIGIBLE');
    assert.ok(result.reasons.some(r => r.includes('reliably reproduced')));
    assert.ok(!result.matchedRules.includes('QF_REPRODUCIBLE_REQUIRED_001'));
  });

  it('Rule 2 (QF_APP_FAILURE_REQUIRED_001): rejects when failure is automation/environment bug', () => {
    const facts = createBaseFacts({ failureDomain: 'AUTOMATION_FAILURE' });
    const result = engine.evaluate(facts);

    assert.equal(result.decision, 'NOT_ELIGIBLE');
    assert.ok(result.reasons.some(r => r.includes('AUTOMATION_FAILURE')));
  });

  it('Rule 3 (QF_SECURITY_PATH_BLOCK_001): blocks when security-sensitive path touched', () => {
    const facts = createBaseFacts({
      riskFactors: {
        ...createBaseFacts().riskFactors,
        isSecuritySensitive: true,
      },
    });
    const result = engine.evaluate(facts);

    assert.equal(result.decision, 'BLOCKED');
    assert.equal(result.riskLevel, 'CRITICAL');
    assert.ok(result.blockingRules.includes('QF_SECURITY_PATH_BLOCK_001'));
  });

  it('Rule 4 (QF_AUTH_PERMISSION_BLOCK_001): blocks when auth/permission touched', () => {
    const facts = createBaseFacts({
      riskFactors: {
        ...createBaseFacts().riskFactors,
        isAuthOrPermission: true,
      },
    });
    const result = engine.evaluate(facts);

    assert.equal(result.decision, 'BLOCKED');
    assert.equal(result.riskLevel, 'CRITICAL');
    assert.ok(result.blockingRules.includes('QF_AUTH_PERMISSION_BLOCK_001'));
  });

  it('Rule 5 (QF_FINANCIAL_PAYMENT_BLOCK_001): blocks when financial/payment touched', () => {
    const facts = createBaseFacts({
      riskFactors: {
        ...createBaseFacts().riskFactors,
        isFinancialOrPayment: true,
      },
    });
    const result = engine.evaluate(facts);

    assert.equal(result.decision, 'BLOCKED');
    assert.equal(result.riskLevel, 'CRITICAL');
    assert.ok(result.blockingRules.includes('QF_FINANCIAL_PAYMENT_BLOCK_001'));
  });

  it('Rule 6 (QF_DB_MIGRATION_BLOCK_001): blocks when database migration or schema touched', () => {
    const facts = createBaseFacts({
      riskFactors: {
        ...createBaseFacts().riskFactors,
        isDbMigrationOrSchema: true,
      },
    });
    const result = engine.evaluate(facts);

    assert.equal(result.decision, 'BLOCKED');
    assert.equal(result.riskLevel, 'CRITICAL');
    assert.ok(result.blockingRules.includes('QF_DB_MIGRATION_BLOCK_001'));
  });

  it('Rule 7 (QF_DEPENDENCY_CHANGE_BLOCK_001): requires human review for dependency changes', () => {
    const facts = createBaseFacts({
      riskFactors: {
        ...createBaseFacts().riskFactors,
        isDependencyChange: true,
      },
    });
    const result = engine.evaluate(facts);

    assert.equal(result.decision, 'NEEDS_HUMAN_REVIEW');
    assert.equal(result.riskLevel, 'HIGH');
    assert.ok(result.humanReviewReasons.some(r => r.includes('dependency manifests')));
  });

  it('Rule 8 (QF_PRODUCTION_CONFIG_BLOCK_001): blocks on CI/CD and production infrastructure', () => {
    const facts = createBaseFacts({
      riskFactors: {
        ...createBaseFacts().riskFactors,
        isProductionConfigOrCi: true,
      },
    });
    const result = engine.evaluate(facts);

    assert.equal(result.decision, 'BLOCKED');
    assert.equal(result.riskLevel, 'CRITICAL');
    assert.ok(result.blockingRules.includes('QF_PRODUCTION_CONFIG_BLOCK_001'));
  });

  it('Rule 9 (QF_DATA_DESTRUCTIVE_BLOCK_001): blocks on data destructive operations', () => {
    const facts = createBaseFacts({
      riskFactors: {
        ...createBaseFacts().riskFactors,
        isDataDestructive: true,
      },
    });
    const result = engine.evaluate(facts);

    assert.equal(result.decision, 'BLOCKED');
    assert.equal(result.riskLevel, 'CRITICAL');
    assert.ok(result.blockingRules.includes('QF_DATA_DESTRUCTIVE_BLOCK_001'));
  });

  it('Rule 10 (QF_PUBLIC_API_BREAKING_001): requires human review on public API routes', () => {
    const facts = createBaseFacts({
      riskFactors: {
        ...createBaseFacts().riskFactors,
        isPublicApiBreaking: true,
      },
    });
    const result = engine.evaluate(facts);

    assert.equal(result.decision, 'NEEDS_HUMAN_REVIEW');
    assert.equal(result.riskLevel, 'HIGH');
    assert.ok(result.humanReviewReasons.some(r => r.includes('public API routes')));
  });

  it('Rule 11 (QF_DIRTY_WORKTREE_BLOCK_001): blocks on dirty git worktree', () => {
    const facts = createBaseFacts({
      gitState: {
        branch: 'main',
        commitSha: '12345',
        isClean: false,
        modifiedFiles: ['src/components/button.ts'],
        untrackedFiles: [],
      },
      riskFactors: {
        ...createBaseFacts().riskFactors,
        isDirtyWorktree: true,
      },
    });
    const result = engine.evaluate(facts);

    assert.equal(result.decision, 'BLOCKED');
    assert.ok(result.blockingRules.includes('QF_DIRTY_WORKTREE_BLOCK_001'));
  });

  it('Rule 12 (QF_LARGE_SCOPE_BLOCK_001): rejects scope > 3 files or > 5 symbols', () => {
    const facts = createBaseFacts({
      candidateFiles: ['file1.ts', 'file2.ts', 'file3.ts', 'file4.ts'],
      riskFactors: {
        ...createBaseFacts().riskFactors,
        isLargeScope: true,
      },
    });
    const result = engine.evaluate(facts);

    assert.equal(result.decision, 'NOT_ELIGIBLE');
    assert.ok(result.reasons.some(r => r.includes('Fix scope exceeds quick-fix boundary')));
  });

  it('Rule 13 (QF_BLAST_RADIUS_BLOCK_001): flags review when dependent files > 10', () => {
    const facts = createBaseFacts({
      blastRadius: {
        totalDependentFiles: 15,
        totalDependentSymbols: 40,
        affectedModules: ['a', 'b', 'c'],
        dependencyGraphDepth: 2,
        highRiskDependents: [],
      },
    });
    const result = engine.evaluate(facts);

    assert.equal(result.decision, 'NEEDS_HUMAN_REVIEW');
    assert.ok(result.humanReviewReasons.some(r => r.includes('High blast radius')));
  });

  it('Rule 14 (QF_TEST_COVERAGE_REQUIRED_001): returns INSUFFICIENT_EVIDENCE when no tests exist', () => {
    const facts = createBaseFacts({ associatedTests: [] });
    const result = engine.evaluate(facts);

    assert.equal(result.decision, 'INSUFFICIENT_EVIDENCE');
    assert.ok(result.unknownFactors.some(r => r.includes('No associated test cases')));
  });

  it('Rule 15 (QF_ROOT_CAUSE_CONFIDENCE_001): returns INSUFFICIENT_EVIDENCE on low confidence or 0 references', () => {
    const facts = createBaseFacts({ rootCauseConfidence: 0.4, repositoryReferenceCount: 0 });
    const result = engine.evaluate(facts);

    assert.equal(result.decision, 'INSUFFICIENT_EVIDENCE');
    assert.ok(result.unknownFactors.some(r => r.includes('Root-cause confidence')));
  });

  it('Precedence: BLOCKED takes precedence over INSUFFICIENT_EVIDENCE or NEEDS_HUMAN_REVIEW', () => {
    const facts = createBaseFacts({
      associatedTests: [], // triggers INSUFFICIENT_EVIDENCE
      riskFactors: {
        ...createBaseFacts().riskFactors,
        isSecuritySensitive: true, // triggers BLOCKED
        isPublicApiBreaking: true, // triggers NEEDS_HUMAN_REVIEW
      },
    });
    const result = engine.evaluate(facts);

    assert.equal(result.decision, 'BLOCKED');
    assert.equal(result.riskLevel, 'CRITICAL');
  });
});
