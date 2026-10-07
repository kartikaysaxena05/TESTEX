/**
 * @file packages/core/src/quick-fix/rules/safety-policy-checker.ts
 * Evaluates sensitive paths, DB migrations, financial, auth, configs, and destructive risks.
 */

import type { QuickFixCandidateSymbol, QuickFixRiskFactors } from '../quick-fix-types.js';

export interface SafetyCheckResult {
  readonly riskFactors: QuickFixRiskFactors;
  readonly triggeredRuleIds: readonly string[];
  readonly violations: readonly string[];
}

export class SafetyPolicyChecker {
  // Regex patterns for prohibited / high-risk file paths
  private static readonly SECURITY_PATH_REGEX =
    /(?:^|\/)(?:security|crypto|secrets|passwords|tokens|keys|certs|etc|proc|sys|var|usr|bin|sbin|dev)\/|\.env|\.pem$|\.key$|id_rsa|\.\./i;
  private static readonly SECURITY_SYMBOL_REGEX =
    /(?:secret|privatekey|encrypt|decrypt|hashpassword|signingkey)/i;

  private static readonly AUTH_PATH_REGEX =
    /(?:^|\/)(?:auth|oauth|permissions|rbac|session|sessions|jwt|access-control|roles)\//i;
  private static readonly AUTH_SYMBOL_REGEX =
    /(?:authenticate|authorize|verifytoken|requirerole|checkpermission|sessiontoken)/i;

  private static readonly FINANCIAL_PATH_REGEX =
    /(?:^|\/)(?:billing|payment|payments|stripe|checkout|invoice|pricing|refund|wallet|subscription)\//i;
  private static readonly FINANCIAL_SYMBOL_REGEX =
    /(?:payment|charge|refund|stripe|creditcard|invoice|billing|processpayout)/i;

  private static readonly DB_MIGRATION_PATH_REGEX =
    /(?:^|\/)(?:migrations|prisma\/migrations|db\/migrate)\/|schema\.prisma$|\.sql$/i;
  private static readonly DB_MIGRATION_SYMBOL_REGEX =
    /(?:migration|altertable|droptable|createschema)/i;

  private static readonly DEPENDENCY_PATH_REGEX =
    /(?:^|\/)(?:package\.json|package-lock\.json|yarn\.lock|pnpm-lock\.yaml|requirements\.txt|Pipfile|poetry\.lock|go\.mod|go\.sum|pom\.xml|build\.gradle)$/i;

  private static readonly PRODUCTION_CONFIG_PATH_REGEX =
    /(?:^|\/)(?:\.github\/workflows\/|docker-compose.*\.ya?ml|Dockerfile.*|k8s\/|kubernetes\/|terraform\/|helm\/|nginx\.conf|deploy\/)/i;

  private static readonly DESTRUCTIVE_KEYWORD_REGEX =
    /\b(?:drop\s+database|drop\s+table|truncate\s+table|cascade\s+delete|permanent(?:ly)?\s+delete|purge\s+data|wipe\s+data|destroy\s+all)\b/i;

  private static readonly PUBLIC_API_PATH_REGEX =
    /(?:^|\/)(?:routes|api|controllers|endpoints)\/|openapi\.(?:json|ya?ml)|swagger\.(?:json|ya?ml)/i;

  /**
   * Evaluates safety policies against candidate files, candidate symbols, and root cause information.
   */
  public evaluateSafetyPolicies(
    candidateFiles: readonly string[],
    candidateSymbols: readonly QuickFixCandidateSymbol[],
    probableCause: string = '',
    isDirtyWorktree: boolean = false,
  ): SafetyCheckResult {
    const triggeredRuleIds: string[] = [];
    const violations: string[] = [];

    // Normalize candidate file paths with forward slashes
    const normalizedFiles = candidateFiles.map(f => f.replace(/\\/g, '/'));

    // 1. Security check
    const isSecurityPath = normalizedFiles.some(f =>
      SafetyPolicyChecker.SECURITY_PATH_REGEX.test(f),
    );
    const isSecuritySymbol = candidateSymbols.some(s =>
      SafetyPolicyChecker.SECURITY_SYMBOL_REGEX.test(s.symbolName),
    );
    const isSecuritySensitive = isSecurityPath || isSecuritySymbol;
    if (isSecuritySensitive) {
      triggeredRuleIds.push('QF_SECURITY_PATH_BLOCK_001');
      violations.push('Touches security-sensitive path, cryptographic logic, or credentials.');
    }

    // 2. Auth & Permission check
    const isAuthPath = normalizedFiles.some(f => SafetyPolicyChecker.AUTH_PATH_REGEX.test(f));
    const isAuthSymbol = candidateSymbols.some(s =>
      SafetyPolicyChecker.AUTH_SYMBOL_REGEX.test(s.symbolName),
    );
    const isAuthOrPermission = isAuthPath || isAuthSymbol;
    if (isAuthOrPermission) {
      triggeredRuleIds.push('QF_AUTH_PERMISSION_BLOCK_001');
      violations.push('Touches authentication, authorization, session, or RBAC controls.');
    }

    // 3. Financial & Payment check
    const isFinancialPath = normalizedFiles.some(f =>
      SafetyPolicyChecker.FINANCIAL_PATH_REGEX.test(f),
    );
    const isFinancialSymbol = candidateSymbols.some(s =>
      SafetyPolicyChecker.FINANCIAL_SYMBOL_REGEX.test(s.symbolName),
    );
    const isFinancialOrPayment = isFinancialPath || isFinancialSymbol;
    if (isFinancialOrPayment) {
      triggeredRuleIds.push('QF_FINANCIAL_PAYMENT_BLOCK_001');
      violations.push('Touches billing, financial transaction, or payment processing logic.');
    }

    // 4. DB Migration & Schema check
    const isDbPath = normalizedFiles.some(f => SafetyPolicyChecker.DB_MIGRATION_PATH_REGEX.test(f));
    const isDbSymbol = candidateSymbols.some(s =>
      SafetyPolicyChecker.DB_MIGRATION_SYMBOL_REGEX.test(s.symbolName),
    );
    const isDbMigrationOrSchema = isDbPath || isDbSymbol;
    if (isDbMigrationOrSchema) {
      triggeredRuleIds.push('QF_DB_MIGRATION_BLOCK_001');
      violations.push('Touches database migration scripts, DDL, or schema definitions.');
    }

    // 5. Dependency Manifest check
    const isDependencyChange = normalizedFiles.some(f =>
      SafetyPolicyChecker.DEPENDENCY_PATH_REGEX.test(f),
    );
    if (isDependencyChange) {
      triggeredRuleIds.push('QF_DEPENDENCY_CHANGE_BLOCK_001');
      violations.push('Touches third-party dependency manifests or lockfiles.');
    }

    // 6. Production Config & CI/CD check
    const isProductionConfigOrCi = normalizedFiles.some(f =>
      SafetyPolicyChecker.PRODUCTION_CONFIG_PATH_REGEX.test(f),
    );
    if (isProductionConfigOrCi) {
      triggeredRuleIds.push('QF_PRODUCTION_CONFIG_BLOCK_001');
      violations.push(
        'Touches production infrastructure, CI/CD workflows, or deployment manifests.',
      );
    }

    // 7. Data Destructive check
    const isDataDestructive =
      SafetyPolicyChecker.DESTRUCTIVE_KEYWORD_REGEX.test(probableCause) ||
      candidateSymbols.some(s => SafetyPolicyChecker.DESTRUCTIVE_KEYWORD_REGEX.test(s.symbolName));
    if (isDataDestructive) {
      triggeredRuleIds.push('QF_DATA_DESTRUCTIVE_BLOCK_001');
      violations.push('Involves irreversible or destructive data removal / drop operations.');
    }

    // 8. Public API Breaking check
    const isPublicApiBreaking = normalizedFiles.some(f =>
      SafetyPolicyChecker.PUBLIC_API_PATH_REGEX.test(f),
    );
    if (isPublicApiBreaking) {
      triggeredRuleIds.push('QF_PUBLIC_API_BREAKING_001');
      violations.push('Touches public API endpoints or controller definitions.');
    }

    // 9. Large Scope check
    const isLargeScope = candidateFiles.length > 3 || candidateSymbols.length > 5;
    if (isLargeScope) {
      triggeredRuleIds.push('QF_LARGE_SCOPE_BLOCK_001');
      violations.push(
        `Scope exceeds quick-fix limit (${candidateFiles.length} files > 3, or ${candidateSymbols.length} symbols > 5).`,
      );
    }

    // 10. Dirty Worktree check
    if (isDirtyWorktree) {
      triggeredRuleIds.push('QF_DIRTY_WORKTREE_BLOCK_001');
      violations.push('Candidate files or repository worktree contains uncommitted modifications.');
    }

    const riskFactors: QuickFixRiskFactors = {
      isSecuritySensitive,
      isAuthOrPermission,
      isFinancialOrPayment,
      isDbMigrationOrSchema,
      isDependencyChange,
      isProductionConfigOrCi,
      isDataDestructive,
      isPublicApiBreaking,
      isDirtyWorktree,
      isLargeScope,
      details: {
        totalCandidateFiles: candidateFiles.length,
        totalCandidateSymbols: candidateSymbols.length,
        violationsCount: violations.length,
      },
    };

    return {
      riskFactors,
      triggeredRuleIds,
      violations,
    };
  }
}
