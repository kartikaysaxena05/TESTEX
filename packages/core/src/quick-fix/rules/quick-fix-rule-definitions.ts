/**
 * @file packages/core/src/quick-fix/rules/quick-fix-rule-definitions.ts
 * Stable rule definitions for AI Quick-Fix Eligibility & Safety Analysis (V7 Phase 99).
 */

import type {
  QuickFixRuleId,
  QuickFixEligibilityDecision,
  QuickFixRiskLevel,
} from '../quick-fix-types.js';

export interface QuickFixRuleDefinition {
  readonly id: QuickFixRuleId;
  readonly name: string;
  readonly description: string;
  readonly defaultDecisionImpact: QuickFixEligibilityDecision;
  readonly defaultRiskImpact: QuickFixRiskLevel;
}

export const QUICK_FIX_RULES: Record<QuickFixRuleId, QuickFixRuleDefinition> = {
  QF_REPRODUCIBLE_REQUIRED_001: {
    id: 'QF_REPRODUCIBLE_REQUIRED_001',
    name: 'Defect Must Be Reproduced',
    description:
      'A defect cannot be eligible for quick-fix unless it has been reliably reproduced with matching failure evidence.',
    defaultDecisionImpact: 'NOT_ELIGIBLE',
    defaultRiskImpact: 'HIGH',
  },
  QF_APP_FAILURE_REQUIRED_001: {
    id: 'QF_APP_FAILURE_REQUIRED_001',
    name: 'Application Defect Candidate Required',
    description:
      'Failure domain separation must classify the failure as an APPLICATION_DEFECT_CANDIDATE. Non-application failures (automation, test data, environment) are ineligible.',
    defaultDecisionImpact: 'NOT_ELIGIBLE',
    defaultRiskImpact: 'HIGH',
  },
  QF_SECURITY_PATH_BLOCK_001: {
    id: 'QF_SECURITY_PATH_BLOCK_001',
    name: 'Security Sensitive Path Block',
    description:
      'Fix touches security-sensitive paths, cryptographic modules, secrets, or certificates.',
    defaultDecisionImpact: 'BLOCKED',
    defaultRiskImpact: 'CRITICAL',
  },
  QF_AUTH_PERMISSION_BLOCK_001: {
    id: 'QF_AUTH_PERMISSION_BLOCK_001',
    name: 'Authentication and Permissions Block',
    description:
      'Fix touches authentication, authorization, session management, RBAC, or access controls.',
    defaultDecisionImpact: 'BLOCKED',
    defaultRiskImpact: 'CRITICAL',
  },
  QF_FINANCIAL_PAYMENT_BLOCK_001: {
    id: 'QF_FINANCIAL_PAYMENT_BLOCK_001',
    name: 'Financial and Payment Subsystem Block',
    description: 'Fix touches billing, payments, checkout, transactions, or accounting code.',
    defaultDecisionImpact: 'BLOCKED',
    defaultRiskImpact: 'CRITICAL',
  },
  QF_DB_MIGRATION_BLOCK_001: {
    id: 'QF_DB_MIGRATION_BLOCK_001',
    name: 'Database Migration and Schema Block',
    description: 'Fix touches database migration scripts, DDL, schema definitions, or ORM models.',
    defaultDecisionImpact: 'BLOCKED',
    defaultRiskImpact: 'CRITICAL',
  },
  QF_DEPENDENCY_CHANGE_BLOCK_001: {
    id: 'QF_DEPENDENCY_CHANGE_BLOCK_001',
    name: 'Dependency Manifest Modification Block',
    description:
      'Fix modifies package.json, lockfiles, or third-party dependency declarations requiring human review.',
    defaultDecisionImpact: 'NEEDS_HUMAN_REVIEW',
    defaultRiskImpact: 'HIGH',
  },
  QF_PRODUCTION_CONFIG_BLOCK_001: {
    id: 'QF_PRODUCTION_CONFIG_BLOCK_001',
    name: 'Production Config and CI/CD Block',
    description:
      'Fix touches production infrastructure, Kubernetes, Terraform, Docker, or CI/CD workflow configurations.',
    defaultDecisionImpact: 'BLOCKED',
    defaultRiskImpact: 'CRITICAL',
  },
  QF_DATA_DESTRUCTIVE_BLOCK_001: {
    id: 'QF_DATA_DESTRUCTIVE_BLOCK_001',
    name: 'Data Destructive Operation Block',
    description:
      'Fix or defect involves data deletion, cascade drops, truncation, purge, or irreversible destructive modifications.',
    defaultDecisionImpact: 'BLOCKED',
    defaultRiskImpact: 'CRITICAL',
  },
  QF_PUBLIC_API_BREAKING_001: {
    id: 'QF_PUBLIC_API_BREAKING_001',
    name: 'Public API Contract Breaking Review',
    description:
      'Fix touches public API routes, external contracts, or OpenAPI specifications requiring human review.',
    defaultDecisionImpact: 'NEEDS_HUMAN_REVIEW',
    defaultRiskImpact: 'HIGH',
  },
  QF_DIRTY_WORKTREE_BLOCK_001: {
    id: 'QF_DIRTY_WORKTREE_BLOCK_001',
    name: 'Dirty Git Worktree Block',
    description:
      'Git working tree has uncommitted changes in candidate fix files or is in an unclean state.',
    defaultDecisionImpact: 'BLOCKED',
    defaultRiskImpact: 'HIGH',
  },
  QF_LARGE_SCOPE_BLOCK_001: {
    id: 'QF_LARGE_SCOPE_BLOCK_001',
    name: 'Large Scope Ineligibility',
    description:
      'Fix scope exceeds quick-fix boundary (> 3 candidate files or > 5 candidate symbols) requiring human review.',
    defaultDecisionImpact: 'NOT_ELIGIBLE',
    defaultRiskImpact: 'HIGH',
  },
  QF_BLAST_RADIUS_BLOCK_001: {
    id: 'QF_BLAST_RADIUS_BLOCK_001',
    name: 'High Blast Radius Review',
    description:
      'Candidate files have high blast radius (> 10 dependent files or high-risk callers) requiring human review.',
    defaultDecisionImpact: 'NEEDS_HUMAN_REVIEW',
    defaultRiskImpact: 'HIGH',
  },
  QF_TEST_COVERAGE_REQUIRED_001: {
    id: 'QF_TEST_COVERAGE_REQUIRED_001',
    name: 'Test Coverage Required',
    description:
      'Candidate fix requires verifiable regression test coverage; missing associated test cases.',
    defaultDecisionImpact: 'INSUFFICIENT_EVIDENCE',
    defaultRiskImpact: 'MEDIUM',
  },
  QF_ROOT_CAUSE_CONFIDENCE_001: {
    id: 'QF_ROOT_CAUSE_CONFIDENCE_001',
    name: 'Root Cause Confidence Minimum',
    description:
      'Root cause analysis must have confidence >= 0.6 and at least one repository code reference.',
    defaultDecisionImpact: 'INSUFFICIENT_EVIDENCE',
    defaultRiskImpact: 'MEDIUM',
  },
  QF_SMALL_SCOPE_ELIGIBLE_001: {
    id: 'QF_SMALL_SCOPE_ELIGIBLE_001',
    name: 'Small Scope Clean Defect Eligible',
    description:
      'Defect is a confirmed application bug, cleanly reproducible, localized to small scope (<= 3 files, <= 5 symbols), with low blast radius and clean git worktree.',
    defaultDecisionImpact: 'ELIGIBLE',
    defaultRiskImpact: 'LOW',
  },
};
