/**
 * @file packages/core/src/failures/separation/domain-separation-rules-engine.ts
 * Deterministic exclusion-first rules engine separating application defects from
 * automation, test-data, and environment failures (V6 Phase 80).
 */

import type {
  DomainSeparationFacts,
  DomainSeparationResult,
  FailureDomain,
} from './separation-types.js';

export class DomainSeparationRulesEngine {
  /**
   * Evaluates failure evidence facts and returns deterministic failure domain separation result.
   */
  public evaluate(facts: DomainSeparationFacts): DomainSeparationResult {
    const matchedRuleIds: string[] = [];
    const conflictingSignals: string[] = [];
    const excludedDomains: FailureDomain[] = [];
    const exclusionReasons: Record<string, string> = {};

    // -------------------------------------------------------------------------
    // 1. BLOCKED EVALUATION
    // -------------------------------------------------------------------------
    if (facts.decisionIntegrity?.decisionState === 'BLOCKED') {
      matchedRuleIds.push('RULE_BLOCKED_BY_DECISION_INTEGRITY');
      const blockerDetail =
        facts.decisionIntegrity.blockingReasons.join('; ') ||
        'Decision integrity is BLOCKED by cross-evidence contradiction.';
      return {
        domain: 'BLOCKED',
        domainSubreason: 'DECISION_INTEGRITY_BLOCKED',
        primaryRationale: 'Downstream decision integrity and evidence arbitration is blocked.',
        decisionExplanation: `The failure case cannot be separated because decision integrity is BLOCKED:\n- ${blockerDetail}`,
        matchedRuleIds,
        excludedDomains: [
          'APPLICATION_DEFECT_CANDIDATE',
          'AUTOMATION_FAILURE',
          'TEST_DATA_FAILURE',
          'ENVIRONMENT_FAILURE',
        ],
        exclusionReasons: {
          APPLICATION_DEFECT_CANDIDATE:
            'Blocked due to unverified or contradictory decision integrity.',
          AUTOMATION_FAILURE: 'Blocked due to unverified or contradictory decision integrity.',
          TEST_DATA_FAILURE: 'Blocked due to unverified or contradictory decision integrity.',
          ENVIRONMENT_FAILURE: 'Blocked due to unverified or contradictory decision integrity.',
        },
        conflictingSignals,
        evidenceReferences: facts.evidenceItems.map(e => e.id),
        reproductionSummary: this.buildReproductionSummary(facts),
        flakinessSummary: this.buildFlakinessSummary(facts),
      };
    }

    const hasCorruptEvidence = facts.evidenceItems.some(
      e => e.integrityStatus === 'CORRUPT' || e.integrityStatus === 'TAMPERED',
    );
    if (hasCorruptEvidence) {
      matchedRuleIds.push('RULE_BLOCKED_BY_CORRUPT_EVIDENCE');
      return {
        domain: 'BLOCKED',
        domainSubreason: 'CORRUPT_EVIDENCE',
        primaryRationale: 'Evidence artifacts failed cryptographic checksum integrity validation.',
        decisionExplanation:
          'Failure domain separation cannot proceed because one or more attached evidence items are corrupt or tampered.',
        matchedRuleIds,
        excludedDomains: [
          'APPLICATION_DEFECT_CANDIDATE',
          'AUTOMATION_FAILURE',
          'TEST_DATA_FAILURE',
          'ENVIRONMENT_FAILURE',
        ],
        exclusionReasons: {
          APPLICATION_DEFECT_CANDIDATE: 'Evidence integrity compromised.',
          AUTOMATION_FAILURE: 'Evidence integrity compromised.',
          TEST_DATA_FAILURE: 'Evidence integrity compromised.',
          ENVIRONMENT_FAILURE: 'Evidence integrity compromised.',
        },
        conflictingSignals,
        evidenceReferences: facts.evidenceItems.map(e => e.id),
        reproductionSummary: this.buildReproductionSummary(facts),
        flakinessSummary: this.buildFlakinessSummary(facts),
      };
    }

    // -------------------------------------------------------------------------
    // 2. UNKNOWN EVALUATION (Insufficient Evidence)
    // -------------------------------------------------------------------------
    if (facts.evidenceItems.length === 0 && !facts.errorMessage && !facts.errorCode) {
      matchedRuleIds.push('RULE_UNKNOWN_NO_EVIDENCE');
      return {
        domain: 'UNKNOWN',
        domainSubreason: 'INSUFFICIENT_EVIDENCE',
        primaryRationale:
          'No trustworthy evidence or execution diagnostics available to evaluate domain.',
        decisionExplanation:
          'Zero evidence artifacts and zero diagnostic telemetry were attached to this failure case. Domain cannot be determined.',
        matchedRuleIds,
        excludedDomains: [],
        exclusionReasons: {},
        conflictingSignals,
        evidenceReferences: [],
        reproductionSummary: this.buildReproductionSummary(facts),
        flakinessSummary: this.buildFlakinessSummary(facts),
      };
    }

    // -------------------------------------------------------------------------
    // 3. IDENTIFY DOMAIN SIGNALS
    // -------------------------------------------------------------------------
    const automationSignals = this.detectAutomationSignals(facts);
    const environmentSignals = this.detectEnvironmentSignals(facts);
    const testDataSignals = this.detectTestDataSignals(facts);
    const requirementAmbiguitySignals = this.detectRequirementAmbiguitySignals(facts);
    const applicationSignals = this.detectApplicationSignals(facts);

    // -------------------------------------------------------------------------
    // 4. CONFLICT DETECTION
    // -------------------------------------------------------------------------
    if (automationSignals.length > 0 && applicationSignals.length > 0) {
      // Check if ordered: did assertion happen before browser crash?
      const isCrashAfterAssertion =
        facts.executionMetadata?.browserCrash && facts.executionMetadata?.assertionFailure != null;

      if (!isCrashAfterAssertion) {
        conflictingSignals.push(
          `Conflicting signals: Automation failure (${automationSignals.join(', ')}) coincides with Application failure (${applicationSignals.join(', ')}).`,
        );
      }
    }

    if (environmentSignals.length > 0 && applicationSignals.length > 0) {
      conflictingSignals.push(
        `Conflicting signals: Environment failure (${environmentSignals.join(', ')}) coincides with Application failure (${applicationSignals.join(', ')}).`,
      );
    }

    if (testDataSignals.length > 0 && applicationSignals.length > 0) {
      conflictingSignals.push(
        `Conflicting signals: Test-data failure (${testDataSignals.join(', ')}) coincides with Application failure (${applicationSignals.join(', ')}).`,
      );
    }

    // -------------------------------------------------------------------------
    // 5. EVALUATE AUTHORITATIVE AUTOMATION FAILURE
    // -------------------------------------------------------------------------
    if (automationSignals.length > 0) {
      // If there's an unresolvable conflict between automation and application
      if (conflictingSignals.length > 0 && !facts.executionMetadata?.browserCrash) {
        matchedRuleIds.push('RULE_CONFLICT_AUTOMATION_APPLICATION');
        return this.buildInconclusiveResult(
          'AUTOMATION_APPLICATION_CONFLICT',
          'Conflicting authoritative signals between automation layer and application logic.',
          conflictingSignals,
          facts,
          matchedRuleIds,
        );
      }

      matchedRuleIds.push(...automationSignals.map(s => `RULE_AUTOMATION_${s}`));
      excludedDomains.push(
        'APPLICATION_DEFECT_CANDIDATE',
        'TEST_DATA_FAILURE',
        'ENVIRONMENT_FAILURE',
      );
      exclusionReasons.APPLICATION_DEFECT_CANDIDATE =
        'Automation runtime/browser infrastructure failed before application behavior could be authoritatively validated.';
      exclusionReasons.TEST_DATA_FAILURE =
        'Failure occurred at the automation execution layer, independent of test data.';
      exclusionReasons.ENVIRONMENT_FAILURE =
        'Failure occurred inside the automation execution harness rather than target environment connectivity.';

      return {
        domain: 'AUTOMATION_FAILURE',
        domainSubreason: automationSignals[0],
        primaryRationale: `Authoritative automation failure detected: ${automationSignals.join(', ')}.`,
        decisionExplanation: this.formatExplanation(
          'AUTOMATION_FAILURE',
          `Automation runtime or driver failed during execution:\n- ${automationSignals.join('\n- ')}`,
          exclusionReasons,
        ),
        matchedRuleIds,
        excludedDomains,
        exclusionReasons,
        conflictingSignals,
        evidenceReferences: facts.evidenceItems.map(e => e.id),
        reproductionSummary: this.buildReproductionSummary(facts),
        flakinessSummary: this.buildFlakinessSummary(facts),
      };
    }

    // -------------------------------------------------------------------------
    // 6. EVALUATE AUTHORITATIVE ENVIRONMENT FAILURE
    // -------------------------------------------------------------------------
    if (environmentSignals.length > 0) {
      matchedRuleIds.push(...environmentSignals.map(s => `RULE_ENVIRONMENT_${s}`));
      excludedDomains.push(
        'APPLICATION_DEFECT_CANDIDATE',
        'AUTOMATION_FAILURE',
        'TEST_DATA_FAILURE',
      );
      exclusionReasons.APPLICATION_DEFECT_CANDIDATE =
        'Target environment or dependent service is offline or unreachable; application code cannot be blamed.';
      exclusionReasons.AUTOMATION_FAILURE =
        'Automation runner and browser executed correctly; connection failed at the environment level.';
      exclusionReasons.TEST_DATA_FAILURE =
        'Failure is infrastructural (connectivity/reachability), not attributable to test entity data.';

      return {
        domain: 'ENVIRONMENT_FAILURE',
        domainSubreason: environmentSignals[0],
        primaryRationale: `Authoritative environment infrastructure failure detected: ${environmentSignals.join(', ')}.`,
        decisionExplanation: this.formatExplanation(
          'ENVIRONMENT_FAILURE',
          `Target application environment or dependent service was unreachable or unhealthy:\n- ${environmentSignals.join('\n- ')}`,
          exclusionReasons,
        ),
        matchedRuleIds,
        excludedDomains,
        exclusionReasons,
        conflictingSignals,
        evidenceReferences: facts.evidenceItems.map(e => e.id),
        reproductionSummary: this.buildReproductionSummary(facts),
        flakinessSummary: this.buildFlakinessSummary(facts),
      };
    }

    // -------------------------------------------------------------------------
    // 7. EVALUATE AUTHORITATIVE TEST-DATA FAILURE
    // -------------------------------------------------------------------------
    if (testDataSignals.length > 0) {
      matchedRuleIds.push(...testDataSignals.map(s => `RULE_TEST_DATA_${s}`));
      excludedDomains.push(
        'APPLICATION_DEFECT_CANDIDATE',
        'AUTOMATION_FAILURE',
        'ENVIRONMENT_FAILURE',
      );
      exclusionReasons.APPLICATION_DEFECT_CANDIDATE =
        'Required test fixture, seeded record, or test account was absent or invalid prior to test assertion.';
      exclusionReasons.AUTOMATION_FAILURE =
        'Automation engine executed normally; input test preconditions were violated.';
      exclusionReasons.ENVIRONMENT_FAILURE =
        'Target environment was operational; failure originated from missing/invalid test fixtures.';

      return {
        domain: 'TEST_DATA_FAILURE',
        domainSubreason: testDataSignals[0],
        primaryRationale: `Authoritative test-data precondition failure detected: ${testDataSignals.join(', ')}.`,
        decisionExplanation: this.formatExplanation(
          'TEST_DATA_FAILURE',
          `Required test data or fixture preconditions were missing or invalid:\n- ${testDataSignals.join('\n- ')}`,
          exclusionReasons,
        ),
        matchedRuleIds,
        excludedDomains,
        exclusionReasons,
        conflictingSignals,
        evidenceReferences: facts.evidenceItems.map(e => e.id),
        reproductionSummary: this.buildReproductionSummary(facts),
        flakinessSummary: this.buildFlakinessSummary(facts),
      };
    }

    // -------------------------------------------------------------------------
    // 8. EVALUATE REQUIREMENT AMBIGUITY OR INVALID TEST
    // -------------------------------------------------------------------------
    if (requirementAmbiguitySignals.length > 0) {
      matchedRuleIds.push(...requirementAmbiguitySignals.map(s => `RULE_${s}`));
      return this.buildInconclusiveResult(
        'REQUIREMENT_OR_TEST_INVALID',
        'Test definition or requirement specification is ambiguous or structurally invalid.',
        requirementAmbiguitySignals,
        facts,
        matchedRuleIds,
      );
    }

    // -------------------------------------------------------------------------
    // 9. EVALUATE APPLICATION DEFECT CANDIDATE (EXCLUSION-FIRST)
    // -------------------------------------------------------------------------
    if (applicationSignals.length > 0) {
      matchedRuleIds.push('RULE_APPLICATION_DEFECT_EXCLUSIONS_PASSED');
      matchedRuleIds.push(...applicationSignals.map(s => `RULE_APPLICATION_${s}`));

      excludedDomains.push('AUTOMATION_FAILURE', 'ENVIRONMENT_FAILURE', 'TEST_DATA_FAILURE');
      exclusionReasons.AUTOMATION_FAILURE =
        'Browser process, Playwright driver, and execution engine operated normally with zero crashes or transport errors.';
      exclusionReasons.ENVIRONMENT_FAILURE =
        'Target environment baseUrl was reachable and responded with valid HTTP status.';
      exclusionReasons.TEST_DATA_FAILURE =
        'Required test accounts, seeded entities, and input payloads were verified valid.';

      const reproductionBonus =
        facts.reproduction?.status === 'REPRODUCED'
          ? '\n- Failure reproduced identically under controlled conditions.'
          : '';

      const flakinessNote =
        facts.flakiness?.flakinessState === 'CONFIRMED_FLAKY'
          ? '\n- Test exhibits CONFIRMED_FLAKY behavior (possible application race condition or timing sensitivity).'
          : '';

      return {
        domain: 'APPLICATION_DEFECT_CANDIDATE',
        domainSubreason: applicationSignals[0],
        primaryRationale:
          'Application actual behavior deviated from valid expected specification while automation, environment, and test data were healthy.',
        decisionExplanation: this.formatExplanation(
          'APPLICATION_DEFECT_CANDIDATE',
          `Application logic deviation substantiated after excluding automation, environment, and test-data failures:\n- ${applicationSignals.join('\n- ')}${reproductionBonus}${flakinessNote}`,
          exclusionReasons,
        ),
        matchedRuleIds,
        excludedDomains,
        exclusionReasons,
        conflictingSignals,
        evidenceReferences: facts.evidenceItems.map(e => e.id),
        reproductionSummary: this.buildReproductionSummary(facts),
        flakinessSummary: this.buildFlakinessSummary(facts),
      };
    }

    // -------------------------------------------------------------------------
    // 10. FALLBACK: INCONCLUSIVE
    // -------------------------------------------------------------------------
    matchedRuleIds.push('RULE_INCONCLUSIVE_DEFAULT');
    return this.buildInconclusiveResult(
      'INDETERMINATE_FACTS',
      'Available evidence does not definitively corroborate or exclude any single failure domain.',
      [
        'No definitive automation, environment, test-data, or application mismatch signal could be verified.',
      ],
      facts,
      matchedRuleIds,
    );
  }

  // =========================================================================
  // SIGNAL DETECTION HELPERS
  // =========================================================================

  private detectAutomationSignals(facts: DomainSeparationFacts): string[] {
    const signals: string[] = [];
    const meta = facts.executionMetadata;
    const msg = (facts.errorMessage ?? '').toLowerCase();
    const code = (facts.errorCode ?? '').toUpperCase();

    if (
      meta?.browserCrash ||
      msg.includes('browser crashed') ||
      msg.includes('target page, context or browser has been closed')
    ) {
      signals.push('BROWSER_CRASH');
    }

    if (
      msg.includes('playwright') ||
      code.includes('PLAYWRIGHT') ||
      msg.includes('cdp disconnect') ||
      msg.includes('protocol error')
    ) {
      signals.push('PLAYWRIGHT_TRANSPORT_FAILURE');
    }

    if (
      meta?.locatorFailure?.isAmbiguous ||
      msg.includes('strict mode violation') ||
      msg.includes('resolved to multiple elements')
    ) {
      signals.push('AMBIGUOUS_LOCATOR');
    }

    // Locator separation: only automation failure if locator was stale or targeting was invalid
    if (
      (meta?.locatorFailure && !meta.locatorFailure.isElementMissingInDom) ||
      msg.includes('invalid selector') ||
      msg.includes('syntax error in selector')
    ) {
      signals.push('INVALID_LOCATOR_SYNTAX');
    }

    // Timeout separation: only automation failure if timeout was browser/driver owned
    if (
      meta?.timeoutDetails?.phase === 'BROWSER' ||
      code === 'ERR_AUTOMATION_TIMEOUT' ||
      msg.includes('worker killed')
    ) {
      signals.push('AUTOMATION_TIMEOUT');
    }

    if (facts.classification?.category === 'AUTOMATION_FAILURE') {
      signals.push('PHASE77_AUTOMATION_FAILURE_CLASSIFICATION');
    }

    return signals;
  }

  private detectEnvironmentSignals(facts: DomainSeparationFacts): string[] {
    const signals: string[] = [];
    const meta = facts.executionMetadata;
    const msg = (facts.errorMessage ?? '').toLowerCase();
    const code = (facts.errorCode ?? '').toUpperCase();

    if (
      meta?.environmentDiagnostics?.isTargetUnreachable ||
      meta?.environmentDiagnostics?.isDnsFailure ||
      msg.includes('econnrefused') ||
      msg.includes('enotfound') ||
      msg.includes('net::err_connection_refused') ||
      code === 'ERR_CONNECTION_REFUSED'
    ) {
      signals.push('TARGET_UNREACHABLE');
    }

    if (
      meta?.environmentDiagnostics?.isConfigMissing ||
      msg.includes('missing environment configuration')
    ) {
      signals.push('ENVIRONMENT_CONFIGURATION_MISSING');
    }

    if (meta?.environmentDiagnostics?.isHealthCheckFailed || msg.includes('health check failed')) {
      signals.push('ENVIRONMENT_HEALTH_CHECK_FAILED');
    }

    // Timeout separation: environment owned timeout
    if (
      meta?.timeoutDetails?.phase === 'NETWORK' ||
      msg.includes('gateway timeout') ||
      msg.includes('etimedout')
    ) {
      signals.push('ENVIRONMENT_TIMEOUT');
    }

    if (facts.classification?.category === 'ENVIRONMENT_FAILURE') {
      signals.push('PHASE77_ENVIRONMENT_FAILURE_CLASSIFICATION');
    }

    return signals;
  }

  private detectTestDataSignals(facts: DomainSeparationFacts): string[] {
    const signals: string[] = [];
    const meta = facts.executionMetadata;
    const msg = (facts.errorMessage ?? '').toLowerCase();
    const code = (facts.errorCode ?? '').toUpperCase();

    if (
      meta?.testDataProvenance?.isFixtureMissing ||
      msg.includes('required fixture missing') ||
      msg.includes('fixture not found') ||
      msg.includes('missing required test data') ||
      msg.includes('missing fixture') ||
      msg.includes('test data fixture') ||
      msg.includes('seed profile') ||
      msg.includes('test dataset') ||
      code === 'TEST_DATA_MISSING'
    ) {
      signals.push('MISSING_TEST_DATA_FIXTURE');
    }

    if (
      meta?.testDataProvenance?.isCredentialInvalid ||
      msg.includes('test account locked') ||
      msg.includes('expired test account')
    ) {
      signals.push('INVALID_TEST_CREDENTIAL_FIXTURE');
    }

    if (
      meta?.testDataProvenance?.isPreconditionFailed ||
      msg.includes('prerequisite record not created') ||
      msg.includes('seed entity absent')
    ) {
      signals.push('DATA_PRECONDITION_UNMET');
    }

    if (facts.classification?.category === 'TEST_DATA_FAILURE') {
      signals.push('PHASE77_TEST_DATA_FAILURE_CLASSIFICATION');
    }

    return signals;
  }

  private detectRequirementAmbiguitySignals(facts: DomainSeparationFacts): string[] {
    const signals: string[] = [];
    if (facts.classification?.category === 'REQUIREMENT_AMBIGUITY') {
      signals.push('REQUIREMENT_AMBIGUITY_DETECTED');
    }
    if (facts.classification?.category === 'INVALID_TEST') {
      signals.push('INVALID_TEST_SPECIFICATION');
    }
    return signals;
  }

  private detectApplicationSignals(facts: DomainSeparationFacts): string[] {
    const signals: string[] = [];
    const meta = facts.executionMetadata;
    const msg = (facts.errorMessage ?? '').toLowerCase();
    const code = (facts.errorCode ?? '').toUpperCase();

    if (
      meta?.assertionFailure != null ||
      code === 'ERR_ASSERTION_MISMATCH' ||
      (msg.includes('expected') && msg.includes('received'))
    ) {
      const exp = meta?.assertionFailure?.expected
        ? ` Expected: "${meta.assertionFailure.expected}".`
        : '';
      const act = meta?.assertionFailure?.actual
        ? ` Actual: "${meta.assertionFailure.actual}".`
        : '';
      signals.push(`ASSERTION_MISMATCH${exp}${act}`);
    }

    // Locator separation: genuinely absent application element confirmed in DOM
    if (meta?.locatorFailure?.isElementMissingInDom && !meta.locatorFailure.isAmbiguous) {
      signals.push('VALID_EXPECTED_ELEMENT_MISSING_IN_DOM');
    }

    // Application console error
    if (meta?.consoleErrors && meta.consoleErrors.length > 0) {
      const appConsoleError = meta.consoleErrors.find(
        c => !c.toLowerCase().includes('favicon') && !c.toLowerCase().includes('extension'),
      );
      if (appConsoleError) {
        signals.push(`APPLICATION_JAVASCRIPT_EXCEPTION: ${appConsoleError}`);
      }
    }

    // Application HTTP error (500 from application server, not network timeout)
    if (
      facts.failureSummary?.includes('500 Internal Server Error') ||
      msg.includes('500 internal server error')
    ) {
      signals.push('APPLICATION_HTTP_500_ERROR');
    }

    if (facts.classification?.category === 'APPLICATION_FAILURE') {
      signals.push('PHASE77_APPLICATION_FAILURE_CLASSIFICATION');
    }

    return signals;
  }

  // =========================================================================
  // FORMATTING & RESULT FACTORIES
  // =========================================================================

  private formatExplanation(
    domain: FailureDomain,
    rationale: string,
    exclusionReasons: Record<string, string>,
  ): string {
    const lines: string[] = [
      `Selected Domain: ${domain}`,
      '',
      `Evidence & Rationale:`,
      rationale,
      '',
      `Excluded Alternative Domains:`,
    ];

    for (const [excluded, reason] of Object.entries(exclusionReasons)) {
      lines.push(`- ${excluded}: ${reason}`);
    }

    return lines.join('\n');
  }

  private buildInconclusiveResult(
    subreason: string,
    rationale: string,
    reasons: string[],
    facts: DomainSeparationFacts,
    matchedRuleIds: string[],
  ): DomainSeparationResult {
    return {
      domain: 'INCONCLUSIVE',
      domainSubreason: subreason,
      primaryRationale: rationale,
      decisionExplanation: `Failure domain is INCONCLUSIVE because:\n- ${reasons.join('\n- ')}`,
      matchedRuleIds,
      excludedDomains: [],
      exclusionReasons: {},
      conflictingSignals: reasons,
      evidenceReferences: facts.evidenceItems.map(e => e.id),
      reproductionSummary: this.buildReproductionSummary(facts),
      flakinessSummary: this.buildFlakinessSummary(facts),
    };
  }

  private buildReproductionSummary(facts: DomainSeparationFacts): Record<string, unknown> {
    if (!facts.reproduction) {
      return { status: 'NOT_ATTEMPTED' };
    }
    return {
      id: facts.reproduction.id,
      attemptNumber: facts.reproduction.attemptNumber,
      status: facts.reproduction.status,
      environmentEquivalence: facts.reproduction.environmentEquivalence,
      isSignatureMatch: facts.reproduction.isSignatureMatch ?? false,
      isFailedStepMatch: facts.reproduction.isFailedStepMatch ?? false,
      reproductionFailureSignature: facts.reproduction.reproductionFailureSignature ?? null,
    };
  }

  private buildFlakinessSummary(facts: DomainSeparationFacts): Record<string, unknown> {
    if (!facts.flakiness) {
      return { status: 'NOT_EVALUATED' };
    }
    return {
      id: facts.flakiness.id,
      flakinessState: facts.flakiness.flakinessState,
      stabilityState: facts.flakiness.stabilityState,
      flakinessScore: facts.flakiness.flakinessScore ?? null,
      passRate: facts.flakiness.passRate ?? null,
      dominantFailureSignature: facts.flakiness.dominantFailureSignature ?? null,
    };
  }
}
