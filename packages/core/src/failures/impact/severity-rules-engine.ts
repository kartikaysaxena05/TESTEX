/**
 * @file packages/core/src/failures/impact/severity-rules-engine.ts
 * Deterministic rules engine for technical defect severity evaluation (Phase 84).
 */

import type { ImpactSupportingEvidenceItemDto } from '@ai-quality/contracts';
import type { ImpactRawFacts, SeverityRuleEvaluation } from './impact-types.js';

export const SEVERITY_RULE_IDS = {
  SEV_NON_APP_FAILURE: 'SEV_NON_APP_FAILURE_001',
  SEV_CRITICAL_SECURITY_BYPASS: 'SEV_CRITICAL_SECURITY_BYPASS_001',
  SEV_CRITICAL_DATA_CORRUPTION: 'SEV_CRITICAL_DATA_CORRUPTION_001',
  SEV_CRITICAL_TOTAL_OUTAGE: 'SEV_CRITICAL_TOTAL_OUTAGE_001',
  SEV_HIGH_MAJOR_WORKFLOW_BLOCKED: 'SEV_HIGH_MAJOR_WORKFLOW_BLOCKED_001',
  SEV_HIGH_PERSISTENT_5XX: 'SEV_HIGH_PERSISTENT_5XX_001',
  SEV_HIGH_DATA_INCONSISTENCY: 'SEV_HIGH_DATA_INCONSISTENCY_001',
  SEV_MEDIUM_PARTIAL_WORKFLOW: 'SEV_MEDIUM_PARTIAL_WORKFLOW_001',
  SEV_LOW_COSMETIC_MINOR: 'SEV_LOW_COSMETIC_MINOR_001',
  SEV_UNKNOWN_INSUFFICIENT_EVIDENCE: 'SEV_UNKNOWN_INSUFFICIENT_EVIDENCE_001',
} as const;

export class SeverityRulesEngine {
  /**
   * Evaluates technical defect severity using deterministic rule precedence.
   */
  public evaluate(facts: ImpactRawFacts): SeverityRuleEvaluation {
    const evidence: ImpactSupportingEvidenceItemDto[] = [];
    const reasons: string[] = [];

    // 1. Rule: Non-Application Failure Check
    // If Phase 80 domain separation determined the failure is automation, environment, test data, or blocked
    if (
      facts.domain &&
      ['AUTOMATION_FAILURE', 'ENVIRONMENT_FAILURE', 'TEST_DATA_FAILURE', 'BLOCKED'].includes(
        facts.domain,
      )
    ) {
      evidence.push({
        id: 'ev-sev-non-app',
        sourceType: 'DOMAIN_SEPARATION',
        fact: `Failure domain separated to ${facts.domain} (${facts.domainSubreason || 'operational'}).`,
        significance: 'CRITICAL',
      });
      reasons.push(
        `Failure is classified as an operational/non-application issue (${facts.domain}). Product severity is not applicable.`,
      );

      return {
        severity: 'NOT_APPLICABLE',
        ruleId: SEVERITY_RULE_IDS.SEV_NON_APP_FAILURE,
        rationale: `Failure domain is ${facts.domain}; application bug severity is not applicable.`,
        reasons,
        supportingEvidence: evidence,
      };
    }

    // 2. Insufficient Evidence Check
    const hasAnyTelemetry =
      Boolean(facts.failureErrorMessage) ||
      Boolean(facts.executionErrorMessage) ||
      facts.evidenceArtifactCount > 0 ||
      Boolean(facts.classificationCategory);

    if (!hasAnyTelemetry) {
      return {
        severity: 'UNKNOWN',
        ruleId: SEVERITY_RULE_IDS.SEV_UNKNOWN_INSUFFICIENT_EVIDENCE,
        rationale: 'Insufficient diagnostic evidence to responsibly assess defect severity.',
        reasons: [
          'Zero diagnostic evidence artifacts, no error messages, and no classification facts.',
        ],
        supportingEvidence: [],
      };
    }

    // Text search corpus for factual indicators
    const fullTextCorpus = [
      facts.failureTitle,
      facts.failureErrorMessage,
      facts.executionErrorMessage,
      facts.testCaseTitle,
      facts.requirementTitle,
      facts.technicalTargetIdentifier,
      facts.rootCauseProbableCause,
      ...facts.consoleErrorSnippets,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    // 3. Rule: Critical Security Bypass
    const isSecurityBypass =
      fullTextCorpus.includes('authentication bypass') ||
      fullTextCorpus.includes('unauthorized privilege escalation') ||
      fullTextCorpus.includes('authorization bypass') ||
      fullTextCorpus.includes('access control breach') ||
      fullTextCorpus.includes('security control bypass') ||
      (facts.technicalLayer === 'AUTHENTICATION' && fullTextCorpus.includes('bypass')) ||
      (facts.technicalLayer === 'AUTHORIZATION' && fullTextCorpus.includes('privilege'));

    if (isSecurityBypass) {
      evidence.push({
        id: 'ev-sev-sec-bypass',
        sourceType: 'SECURITY_EVIDENCE',
        fact: 'Evidence indicates unauthorized access control or security bypass.',
        significance: 'CRITICAL',
      });
      reasons.push('Verified security-sensitive authorization or authentication bypass condition.');

      return {
        severity: 'CRITICAL',
        ruleId: SEVERITY_RULE_IDS.SEV_CRITICAL_SECURITY_BYPASS,
        rationale:
          'Unauthorized security bypass or privilege escalation detected in failure telemetry.',
        reasons,
        supportingEvidence: evidence,
      };
    }

    // 4. Rule: Critical Data Corruption
    const isDataCorruption =
      fullTextCorpus.includes('irreversible data corruption') ||
      fullTextCorpus.includes('financial transaction corrupt') ||
      fullTextCorpus.includes('incorrect real payment') ||
      fullTextCorpus.includes('database constraint violation: foreign key cascade corrupt') ||
      fullTextCorpus.includes('data loss verified');

    if (isDataCorruption) {
      evidence.push({
        id: 'ev-sev-data-corrupt',
        sourceType: 'DATA_INTEGRITY_EVIDENCE',
        fact: 'Verified irreversible data corruption or payment execution failure.',
        significance: 'CRITICAL',
      });
      reasons.push('Demonstrated irreversible data corruption or critical transaction error.');

      return {
        severity: 'CRITICAL',
        ruleId: SEVERITY_RULE_IDS.SEV_CRITICAL_DATA_CORRUPTION,
        rationale:
          'Irreversible data corruption or financial transaction damage demonstrated by evidence.',
        reasons,
        supportingEvidence: evidence,
      };
    }

    // 5. Rule: Critical Total Outage
    const isTotalOutage =
      fullTextCorpus.includes('system-wide outage') ||
      fullTextCorpus.includes('essential functionality completely unusable') ||
      (facts.requirementCriticality === 'CRITICAL' &&
        fullTextCorpus.includes('service crash') &&
        facts.isReproducible === true);

    if (isTotalOutage) {
      evidence.push({
        id: 'ev-sev-total-outage',
        sourceType: 'AVAILABILITY_EVIDENCE',
        fact: 'Critical requirement execution experienced complete service-wide crash.',
        significance: 'CRITICAL',
      });
      reasons.push('Complete breakdown of essential core service with 100% reproducibility.');

      return {
        severity: 'CRITICAL',
        ruleId: SEVERITY_RULE_IDS.SEV_CRITICAL_TOTAL_OUTAGE,
        rationale: 'Essential functionality completely unusable with no workaround.',
        reasons,
        supportingEvidence: evidence,
      };
    }

    // 6. Rule: High - Major Workflow Blocked or Critical Requirement Failing
    const isRequirementCriticalOrHigh =
      facts.requirementCriticality === 'CRITICAL' ||
      facts.requirementCriticality === 'HIGH' ||
      facts.testCasePriority === 'CRITICAL' ||
      facts.testCasePriority === 'HIGH';

    const has5xxError =
      (facts.httpStatusCode && facts.httpStatusCode >= 500 && facts.httpStatusCode < 600) ||
      facts.failedHttpEndpoints.some(ep => ep.statusCode && ep.statusCode >= 500) ||
      fullTextCorpus.includes('http 500') ||
      fullTextCorpus.includes('500 server error') ||
      fullTextCorpus.includes('502 bad gateway') ||
      fullTextCorpus.includes('503 service unavailable');

    const isCoreWorkflow =
      fullTextCorpus.includes('checkout') ||
      fullTextCorpus.includes('login') ||
      fullTextCorpus.includes('signup') ||
      fullTextCorpus.includes('billing') ||
      fullTextCorpus.includes('order creation') ||
      fullTextCorpus.includes('session renewal');

    if (isRequirementCriticalOrHigh && (facts.isReproducible !== false || has5xxError)) {
      evidence.push({
        id: 'ev-sev-high-req',
        sourceType: 'REQUIREMENT_PROVENANCE',
        fact: `Requirement or test case is designated ${facts.requirementCriticality || facts.testCasePriority}, and workflow consistently failed.`,
        significance: 'HIGH',
      });
      if (has5xxError) {
        evidence.push({
          id: 'ev-sev-high-5xx',
          sourceType: 'NETWORK_TELEMETRY',
          fact: 'Persistent HTTP 5xx error encountered during execution.',
          significance: 'HIGH',
        });
      }
      reasons.push(
        'Important or critical functional requirement blocked without verified workaround.',
      );

      return {
        severity: 'HIGH',
        ruleId: SEVERITY_RULE_IDS.SEV_HIGH_MAJOR_WORKFLOW_BLOCKED,
        rationale:
          'Major workflow or high-criticality requirement blocked without verified workaround.',
        reasons,
        supportingEvidence: evidence,
      };
    }

    if (has5xxError && isCoreWorkflow) {
      evidence.push({
        id: 'ev-sev-high-core-5xx',
        sourceType: 'NETWORK_TELEMETRY',
        fact: 'HTTP 5xx server error on core business workflow.',
        significance: 'HIGH',
      });
      reasons.push(
        'Persistent HTTP 5xx response returned during execution of a core business workflow.',
      );

      return {
        severity: 'HIGH',
        ruleId: SEVERITY_RULE_IDS.SEV_HIGH_PERSISTENT_5XX,
        rationale: 'Persistent HTTP 5xx server failure on core application operation.',
        reasons,
        supportingEvidence: evidence,
      };
    }

    // 7. Rule: Low - Minor Cosmetic Discrepancy
    const isCosmeticOnly =
      fullTextCorpus.includes('cosmetic') ||
      fullTextCorpus.includes('font size') ||
      fullTextCorpus.includes('margin') ||
      fullTextCorpus.includes('padding') ||
      fullTextCorpus.includes('typo') ||
      fullTextCorpus.includes('color mismatch') ||
      fullTextCorpus.includes('alignment');

    const isFunctionalCrash =
      has5xxError ||
      facts.hasConsoleErrors ||
      fullTextCorpus.includes('uncaught exception') ||
      fullTextCorpus.includes('typeerror') ||
      fullTextCorpus.includes('referenceerror');

    if (isCosmeticOnly && !isFunctionalCrash) {
      evidence.push({
        id: 'ev-sev-low-cosmetic',
        sourceType: 'DOM_ASSERTION',
        fact: 'Failure is isolated to visual styling, alignment, or minor wording.',
        significance: 'LOW',
      });
      reasons.push(
        'Cosmetic visual or text discrepancy with zero functional impairment or error exceptions.',
      );

      return {
        severity: 'LOW',
        ruleId: SEVERITY_RULE_IDS.SEV_LOW_COSMETIC_MINOR,
        rationale:
          'Minor visual, cosmetic, or wording issue where core functions remain operative.',
        reasons,
        supportingEvidence: evidence,
      };
    }

    // 8. Rule: Medium - Partial Workflow Impairment
    evidence.push({
      id: 'ev-sev-med-partial',
      sourceType: 'EXECUTION_TELEMETRY',
      fact: 'Functional assertion mismatch in non-critical workflow with recoverable application state.',
      significance: 'MEDIUM',
    });
    reasons.push(
      'Feature partially impaired or secondary assertion mismatch with moderate functional effect.',
    );

    return {
      severity: 'MEDIUM',
      ruleId: SEVERITY_RULE_IDS.SEV_MEDIUM_PARTIAL_WORKFLOW,
      rationale:
        'Feature partially impaired or secondary behavior incorrect in non-critical workflow.',
      reasons,
      supportingEvidence: evidence,
    };
  }
}
