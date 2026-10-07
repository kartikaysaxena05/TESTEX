/**
 * @file packages/core/src/retest/retest-types.ts
 * Core domain types, risk policies, and bounds for Requirement Change-Impact & Retest Selection.
 */

import type {
  TestSelectionState,
  ImpactCategory,
  ImpactConfidence,
  RetestImpactGraphDto,
  RetestPlanDto,
} from '@ai-quality/contracts';

export const SELECTION_POLICY_VERSION = '1.0.0';
export const RISK_POLICY_VERSION = '1.0.0';
export const IMPACT_ENGINE_VERSION = '1.0.0';

export const RETEST_BOUNDS = {
  MAX_DIFF_BYTES: 2 * 1024 * 1024, // 2MB max diff
  MAX_CHANGED_FILES: 1000,
  MAX_DEPENDENCY_DEPTH: 5,
  MAX_SELECTED_TESTS: 2000,
  FULL_REGRESSION_FILE_THRESHOLD: 50, // >= 50 changed files triggers full regression check
  FULL_REGRESSION_REQ_RATIO: 0.5, // >= 50% of requirements changed triggers full regression
  FULL_REGRESSION_UNKNOWN_RATIO: 0.75, // >= 75% tests unknown triggers full regression
} as const;

export const SECURITY_CRITICAL_KEYWORDS = [
  'auth',
  'login',
  'session',
  'permission',
  'role',
  'token',
  'password',
  'security',
  'credential',
  'payment',
  'secret',
  'tenant',
  'isolation',
  'account',
  'recovery',
  'admin',
  'crypto',
  'privilege',
] as const;

export const DATABASE_CHANGE_KEYWORDS = [
  'prisma',
  'schema.prisma',
  'migration',
  'database',
  'models',
  'entities',
  'repository',
  'sql',
  'table',
] as const;

export const API_CHANGE_KEYWORDS = [
  'route',
  'controller',
  'api',
  'endpoint',
  'router',
  'handler',
  'trpc',
  'graphql',
] as const;

export interface ChangedSymbolInfo {
  readonly name: string;
  readonly kind: string;
  readonly filePath: string;
  readonly startLine?: number;
  readonly endLine?: number;
}

export interface ChangedApiInfo {
  readonly endpoint: string;
  readonly method?: string;
  readonly filePath?: string;
}

export interface TestSelectionEvaluation {
  readonly testCaseId: string;
  readonly testCaseKey: string;
  readonly testCaseTitle: string;
  readonly testCaseVersionId?: string | null;
  readonly testCaseVersionNumber?: number;
  readonly selectionState: TestSelectionState;
  readonly impactCategory: ImpactCategory;
  readonly confidence: ImpactConfidence;
  readonly selectionReason: string;
  readonly dependencyPath: readonly string[];
  readonly riskSignals: readonly string[];
  readonly evidenceReferences: readonly string[];
  readonly historicalFailureSignal: boolean;
  readonly isExecutable: boolean;
  readonly changedRequirement?: string | null;
  readonly affectedCodeOrApi?: string | null;
}

export interface RetestAuditEntry {
  readonly timestamp: string;
  readonly event: string;
  readonly actor: string;
  readonly details?: Record<string, unknown>;
}

export interface RetestPlanResult {
  readonly plan: RetestPlanDto;
  readonly impactGraph: RetestImpactGraphDto;
  readonly evaluations: readonly TestSelectionEvaluation[];
}
