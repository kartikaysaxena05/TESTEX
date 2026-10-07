/**
 * @file packages/core/src/failures/localization/technical-cause-localizer.ts
 * Deterministic rules engine correlating failure evidence to localize technical layers and targets.
 */

import type {
  TechnicalLayer,
  LocalizationTargetType,
  CorrelationSignalDto,
  SecondaryTargetDto,
  TimelineEventDto,
} from '@ai-quality/contracts';
import type { TechnicalLocalizationFacts, LocalizationResult } from './localization-types.js';
import type { StepNetworkCorrelationResult } from './step-network-correlator.js';
import type { RepositoryRouteLinker, RepositoryLinkResult } from './repository-route-linker.js';

export class TechnicalCauseLocalizer {
  constructor(private readonly routeLinker: RepositoryRouteLinker) {}

  /**
   * Evaluates all facts, timeline, network correlation, and repository linkages
   * to deterministically localize the technical cause.
   */
  public localize(
    facts: TechnicalLocalizationFacts,
    timeline: readonly TimelineEventDto[],
    networkCorrelation: StepNetworkCorrelationResult,
  ): LocalizationResult {
    const signals: CorrelationSignalDto[] = [];
    const conflictingSignals: CorrelationSignalDto[] = [];
    const secondaryTargets: SecondaryTargetDto[] = [];
    const secondaryLayers = new Set<TechnicalLayer>();
    const evidenceReferences = facts.evidenceItems.map(e => e.id);

    let primaryLayer: TechnicalLayer = 'UNKNOWN';
    let primaryTargetType: LocalizationTargetType = 'TEST_STEP';
    let primaryTargetIdentifier =
      facts.stepIndex !== null && facts.stepIndex !== undefined
        ? `step_${facts.stepIndex}`
        : 'test_step';
    let rationale = '';

    let matchedRepoLink: RepositoryLinkResult | null = null;
    let httpEndpoint: string | null = null;
    let httpMethod: string | null = null;
    let httpStatusCode: number | null = null;
    let domSelector: string | null = null;
    let uiComponentName: string | null = null;
    let routePath: string | null = null;

    const navStep = facts.steps.find(s => s.actionType === 'NAVIGATE' && s.actionValue);
    if (navStep?.actionValue) {
      try {
        const parsedUrl = new URL(navStep.actionValue);
        routePath = parsedUrl.pathname;
      } catch {
        routePath = navStep.actionValue.startsWith('/') ? navStep.actionValue : null;
      }
    }

    const domain = facts.domainSeparation?.domain;

    // --------------------------------------------------------------------------
    // 1. DOMAIN BOUNDARY GUARD: Inherit constraints from Phase 80
    // --------------------------------------------------------------------------
    if (domain === 'AUTOMATION_FAILURE') {
      const isLocatorFailure =
        facts.errorMessage?.toLowerCase().includes('locator') ||
        facts.errorMessage?.toLowerCase().includes('selector') ||
        facts.errorMessage?.toLowerCase().includes('waiting for');

      if (isLocatorFailure) {
        primaryLayer = 'BROWSER_AUTOMATION';
        primaryTargetType = 'DOM_ELEMENT';
        primaryTargetIdentifier = facts.failedStepTarget || 'unresolved_element';
        domSelector = facts.failedStepTarget ?? null;
        rationale = `Failure localized to BROWSER_AUTOMATION: Locator targeting failed on selector "${primaryTargetIdentifier}". Verified by Phase 80 domain separation.`;
      } else {
        primaryLayer = 'TEST_INFRASTRUCTURE';
        primaryTargetType = 'BROWSER_SUBSYSTEM';
        primaryTargetIdentifier = 'playwright_browser_runner';
        rationale =
          'Failure localized to TEST_INFRASTRUCTURE: Browser worker or execution runner failure verified by Phase 80.';
      }

      signals.push({
        signalId: `sig_${String(signals.length + 1).padStart(3, '0')}`,
        signalType: 'AUTHORITATIVE_AUTOMATION_DOMAIN',
        technicalLayer: primaryLayer,
        targetType: primaryTargetType,
        targetIdentity: primaryTargetIdentifier,
        sourceEvidenceKey: facts.domainSeparation?.id ?? facts.failureCaseId,
        stepIndex: facts.stepIndex ?? undefined,
        strength: 'DIRECT',
        explanation: rationale,
      });

      return {
        primaryLayer,
        secondaryLayers: Array.from(secondaryLayers),
        primaryTargetType,
        primaryTargetIdentifier,
        secondaryTargets,
        domSelector,
        timelineSummary: timeline,
        correlationSignals: signals,
        conflictingSignals,
        localizationRationale: rationale,
        evidenceReferences,
      };
    }

    if (domain === 'TEST_DATA_FAILURE') {
      primaryLayer = 'TEST_DATA';
      primaryTargetType = 'TEST_STEP';
      primaryTargetIdentifier =
        facts.failedStepValue || facts.failedStepTarget || `step_${facts.stepIndex ?? 0}`;
      rationale =
        'Failure localized to TEST_DATA: Fixture, test account, or dynamic data state inconsistency verified by Phase 80.';

      signals.push({
        signalId: `sig_${String(signals.length + 1).padStart(3, '0')}`,
        signalType: 'TEST_DATA_MISMATCH',
        technicalLayer: 'TEST_DATA',
        targetType: primaryTargetType,
        targetIdentity: primaryTargetIdentifier,
        sourceEvidenceKey: facts.domainSeparation?.id ?? facts.failureCaseId,
        stepIndex: facts.stepIndex ?? undefined,
        strength: 'DIRECT',
        explanation: rationale,
      });

      return {
        primaryLayer,
        secondaryLayers: Array.from(secondaryLayers),
        primaryTargetType,
        primaryTargetIdentifier,
        secondaryTargets,
        timelineSummary: timeline,
        correlationSignals: signals,
        conflictingSignals,
        localizationRationale: rationale,
        evidenceReferences,
      };
    }

    if (domain === 'ENVIRONMENT_FAILURE') {
      primaryLayer = 'ENVIRONMENT';
      primaryTargetType = 'ENVIRONMENT_DEPENDENCY';
      primaryTargetIdentifier =
        facts.domainSeparation?.domainSubreason || 'target_host_unreachable';
      rationale = `Failure localized to ENVIRONMENT: Unreachable infrastructure or environmental dependency (${primaryTargetIdentifier}) verified by Phase 80.`;

      signals.push({
        signalId: `sig_${String(signals.length + 1).padStart(3, '0')}`,
        signalType: 'ENVIRONMENT_UNAVAILABLE',
        technicalLayer: 'ENVIRONMENT',
        targetType: primaryTargetType,
        targetIdentity: primaryTargetIdentifier,
        sourceEvidenceKey: facts.domainSeparation?.id ?? facts.failureCaseId,
        strength: 'DIRECT',
        explanation: rationale,
      });

      return {
        primaryLayer,
        secondaryLayers: Array.from(secondaryLayers),
        primaryTargetType,
        primaryTargetIdentifier,
        secondaryTargets,
        timelineSummary: timeline,
        correlationSignals: signals,
        conflictingSignals,
        localizationRationale: rationale,
        evidenceReferences,
      };
    }

    // --------------------------------------------------------------------------
    // 2. APPLICATION DEFECT CANDIDATE LOCALIZATION (Multi-Modal Correlation)
    // --------------------------------------------------------------------------

    // A. Check for Database Errors in responses / console / logs
    const errorString =
      `${facts.errorMessage || ''} ${facts.failureSummary || ''} ${JSON.stringify(facts.evidenceItems.map(e => e.metadataJson))}`.toLowerCase();
    const isDatabaseError =
      errorString.includes('prisma') ||
      errorString.includes('postgresql') ||
      errorString.includes('unique constraint') ||
      errorString.includes('foreign key constraint') ||
      errorString.includes('syntax error at or near') ||
      errorString.includes('deadlock') ||
      errorString.includes('database error') ||
      errorString.includes('table or view not found');

    if (isDatabaseError) {
      primaryLayer = 'DATABASE';
      primaryTargetType = 'DATABASE_OPERATION';
      primaryTargetIdentifier = errorString.includes('unique constraint')
        ? 'unique_constraint_violation'
        : errorString.includes('foreign key')
          ? 'foreign_key_violation'
          : 'database_query_error';

      secondaryLayers.add('BACKEND_SERVICE');
      secondaryLayers.add('BACKEND_API');
      rationale = `Failure localized to DATABASE layer: Database operation failed (${primaryTargetIdentifier}).`;

      signals.push({
        signalId: `sig_${String(signals.length + 1).padStart(3, '0')}`,
        signalType: 'DATABASE_EXCEPTION_EVIDENCE',
        technicalLayer: 'DATABASE',
        targetType: 'DATABASE_OPERATION',
        targetIdentity: primaryTargetIdentifier,
        sourceEvidenceKey: facts.failureCaseId,
        strength: 'DIRECT',
        explanation: 'Database constraint or query exception detected in execution error context.',
      });

      // Also link any failed HTTP endpoint if present
      if (networkCorrelation.primaryFailedRequest) {
        httpEndpoint = networkCorrelation.primaryFailedRequest.url;
        httpMethod = networkCorrelation.primaryFailedRequest.method;
        httpStatusCode = networkCorrelation.primaryFailedRequest.statusCode ?? 500;
        secondaryTargets.push({
          targetType: 'API_ENDPOINT',
          identifier: `${httpMethod} ${httpEndpoint}`,
          explanation: `HTTP ${httpStatusCode} returned from API due to underlying database failure.`,
        });
        matchedRepoLink = this.routeLinker.linkTarget(facts, httpEndpoint, 'API_ENDPOINT');
      }
    }

    // B. Check for Authentication / Authorization Rejections
    else if (
      networkCorrelation.primaryFailedRequest?.isAuthError ||
      errorString.includes('401') ||
      errorString.includes('403') ||
      errorString.includes('unauthorized') ||
      errorString.includes('jwt expired')
    ) {
      const statusCode = networkCorrelation.primaryFailedRequest?.statusCode;
      const is403 =
        statusCode === 403 ||
        errorString.includes('forbidden') ||
        errorString.includes('access denied');

      primaryLayer = is403 ? 'AUTHORIZATION' : 'AUTHENTICATION';
      primaryTargetType = 'API_ENDPOINT';
      httpEndpoint = networkCorrelation.primaryFailedRequest?.url || '/api/auth';
      httpMethod = networkCorrelation.primaryFailedRequest?.method || 'POST';
      httpStatusCode = statusCode ?? (is403 ? 403 : 401);
      primaryTargetIdentifier = `${httpMethod} ${httpEndpoint}`;

      rationale = `Failure localized to ${primaryLayer}: Request rejected with HTTP ${httpStatusCode} on endpoint "${httpEndpoint}".`;

      signals.push({
        signalId: `sig_${String(signals.length + 1).padStart(3, '0')}`,
        signalType: is403 ? 'AUTHORIZATION_DENIED' : 'AUTHENTICATION_REQUIRED',
        technicalLayer: primaryLayer,
        targetType: 'API_ENDPOINT',
        targetIdentity: primaryTargetIdentifier,
        sourceEvidenceKey: facts.failureCaseId,
        networkRequestId: httpEndpoint,
        strength: 'DIRECT',
        explanation: `Endpoint returned HTTP ${httpStatusCode} during step execution.`,
      });

      matchedRepoLink = this.routeLinker.linkTarget(facts, httpEndpoint, 'API_ENDPOINT');
    }

    // C. Check for Backend Server Error (HTTP 5xx)
    else if (networkCorrelation.primaryFailedRequest?.isServerError) {
      primaryLayer = 'BACKEND_API';
      primaryTargetType = 'API_ENDPOINT';
      httpEndpoint = networkCorrelation.primaryFailedRequest.url;
      httpMethod = networkCorrelation.primaryFailedRequest.method;
      httpStatusCode = networkCorrelation.primaryFailedRequest.statusCode ?? 500;
      primaryTargetIdentifier = `${httpMethod} ${httpEndpoint}`;

      secondaryLayers.add('BACKEND_SERVICE');
      secondaryLayers.add('FRONTEND_NETWORK_CLIENT');
      rationale = `Failure localized to BACKEND_API: Server returned HTTP ${httpStatusCode} for "${primaryTargetIdentifier}".`;

      signals.push({
        signalId: `sig_${String(signals.length + 1).padStart(3, '0')}`,
        signalType: 'HTTP_5XX_SERVER_ERROR',
        technicalLayer: 'BACKEND_API',
        targetType: 'API_ENDPOINT',
        targetIdentity: primaryTargetIdentifier,
        sourceEvidenceKey: facts.failureCaseId,
        networkRequestId: httpEndpoint,
        stepIndex: networkCorrelation.primaryFailedRequest.stepIndex,
        strength: 'DIRECT',
        explanation: `Correlated network request ${primaryTargetIdentifier} failed with status ${httpStatusCode}.`,
      });

      matchedRepoLink = this.routeLinker.linkTarget(facts, httpEndpoint, 'API_ENDPOINT');
    }

    // D. Check for Client-Side Uncaught JavaScript Error in Console
    else {
      const consoleErrorEvents = timeline.filter(e => e.eventType === 'CONSOLE_ERROR');
      const criticalJsError = consoleErrorEvents.find(e => {
        const msg = String(e.summary).toLowerCase();
        return (
          msg.includes('typeerror') ||
          msg.includes('referenceerror') ||
          msg.includes('uncaught') ||
          msg.includes('cannot read propert')
        );
      });

      if (criticalJsError) {
        primaryLayer = 'FRONTEND_STATE';
        primaryTargetType = 'FRONTEND_COMPONENT';
        primaryTargetIdentifier = facts.failedStepTarget || 'ReactComponent';
        uiComponentName = primaryTargetIdentifier;
        secondaryLayers.add('FRONTEND_UI');

        rationale = `Failure localized to FRONTEND_STATE: Uncaught client-side JavaScript error: ${criticalJsError.summary}.`;

        signals.push({
          signalId: `sig_${String(signals.length + 1).padStart(3, '0')}`,
          signalType: 'CLIENT_SCRIPT_EXCEPTION',
          technicalLayer: 'FRONTEND_STATE',
          targetType: 'FRONTEND_COMPONENT',
          targetIdentity: primaryTargetIdentifier,
          sourceEvidenceKey: criticalJsError.evidenceArtifactId || facts.failureCaseId,
          stepIndex: criticalJsError.stepIndex,
          strength: 'DIRECT',
          explanation: criticalJsError.summary,
        });

        matchedRepoLink = this.routeLinker.linkTarget(
          facts,
          primaryTargetIdentifier,
          'UI_COMPONENT',
        );
      }

      // E. Check for Assertion Failure on UI Content / Visual state
      else if (facts.steps.some(s => s.status === 'FAILED' && s.actionType === 'ASSERT')) {
        const failedAssert = facts.steps.find(
          s => s.status === 'FAILED' && s.actionType === 'ASSERT',
        )!;
        primaryLayer = 'FRONTEND_UI';
        primaryTargetType = 'ASSERTION';
        primaryTargetIdentifier = failedAssert.targetLocator || `step_${failedAssert.stepIndex}`;
        domSelector = failedAssert.targetLocator ?? null;

        rationale = `Failure localized to FRONTEND_UI: Assertion failed on target "${primaryTargetIdentifier}". (${failedAssert.errorMessage || 'Assertion mismatch'})`;

        signals.push({
          signalId: `sig_${String(signals.length + 1).padStart(3, '0')}`,
          signalType: 'UI_ASSERTION_MISMATCH',
          technicalLayer: 'FRONTEND_UI',
          targetType: 'ASSERTION',
          targetIdentity: primaryTargetIdentifier,
          sourceEvidenceKey: failedAssert.id,
          stepIndex: failedAssert.stepIndex,
          strength: 'DIRECT',
          explanation: failedAssert.errorMessage || 'Step assertion mismatch',
        });

        if (domSelector) {
          matchedRepoLink = this.routeLinker.linkTarget(facts, domSelector, 'UI_COMPONENT');
        }
      }

      // F. Fallback if no specific signal matched
      else {
        primaryLayer = 'FRONTEND_UI';
        primaryTargetType = facts.failedStepTarget ? 'DOM_ELEMENT' : 'TEST_STEP';
        primaryTargetIdentifier =
          facts.failedStepTarget ||
          (facts.stepIndex !== null && facts.stepIndex !== undefined
            ? `step_${facts.stepIndex}`
            : 'unknown_step');
        domSelector = facts.failedStepTarget ?? null;

        rationale = `Failure localized to FRONTEND_UI: Test step failed on target "${primaryTargetIdentifier}".`;

        signals.push({
          signalId: `sig_${String(signals.length + 1).padStart(3, '0')}`,
          signalType: 'STEP_EXECUTION_FAILURE',
          technicalLayer: 'FRONTEND_UI',
          targetType: primaryTargetType,
          targetIdentity: primaryTargetIdentifier,
          sourceEvidenceKey: facts.failureCaseId,
          stepIndex: facts.stepIndex ?? undefined,
          strength: 'SUPPORTING',
          explanation: facts.errorMessage || 'Step execution did not complete successfully.',
        });
      }
    }

    // --------------------------------------------------------------------------
    // 3. DETECT CONFLICTING SIGNALS
    // --------------------------------------------------------------------------
    // Check if background requests failed with 500 when failure was classified as FRONTEND_UI
    if (primaryLayer === 'FRONTEND_UI' || primaryLayer === 'FRONTEND_STATE') {
      const background500 = networkCorrelation.backgroundHttpErrors.find(r => r.isServerError);
      if (background500) {
        conflictingSignals.push({
          signalId: `conf_${String(conflictingSignals.length + 1).padStart(3, '0')}`,
          signalType: 'UNSOLICITED_BACKGROUND_HTTP_ERROR',
          technicalLayer: 'BACKEND_API',
          targetType: 'API_ENDPOINT',
          targetIdentity: `${background500.method} ${background500.url}`,
          sourceEvidenceKey: facts.failureCaseId,
          networkRequestId: background500.url,
          strength: 'WEAK',
          explanation: `A background request to "${background500.url}" returned HTTP ${background500.statusCode}, but did not directly fail the UI assertion.`,
        });
      }
    }

    // Add repository linkage signal if match found
    if (matchedRepoLink && matchedRepoLink.confidence !== 'NONE') {
      signals.push({
        signalId: `sig_${String(signals.length + 1).padStart(3, '0')}`,
        signalType: 'REPOSITORY_CODE_LINKAGE',
        technicalLayer: primaryLayer,
        targetType: matchedRepoLink.matchedSymbolName ? 'REPOSITORY_SYMBOL' : 'REPOSITORY_FILE',
        targetIdentity: matchedRepoLink.matchedFilePath ?? 'repository_file',
        sourceEvidenceKey: matchedRepoLink.repositoryFileId ?? facts.failureCaseId,
        repositoryReference: `${matchedRepoLink.matchedFilePath}${matchedRepoLink.matchedSymbolName ? `#${matchedRepoLink.matchedSymbolName}` : ''}`,
        strength: matchedRepoLink.confidence === 'EXACT' ? 'STRONG' : 'SUPPORTING',
        explanation: matchedRepoLink.explanation,
      });
    }

    return {
      primaryLayer,
      secondaryLayers: Array.from(secondaryLayers),
      primaryTargetType,
      primaryTargetIdentifier,
      secondaryTargets,
      repositoryFileId: matchedRepoLink?.repositoryFileId ?? null,
      repositorySymbolId: matchedRepoLink?.repositorySymbolId ?? null,
      matchedFilePath: matchedRepoLink?.matchedFilePath ?? null,
      matchedSymbolName: matchedRepoLink?.matchedSymbolName ?? null,
      matchedLineNumber: matchedRepoLink?.matchedLineNumber ?? null,
      httpEndpoint,
      httpMethod,
      httpStatusCode,
      domSelector,
      uiComponentName,
      routePath,
      timelineSummary: timeline,
      correlationSignals: signals,
      conflictingSignals,
      localizationRationale: rationale,
      evidenceReferences,
    };
  }
}
