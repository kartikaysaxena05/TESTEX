/**
 * @file packages/core/src/quick-fix/quick-fix-contract.test.ts
 * Tests for contracts, Zod schemas, and DTO validation (V7 Phase 99).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  quickFixEligibilityDecisionSchema,
  quickFixRiskLevelSchema,
  quickFixCandidateSymbolDtoSchema,
  quickFixRiskFactorsDtoSchema,
  quickFixBlastRadiusDtoSchema,
  quickFixRequiredTestDtoSchema,
  quickFixGitStateDtoSchema,
  quickFixEligibilityAssessmentDtoSchema,
  evaluateQuickFixEligibilityInputSchema,
  getQuickFixAssessmentInputSchema,
  listQuickFixAssessmentsInputSchema,
  DESKTOP_CHANNELS,
} from '@ai-quality/contracts';

describe('AI Quick-Fix Contracts & Schemas (Phase 99)', () => {
  it('validates all QuickFixEligibilityDecision enum values', () => {
    const validDecisions = [
      'ELIGIBLE',
      'NOT_ELIGIBLE',
      'NEEDS_HUMAN_REVIEW',
      'INSUFFICIENT_EVIDENCE',
      'BLOCKED',
    ];
    for (const d of validDecisions) {
      assert.equal(quickFixEligibilityDecisionSchema.parse(d), d);
    }
    assert.throws(() => quickFixEligibilityDecisionSchema.parse('INVALID_DECISION'));
  });

  it('validates all QuickFixRiskLevel enum values', () => {
    const validLevels = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
    for (const l of validLevels) {
      assert.equal(quickFixRiskLevelSchema.parse(l), l);
    }
    assert.throws(() => quickFixRiskLevelSchema.parse('EXTREME'));
  });

  it('validates QuickFixCandidateSymbolDto schema', () => {
    const validSymbol = {
      symbolName: 'calculateTotal',
      symbolType: 'FUNCTION',
      filePath: 'src/utils/math.ts',
      line: 42,
      column: 10,
    };
    const parsed = quickFixCandidateSymbolDtoSchema.parse(validSymbol);
    assert.equal(parsed.symbolName, 'calculateTotal');
    assert.equal(parsed.line, 42);

    assert.throws(() =>
      quickFixCandidateSymbolDtoSchema.parse({
        symbolName: 123,
      }),
    );
  });

  it('validates QuickFixRiskFactorsDto schema', () => {
    const validFactors = {
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
      details: { checksPassed: 10 },
    };
    const parsed = quickFixRiskFactorsDtoSchema.parse(validFactors);
    assert.equal(parsed.isSecuritySensitive, false);
    assert.equal(parsed.details?.checksPassed, 10);
  });

  it('validates QuickFixBlastRadiusDto schema', () => {
    const validBlast = {
      totalDependentFiles: 3,
      totalDependentSymbols: 12,
      affectedModules: ['components', 'utils'],
      affectedEndpoints: ['/api/v1/checkout'],
      dependencyGraphDepth: 1,
      highRiskDependents: [],
    };
    const parsed = quickFixBlastRadiusDtoSchema.parse(validBlast);
    assert.equal(parsed.totalDependentFiles, 3);
    assert.equal(parsed.affectedModules.length, 2);
  });

  it('validates QuickFixRequiredTestDto schema', () => {
    const validTest = {
      testId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
      testName: 'User login test',
      testType: 'HISTORICAL',
      isRequired: true,
      reason: 'Original failing test case',
    };
    const parsed = quickFixRequiredTestDtoSchema.parse(validTest);
    assert.equal(parsed.isRequired, true);
    assert.equal(parsed.testType, 'HISTORICAL');
  });

  it('validates QuickFixGitStateDto schema', () => {
    const validGit = {
      branch: 'main',
      commitSha: 'abcdef1234567890',
      isClean: true,
      modifiedFiles: [],
      untrackedFiles: [],
    };
    const parsed = quickFixGitStateDtoSchema.parse(validGit);
    assert.equal(parsed.isClean, true);
    assert.equal(parsed.branch, 'main');
  });

  it('validates full QuickFixEligibilityAssessmentDto schema', () => {
    const validAssessment = {
      id: '11111111-1111-1111-1111-111111111111',
      failureCaseId: '22222222-2222-2222-2222-222222222222',
      projectId: '33333333-3333-3333-3333-333333333333',
      sourceId: '44444444-4444-4444-4444-444444444444',
      rootCauseAnalysisId: '55555555-5555-5555-5555-555555555555',
      decision: 'ELIGIBLE' as const,
      riskLevel: 'LOW' as const,
      confidenceScore: 0.95,
      summary: 'Small scope clean defect is eligible.',
      reasons: ['Defect is verified and localized.'],
      matchedRules: ['QF_SMALL_SCOPE_ELIGIBLE_001'],
      blockingRules: [],
      candidateFiles: ['src/utils/format.ts'],
      candidateSymbols: [
        {
          symbolName: 'formatDate',
          symbolType: 'FUNCTION',
          filePath: 'src/utils/format.ts',
        },
      ],
      blastRadius: {
        totalDependentFiles: 1,
        totalDependentSymbols: 2,
        affectedModules: ['utils'],
      },
      requiredTests: [
        {
          testName: 'Date formatting test',
          testType: 'HISTORICAL',
          isRequired: true,
          reason: 'Verify fix',
        },
      ],
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
      gitState: {
        branch: 'main',
        commitSha: 'sha123',
        isClean: true,
        modifiedFiles: [],
        untrackedFiles: [],
      },
      gitBranch: 'main',
      gitCommitSha: 'sha123',
      gitClean: true,
      isSuperseded: false,
      evaluatedBy: 'SYSTEM',
      evaluatedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const parsed = quickFixEligibilityAssessmentDtoSchema.parse(validAssessment);
    assert.equal(parsed.decision, 'ELIGIBLE');
    assert.equal(parsed.riskLevel, 'LOW');
    assert.equal(parsed.confidenceScore, 0.95);
  });

  it('validates evaluateQuickFixEligibilityInputSchema', () => {
    const valid = {
      projectId: '11111111-1111-1111-1111-111111111111',
      failureCaseId: '22222222-2222-2222-2222-222222222222',
      actor: 'USER',
    };
    const parsed = evaluateQuickFixEligibilityInputSchema.parse(valid);
    assert.equal(parsed.actor, 'USER');

    // Default actor
    const withDefaults = evaluateQuickFixEligibilityInputSchema.parse({
      projectId: '11111111-1111-1111-1111-111111111111',
      failureCaseId: '22222222-2222-2222-2222-222222222222',
    });
    assert.equal(withDefaults.actor, 'SYSTEM');

    // Invalid UUID
    assert.throws(() =>
      evaluateQuickFixEligibilityInputSchema.parse({
        projectId: 'not-a-uuid',
        failureCaseId: '22222222-2222-2222-2222-222222222222',
      }),
    );
  });

  it('verifies DESKTOP_CHANNELS constants for Phase 99', () => {
    assert.equal(
      DESKTOP_CHANNELS.QUICK_FIX_EVALUATE_ELIGIBILITY,
      'desktop:quick-fix:evaluate-eligibility',
    );
    assert.equal(DESKTOP_CHANNELS.QUICK_FIX_GET_ASSESSMENT, 'desktop:quick-fix:get-assessment');
    assert.equal(DESKTOP_CHANNELS.QUICK_FIX_LIST_ASSESSMENTS, 'desktop:quick-fix:list-assessments');
  });
});
