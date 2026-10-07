/**
 * @file packages/core/src/failures/impact/priority-rules-engine.ts
 * Deterministic rules engine for operational priority evaluation (Phase 84).
 */

import type { DefectSeverityDto } from '@ai-quality/contracts';
import type { ImpactRawFacts, PriorityRuleEvaluation } from './impact-types.js';

export const PRIORITY_RULE_IDS = {
  PRI_P0_IMMEDIATE_BLOCKER: 'PRI_P0_IMMEDIATE_BLOCKER_001',
  PRI_P1_URGENT: 'PRI_P1_URGENT_001',
  PRI_P2_NORMAL: 'PRI_P2_NORMAL_001',
  PRI_P3_LOW: 'PRI_P3_LOW_001',
  PRI_UNKNOWN_INSUFFICIENT_EVIDENCE: 'PRI_UNKNOWN_INSUFFICIENT_EVIDENCE_001',
} as const;

export class PriorityRulesEngine {
  /**
   * Evaluates operational defect priority using deterministic precedence rules.
   * Priority represents urgency to resolve, independent of pure technical severity.
   */
  public evaluate(facts: ImpactRawFacts, severity?: DefectSeverityDto): PriorityRuleEvaluation {
    const reasons: string[] = [];

    // 1. Insufficient Evidence Check
    const hasAnyTelemetry =
      Boolean(facts.failureErrorMessage) ||
      Boolean(facts.executionErrorMessage) ||
      facts.evidenceArtifactCount > 0 ||
      Boolean(facts.classificationCategory);

    if (!hasAnyTelemetry && (!severity || severity === 'UNKNOWN')) {
      return {
        priority: 'UNKNOWN',
        ruleId: PRIORITY_RULE_IDS.PRI_UNKNOWN_INSUFFICIENT_EVIDENCE,
        rationale:
          'Insufficient operational context and failure telemetry to determine resolution priority.',
        reasons: [
          'Zero diagnostic evidence artifacts, no error messages, and no classification facts.',
        ],
      };
    }

    // 2. Operational / Non-Application Failure Queue
    if (
      facts.domain &&
      ['AUTOMATION_FAILURE', 'ENVIRONMENT_FAILURE', 'TEST_DATA_FAILURE', 'BLOCKED'].includes(
        facts.domain,
      )
    ) {
      if (facts.releaseBlockingOverride === true) {
        reasons.push(`Operational issue (${facts.domain}) explicitly flagged as release blocking.`);
        return {
          priority: 'P1_URGENT',
          ruleId: PRIORITY_RULE_IDS.PRI_P1_URGENT,
          rationale: `Operational ${facts.domain} has release-blocking override active; test infrastructure fix required urgently.`,
          reasons,
        };
      }

      reasons.push(
        `Failure is an operational ${facts.domain}; queued for test engineering triage.`,
      );
      return {
        priority: 'P3_LOW',
        ruleId: PRIORITY_RULE_IDS.PRI_P3_LOW,
        rationale: `Operational issue in domain ${facts.domain} triaged to non-blocking test engineering backlog.`,
        reasons,
      };
    }

    // Normalized environment
    const isProduction =
      facts.environmentType?.toUpperCase() === 'PRODUCTION' ||
      facts.environmentOverride?.toUpperCase() === 'PRODUCTION';

    // 3. Rule: P0 Immediate Blocker
    const isCriticalSeverity = severity === 'CRITICAL';
    const isHighSeverity = severity === 'HIGH';
    const isReproducible = facts.isReproducible === true;
    const isCriticalRequirement = facts.requirementCriticality === 'CRITICAL';

    const isP0Triggered =
      // Critical severity in production or with release-blocking flag
      (isCriticalSeverity && (isProduction || facts.releaseBlockingOverride === true)) ||
      // Critical severity on critical requirement with confirmed reproduction
      (isCriticalSeverity && isReproducible && isCriticalRequirement) ||
      // High severity in production with release-blocking flag
      (isHighSeverity && isProduction && facts.releaseBlockingOverride === true);

    if (isP0Triggered) {
      if (isProduction) {
        reasons.push('Affects production environment with severe user or functional impact.');
      }
      if (facts.releaseBlockingOverride === true) {
        reasons.push('Explicit release-blocking override active.');
      }
      if (isCriticalSeverity && isCriticalRequirement) {
        reasons.push('Confirmed 100% reproducible failure on critical tier requirement.');
      }

      return {
        priority: 'P0_IMMEDIATE',
        ruleId: PRIORITY_RULE_IDS.PRI_P0_IMMEDIATE_BLOCKER,
        rationale:
          'Immediate release or production blocker requiring continuous emergency escalation.',
        reasons,
      };
    }

    // 4. Rule: P1 Urgent
    const isP1Triggered =
      isCriticalSeverity ||
      (isHighSeverity && isReproducible) ||
      (isHighSeverity &&
        (facts.requirementCriticality === 'HIGH' || facts.requirementCriticality === 'CRITICAL')) ||
      (isProduction && severity === 'MEDIUM') ||
      facts.releaseBlockingOverride === true;

    if (isP1Triggered) {
      if (isCriticalSeverity) {
        reasons.push(
          'Critical defect severity requires urgent resolution before release candidate cutoff.',
        );
      }
      if (isHighSeverity && isReproducible) {
        reasons.push('High severity failure consistently reproduced in test environment.');
      }
      if (facts.releaseBlockingOverride === true) {
        reasons.push('Release-blocking override specified by QA lead or release operator.');
      }
      if (isProduction) {
        reasons.push('Medium severity defect in live production environment.');
      }

      return {
        priority: 'P1_URGENT',
        ruleId: PRIORITY_RULE_IDS.PRI_P1_URGENT,
        rationale:
          'Must be resolved prior to release; affects key customer workflow or critical capability.',
        reasons,
      };
    }

    // 5. Rule: P3 Low
    const isLowSeverity = severity === 'LOW';
    const isFlakyNonCritical = facts.isFlaky === true && !isCriticalSeverity && !isHighSeverity;

    if (isLowSeverity || isFlakyNonCritical) {
      if (isLowSeverity) {
        reasons.push(
          'Cosmetic or minor visual discrepancy with viable workarounds and zero data loss.',
        );
      }
      if (isFlakyNonCritical) {
        reasons.push(
          'Intermittent flakiness on non-critical workflow; low customer operational risk.',
        );
      }

      return {
        priority: 'P3_LOW',
        ruleId: PRIORITY_RULE_IDS.PRI_P3_LOW,
        rationale:
          'Low priority backlog; non-critical cosmetic issue or minor intermittent glitch.',
        reasons,
      };
    }

    // 6. Rule: P2 Normal (Default for Standard Defects)
    reasons.push(
      'Standard defect affecting non-critical workflow during active development cycle.',
    );
    if (facts.testCasePriority) {
      reasons.push(`Test case priority designated as ${facts.testCasePriority}.`);
    }

    return {
      priority: 'P2_NORMAL',
      ruleId: PRIORITY_RULE_IDS.PRI_P2_NORMAL,
      rationale: 'Standard resolution priority for next regular milestone or scheduled release.',
      reasons,
    };
  }
}
