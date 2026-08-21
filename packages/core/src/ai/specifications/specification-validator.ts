/**
 * @file packages/core/src/ai/specifications/specification-validator.ts
 * Deterministic grounding validator and sanitization engine for Phase 51 Test Specification Enrichment.
 */

import crypto from 'node:crypto';
import type {
  GeneratedExpectedResultDto,
  GeneratedPreconditionDto,
  GeneratedTestDataItemDto,
  GeneratedTestSpecificationDto,
  GroundingConfidence,
  TestSpecificationEnrichmentMetricsDto,
} from '@ai-quality/contracts';
import {
  SPECIFICATION_LIMITS,
  type RawTestSpecificationOutput,
  type SpecificationValidationResult,
  type TestSpecificationValidationContext,
} from './specification-types.js';

export interface RawSpecificationOutputContainer {
  readonly specifications?: readonly RawTestSpecificationOutput[];
  readonly warnings?: readonly { readonly code: string; readonly message: string }[];
}

export class TestSpecificationValidator {
  /**
   * Validates and sanitizes raw model output against authoritative context.
   */
  static validateAndSanitize(
    rawOutput: RawSpecificationOutputContainer,
    context: TestSpecificationValidationContext,
  ): SpecificationValidationResult {
    const warnings: { code: string; message: string }[] = [];
    let ungroundedEvidenceCount = 0;
    let duplicateCount = 0;

    const sanitizedSpecifications: GeneratedTestSpecificationDto[] = [];

    const specsToProcess = (rawOutput.specifications ?? []).slice(
      0,
      SPECIFICATION_LIMITS.MAX_TOTAL_SPECS,
    );

    if ((rawOutput.specifications ?? []).length > SPECIFICATION_LIMITS.MAX_TOTAL_SPECS) {
      warnings.push({
        code: 'SPECIFICATION_LIMIT_EXCEEDED',
        message: `Output exceeded maximum specification limit of ${SPECIFICATION_LIMITS.MAX_TOTAL_SPECS}. Excess specifications truncated.`,
      });
    }

    const seenSpecKeys = new Set<string>();

    for (const rawSpec of specsToProcess) {
      const specKey = (rawSpec.title ?? '').trim().toLowerCase();
      if (!specKey || seenSpecKeys.has(specKey)) {
        duplicateCount++;
        warnings.push({
          code: 'DUPLICATE_SPECIFICATION_REMOVED',
          message: `Duplicate or untitled specification '${rawSpec.title}' removed.`,
        });
        continue;
      }
      seenSpecKeys.add(specKey);

      // 1. Sanitize Preconditions
      const sanitizedPreconditions: GeneratedPreconditionDto[] = [];
      const seenPreconditions = new Set<string>();

      const rawPreconditions = (rawSpec.preconditions ?? []).slice(
        0,
        SPECIFICATION_LIMITS.MAX_PRECONDITIONS_PER_SPEC,
      );

      if ((rawSpec.preconditions ?? []).length > SPECIFICATION_LIMITS.MAX_PRECONDITIONS_PER_SPEC) {
        warnings.push({
          code: 'PRECONDITION_LIMIT_EXCEEDED',
          message: `Specification '${rawSpec.title}' exceeded maximum preconditions. Excess truncated.`,
        });
      }

      let precOrdinal = 1;
      for (const rawPrec of rawPreconditions) {
        const desc = (rawPrec.description ?? '').trim();
        if (!desc) continue;

        const normalizedDesc = desc.toLowerCase().replace(/\s+/g, ' ');
        if (seenPreconditions.has(normalizedDesc)) {
          duplicateCount++;
          continue;
        }
        seenPreconditions.add(normalizedDesc);

        // Grounding reference filtering
        const filteredRefs: string[] = [];
        for (const ref of rawPrec.sourceEvidenceRefs ?? []) {
          if (context.validEvidenceRefIds.has(ref)) {
            filteredRefs.push(ref);
          } else {
            ungroundedEvidenceCount++;
          }
        }

        if (filteredRefs.length === 0 && (rawPrec.sourceEvidenceRefs ?? []).length > 0) {
          warnings.push({
            code: 'UNGROUNDED_EVIDENCE_REF_STRIPPED',
            message: `Ungrounded evidence reference stripped from precondition '${desc.slice(0, 40)}...'.`,
          });
        }

        sanitizedPreconditions.push({
          id: crypto.randomUUID(),
          key: rawPrec.key ?? `PREC-${String(precOrdinal++).padStart(3, '0')}`,
          category: rawPrec.category ?? 'APPLICATION_STATE',
          description: desc.slice(0, SPECIFICATION_LIMITS.MAX_DESCRIPTION_LENGTH),
          confidence: (rawPrec.confidence as GroundingConfidence) ?? 'HIGH',
          sourceEvidenceRefs: filteredRefs.length > 0 ? filteredRefs : [context.requirementKey],
          reviewRequired: Boolean(rawPrec.reviewRequired),
          assumptions: (rawPrec.assumptions ?? []).slice(
            0,
            SPECIFICATION_LIMITS.MAX_ASSUMPTIONS_PER_SPEC,
          ),
        });
      }

      // 2. Sanitize Test Data Items
      const sanitizedTestData: GeneratedTestDataItemDto[] = [];
      const seenDataNames = new Set<string>();

      const rawTestData = (rawSpec.testData ?? []).slice(
        0,
        SPECIFICATION_LIMITS.MAX_TEST_DATA_PER_SPEC,
      );

      if ((rawSpec.testData ?? []).length > SPECIFICATION_LIMITS.MAX_TEST_DATA_PER_SPEC) {
        warnings.push({
          code: 'TEST_DATA_LIMIT_EXCEEDED',
          message: `Specification '${rawSpec.title}' exceeded maximum test data items. Excess truncated.`,
        });
      }

      let dataOrdinal = 1;
      for (const rawItem of rawTestData) {
        const name = (rawItem.name ?? '').trim();
        if (!name) continue;

        const normalizedName = name.toLowerCase();
        if (seenDataNames.has(normalizedName)) {
          duplicateCount++;
          continue;
        }
        seenDataNames.add(normalizedName);

        // Grounding reference filtering
        const filteredRefs: string[] = [];
        for (const ref of rawItem.sourceEvidenceRefs ?? []) {
          if (context.validEvidenceRefIds.has(ref)) {
            filteredRefs.push(ref);
          } else {
            ungroundedEvidenceCount++;
          }
        }

        const isUnknown = rawItem.origin === 'UNKNOWN';
        const isSensitive = Boolean(rawItem.isSensitive);

        sanitizedTestData.push({
          id: crypto.randomUUID(),
          key: rawItem.key ?? `DATA-${String(dataOrdinal++).padStart(3, '0')}`,
          name: name.slice(0, SPECIFICATION_LIMITS.MAX_STRING_FIELD_LENGTH),
          dataType: rawItem.dataType ?? 'STRING',
          origin: rawItem.origin ?? (isUnknown ? 'UNKNOWN' : 'GENERATED'),
          value: isUnknown ? null : (rawItem.value ?? null),
          generator: rawItem.generator ? rawItem.generator.slice(0, 512) : null,
          constraint: rawItem.constraint ? rawItem.constraint.slice(0, 1000) : null,
          isSensitive,
          unknownReason: isUnknown
            ? (rawItem.unknownReason ??
              'Parameter requirement is referenced but threshold value is unspecified in context.')
            : null,
          confidence: (rawItem.confidence as GroundingConfidence) ?? (isUnknown ? 'LOW' : 'HIGH'),
          sourceEvidenceRefs: filteredRefs.length > 0 ? filteredRefs : [context.requirementKey],
          reviewRequired: Boolean(rawItem.reviewRequired || isUnknown),
        });
      }

      // 3. Sanitize Expected Results
      const sanitizedExpectedResults: GeneratedExpectedResultDto[] = [];
      const seenExpResults = new Set<string>();

      const rawExpResults = (rawSpec.expectedResults ?? []).slice(
        0,
        SPECIFICATION_LIMITS.MAX_EXPECTED_RESULTS_PER_SPEC,
      );

      if (
        (rawSpec.expectedResults ?? []).length > SPECIFICATION_LIMITS.MAX_EXPECTED_RESULTS_PER_SPEC
      ) {
        warnings.push({
          code: 'EXPECTED_RESULT_LIMIT_EXCEEDED',
          message: `Specification '${rawSpec.title}' exceeded maximum expected results. Excess truncated.`,
        });
      }

      let expOrdinal = 1;
      for (const rawExp of rawExpResults) {
        const desc = (rawExp.description ?? '').trim();
        if (!desc) continue;

        const normalizedExp = desc.toLowerCase().replace(/\s+/g, ' ');
        if (seenExpResults.has(normalizedExp)) {
          duplicateCount++;
          continue;
        }
        seenExpResults.add(normalizedExp);

        // Grounding reference filtering
        const filteredRefs: string[] = [];
        for (const ref of rawExp.sourceEvidenceRefs ?? []) {
          if (context.validEvidenceRefIds.has(ref)) {
            filteredRefs.push(ref);
          } else {
            ungroundedEvidenceCount++;
          }
        }

        sanitizedExpectedResults.push({
          id: crypto.randomUUID(),
          key: rawExp.key ?? `EXP-${String(expOrdinal++).padStart(3, '0')}`,
          category: rawExp.category ?? 'SUCCESS',
          description: desc.slice(0, SPECIFICATION_LIMITS.MAX_DESCRIPTION_LENGTH),
          observable: rawExp.observable !== false,
          stateChange: rawExp.stateChange
            ? {
                from: rawExp.stateChange.from?.slice(0, 256) ?? null,
                to: rawExp.stateChange.to?.slice(0, 256) ?? null,
                entity: rawExp.stateChange.entity?.slice(0, 256) ?? null,
              }
            : null,
          nonChange: rawExp.nonChange
            ? {
                entity: rawExp.nonChange.entity?.slice(0, 256) ?? null,
                preservedState: rawExp.nonChange.preservedState?.slice(0, 256) ?? null,
              }
            : null,
          exactMessageExpected: rawExp.exactMessageExpected
            ? rawExp.exactMessageExpected.slice(0, 1000)
            : null,
          httpStatusExpected:
            typeof rawExp.httpStatusExpected === 'number' ? rawExp.httpStatusExpected : null,
          confidence: (rawExp.confidence as GroundingConfidence) ?? 'HIGH',
          sourceEvidenceRefs: filteredRefs.length > 0 ? filteredRefs : [context.requirementKey],
          reviewRequired: Boolean(rawExp.reviewRequired),
        });
      }

      // 4. Sanitize Assumptions and Unknowns
      const sanitizedAssumptions = (rawSpec.assumptions ?? [])
        .map((a: string) => a.trim())
        .filter(Boolean)
        .slice(0, SPECIFICATION_LIMITS.MAX_ASSUMPTIONS_PER_SPEC);

      const sanitizedUnknowns = (rawSpec.unknowns ?? [])
        .filter(
          (u: { name: string; reason: string; reviewRequired?: boolean }) => u.name && u.reason,
        )
        .slice(0, SPECIFICATION_LIMITS.MAX_UNKNOWNS_PER_SPEC)
        .map((u: { name: string; reason: string; reviewRequired?: boolean }) => ({
          name: u.name.slice(0, SPECIFICATION_LIMITS.MAX_STRING_FIELD_LENGTH),
          reason: u.reason.slice(0, 1000),
          reviewRequired: u.reviewRequired !== false,
        }));

      // Review required derivation
      const reviewReasons: string[] = [...(rawSpec.reviewReasons ?? [])];
      let reviewRequired = Boolean(rawSpec.reviewRequired);

      if (context.isNotTestable) {
        reviewRequired = true;
        reviewReasons.push('Requirement testability status is NOT_TESTABLE.');
      }

      if (sanitizedUnknowns.length > 0) {
        reviewRequired = true;
        reviewReasons.push(
          `Contains ${sanitizedUnknowns.length} unresolved unknown requirement parameter(s).`,
        );
      }

      if (sanitizedTestData.some(d => d.origin === 'UNKNOWN')) {
        reviewRequired = true;
        if (!reviewReasons.some(r => r.includes('unknown'))) {
          reviewReasons.push('Contains test data with UNKNOWN value/threshold.');
        }
      }

      if (sanitizedExpectedResults.length === 0 && !context.isNotTestable) {
        reviewRequired = true;
        reviewReasons.push('No observable expected result could be derived safely.');
      }

      // Filter specification level evidence refs
      const specFilteredRefs: string[] = [];
      for (const ref of rawSpec.sourceEvidenceRefs ?? []) {
        if (context.validEvidenceRefIds.has(ref)) {
          specFilteredRefs.push(ref);
        } else {
          ungroundedEvidenceCount++;
        }
      }

      sanitizedSpecifications.push({
        id: crypto.randomUUID(),
        scenarioId: null, // bound by service
        scenarioKey: rawSpec.scenarioKey ?? null,
        testDesignId: null,
        title: rawSpec.title.trim().slice(0, SPECIFICATION_LIMITS.MAX_STRING_FIELD_LENGTH),
        category: rawSpec.category ?? 'POSITIVE',
        preconditions: sanitizedPreconditions,
        testData: sanitizedTestData,
        expectedResults: sanitizedExpectedResults,
        assumptions: sanitizedAssumptions,
        unknowns: sanitizedUnknowns,
        confidence: (rawSpec.confidence as GroundingConfidence) ?? 'HIGH',
        reviewRequired,
        reviewReasons,
        sourceEvidenceRefs:
          specFilteredRefs.length > 0 ? specFilteredRefs : [context.requirementKey],
      });
    }

    // Compute derived metrics
    let totalPreconditions = 0;
    let totalTestDataItems = 0;
    let totalExpectedResults = 0;
    let reviewRequiredCount = 0;
    let unknownCount = 0;

    for (const spec of sanitizedSpecifications) {
      totalPreconditions += spec.preconditions.length;
      totalTestDataItems += spec.testData.length;
      totalExpectedResults += spec.expectedResults.length;
      if (spec.reviewRequired) reviewRequiredCount++;
      unknownCount +=
        spec.unknowns.length + spec.testData.filter(d => d.origin === 'UNKNOWN').length;
    }

    const metrics: TestSpecificationEnrichmentMetricsDto = {
      totalSpecifications: sanitizedSpecifications.length,
      totalPreconditions,
      totalTestDataItems,
      totalExpectedResults,
      reviewRequiredCount,
      unknownCount,
    };

    return {
      sanitizedSpecifications,
      metrics,
      warnings,
      ungroundedEvidenceCount,
      duplicateCount,
    };
  }
}
