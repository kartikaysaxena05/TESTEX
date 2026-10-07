/**
 * @file packages/core/src/failures/classification/rule-registry.ts
 * Authoritative deterministic classification rules and precedence matrix (V6 Phase 77).
 */

import type { ClassificationEvidenceContext, IDeterministicRule } from './classification-types.js';

/**
 * Helper to extract combined text from error message, summary, and step errors.
 */
function getCombinedErrorText(ctx: ClassificationEvidenceContext): string {
  const parts: string[] = [];
  if (ctx.errorMessage) parts.push(ctx.errorMessage);
  if (ctx.failureSummary) parts.push(ctx.failureSummary);
  if (ctx.executionFailureReason) parts.push(ctx.executionFailureReason);
  for (const step of ctx.stepExecutions) {
    if (step.errorMessage) parts.push(step.errorMessage);
  }
  for (const assertion of ctx.assertions) {
    if (assertion.errorMessage) parts.push(assertion.errorMessage);
  }
  return parts.join(' \n ');
}

// -----------------------------------------------------------------------------
// Precedence Tier 1 (100-199): BLOCKED Factual State
// -----------------------------------------------------------------------------

export const RULE_BLK_REPRODUCTION_BLOCKED_001: IDeterministicRule = {
  id: 'BLK_REPRODUCTION_BLOCKED_001',
  name: 'Reproduction Attempt Explicitly Blocked',
  category: 'BLOCKED_EXECUTION',
  subcategory: 'UNSPECIFIED_FAILURE',
  precedence: 100,
  evaluate: ctx => {
    const blockedAttempt = ctx.reproductionAttempts.find(a => a.status === 'BLOCKED');
    if (blockedAttempt) {
      return {
        matched: true,
        explanation: `Reproduction verification was explicitly blocked: ${blockedAttempt.blockerReason ?? 'Precondition or environment blocked reproduction'}.`,
        supportingEvidence: [
          `Reproduction attempt #${blockedAttempt.attemptNumber} status: BLOCKED`,
          `Blocker reason: ${blockedAttempt.blockerReason ?? 'Unspecified precondition blocker'}`,
        ],
        signalStrength: 'DEFINITIVE',
      };
    }
    return null;
  },
};

export const RULE_BLK_ANALYSIS_BLOCKED_001: IDeterministicRule = {
  id: 'BLK_ANALYSIS_BLOCKED_001',
  name: 'Failure Analysis Explicitly Blocked or Ineligible',
  category: 'BLOCKED_EXECUTION',
  subcategory: 'UNSPECIFIED_FAILURE',
  precedence: 110,
  evaluate: ctx => {
    if (ctx.failureCaseStatus === 'BLOCKED' || ctx.isEligible === false) {
      return {
        matched: true,
        explanation: `Failure case is blocked from analysis: ${ctx.ineligibilityReason ?? 'Marked as ineligible or blocked'}.`,
        supportingEvidence: [
          `FailureCase status: ${ctx.failureCaseStatus}`,
          `Eligible: ${ctx.isEligible}`,
          `Reason: ${ctx.ineligibilityReason ?? 'None provided'}`,
        ],
        signalStrength: 'DEFINITIVE',
      };
    }
    return null;
  },
};

// -----------------------------------------------------------------------------
// Precedence Tier 2 (200-299): Infrastructure / Automation Runtime Failures
// -----------------------------------------------------------------------------

export const RULE_AUTO_BROWSER_CRASH_001: IDeterministicRule = {
  id: 'AUTO_BROWSER_CRASH_001',
  name: 'Browser Process Crashed or Terminated Unexpectedly',
  category: 'AUTOMATION_FAILURE',
  subcategory: 'BROWSER_CRASH',
  precedence: 200,
  evaluate: ctx => {
    const errorText = getCombinedErrorText(ctx);
    const crashPatterns = [
      /browser\s+(has\s+)?crashed/i,
      /browser\s+process\s+(terminated|exited|died)/i,
      /target\s+page,\s+context\s+or\s+browser\s+has\s+been\s+closed/i,
      /session\s+closed\.\s+most\s+likely\s+the\s+browser\s+crashed/i,
      /SIGSEGV|SIGBUS|exit\s+code\s+139/i,
    ];

    const matchedPattern = crashPatterns.find(p => p.test(errorText));
    if (matchedPattern) {
      return {
        matched: true,
        explanation:
          'The underlying browser process crashed or terminated before test execution could complete normally.',
        supportingEvidence: [
          `Matched browser crash signature in error logs.`,
          `Error: ${ctx.errorMessage ?? 'Browser terminated abruptly'}`,
        ],
        signalStrength: 'DEFINITIVE',
      };
    }
    return null;
  },
};

export const RULE_AUTO_PLAYWRIGHT_TRANSPORT_001: IDeterministicRule = {
  id: 'AUTO_PLAYWRIGHT_TRANSPORT_001',
  name: 'Playwright Transport Protocol Disconnected',
  category: 'AUTOMATION_FAILURE',
  subcategory: 'PLAYWRIGHT_ERROR',
  precedence: 210,
  evaluate: ctx => {
    const errorText = getCombinedErrorText(ctx);
    const transportPatterns = [
      /protocol\s+error\s*\([A-Za-z0-9_.]+\)/i,
      /connection\s+closed\s+while\s+reading\s+from\s+the\s+driver/i,
      /playwright\s+connection\s+(refused|reset|closed)/i,
      /cdp\s+session\s+closed/i,
    ];

    const matchedPattern = transportPatterns.find(p => p.test(errorText));
    if (matchedPattern) {
      return {
        matched: true,
        explanation:
          'Playwright automation transport encountered an internal communication or driver failure.',
        supportingEvidence: [
          `Matched Playwright driver protocol error signature.`,
          `Error: ${ctx.errorMessage ?? 'CDP transport failure'}`,
        ],
        signalStrength: 'STRONG',
      };
    }
    return null;
  },
};

export const RULE_AUTO_AMBIGUOUS_LOCATOR_001: IDeterministicRule = {
  id: 'AUTO_AMBIGUOUS_LOCATOR_001',
  name: 'Ambiguous Locator Resolved to Multiple Elements',
  category: 'AUTOMATION_FAILURE',
  subcategory: 'AMBIGUOUS_LOCATOR',
  precedence: 220,
  evaluate: ctx => {
    const errorText = getCombinedErrorText(ctx);
    const ambiguousPatterns = [
      /strict\s+mode\s+violation/i,
      /resolved\s+to\s+\d+\s+elements/i,
      /locator\s+is\s+ambiguous/i,
      /multiple\s+elements\s+matched/i,
    ];

    const matchedPattern = ambiguousPatterns.find(p => p.test(errorText));
    if (matchedPattern) {
      return {
        matched: true,
        explanation:
          'The test step locator resolved to multiple elements in strict mode, preventing unambiguous action dispatch.',
        supportingEvidence: [
          `Matched ambiguous locator violation.`,
          `Error snippet: ${ctx.errorMessage ?? 'Strict mode violation'}`,
        ],
        signalStrength: 'DEFINITIVE',
      };
    }
    return null;
  },
};

export const RULE_AUTO_LOCATOR_NOT_FOUND_001: IDeterministicRule = {
  id: 'AUTO_LOCATOR_NOT_FOUND_001',
  name: 'Target Element Locator Not Found',
  category: 'AUTOMATION_FAILURE',
  subcategory: 'LOCATOR_NOT_FOUND',
  precedence: 230,
  evaluate: ctx => {
    // If target was unreachable, that takes precedence as environment failure
    const errorText = getCombinedErrorText(ctx);
    if (/net::ERR_|connection\s+refused|DNS|ECONNREFUSED/i.test(errorText)) {
      return null;
    }

    const notFoundPatterns = [
      /waiting\s+for\s+locator\s*\(.*\)\s*to\s+be\s+visible/i,
      /waiting\s+for\s+selector\s*\(.*\)/i,
      /element\s+not\s+found/i,
      /could\s+not\s+resolve\s+locator/i,
      /cannot\s+find\s+element\s+with\s+locator/i,
    ];

    const matchedPattern = notFoundPatterns.find(p => p.test(errorText));
    if (matchedPattern) {
      return {
        matched: true,
        explanation:
          'The automation framework timed out waiting for the target DOM selector to appear or resolve.',
        supportingEvidence: [
          `Locator resolution timed out or failed without application network unreachable error.`,
          `Error: ${ctx.errorMessage ?? 'Waiting for selector failed'}`,
        ],
        signalStrength: 'STRONG',
      };
    }
    return null;
  },
};

export const RULE_AUTO_ACTION_TIMEOUT_001: IDeterministicRule = {
  id: 'AUTO_ACTION_TIMEOUT_001',
  name: 'Automation Action Execution Timeout',
  category: 'AUTOMATION_FAILURE',
  subcategory: 'TIMEOUT',
  precedence: 240,
  evaluate: ctx => {
    const errorText = getCombinedErrorText(ctx);
    const timeoutPatterns = [
      /Timeout\s+\d+ms\s+exceeded/i,
      /action\s+timed\s+out/i,
      /navigation\s+timed\s+out/i,
      /SYNCHRONIZATION_TIMEOUT|ELEMENT_READINESS_TIMEOUT/i,
    ];

    // Must not be an assertion timeout or reachability error
    if (/ASSERTION_|assertion/i.test(ctx.errorCode ?? '') || /net::ERR_/i.test(errorText)) {
      return null;
    }

    const matchedPattern = timeoutPatterns.find(p => p.test(errorText));
    if (matchedPattern) {
      return {
        matched: true,
        explanation:
          'An automation action exceeded the allotted execution threshold before reaching verification.',
        supportingEvidence: [
          `Action execution timed out.`,
          `Error: ${ctx.errorMessage ?? 'Action timeout'}`,
        ],
        signalStrength: 'STRONG',
      };
    }
    return null;
  },
};

export const RULE_AUTO_ACTION_EXECUTION_ERROR_001: IDeterministicRule = {
  id: 'AUTO_ACTION_EXECUTION_ERROR_001',
  name: 'Browser Action Intercepted or Element Not Actionable',
  category: 'AUTOMATION_FAILURE',
  subcategory: 'ACTION_EXECUTION_ERROR',
  precedence: 250,
  evaluate: ctx => {
    const errorText = getCombinedErrorText(ctx);
    const actionErrorPatterns = [
      /element\s+is\s+not\s+actionable/i,
      /another\s+element\s+covers\s+it/i,
      /intercepts\s+pointer\s+events/i,
      /element\s+is\s+outside\s+of\s+the\s+viewport/i,
      /element\s+is\s+disabled/i,
    ];

    const matchedPattern = actionErrorPatterns.find(p => p.test(errorText));
    if (matchedPattern) {
      return {
        matched: true,
        explanation:
          'Browser action could not be dispatched because the element was obstructed, outside viewport, or not actionable.',
        supportingEvidence: [
          `Action dispatch rejected by browser interaction policy.`,
          `Error: ${ctx.errorMessage ?? 'Pointer events intercepted'}`,
        ],
        signalStrength: 'STRONG',
      };
    }
    return null;
  },
};

// -----------------------------------------------------------------------------
// Precedence Tier 3 (300-399): Environment Failures
// -----------------------------------------------------------------------------

export const RULE_ENV_TARGET_UNREACHABLE_001: IDeterministicRule = {
  id: 'ENV_TARGET_UNREACHABLE_001',
  name: 'Target Application URL Unreachable or Connection Refused',
  category: 'ENVIRONMENT_FAILURE',
  subcategory: 'TARGET_UNREACHABLE',
  precedence: 300,
  evaluate: ctx => {
    const errorText = getCombinedErrorText(ctx);
    const unreachablePatterns = [
      /net::ERR_CONNECTION_REFUSED/i,
      /net::ERR_NAME_NOT_RESOLVED/i,
      /net::ERR_ADDRESS_UNREACHABLE/i,
      /ECONNREFUSED/i,
      /ENOTFOUND/i,
      /target\s+url\s+is\s+unreachable/i,
      /HTTP\s+(502|503|504)\s+(Bad\s+Gateway|Service\s+Unavailable|Gateway\s+Timeout)/i,
    ];

    const matchedPattern = unreachablePatterns.find(p => p.test(errorText));
    const networkFailure = ctx.networkErrors.find(
      n => n.status === 502 || n.status === 503 || n.status === 504 || /ERR_/i.test(n.error ?? ''),
    );

    if (matchedPattern || networkFailure) {
      return {
        matched: true,
        explanation:
          'The target application endpoint was unreachable due to connection refusal, DNS failure, or gateway outage.',
        supportingEvidence: [
          networkFailure
            ? `Network failure on ${networkFailure.url}: status=${networkFailure.status ?? 'N/A'}, error=${networkFailure.error ?? 'Connection failed'}`
            : `Matched unreachable target error: ${ctx.errorMessage ?? 'Connection refused'}`,
        ],
        signalStrength: 'DEFINITIVE',
      };
    }
    return null;
  },
};

export const RULE_ENV_CONFIGURATION_MISSING_001: IDeterministicRule = {
  id: 'ENV_CONFIGURATION_MISSING_001',
  name: 'Environment Profile or Base URL Missing',
  category: 'ENVIRONMENT_FAILURE',
  subcategory: 'ENVIRONMENT_CONFIGURATION_MISSING',
  precedence: 310,
  evaluate: ctx => {
    const errorText = getCombinedErrorText(ctx);
    const missingPatterns = [
      /environment\s+not\s+found/i,
      /missing\s+base\s*url/i,
      /no\s+target\s+environment\s+configured/i,
      /invalid\s+environment\s+url/i,
      /ENVIRONMENT_NOT_FOUND/i,
    ];

    if (missingPatterns.some(p => p.test(errorText))) {
      return {
        matched: true,
        explanation:
          'The required project environment configuration or base URL was missing, preventing valid execution.',
        supportingEvidence: [
          `Environment configuration missing from execution context.`,
          `Error: ${ctx.errorMessage ?? 'Missing environment configuration'}`,
        ],
        signalStrength: 'DEFINITIVE',
      };
    }
    return null;
  },
};

export const RULE_ENV_INCOMPATIBLE_RUNTIME_001: IDeterministicRule = {
  id: 'ENV_INCOMPATIBLE_RUNTIME_001',
  name: 'Incompatible Browser or Operating System Runtime',
  category: 'ENVIRONMENT_FAILURE',
  subcategory: 'INCOMPATIBLE_RUNTIME',
  precedence: 320,
  evaluate: ctx => {
    const errorText = getCombinedErrorText(ctx);
    const incompatiblePatterns = [
      /unsupported\s+browser\s+engine/i,
      /browser\s+type\s+not\s+supported/i,
      /incompatible\s+runtime/i,
      /REPRODUCTION_ENVIRONMENT_INCOMPATIBLE/i,
    ];

    const reproductionIncompatible = ctx.reproductionAttempts.some(
      a => a.environmentEquivalence === 'INCOMPATIBLE',
    );

    if (reproductionIncompatible || incompatiblePatterns.some(p => p.test(errorText))) {
      return {
        matched: true,
        explanation:
          'The requested browser engine or execution environment is incompatible with the host runtime.',
        supportingEvidence: [
          reproductionIncompatible
            ? 'Phase 76 reproduction verified environment equivalence: INCOMPATIBLE'
            : `Error: ${ctx.errorMessage ?? 'Incompatible browser engine'}`,
        ],
        signalStrength: 'DEFINITIVE',
      };
    }
    return null;
  },
};

export const RULE_ENV_DEPENDENCY_UNAVAILABLE_001: IDeterministicRule = {
  id: 'ENV_DEPENDENCY_UNAVAILABLE_001',
  name: 'External Dependency or Downstream API Unavailable',
  category: 'ENVIRONMENT_FAILURE',
  subcategory: 'DEPENDENCY_UNAVAILABLE',
  precedence: 330,
  evaluate: ctx => {
    const downstreamFailures = ctx.networkErrors.filter(
      n => (n.status && n.status >= 500) || /ERR_CONNECTION_REFUSED/i.test(n.error ?? ''),
    );

    if (downstreamFailures.length > 0) {
      return {
        matched: true,
        explanation:
          'One or more required downstream services or third-party APIs failed with server errors during execution.',
        supportingEvidence: downstreamFailures.map(
          f => `Dependency request failed: ${f.url} (status: ${f.status ?? 'N/A'})`,
        ),
        signalStrength: 'STRONG',
      };
    }
    return null;
  },
};

// -----------------------------------------------------------------------------
// Precedence Tier 4 (400-499): Test-Data Failures
// -----------------------------------------------------------------------------

export const RULE_DATA_REQUIRED_FIXTURE_MISSING_001: IDeterministicRule = {
  id: 'DATA_REQUIRED_FIXTURE_MISSING_001',
  name: 'Required Test Fixture or Authentication Account Missing',
  category: 'TEST_DATA_FAILURE',
  subcategory: 'MISSING_TEST_DATA',
  precedence: 400,
  evaluate: ctx => {
    const errorText = getCombinedErrorText(ctx);
    const dataPatterns = [
      /required\s+(test\s+)?(data|fixture|seed)\s+(is\s+)?missing/i,
      /user\s+account\s+not\s+found/i,
      /fixture\s+file\s+not\s+found/i,
      /test\s+account\s+does\s+not\s+exist/i,
      /AUTH_PROFILE_NOT_FOUND|MISSING_TEST_DATA/i,
    ];

    if (dataPatterns.some(p => p.test(errorText))) {
      return {
        matched: true,
        explanation:
          'A mandatory test data fixture, user account, or dataset prerequisite was absent during execution.',
        supportingEvidence: [
          `Factual test data fixture absence detected in failure records.`,
          `Error: ${ctx.errorMessage ?? 'Required fixture missing'}`,
        ],
        signalStrength: 'DEFINITIVE',
      };
    }
    return null;
  },
};

export const RULE_DATA_PRECONDITION_FAILURE_001: IDeterministicRule = {
  id: 'DATA_PRECONDITION_FAILURE_001',
  name: 'Test Data Precondition Verification Failed',
  category: 'TEST_DATA_FAILURE',
  subcategory: 'DATA_PRECONDITION_FAILURE',
  precedence: 410,
  evaluate: ctx => {
    const errorText = getCombinedErrorText(ctx);
    const preconditionPatterns = [
      /data\s+precondition\s+failed/i,
      /precondition\s+check\s+failed/i,
      /database\s+seed\s+failed/i,
      /initial\s+state\s+invalid/i,
    ];

    if (preconditionPatterns.some(p => p.test(errorText))) {
      return {
        matched: true,
        explanation:
          'The data environment failed initial precondition verification before application actions commenced.',
        supportingEvidence: [
          `Precondition data failure detected.`,
          `Error: ${ctx.errorMessage ?? 'Precondition failed'}`,
        ],
        signalStrength: 'STRONG',
      };
    }
    return null;
  },
};

export const RULE_DATA_EXPIRED_FIXTURE_001: IDeterministicRule = {
  id: 'DATA_EXPIRED_FIXTURE_001',
  name: 'Expired Authentication Token or Expired Fixture',
  category: 'TEST_DATA_FAILURE',
  subcategory: 'EXPIRED_TEST_DATA',
  precedence: 420,
  evaluate: ctx => {
    const errorText = getCombinedErrorText(ctx);
    const expiredPatterns = [
      /token\s+(has\s+)?expired/i,
      /jwt\s+expired/i,
      /session\s+(has\s+)?expired/i,
      /fixture\s+data\s+expired/i,
    ];

    if (expiredPatterns.some(p => p.test(errorText))) {
      return {
        matched: true,
        explanation:
          'Test execution failed due to an expired authentication session token or time-sensitive data fixture.',
        supportingEvidence: [
          `Expired credentials or session token detected.`,
          `Error: ${ctx.errorMessage ?? 'Token expired'}`,
        ],
        signalStrength: 'DEFINITIVE',
      };
    }
    return null;
  },
};

// -----------------------------------------------------------------------------
// Precedence Tier 5 (500-599): Invalid Test / Requirement Ambiguity
// -----------------------------------------------------------------------------

export const RULE_TEST_INVALID_STEPS_001: IDeterministicRule = {
  id: 'TEST_INVALID_STEPS_001',
  name: 'Test Definition Has Empty or Structurally Invalid Steps',
  category: 'INVALID_TEST',
  subcategory: 'TEST_DEFINITION_INVALID',
  precedence: 500,
  evaluate: ctx => {
    if (
      ctx.evidenceCompleteness !== 'INSUFFICIENT' &&
      ctx.stepExecutions.length === 0 &&
      ctx.triggeringExecutionStatus === 'FAILED'
    ) {
      return {
        matched: true,
        explanation:
          'The test definition contained zero executable steps or violated the executable plan contract.',
        supportingEvidence: [
          `Executed steps count: 0`,
          `Triggering status: ${ctx.triggeringExecutionStatus}`,
          `Error: ${ctx.errorMessage ?? 'Test has no steps'}`,
        ],
        signalStrength: 'DEFINITIVE',
      };
    }
    return null;
  },
};

export const RULE_REQ_AMBIGUITY_DETECTED_001: IDeterministicRule = {
  id: 'REQ_AMBIGUITY_DETECTED_001',
  name: 'Flagged Requirement Conflict or Inconsistency',
  category: 'REQUIREMENT_AMBIGUITY',
  subcategory: 'REQUIREMENT_INCONSISTENCY',
  precedence: 510,
  evaluate: ctx => {
    const errorText = getCombinedErrorText(ctx);
    const ambiguityPatterns = [
      /requirement\s+conflict\s+detected/i,
      /conflicting\s+expected\s+outcomes/i,
      /requirement\s+is\s+ambiguous/i,
      /REQUIREMENT_INCONSISTENCY/i,
    ];

    if (ambiguityPatterns.some(p => p.test(errorText))) {
      return {
        matched: true,
        explanation:
          'Existing requirement intelligence records explicitly flag contradictory or unresolvable specifications for this test.',
        supportingEvidence: [
          `Requirement conflict recorded in failure context.`,
          `Error: ${ctx.errorMessage ?? 'Requirement ambiguity'}`,
        ],
        signalStrength: 'STRONG',
      };
    }
    return null;
  },
};

// -----------------------------------------------------------------------------
// Precedence Tier 6 (600-699): Application-Behavior Mismatch
// -----------------------------------------------------------------------------

export const RULE_APP_ASSERTION_MISMATCH_001: IDeterministicRule = {
  id: 'APP_ASSERTION_MISMATCH_001',
  name: 'Application Assertion Mismatch on Healthy Runtime',
  category: 'APPLICATION_FAILURE',
  subcategory: 'ASSERTION_MISMATCH',
  precedence: 600,
  evaluate: ctx => {
    // Only applies if the step executed, runtime was healthy, target reachable, and an assertion explicitly failed
    const failedAssertions = ctx.assertions.filter(a => !a.passed);
    if (failedAssertions.length === 0) {
      return null;
    }

    const firstFailed = failedAssertions[0];
    if (!firstFailed) {
      return null;
    }
    const isReproduced = ctx.reproductionAttempts.some(a => a.status === 'REPRODUCED');

    const supportingEvidence: string[] = [
      `Assertion failed: type=${firstFailed.assertionType}`,
      `Expected: ${firstFailed.expectedValue ?? 'N/A'}, Actual: ${firstFailed.actualValue ?? 'N/A'}`,
    ];

    if (isReproduced) {
      supportingEvidence.push(
        'Phase 76 reproduction confirmed identical assertion mismatch under equivalent conditions.',
      );
    }

    return {
      matched: true,
      explanation:
        'The application UI reached the asserted state, but returned an actual value that did not match the expected specification.',
      supportingEvidence,
      signalStrength: isReproduced ? 'DEFINITIVE' : 'STRONG',
    };
  },
};

export const RULE_APP_HTTP_ERROR_001: IDeterministicRule = {
  id: 'APP_HTTP_ERROR_001',
  name: 'Application Returned Internal Server Error (HTTP 500)',
  category: 'APPLICATION_FAILURE',
  subcategory: 'HTTP_ERROR_RESPONSE',
  precedence: 610,
  evaluate: ctx => {
    const errorText = getCombinedErrorText(ctx);
    const appHttp500 =
      /HTTP\s+500\s+(Internal\s+Server\s+Error)?/i.test(errorText) ||
      ctx.networkErrors.some(n => n.status === 500);

    if (appHttp500) {
      return {
        matched: true,
        explanation:
          'The application backend returned HTTP 500 Internal Server Error during user action execution.',
        supportingEvidence: [
          `Application HTTP 500 response recorded.`,
          `Error: ${ctx.errorMessage ?? 'Internal Server Error 500'}`,
        ],
        signalStrength: 'STRONG',
      };
    }
    return null;
  },
};

export const RULE_APP_CONSOLE_ERROR_001: IDeterministicRule = {
  id: 'APP_CONSOLE_ERROR_001',
  name: 'Uncaught Application Exception or Script Error in Console',
  category: 'APPLICATION_FAILURE',
  subcategory: 'APPLICATION_CONSOLE_ERROR',
  precedence: 620,
  evaluate: ctx => {
    const fatalConsoleError = ctx.consoleErrors.find(
      msg =>
        /TypeError:|ReferenceError:|SyntaxError:|Uncaught\s+exception/i.test(msg) &&
        !/playwright/i.test(msg),
    );

    if (fatalConsoleError) {
      return {
        matched: true,
        explanation:
          'Uncaught JavaScript runtime exception occurred within the application codebase during execution.',
        supportingEvidence: [`Application console error: ${fatalConsoleError.slice(0, 300)}`],
        signalStrength: 'STRONG',
      };
    }
    return null;
  },
};

export const RULE_APP_MISSING_EXPECTED_ELEMENT_001: IDeterministicRule = {
  id: 'APP_MISSING_EXPECTED_ELEMENT_001',
  name: 'Expected UI Element Missing from Valid Rendered Page',
  category: 'APPLICATION_FAILURE',
  subcategory: 'MISSING_EXPECTED_ELEMENT',
  precedence: 630,
  evaluate: ctx => {
    const errorText = getCombinedErrorText(ctx);
    const missingElementPatterns = [
      /expected\s+element\s+to\s+be\s+visible/i,
      /expected\s+element\s+to\s+contain/i,
      /element\s+visibility\s+assertion\s+failed/i,
    ];

    // Must be on an assertion, not a locator lookup timeout
    const isAssertion = ctx.assertions.some(a => !a.passed);
    if (isAssertion && missingElementPatterns.some(p => p.test(errorText))) {
      return {
        matched: true,
        explanation:
          'The application rendered the page without the expected UI elements required by the specification.',
        supportingEvidence: [
          `Assertion failed verifying expected element presence/visibility.`,
          `Error: ${ctx.errorMessage ?? 'Expected element missing'}`,
        ],
        signalStrength: 'STRONG',
      };
    }
    return null;
  },
};

// -----------------------------------------------------------------------------
// Precedence Tier 7 (700-799): UNKNOWN & INCONCLUSIVE Rules
// -----------------------------------------------------------------------------

export const RULE_UNKNOWN_INSUFFICIENT_EVIDENCE_001: IDeterministicRule = {
  id: 'UNKNOWN_INSUFFICIENT_EVIDENCE_001',
  name: 'Mandatory Execution Evidence Missing or Incomplete',
  category: 'UNKNOWN',
  subcategory: 'UNSPECIFIED_FAILURE',
  precedence: 700,
  evaluate: ctx => {
    const hasInsufficientCompleteness = ctx.evidenceCompleteness === 'INSUFFICIENT';
    const missingCoreData = !ctx.errorMessage && ctx.stepExecutions.length === 0;

    if (hasInsufficientCompleteness || missingCoreData) {
      return {
        matched: true,
        explanation:
          'Mandatory failure evidence is absent or incomplete; classification cannot be deterministically inferred.',
        supportingEvidence: [
          `Evidence completeness: ${ctx.evidenceCompleteness ?? 'UNKNOWN'}`,
          `ErrorMessage present: ${Boolean(ctx.errorMessage)}`,
          `Step records count: ${ctx.stepExecutions.length}`,
        ],
        signalStrength: 'DEFINITIVE',
      };
    }
    return null;
  },
};

export const RULE_INCONCLUSIVE_CONTRADICTORY_SIGNALS_001: IDeterministicRule = {
  id: 'INCONCLUSIVE_CONTRADICTORY_SIGNALS_001',
  name: 'Conflicting Factual Signals Across Failure Domains',
  category: 'INCONCLUSIVE',
  subcategory: 'UNSPECIFIED_FAILURE',
  precedence: 710,
  evaluate: ctx => {
    // If reproduction outcome produced a divergent outcome under drifted environment
    const driftedAttempt = ctx.reproductionAttempts.find(
      a => a.status === 'NOT_REPRODUCED' && a.environmentEquivalence === 'DRIFTED',
    );

    if (driftedAttempt) {
      return {
        matched: true,
        explanation:
          'Reproduction failed to reproduce the original failure, but the environment experienced substantial drift, resulting in inconclusive signals.',
        supportingEvidence: [
          `Reproduction attempt #${driftedAttempt.attemptNumber} outcome: NOT_REPRODUCED`,
          `Environment equivalence: DRIFTED`,
          `Contradictory evidence between original execution and drifted reproduction run.`,
        ],
        signalStrength: 'STRONG',
      };
    }
    return null;
  },
};

/**
 * Ordered registry of all deterministic classification rules sorted strictly by precedence.
 */
export const DETERMINISTIC_RULES_REGISTRY: readonly IDeterministicRule[] = [
  RULE_BLK_REPRODUCTION_BLOCKED_001,
  RULE_BLK_ANALYSIS_BLOCKED_001,
  RULE_AUTO_BROWSER_CRASH_001,
  RULE_AUTO_PLAYWRIGHT_TRANSPORT_001,
  RULE_AUTO_AMBIGUOUS_LOCATOR_001,
  RULE_AUTO_LOCATOR_NOT_FOUND_001,
  RULE_AUTO_ACTION_TIMEOUT_001,
  RULE_AUTO_ACTION_EXECUTION_ERROR_001,
  RULE_ENV_TARGET_UNREACHABLE_001,
  RULE_ENV_CONFIGURATION_MISSING_001,
  RULE_ENV_INCOMPATIBLE_RUNTIME_001,
  RULE_ENV_DEPENDENCY_UNAVAILABLE_001,
  RULE_DATA_REQUIRED_FIXTURE_MISSING_001,
  RULE_DATA_PRECONDITION_FAILURE_001,
  RULE_DATA_EXPIRED_FIXTURE_001,
  RULE_TEST_INVALID_STEPS_001,
  RULE_REQ_AMBIGUITY_DETECTED_001,
  RULE_APP_ASSERTION_MISMATCH_001,
  RULE_APP_HTTP_ERROR_001,
  RULE_APP_CONSOLE_ERROR_001,
  RULE_APP_MISSING_EXPECTED_ELEMENT_001,
  RULE_UNKNOWN_INSUFFICIENT_EVIDENCE_001,
  RULE_INCONCLUSIVE_CONTRADICTORY_SIGNALS_001,
].sort((a, b) => a.precedence - b.precedence);
