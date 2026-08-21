/**
 * @file packages/core/src/ai/scenarios/scenario-validator.ts
 * Domain validator for Phase 49 Scenario Generation.
 */

import type {
  GeneratedTestScenarioDto,
  ScenarioGenerationWarningDto,
  StructuredScenarioGenerationOutputDto,
} from '@ai-quality/contracts';
import { randomUUID } from 'node:crypto';
import { SCENARIO_LIMITS, type ScenarioValidationContext } from './scenario-types.js';

export interface ScenarioValidationResult {
  readonly sanitizedOutput: StructuredScenarioGenerationOutputDto;
  readonly ungroundedEvidenceCount: number;
  readonly duplicateCount: number;
  readonly warnings: readonly ScenarioGenerationWarningDto[];
}

export class ScenarioValidator {
  /**
   * Sanitizes, validates grounding, dedupes, and bounds candidate scenarios.
   */
  public static validateAndSanitize(
    rawOutput: StructuredScenarioGenerationOutputDto,
    context: ScenarioValidationContext,
  ): ScenarioValidationResult {
    const warnings: ScenarioGenerationWarningDto[] = [...(rawOutput.warnings ?? [])];
    let ungroundedEvidenceCount = 0;
    let duplicateCount = 0;

    const seenNormalizedTitles = new Set<string>();
    const seenNormalizedObjectives = new Set<string>();
    const sanitizedScenarios: GeneratedTestScenarioDto[] = [];

    const rawScenarios = Array.isArray(rawOutput.scenarios) ? rawOutput.scenarios : [];

    for (let i = 0; i < rawScenarios.length; i++) {
      if (sanitizedScenarios.length >= SCENARIO_LIMITS.MAX_SCENARIOS) {
        warnings.push({
          code: 'SCENARIO_COUNT_EXCEEDED',
          message: `Generated scenarios exceeded maximum bound of ${SCENARIO_LIMITS.MAX_SCENARIOS}. Excess items were truncated.`,
        });
        break;
      }

      const raw = rawScenarios[i];
      if (!raw || typeof raw !== 'object') {
        continue;
      }

      const title = (raw.title ?? '').trim().slice(0, SCENARIO_LIMITS.MAX_TITLE_LENGTH);
      const objective = (raw.objective ?? '').trim().slice(0, SCENARIO_LIMITS.MAX_OBJECTIVE_LENGTH);
      const rationale = (raw.rationale ?? '').trim().slice(0, SCENARIO_LIMITS.MAX_RATIONALE_LENGTH);
      const requirementAspect = (raw.requirementAspect ?? 'General Functionality')
        .trim()
        .slice(0, SCENARIO_LIMITS.MAX_ASPECT_LENGTH);

      if (!title || !objective) {
        warnings.push({
          code: 'EMPTY_SCENARIO_FIELD',
          message: `Scenario at index ${i + 1} was dropped due to missing title or objective.`,
        });
        continue;
      }

      // Normalization for duplicate detection
      const normalizedTitle = title.toLowerCase().replace(/[^a-z0-9]/g, '');
      const normalizedObjective = objective.toLowerCase().replace(/[^a-z0-9]/g, '');

      if (
        seenNormalizedTitles.has(normalizedTitle) ||
        seenNormalizedObjectives.has(normalizedObjective)
      ) {
        duplicateCount++;
        warnings.push({
          code: 'DUPLICATE_SCENARIO_DROPPED',
          message: `Duplicate scenario "${title}" was dropped.`,
          scenarioKey: raw.scenarioKey ?? `SCN-${i + 1}`,
        });
        continue;
      }

      seenNormalizedTitles.add(normalizedTitle);
      seenNormalizedObjectives.add(normalizedObjective);

      // Validate & sanitize source evidence references
      const rawEvidenceRefs = Array.isArray(raw.sourceEvidenceRefs) ? raw.sourceEvidenceRefs : [];
      const validEvidenceRefs: string[] = [];

      for (const ref of rawEvidenceRefs) {
        if (typeof ref === 'string' && ref.trim()) {
          const trimmed = ref.trim();
          if (context.validEvidenceRefIds.has(trimmed)) {
            validEvidenceRefs.push(trimmed);
          } else {
            ungroundedEvidenceCount++;
            warnings.push({
              code: 'UNGROUNDED_EVIDENCE_REF_STRIPPED',
              message: `Ungrounded evidence reference '${trimmed}' in scenario '${title}' was stripped.`,
              scenarioKey: raw.scenarioKey ?? `SCN-${i + 1}`,
            });
          }
        }
      }

      // Always include primary requirementKey if no valid refs survived
      if (validEvidenceRefs.length === 0) {
        validEvidenceRefs.push(context.requirementKey);
      }

      // Sanitize assumptions
      const rawAssumptions = Array.isArray(raw.assumptions) ? raw.assumptions : [];
      const sanitizedAssumptions: string[] = [];
      for (const a of rawAssumptions.slice(0, SCENARIO_LIMITS.MAX_ASSUMPTIONS)) {
        if (typeof a === 'string' && a.trim()) {
          sanitizedAssumptions.push(a.trim().slice(0, SCENARIO_LIMITS.MAX_ASSUMPTION_LENGTH));
        }
      }

      const scenarioKey =
        raw.scenarioKey?.trim() || `SCN-${String(sanitizedScenarios.length + 1).padStart(3, '0')}`;

      sanitizedScenarios.push({
        id: raw.id || randomUUID(),
        scenarioKey,
        title,
        objective,
        rationale: rationale || `Covers ${requirementAspect} for ${context.requirementKey}.`,
        requirementAspect,
        testLevel: typeof raw.testLevel === 'string' ? raw.testLevel.trim() : null,
        testIntent: typeof raw.testIntent === 'string' ? raw.testIntent.trim() : null,
        applicability:
          typeof raw.applicability === 'string' ? raw.applicability.trim() : 'APPLICABLE',
        assumptions: sanitizedAssumptions,
        sourceEvidenceRefs: Array.from(new Set(validEvidenceRefs)),
      });
    }

    // Sanitize global assumptions
    const rawGlobalAssumptions = Array.isArray(rawOutput.assumptions) ? rawOutput.assumptions : [];
    const sanitizedGlobalAssumptions: string[] = [];
    for (const a of rawGlobalAssumptions.slice(0, SCENARIO_LIMITS.MAX_ASSUMPTIONS)) {
      if (typeof a === 'string' && a.trim()) {
        sanitizedGlobalAssumptions.push(a.trim().slice(0, SCENARIO_LIMITS.MAX_ASSUMPTION_LENGTH));
      }
    }

    return {
      sanitizedOutput: {
        scenarios: sanitizedScenarios,
        assumptions: sanitizedGlobalAssumptions,
        warnings: warnings.slice(0, SCENARIO_LIMITS.MAX_WARNINGS),
      },
      ungroundedEvidenceCount,
      duplicateCount,
      warnings: warnings.slice(0, SCENARIO_LIMITS.MAX_WARNINGS),
    };
  }
}
