/**
 * @file packages/core/src/quick-fix/rules/quick-fix-rules-engine.ts
 * Deterministic rules engine evaluating 16 safety and eligibility rules for AI Quick-Fix (V7 Phase 99).
 */

import type {
  QuickFixFacts,
  QuickFixRulesEngineResult,
  QuickFixRuleEvaluation,
  QuickFixEligibilityDecision,
  QuickFixRiskLevel,
} from '../quick-fix-types.js';
import { QUICK_FIX_RULES } from './quick-fix-rule-definitions.js';

export class QuickFixRulesEngine {
  /**
   * Deterministically evaluates facts against all 16 quick-fix rules.
   */
  public evaluate(facts: QuickFixFacts): QuickFixRulesEngineResult {
    const evaluations: QuickFixRuleEvaluation[] = [];
    const matchedRules: string[] = [];
    const blockingRules: string[] = [];
    const safetyWarnings: string[] = [];
    const humanReviewReasons: string[] = [];
    const unknownFactors: string[] = [];
    const reasons: string[] = [];

    // Helper to record rule evaluation
    const evaluateRule = (
      ruleId: keyof typeof QUICK_FIX_RULES,
      passed: boolean,
      failReason: string,
      passReason?: string,
      customDecisionImpact?: QuickFixEligibilityDecision,
      customRiskImpact?: QuickFixRiskLevel,
      details?: Record<string, unknown>,
    ) => {
      const def = QUICK_FIX_RULES[ruleId];
      const decisionImpact = passed
        ? undefined
        : (customDecisionImpact ?? def.defaultDecisionImpact);
      const riskImpact = passed ? undefined : (customRiskImpact ?? def.defaultRiskImpact);
      const reason = passed ? (passReason ?? `${def.name} satisfied.`) : failReason;

      evaluations.push({
        ruleId,
        name: def.name,
        passed,
        decisionImpact,
        riskImpact,
        reason,
        details,
      });

      if (passed) {
        matchedRules.push(ruleId);
      } else {
        reasons.push(reason);
        if (decisionImpact === 'BLOCKED') {
          blockingRules.push(ruleId);
          safetyWarnings.push(reason);
        } else if (decisionImpact === 'NEEDS_HUMAN_REVIEW') {
          humanReviewReasons.push(reason);
        } else if (decisionImpact === 'INSUFFICIENT_EVIDENCE') {
          unknownFactors.push(reason);
        }
      }
    };

    // 1. QF_REPRODUCIBLE_REQUIRED_001
    evaluateRule(
      'QF_REPRODUCIBLE_REQUIRED_001',
      facts.isReproduced,
      'Defect has not been reliably reproduced with matching failure evidence.',
      'Defect is reliably reproduced.',
    );

    // 2. QF_APP_FAILURE_REQUIRED_001
    const isAppBug = facts.failureDomain === 'APPLICATION_DEFECT_CANDIDATE';
    evaluateRule(
      'QF_APP_FAILURE_REQUIRED_001',
      isAppBug,
      `Failure domain is "${facts.failureDomain || 'UNKNOWN'}", which is not an APPLICATION_DEFECT_CANDIDATE. Quick-fix only applies to confirmed application bugs.`,
      'Failure classified as application defect candidate.',
    );

    // 3. QF_SECURITY_PATH_BLOCK_001
    evaluateRule(
      'QF_SECURITY_PATH_BLOCK_001',
      !facts.riskFactors.isSecuritySensitive,
      'Candidate fix touches security-sensitive paths, cryptographic modules, secrets, or certificates.',
      'No security-sensitive paths or cryptographic modules touched.',
    );

    // 4. QF_AUTH_PERMISSION_BLOCK_001
    evaluateRule(
      'QF_AUTH_PERMISSION_BLOCK_001',
      !facts.riskFactors.isAuthOrPermission,
      'Candidate fix touches authentication, authorization, session management, RBAC, or access controls.',
      'No authentication or access control logic touched.',
    );

    // 5. QF_FINANCIAL_PAYMENT_BLOCK_001
    evaluateRule(
      'QF_FINANCIAL_PAYMENT_BLOCK_001',
      !facts.riskFactors.isFinancialOrPayment,
      'Candidate fix touches billing, payments, checkout, transactions, or accounting code.',
      'No financial, billing, or payment processing logic touched.',
    );

    // 6. QF_DB_MIGRATION_BLOCK_001
    evaluateRule(
      'QF_DB_MIGRATION_BLOCK_001',
      !facts.riskFactors.isDbMigrationOrSchema,
      'Candidate fix touches database migration scripts, DDL, schema definitions, or ORM models.',
      'No database migrations or schema files touched.',
    );

    // 7. QF_DEPENDENCY_CHANGE_BLOCK_001
    evaluateRule(
      'QF_DEPENDENCY_CHANGE_BLOCK_001',
      !facts.riskFactors.isDependencyChange,
      'Candidate fix modifies dependency manifests or lockfiles requiring human review.',
      'No third-party dependency manifests modified.',
    );

    // 8. QF_PRODUCTION_CONFIG_BLOCK_001
    evaluateRule(
      'QF_PRODUCTION_CONFIG_BLOCK_001',
      !facts.riskFactors.isProductionConfigOrCi,
      'Candidate fix touches production infrastructure, Kubernetes, Terraform, Docker, or CI/CD workflow configurations.',
      'No production configuration or CI/CD pipelines touched.',
    );

    // 9. QF_DATA_DESTRUCTIVE_BLOCK_001
    evaluateRule(
      'QF_DATA_DESTRUCTIVE_BLOCK_001',
      !facts.riskFactors.isDataDestructive,
      'Candidate fix involves destructive or irreversible data removal, drops, or truncation.',
      'No destructive data removal or drop operations detected.',
    );

    // 10. QF_PUBLIC_API_BREAKING_001
    evaluateRule(
      'QF_PUBLIC_API_BREAKING_001',
      !facts.riskFactors.isPublicApiBreaking,
      'Candidate fix touches public API routes, external contracts, or OpenAPI specifications requiring human review.',
      'No public API contract modifications detected.',
    );

    // 11. QF_DIRTY_WORKTREE_BLOCK_001
    const isCleanGit = !facts.riskFactors.isDirtyWorktree && facts.gitState.isClean;
    evaluateRule(
      'QF_DIRTY_WORKTREE_BLOCK_001',
      isCleanGit,
      `Git working tree has uncommitted modifications affecting candidate fix files (${facts.gitState.modifiedFiles.length} modified, ${facts.gitState.untrackedFiles.length} untracked).`,
      'Git working tree is clean.',
    );

    // 12. QF_LARGE_SCOPE_BLOCK_001
    const withinScope =
      !facts.riskFactors.isLargeScope &&
      facts.candidateFiles.length <= 3 &&
      facts.candidateSymbols.length <= 5 &&
      facts.candidateFiles.length > 0;
    evaluateRule(
      'QF_LARGE_SCOPE_BLOCK_001',
      withinScope,
      `Fix scope exceeds quick-fix boundary: ${facts.candidateFiles.length} candidate files (max 3), ${facts.candidateSymbols.length} candidate symbols (max 5).`,
      `Fix scope is within bounds (${facts.candidateFiles.length} files, ${facts.candidateSymbols.length} symbols).`,
    );

    // 13. QF_BLAST_RADIUS_BLOCK_001
    const blastRadiusSafe =
      facts.blastRadius.totalDependentFiles <= 10 &&
      (facts.blastRadius.highRiskDependents?.length ?? 0) === 0;
    evaluateRule(
      'QF_BLAST_RADIUS_BLOCK_001',
      blastRadiusSafe,
      `High blast radius: ${facts.blastRadius.totalDependentFiles} dependent files (max 10), or touches high-risk callers (${facts.blastRadius.highRiskDependents?.join(', ') || 'none'}).`,
      `Blast radius is safe (${facts.blastRadius.totalDependentFiles} dependent files).`,
    );

    // 14. QF_TEST_COVERAGE_REQUIRED_001
    const hasTests = facts.associatedTests.length > 0;
    evaluateRule(
      'QF_TEST_COVERAGE_REQUIRED_001',
      hasTests,
      'No associated test cases or required verification tests found to verify the fix.',
      `${facts.associatedTests.length} verification tests available for fix confirmation.`,
    );

    // 15. QF_ROOT_CAUSE_CONFIDENCE_001
    const hasRootCause =
      facts.rootCauseConfidence >= 0.6 &&
      facts.repositoryReferenceCount > 0 &&
      facts.rootCauseStatus !== 'INCONCLUSIVE' &&
      facts.rootCauseStatus !== 'STALE';
    evaluateRule(
      'QF_ROOT_CAUSE_CONFIDENCE_001',
      hasRootCause,
      `Root-cause confidence (${(facts.rootCauseConfidence * 100).toFixed(0)}%) is below 60%, references are missing, or root cause status is ${facts.rootCauseStatus}.`,
      `Root-cause confidence (${(facts.rootCauseConfidence * 100).toFixed(0)}%) is satisfactory with verified code references.`,
    );

    // 16. QF_SMALL_SCOPE_ELIGIBLE_001
    const allPrecedingPassed = evaluations.slice(0, 15).every(e => e.passed);
    evaluateRule(
      'QF_SMALL_SCOPE_ELIGIBLE_001',
      allPrecedingPassed,
      'One or more eligibility or safety requirements were not met.',
      'Small scope clean defect is fully eligible for AI quick-fix analysis.',
    );

    // Aggregate Decision based on strict safety precedence
    let decision: QuickFixEligibilityDecision;
    let riskLevel: QuickFixRiskLevel;
    let primaryReason: string;

    const failedEvals = evaluations.filter(e => !e.passed);

    if (blockingRules.length > 0) {
      decision = 'BLOCKED';
      riskLevel = 'CRITICAL';
      primaryReason = `Quick-fix blocked by safety policy: ${safetyWarnings[0]}`;
    } else if (
      failedEvals.some(
        e =>
          e.ruleId === 'QF_REPRODUCIBLE_REQUIRED_001' ||
          e.ruleId === 'QF_APP_FAILURE_REQUIRED_001' ||
          e.ruleId === 'QF_LARGE_SCOPE_BLOCK_001',
      )
    ) {
      decision = 'NOT_ELIGIBLE';
      riskLevel = 'HIGH';
      const majorFailure = failedEvals.find(
        e =>
          e.ruleId === 'QF_REPRODUCIBLE_REQUIRED_001' ||
          e.ruleId === 'QF_APP_FAILURE_REQUIRED_001' ||
          e.ruleId === 'QF_LARGE_SCOPE_BLOCK_001',
      );
      primaryReason = majorFailure
        ? majorFailure.reason
        : 'Defect does not meet quick-fix eligibility criteria.';
    } else if (
      failedEvals.some(
        e =>
          e.ruleId === 'QF_TEST_COVERAGE_REQUIRED_001' ||
          e.ruleId === 'QF_ROOT_CAUSE_CONFIDENCE_001',
      )
    ) {
      decision = 'INSUFFICIENT_EVIDENCE';
      riskLevel = 'MEDIUM';
      const gap = failedEvals.find(
        e =>
          e.ruleId === 'QF_TEST_COVERAGE_REQUIRED_001' ||
          e.ruleId === 'QF_ROOT_CAUSE_CONFIDENCE_001',
      );
      primaryReason = gap ? gap.reason : 'Insufficient evidence to certify quick-fix safety.';
    } else if (
      failedEvals.some(
        e =>
          e.ruleId === 'QF_DEPENDENCY_CHANGE_BLOCK_001' ||
          e.ruleId === 'QF_PUBLIC_API_BREAKING_001' ||
          e.ruleId === 'QF_BLAST_RADIUS_BLOCK_001',
      )
    ) {
      decision = 'NEEDS_HUMAN_REVIEW';
      riskLevel = 'HIGH';
      const reviewItem = failedEvals.find(
        e =>
          e.ruleId === 'QF_DEPENDENCY_CHANGE_BLOCK_001' ||
          e.ruleId === 'QF_PUBLIC_API_BREAKING_001' ||
          e.ruleId === 'QF_BLAST_RADIUS_BLOCK_001',
      );
      primaryReason = reviewItem
        ? reviewItem.reason
        : 'Candidate fix requires human engineering review.';
    } else if (allPrecedingPassed) {
      decision = 'ELIGIBLE';
      riskLevel = 'LOW';
      primaryReason =
        'Defect is eligible for quick-fix: confirmed application defect, reproducible, localized to small scope with low blast radius, clean git worktree, and test coverage present.';
    } else {
      decision = 'NOT_ELIGIBLE';
      riskLevel = 'MEDIUM';
      primaryReason =
        failedEvals[0]?.reason ?? 'Defect does not meet quick-fix eligibility criteria.';
    }

    // Determine confidence score (weighted by root cause confidence and rule pass ratio)
    const passedCount = evaluations.filter(e => e.passed).length;
    const rulePassRatio = passedCount / evaluations.length;
    const confidenceScore = Number(
      Math.min(1, Math.max(0, facts.rootCauseConfidence * 0.5 + rulePassRatio * 0.5)).toFixed(2),
    );

    return {
      decision,
      riskLevel,
      confidenceScore,
      primaryReason,
      reasons,
      matchedRules,
      blockingRules,
      safetyWarnings,
      humanReviewReasons,
      unknownFactors,
      evaluations,
    };
  }
}
