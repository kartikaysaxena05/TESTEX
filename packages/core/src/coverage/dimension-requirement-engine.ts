/**
 * @file packages/core/src/coverage/dimension-requirement-engine.ts
 * Engine for determining required test design dimensions for a requirement.
 * Combines Phase 48 Test Design Intelligence with deterministic heuristics so non-quantitative
 * requirements are not penalized for lacking boundary tests.
 */

import type { CoverageDimension } from '@ai-quality/contracts';

interface RequirementInputContext {
  readonly title: string;
  readonly originalText: string;
  readonly normalizedText?: string | null;
  readonly category?: string | null;
}

export interface TestDesignPlanContext {
  readonly structuredDesign?: {
    readonly recommendedDimensions?: readonly {
      readonly dimension: string;
      readonly applicable: boolean;
    }[];
    readonly identifiedConstraints?: readonly {
      readonly constraintType: string;
    }[];
  } | null;
  readonly recommendedDimensions?: readonly {
    readonly dimension: string;
    readonly applicable: boolean;
  }[];
  readonly identifiedConstraints?: readonly {
    readonly constraintType: string;
  }[];
}

const NEGATIVE_PATTERNS =
  /\b(?:shall not|must not|cannot|should not|reject|invalid|unauthorized|forbidden|fail|error|denied|prevent|prohibit|disallow|illegal)\b/i;

const BOUNDARY_PATTERNS =
  /\b(?:between\s+\d+|at\s+least\s+\d+|minimum\s+of|maximum\s+of|exceeds?\s+\d+|\d+\s*to\s*\d+|\d+\s*-\s*\d+|limit\s+of\s+\d+|length\s+of|timeout\s+of|capacity\s+of|\d+\s*(?:characters?|chars?|items?|seconds?|mins?|minutes?|days?|bytes?|mb|gb|attempts?|retries?))\b/i;

const VALIDATION_PATTERNS =
  /\b(?:valid\s+(?:format|email|url|uri|phone|uuid|ip|date|json|regex)|alphanumeric|must\s+match|required\s+field|mandatory\s+field|pattern\s+match|format\s+validation)\b/i;

const SECURITY_PATTERNS =
  /\b(?:password|token|jwt|auth|authenticate|authentication|authorize|authorization|encrypt|decrypt|permission|role|rbac|oauth|session|credentials|secret|hash)\b/i;

export function deriveRequiredDimensions(
  requirement: RequirementInputContext,
  testDesignPlan?: TestDesignPlanContext | null,
): readonly CoverageDimension[] {
  const dimensions = new Set<CoverageDimension>();

  const structured = (testDesignPlan?.structuredDesign ?? testDesignPlan) as {
    recommendedDimensions?: readonly { dimension: string; applicable: boolean }[];
    identifiedConstraints?: readonly { constraintType: string }[];
  } | null;

  // 1. If Phase 48 Test Design Plan exists, consume its structured recommendations
  if (structured?.recommendedDimensions) {
    for (const rec of structured.recommendedDimensions) {
      if (rec.applicable) {
        const dimUpper = rec.dimension.toUpperCase();
        if (
          dimUpper === 'POSITIVE' ||
          dimUpper === 'NEGATIVE' ||
          dimUpper === 'BOUNDARY' ||
          dimUpper === 'VALIDATION' ||
          dimUpper === 'SECURITY' ||
          dimUpper === 'PERFORMANCE' ||
          dimUpper === 'ACCESSIBILITY' ||
          dimUpper === 'COMPATIBILITY' ||
          dimUpper === 'BUSINESS_RULE'
        ) {
          dimensions.add(dimUpper as CoverageDimension);
        } else if (dimUpper === 'FUNCTIONAL') {
          dimensions.add('POSITIVE');
        } else if (dimUpper === 'INPUT_VALIDATION') {
          dimensions.add('VALIDATION');
        } else if (dimUpper === 'AUTHENTICATION' || dimUpper === 'AUTHORIZATION') {
          dimensions.add('SECURITY');
        }
      }
    }

    if (structured.identifiedConstraints && structured.identifiedConstraints.length > 0) {
      dimensions.add('BOUNDARY');
    }
  }

  // 2. Deterministic heuristics based on requirement content
  const combinedText = `${requirement.title} ${requirement.originalText} ${requirement.normalizedText ?? ''}`;

  // Default: All testable functional requirements need at least POSITIVE behavior
  if (dimensions.size === 0) {
    dimensions.add('POSITIVE');
  }

  // Negative dimension
  if (NEGATIVE_PATTERNS.test(combinedText)) {
    dimensions.add('NEGATIVE');
  }

  // Boundary dimension (ONLY when quantitative / range / count constraints exist)
  if (BOUNDARY_PATTERNS.test(combinedText)) {
    dimensions.add('BOUNDARY');
  }

  // Validation dimension
  if (VALIDATION_PATTERNS.test(combinedText)) {
    dimensions.add('VALIDATION');
  }

  // Security dimension
  if (SECURITY_PATTERNS.test(combinedText)) {
    dimensions.add('SECURITY');
  }

  return Array.from(dimensions);
}
