/**
 * @file packages/core/src/quick-fix/quick-fix-adversarial.test.ts
 * Adversarial safety, path traversal, injection, and 0-modification verification tests (V7 Phase 99).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { SafetyPolicyChecker } from './rules/safety-policy-checker.js';
import { QuickFixRulesEngine } from './rules/quick-fix-rules-engine.js';
import type { QuickFixFacts } from './quick-fix-types.js';

describe('AI Quick-Fix Adversarial & Boundary Tests (Phase 99)', () => {
  const safetyChecker = new SafetyPolicyChecker();
  const rulesEngine = new QuickFixRulesEngine();

  it('detects and blocks path traversal attempts to sensitive locations', () => {
    const maliciousPaths = [
      '../../secrets/api_keys.json',
      'src/components/../../../etc/passwd',
      'src/utils/../../auth/token.ts',
      'foo/bar/../crypto/signing.key',
      '.env.production',
      'config/id_rsa',
    ];

    for (const path of maliciousPaths) {
      const result = safetyChecker.evaluateSafetyPolicies([path], []);
      assert.ok(
        result.riskFactors.isSecuritySensitive ||
          result.riskFactors.isAuthOrPermission ||
          result.triggeredRuleIds.length > 0,
        `Path traversal attempt was not caught: ${path}`,
      );
    }
  });

  it('detects deceptive destructive payloads hidden in probable cause text', () => {
    const destructiveInputs = [
      'Fix requires to drop database production;',
      'Potential cause is cascade delete on customer accounts',
      'Recommended fix: truncate table audit_logs to clear space',
      'Wipe data on reset',
      'Permanently delete user records',
    ];

    for (const cause of destructiveInputs) {
      const result = safetyChecker.evaluateSafetyPolicies(['src/safe.ts'], [], cause);
      assert.equal(result.riskFactors.isDataDestructive, true);
      assert.ok(result.triggeredRuleIds.includes('QF_DATA_DESTRUCTIVE_BLOCK_001'));
    }
  });

  it('detects and blocks financial keywords hidden in candidate symbols', () => {
    const financialSymbols = [
      { symbolName: 'processStripePayment', symbolType: 'FUNCTION', filePath: 'src/app.ts' },
      { symbolName: 'refundCreditCardCharge', symbolType: 'FUNCTION', filePath: 'src/app.ts' },
      {
        symbolName: 'updateInvoiceBillingSchedule',
        symbolType: 'FUNCTION',
        filePath: 'src/app.ts',
      },
    ];

    for (const symbol of financialSymbols) {
      const result = safetyChecker.evaluateSafetyPolicies(['src/app.ts'], [symbol]);
      assert.equal(result.riskFactors.isFinancialOrPayment, true);
      assert.ok(result.triggeredRuleIds.includes('QF_FINANCIAL_PAYMENT_BLOCK_001'));
    }
  });

  it('detects and blocks database migration and schema tampering attempts', () => {
    const dbPaths = [
      'prisma/migrations/20260911_patch/migration.sql',
      'db/migrate/001_create_users.rb',
      'schema.prisma',
      'database/ddl/init.sql',
    ];

    for (const path of dbPaths) {
      const result = safetyChecker.evaluateSafetyPolicies([path], []);
      assert.equal(result.riskFactors.isDbMigrationOrSchema, true);
      assert.ok(result.triggeredRuleIds.includes('QF_DB_MIGRATION_BLOCK_001'));
    }
  });

  it('verifies ZERO source code modification invariant', () => {
    // Invariant: The eligibility engine is strictly read-only and analytical.
    // It must NEVER expose or invoke any patching, write, or mutation methods.
    const engineMethods = Object.getOwnPropertyNames(QuickFixRulesEngine.prototype);
    const forbiddenPatterns = [/patch/i, /fix/i, /write/i, /commit/i, /repair/i, /modify/i];

    for (const method of engineMethods) {
      if (method === 'constructor') continue;
      for (const forbidden of forbiddenPatterns) {
        assert.ok(
          !forbidden.test(method),
          `Rules engine prototype contains forbidden mutation method: ${method}`,
        );
      }
    }
  });
});
