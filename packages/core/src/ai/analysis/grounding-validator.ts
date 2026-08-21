/**
 * @file packages/core/src/ai/analysis/grounding-validator.ts
 * Validates citation IDs, checks quantitative constraint preservation, validates negation, and computes grounding summary.
 */

import type {
  RequirementInterpretationDto,
  GroundingSummaryDto,
  GroundingCitationDto,
} from '@ai-quality/contracts';

export interface ValidationResult {
  readonly validatedAnalysis: RequirementInterpretationDto;
  readonly groundingSummary: GroundingSummaryDto;
  readonly warnings: readonly string[];
}

export class GroundingValidator {
  private static readonly NEGATION_PATTERN =
    /\b(shall not|must not|should not|cannot|will not|never|do not|does not|prohibited|forbidden|neither|nor)\b/i;

  /**
   * Validates citations, quantitative preservation, and negation consistency.
   */
  public static validate(
    rawAnalysis: RequirementInterpretationDto,
    originalText: string,
    validEvidenceIds: Set<string>,
  ): ValidationResult {
    const warnings: string[] = [];
    let validCitations = 0;
    let invalidCitations = 0;
    let groundedClaims = 0;
    let unsupportedClaims = 0;

    // 1. Validate Citations against allowed Evidence IDs
    const sanitizedCitations: GroundingCitationDto[] = [];

    for (const cit of rawAnalysis.citations) {
      if (cit.evidenceId && !validEvidenceIds.has(cit.evidenceId)) {
        // Invented or ungrounded evidence ID detected
        invalidCitations++;
        unsupportedClaims++;
        warnings.push(
          `Evidence ID "${cit.evidenceId}" in claim "${cit.claimKey}" was not found in retrieved context.`,
        );
        sanitizedCitations.push({
          ...cit,
          evidenceId: null,
          supportType: 'UNSUPPORTED',
          confidence: 'LOW',
        });
      } else {
        if (cit.supportType === 'UNSUPPORTED') {
          unsupportedClaims++;
        } else {
          validCitations++;
          groundedClaims++;
        }
        sanitizedCitations.push(cit);
      }
    }

    // 2. Validate Negation Preservation
    const textHasNegation = GroundingValidator.NEGATION_PATTERN.test(originalText);
    let hasNegation = rawAnalysis.hasNegation;

    if (textHasNegation && !hasNegation) {
      warnings.push(
        'Requirement text contains negation, but model flagged hasNegation as false. Correcting to true.',
      );
      hasNegation = true;
    }

    // 3. Quantitative Constraints Check
    // Verify that numbers from original text are reflected in the structured output
    const numberMatches = originalText.match(/\b\d+(\.\d+)?\b/g);
    if (numberMatches) {
      const allAnalysisText = JSON.stringify(rawAnalysis);
      for (const num of numberMatches) {
        if (!allAnalysisText.includes(num)) {
          warnings.push(
            `Quantitative value "${num}" from original requirement text was not found in analysis output.`,
          );
        }
      }
    }

    const totalClaims = sanitizedCitations.length;

    const validatedAnalysis: RequirementInterpretationDto = {
      ...rawAnalysis,
      hasNegation,
      citations: sanitizedCitations,
    };

    const groundingSummary: GroundingSummaryDto = {
      totalClaims,
      groundedClaims,
      unsupportedClaims,
      validCitations,
      invalidCitations,
    };

    return {
      validatedAnalysis,
      groundingSummary,
      warnings,
    };
  }
}
