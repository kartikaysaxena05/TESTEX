/**
 * @file packages/core/src/failures/impact/impact-dimension-analyzer.ts
 * Multi-dimensional impact analysis engine for defect evaluation (Phase 84).
 */

import type {
  DefectSeverityDto,
  DefectPriorityDto,
  UserImpactScopeDto,
  DataImpactDto,
  SecurityImpactDto,
  AvailabilityImpactDto,
  BlastRadiusDto,
  WorkaroundStatusDto,
  ReleaseRecommendationDto,
} from '@ai-quality/contracts';
import type { ImpactRawFacts, ImpactDimensionsEvaluation } from './impact-types.js';

export class ImpactDimensionAnalyzer {
  /**
   * Evaluates all 9 impact dimensions, release recommendation, conflicting signals, and unknown factors.
   */
  public analyze(
    facts: ImpactRawFacts,
    severity: DefectSeverityDto,
    priority: DefectPriorityDto,
  ): ImpactDimensionsEvaluation {
    const conflictingSignals: string[] = [];
    const unknownFactors: string[] = [];

    // Text corpus for heuristic pattern extraction
    const fullText = [
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

    // 1. Check Missing / Unknown Factors
    if (!facts.isReproductionAttempted) {
      unknownFactors.push('Reproduction not attempted; exact reproducibility unknown.');
    }
    if (facts.evidenceArtifactCount === 0) {
      unknownFactors.push('No diagnostic evidence artifacts attached.');
    }
    if (!facts.requirementId) {
      unknownFactors.push('No requirement linkage mapped to test case.');
    }
    if (!facts.repositoryContextAvailable) {
      unknownFactors.push('Repository code context was unavailable during analysis.');
    }

    // 2. Conflicting Signals Detection
    if (
      facts.domain &&
      ['AUTOMATION_FAILURE', 'ENVIRONMENT_FAILURE', 'TEST_DATA_FAILURE'].includes(facts.domain) &&
      (facts.aiCategory?.toUpperCase().includes('PRODUCT_BUG') ||
        facts.aiCategory?.toUpperCase().includes('APPLICATION_FAILURE'))
    ) {
      conflictingSignals.push(
        `AI categorized failure as Product Bug / Application Failure, but deterministic domain separation proved ${facts.domain}.`,
      );
    }
    if (facts.isFlaky && facts.reproductionRate === 1.0) {
      conflictingSignals.push(
        'Flakiness telemetry flagged failure as flaky, but 100% reproduction rate observed during analysis.',
      );
    }
    if (facts.requirementCriticality === 'CRITICAL' && severity === 'LOW') {
      conflictingSignals.push(
        'Requirement tier is CRITICAL, but observed defect is isolated to cosmetic/visual elements.',
      );
    }
    if (facts.releaseBlockingOverride === false && severity === 'CRITICAL') {
      conflictingSignals.push(
        'Critical defect severity detected, but explicit operator override set releaseBlocking to false.',
      );
    }

    // 3. User Impact Scope
    let userImpact: UserImpactScopeDto = 'UNKNOWN';
    let userImpactDetails = '';

    if (severity === 'NOT_APPLICABLE') {
      userImpact = 'UNKNOWN';
      userImpactDetails = 'Operational test environment failure has no direct end-user impact.';
    } else if (severity === 'UNKNOWN' && facts.evidenceArtifactCount === 0) {
      userImpact = 'UNKNOWN';
      userImpactDetails = 'Telemetry insufficient to determine impacted user population.';
    } else if (
      fullText.includes('all users') ||
      fullText.includes('system-wide') ||
      fullText.includes('service crash') ||
      fullText.includes('login broken') ||
      fullText.includes('authentication down')
    ) {
      userImpact = 'ALL_USERS';
      userImpactDetails =
        'Global service failure prevents all users from accessing or utilizing the platform.';
    } else if (
      fullText.includes('admin') ||
      fullText.includes('dashboard') ||
      fullText.includes('role')
    ) {
      userImpact = 'SPECIFIC_ROLE';
      userImpactDetails = 'Impact is constrained to administrative or privileged operator roles.';
    } else if (severity === 'LOW') {
      userImpact = 'SINGLE_USER';
      userImpactDetails =
        'Minor visual variance visible only to single user accessing specific UI view.';
    } else {
      userImpact = 'MULTIPLE_USERS';
      userImpactDetails =
        'Affects multiple users navigating through the specific impacted workflow.';
    }

    // 4. Data Impact
    let dataImpact: DataImpactDto = 'UNKNOWN';
    let dataImpactDetails = '';

    if (severity === 'NOT_APPLICABLE') {
      dataImpact = 'NO_DATA_IMPACT';
      dataImpactDetails = 'No customer or operational database records impacted.';
    } else if (
      fullText.includes('data loss') ||
      fullText.includes('record deleted permanently') ||
      fullText.includes('irreversible data loss')
    ) {
      dataImpact = 'DATA_LOSS';
      dataImpactDetails = 'Telemetry indicates permanent or irreversible loss of application data.';
    } else if (
      fullText.includes('corruption') ||
      fullText.includes('corrupt') ||
      fullText.includes('foreign key constraint')
    ) {
      dataImpact = 'DATA_CORRUPTION';
      dataImpactDetails = 'Database or session state corrupted; inconsistent records written.';
    } else if (
      fullText.includes('post') ||
      fullText.includes('put') ||
      fullText.includes('mutation') ||
      fullText.includes('failed to save')
    ) {
      dataImpact = 'FAILED_WRITE';
      dataImpactDetails =
        'Write or update request failed; transaction aborted cleanly without corrupted state.';
    } else if (
      fullText.includes('display') ||
      fullText.includes('render') ||
      fullText.includes('formatting') ||
      severity === 'LOW'
    ) {
      dataImpact = 'DISPLAY_ONLY';
      dataImpactDetails =
        'Visual display discrepancy with no modification to underlying persistence.';
    } else if (
      fullText.includes('get') ||
      fullText.includes('query') ||
      fullText.includes('read')
    ) {
      dataImpact = 'INCORRECT_READ';
      dataImpactDetails = 'Query returned incorrect or inconsistent data representation.';
    } else if (severity === 'UNKNOWN') {
      dataImpact = 'UNKNOWN';
      dataImpactDetails = 'No data integrity diagnostics available in failure telemetry.';
    } else {
      dataImpact = 'NO_DATA_IMPACT';
      dataImpactDetails = 'No data mutations or persistence corruption observed.';
    }

    // 5. Security Impact
    let securityImpact: SecurityImpactDto = 'NONE_PROVEN';
    let securityImpactDetails =
      'No security vulnerabilities, leaks, or permission bypasses identified.';

    if (severity === 'UNKNOWN' && facts.evidenceArtifactCount === 0) {
      securityImpact = 'UNKNOWN';
      securityImpactDetails = 'Insufficient telemetry to verify security posture.';
    } else if (fullText.includes('authentication bypass') || fullText.includes('unauthenticated')) {
      securityImpact = 'AUTHENTICATION_BYPASS';
      securityImpactDetails = 'Evidence indicates authentication boundary was bypassed.';
    } else if (
      fullText.includes('authorization bypass') ||
      fullText.includes('unauthorized access')
    ) {
      securityImpact = 'AUTHORIZATION_BYPASS';
      securityImpactDetails = 'Evidence indicates access control check was bypassed.';
    } else if (
      fullText.includes('privilege escalation') ||
      fullText.includes('unauthorized role')
    ) {
      securityImpact = 'PRIVILEGE_ESCALATION';
      securityImpactDetails =
        'User can elevate permissions or access privileged operator features.';
    } else if (fullText.includes('leak') || fullText.includes('credential')) {
      securityImpact = 'CREDENTIAL_LEAK';
      securityImpactDetails = 'Credentials, tokens, or secret keys exposed in telemetry.';
    } else if (fullText.includes('exposure') || fullText.includes('pii')) {
      securityImpact = 'DATA_EXPOSURE';
      securityImpactDetails = 'Sensitive customer data exposed to unauthorized scope.';
    }

    // 6. Availability Impact
    let availabilityImpact: AvailabilityImpactDto = 'NONE_AFFECTED';

    if (severity === 'UNKNOWN' && facts.evidenceArtifactCount === 0) {
      availabilityImpact = 'UNKNOWN';
    } else if (fullText.includes('system-wide outage') || fullText.includes('service crash')) {
      availabilityImpact = 'FULL_OUTAGE';
    } else if (
      fullText.includes('service unavailable') ||
      fullText.includes('503') ||
      facts.failedHttpEndpoints.some(e => e.statusCode === 503)
    ) {
      availabilityImpact = 'SERVICE_UNAVAILABLE';
    } else if (
      fullText.includes('500') ||
      fullText.includes('502') ||
      fullText.includes('endpoint failed') ||
      facts.failedHttpEndpoints.length > 0
    ) {
      availabilityImpact = 'MODULE_UNAVAILABLE';
    } else if (
      fullText.includes('timeout') ||
      fullText.includes('slow') ||
      fullText.includes('latency')
    ) {
      availabilityImpact = 'DEGRADED';
    } else {
      availabilityImpact = 'NONE_AFFECTED';
    }

    // 7. Blast Radius
    let blastRadius: BlastRadiusDto = 'UNKNOWN';

    if (severity === 'NOT_APPLICABLE') {
      blastRadius = 'SINGLE_TEST';
    } else if (availabilityImpact === 'FULL_OUTAGE' || securityImpact === 'AUTHENTICATION_BYPASS') {
      blastRadius = 'PROJECT_WIDE';
    } else if (
      fullText.includes('cross-service') ||
      fullText.includes('microservice') ||
      fullText.includes('event bus')
    ) {
      blastRadius = 'MULTIPLE_MODULES';
    } else if (
      availabilityImpact === 'SERVICE_UNAVAILABLE' ||
      availabilityImpact === 'MODULE_UNAVAILABLE'
    ) {
      blastRadius = 'SINGLE_MODULE';
    } else if (severity === 'HIGH') {
      blastRadius = 'SINGLE_FEATURE';
    } else if (severity === 'LOW' || severity === 'MEDIUM') {
      blastRadius = 'SINGLE_FEATURE';
    } else if (severity === 'UNKNOWN') {
      blastRadius = 'UNKNOWN';
    } else {
      blastRadius = 'SINGLE_MODULE';
    }

    // 8. Workaround Status
    let workaroundStatus: WorkaroundStatusDto = 'UNKNOWN';
    let workaroundDetails = '';

    if (severity === 'NOT_APPLICABLE' || severity === 'LOW') {
      workaroundStatus = 'WORKAROUND_AVAILABLE';
      workaroundDetails =
        'Core functions remain intact; standard workaround or retry is available.';
    } else if (availabilityImpact === 'FULL_OUTAGE' || dataImpact === 'DATA_LOSS') {
      workaroundStatus = 'NO_WORKAROUND';
      workaroundDetails =
        'Service is completely down or data is permanently lost; no user workaround exists.';
    } else if (
      fullText.includes('workaround') ||
      fullText.includes('retry') ||
      fullText.includes('fallback')
    ) {
      workaroundStatus = 'WORKAROUND_AVAILABLE';
      workaroundDetails = 'Users can retry request or use secondary workflow path.';
    } else if (severity === 'HIGH' || severity === 'CRITICAL') {
      workaroundStatus = 'NO_WORKAROUND';
      workaroundDetails =
        'No verified workaround identified in test telemetry for blocked workflow.';
    } else if (severity === 'MEDIUM') {
      workaroundStatus = 'WORKAROUND_PARTIAL';
      workaroundDetails =
        'Non-trivial manual steps required by user to partially recover application state.';
    }

    // 9. Functional and Business Impact descriptions
    const functionalImpact =
      severity === 'NOT_APPLICABLE'
        ? `Test automation or environment failure (${facts.domain || 'Operational'}). Production functionality unaffected.`
        : severity === 'UNKNOWN'
          ? 'Unknown functional impact due to missing diagnostic telemetry.'
          : `Defect impairs ${facts.testCaseTitle || 'specified workflow'} in ${facts.technicalLayer || 'application'} layer.`;

    const businessImpact =
      severity === 'NOT_APPLICABLE'
        ? 'Zero direct customer revenue impact; operational CI/CD pipeline cycle overhead only.'
        : severity === 'CRITICAL'
          ? 'Direct revenue block, severe security risk, or total user abandonment on critical capability.'
          : severity === 'HIGH'
            ? 'Major degradation to customer experience and critical path conversion.'
            : severity === 'LOW'
              ? 'Negligible business impact; minor cosmetic brand friction.'
              : 'Moderate business friction; secondary feature unavailable.';

    const businessCriticality =
      facts.requirementCriticality ||
      (facts.testCasePriority === 'CRITICAL'
        ? 'CRITICAL'
        : facts.testCasePriority === 'HIGH'
          ? 'HIGH'
          : 'STANDARD');

    // 10. Release Recommendation
    let releaseRecommendation: ReleaseRecommendationDto = 'NON_BLOCKING';
    let releaseRecommendationRationale = '';

    if (facts.releaseBlockingOverride === true) {
      releaseRecommendation = 'BLOCK_RELEASE';
      releaseRecommendationRationale = 'Explicit release-blocking operator override is active.';
    } else if (facts.releaseBlockingOverride === false) {
      releaseRecommendation = 'NON_BLOCKING';
      releaseRecommendationRationale = 'Explicit non-blocking operator override is active.';
    } else if (severity === 'CRITICAL' || priority === 'P0_IMMEDIATE') {
      releaseRecommendation = 'BLOCK_RELEASE';
      releaseRecommendationRationale =
        'Critical severity defect or P0 immediate blocker prevents release certification.';
    } else if (severity === 'HIGH' || priority === 'P1_URGENT') {
      if (workaroundStatus === 'NO_WORKAROUND') {
        releaseRecommendation = 'BLOCK_RELEASE';
        releaseRecommendationRationale =
          'High severity defect without viable workaround blocks release candidate promotion.';
      } else {
        releaseRecommendation = 'REVIEW_REQUIRED';
        releaseRecommendationRationale =
          'Urgent defect requires engineering lead review and risk acceptance before release.';
      }
    } else if (severity === 'UNKNOWN' && priority === 'UNKNOWN') {
      releaseRecommendation = 'UNKNOWN';
      releaseRecommendationRationale =
        'Defect impact and priority cannot be reliably certified due to insufficient evidence.';
    } else if (severity === 'MEDIUM') {
      releaseRecommendation = 'REVIEW_REQUIRED';
      releaseRecommendationRationale =
        'Moderate defect impact requires standard triage confirmation prior to release deployment.';
    } else {
      releaseRecommendation = 'NON_BLOCKING';
      releaseRecommendationRationale =
        'Defect is low impact or operational-only; safe to proceed with release.';
    }

    return {
      userImpact,
      userImpactDetails,
      functionalImpact,
      businessImpact,
      businessCriticality,
      dataImpact,
      dataImpactDetails,
      securityImpact,
      securityImpactDetails,
      availabilityImpact,
      integrationImpact:
        facts.failedHttpEndpoints.length > 0
          ? `Impacts ${facts.failedHttpEndpoints.length} external/internal HTTP integration endpoints.`
          : 'No integration dependencies impacted.',
      blastRadius,
      workaroundStatus,
      workaroundDetails,
      releaseRecommendation,
      releaseRecommendationRationale,
      conflictingSignals,
      unknownFactors,
    };
  }
}
