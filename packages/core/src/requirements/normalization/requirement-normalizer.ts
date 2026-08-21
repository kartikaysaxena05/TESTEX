/**
 * @file packages/core/src/requirements/normalization/requirement-normalizer.ts
 * Pure, deterministic rule-based normalizer for requirement text representation,
 * modal identification, actor extraction, condition parsing, and quantitative constraint analysis.
 *
 * CRITICAL INVARIANTS:
 * 1. PURE & DETERMINISTIC: Running 1,000 times on the same input produces identical output.
 * 2. NO PARAPHRASING: Never invents actors, numbers, SLA, or business logic not present in source text.
 * 3. NO THIRD-PARTY LLM / AI: Pure regex and rule-based linguistic decomposition.
 */

import { NORMALIZER_VERSION, NORMALIZATION_LIMITS } from './normalization-types.js';
import type {
  RequirementModality,
  RequirementConditionDto,
  RequirementConstraintDto,
  RequirementQuantitativeValueDto,
  NormalizationWarningCode,
  ConditionType,
} from '@ai-quality/contracts';

const WORD_NUMBERS: Record<string, number> = {
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
};

export interface NormalizedRequirementDraft {
  readonly normalizedText: string;
  readonly actor: string | null;
  readonly modality: RequirementModality;
  readonly negated: boolean;
  readonly action: string | null;
  readonly object: string | null;
  readonly conditions: readonly RequirementConditionDto[];
  readonly constraints: readonly RequirementConstraintDto[];
  readonly quantitativeValues: readonly RequirementQuantitativeValueDto[];
  readonly expectedOutcome: string | null;
  readonly normalizerVersion: string;
  readonly warnings: readonly NormalizationWarningCode[];
}

export class RequirementNormalizer {
  /**
   * Normalizes raw requirement text into a structured, machine-usable decomposition.
   */
  public static normalize(rawText: string): NormalizedRequirementDraft {
    const warnings: NormalizationWarningCode[] = [];

    // 1. Clean and normalize whitespace and unicode typography
    const cleanedText = this.cleanText(rawText);

    const boundedText = cleanedText.slice(0, NORMALIZATION_LIMITS.MAX_NORMALIZED_TEXT_LENGTH);

    // 2. Check for Agile User Story Pattern: "As a <role>, I want <feature> so that <benefit>"
    const userStory = this.parseUserStory(boundedText);
    if (userStory) {
      const qValues = this.extractQuantitativeValues(boundedText);
      const constraints = this.extractConstraints(boundedText, qValues);

      return {
        normalizedText: boundedText,
        actor: userStory.actor ? userStory.actor.toLowerCase() : null,
        modality: 'REQUIRED_TO',
        negated: false,
        action: userStory.action,
        object: userStory.object,
        conditions: userStory.conditions,
        constraints,
        quantitativeValues: qValues,
        expectedOutcome: userStory.expectedOutcome,
        normalizerVersion: NORMALIZER_VERSION,
        warnings,
      };
    }

    // 3. Extract leading/trailing conditions (WHEN, IF, WHILE, WHERE)
    const { conditions, remainingText } = this.extractConditions(boundedText);
    if (conditions.length > 1) {
      warnings.push('MULTIPLE_CONDITIONS');
    }

    // 4. Extract modality and negation
    const { modality, negated, preClause, postClause, hasMultipleModalities } =
      this.extractModality(remainingText);

    if (hasMultipleModalities) {
      warnings.push('MULTIPLE_MODALITIES');
    }

    // 5. Extract Actor / Subject from pre-modality clause
    const rawActor = this.extractActor(preClause);
    const actor = rawActor ? rawActor.toLowerCase() : null;
    if (!actor) {
      warnings.push('ACTOR_NOT_DETECTED');
    }

    // 6. Extract Action and Object from post-modality clause
    const { action, object, isCompound } = this.extractActionAndObject(postClause);
    if (!action) {
      warnings.push('ACTION_NOT_DETECTED');
    }
    if (isCompound) {
      warnings.push('COMPLEX_COMPOUND_REQUIREMENT');
    }

    // 7. Extract quantitative values and constraints across entire bounded text
    const quantitativeValues = this.extractQuantitativeValues(boundedText);
    const constraints = this.extractConstraints(boundedText, quantitativeValues);

    // 8. Expected outcome
    const expectedOutcome = this.extractExpectedOutcome(postClause);

    // 9. Build normalized text representation
    const normalizedText = boundedText;

    return {
      normalizedText,
      actor,
      modality,
      negated,
      action,
      object,
      conditions,
      constraints,
      quantitativeValues,
      expectedOutcome,
      normalizerVersion: NORMALIZER_VERSION,
      warnings,
    };
  }

  /**
   * Cleans text: trims, standardizes newlines, removes duplicate spaces, normalizes quotes.
   */
  private static cleanText(text: string): string {
    if (!text) return '';

    return (
      text
        // Standardize line breaks
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n')
        // Normalize smart quotes
        .replace(/[\u2018\u2019]/g, "'")
        .replace(/[\u201C\u201D]/g, '"')
        // Normalize dashes
        .replace(/[\u2013\u2014]/g, '-')
        // Collapse horizontal whitespace
        .replace(/[ \t]+/g, ' ')
        // Remove trailing and leading whitespace
        .trim()
    );
  }

  /**
   * Extracts leading/trailing conditional clauses.
   */
  private static extractConditions(text: string): {
    conditions: RequirementConditionDto[];
    remainingText: string;
  } {
    const conditions: RequirementConditionDto[] = [];
    let remainingText = text;

    // Pattern for leading condition: e.g. "If five login attempts fail, the system shall..."
    // or "When the reset token expires, the system shall..."
    // or "While an account is locked, the system shall..."
    const leadingConditionRegex =
      /^(?:(?:When|Whenever)\s+|If\s+|While\s+|Where\s+|Upon\s+|In the event that\s+)([^,;\n]+?)(?:,\s*|\s*;\s*|\s+then\s+)/i;

    const leadingMatch = text.match(leadingConditionRegex);
    if (leadingMatch && leadingMatch[0] && leadingMatch[1]) {
      const matchPrefix = leadingMatch[0].trim();
      let type: ConditionType = 'UNSPECIFIED';
      if (/^when/i.test(matchPrefix)) type = 'WHEN';
      else if (/^if/i.test(matchPrefix)) type = 'IF';
      else if (/^while/i.test(matchPrefix)) type = 'WHILE';
      else if (/^where/i.test(matchPrefix)) type = 'WHERE';

      conditions.push({
        text: leadingMatch[1].trim(),
        type,
      });

      remainingText = text.substring(leadingMatch[0].length).trim();
    }

    // Pattern for trailing condition: "...when five attempts fail"
    const trailingConditionRegex = /\s+(?:when|if|while|where|whenever)\s+([^,;\n.]+)$/i;
    const trailingMatch = remainingText.match(trailingConditionRegex);
    if (trailingMatch && trailingMatch[1]) {
      const matchPrefix = trailingMatch[0].trim();
      let type: ConditionType = 'UNSPECIFIED';
      if (/^when/i.test(matchPrefix)) type = 'WHEN';
      else if (/^if/i.test(matchPrefix)) type = 'IF';
      else if (/^while/i.test(matchPrefix)) type = 'WHILE';
      else if (/^where/i.test(matchPrefix)) type = 'WHERE';

      conditions.push({
        text: trailingMatch[1].trim(),
        type,
      });

      remainingText = remainingText.substring(0, trailingMatch.index).trim();
    }

    return { conditions, remainingText };
  }

  /**
   * Identifies modal verbs and negation.
   */
  private static extractModality(text: string): {
    modality: RequirementModality;
    negated: boolean;
    preClause: string;
    postClause: string;
    hasMultipleModalities: boolean;
  } {
    // List of modal patterns ordered by specificity
    const modalPatterns: {
      regex: RegExp;
      modality: RequirementModality;
      negated: boolean;
    }[] = [
      { regex: /\bshall\s+not\b/i, modality: 'SHALL_NOT', negated: true },
      { regex: /\bmust\s+not\b/i, modality: 'MUST_NOT', negated: true },
      { regex: /\bshall\s+never\b/i, modality: 'SHALL_NOT', negated: true },
      { regex: /\bmust\s+never\b/i, modality: 'MUST_NOT', negated: true },
      { regex: /\bcannot\b/i, modality: 'SHALL_NOT', negated: true },
      { regex: /\bcan\s+not\b/i, modality: 'SHALL_NOT', negated: true },
      { regex: /\bmay\s+not\b/i, modality: 'SHALL_NOT', negated: true },
      { regex: /\bwill\s+not\b/i, modality: 'SHALL_NOT', negated: true },
      { regex: /\bshould\s+not\b/i, modality: 'SHOULD', negated: true },
      { regex: /\bshall\b/i, modality: 'SHALL', negated: false },
      { regex: /\bmust\b/i, modality: 'MUST', negated: false },
      { regex: /\bshould\b/i, modality: 'SHOULD', negated: false },
      { regex: /\bmay\b/i, modality: 'MAY', negated: false },
      {
        regex: /\b(?:is|are)\s+required\s+to\b/i,
        modality: 'REQUIRED_TO',
        negated: false,
      },
      { regex: /\brequired\s+to\b/i, modality: 'REQUIRED_TO', negated: false },
    ];

    let firstMatch: {
      index: number;
      length: number;
      modality: RequirementModality;
      negated: boolean;
    } | null = null;
    let matchCount = 0;

    for (const pattern of modalPatterns) {
      const match = pattern.regex.exec(text);
      if (match) {
        matchCount++;
        if (!firstMatch || match.index < firstMatch.index) {
          firstMatch = {
            index: match.index,
            length: match[0].length,
            modality: pattern.modality,
            negated: pattern.negated,
          };
        }
      }
    }

    if (firstMatch) {
      const preClause = text.substring(0, firstMatch.index).trim();
      const postClause = text.substring(firstMatch.index + firstMatch.length).trim();
      return {
        modality: firstMatch.modality,
        negated: firstMatch.negated,
        preClause,
        postClause,
        hasMultipleModalities: matchCount > 1,
      };
    }

    return {
      modality: 'UNSPECIFIED',
      negated: /\bnot\b|\bnever\b|\bno\b/i.test(text),
      preClause: '',
      postClause: text,
      hasMultipleModalities: false,
    };
  }

  /**
   * Extracts actor/subject from pre-modality clause.
   */
  private static extractActor(preClause: string): string | null {
    if (!preClause) return null;

    let actor = preClause.trim();

    // Remove leading punctuation/connectors
    actor = actor.replace(/^[,;.\s]+/, '').trim();

    if (!actor) return null;

    // Clean up "The ", "An ", "A "
    const cleanedActor = actor.replace(/^(?:the|an|a)\s+/i, '').trim();

    // Check if cleaned actor is a recognized agent role or system entity
    const validActorRegex =
      /^(?:system|application|app|service|server|client|platform|api|database|user|users|registered\s+users?|admin|administrator|administrators|operator|manager|customer|employee|guest|visitor|service\s+provider|auditor|tenant|bot)\b/i;

    if (validActorRegex.test(cleanedActor) || /user|admin|system|service|client/i.test(actor)) {
      return cleanedActor;
    }

    // If it's a multi-word phrase ending with "user", "admin", "agent", "system", "service", capture it
    if (/(?:user|admin|system|service|client|manager|actor|role)$/i.test(cleanedActor)) {
      return cleanedActor;
    }

    return null;
  }

  /**
   * Extracts primary action verb and object from post-modality clause.
   */
  private static extractActionAndObject(postClause: string): {
    action: string | null;
    object: string | null;
    isCompound: boolean;
  } {
    if (!postClause) {
      return { action: null, object: null, isCompound: false };
    }

    let text = postClause.trim();

    // Check for compound action keywords like "and shall", "and must", "and create", "and validate"
    const isCompound = /\band\s+(?:shall|must|will|should|can|also|\w+s?)\b/i.test(text);

    // Remove leading "be able to"
    text = text.replace(/^be\s+able\s+to\s+/i, '');

    // Common action verbs
    const actionVerbMatch = text.match(/^([a-z]+(?:-[a-z]+)?)\s+(.*)$/i);

    if (actionVerbMatch && actionVerbMatch[1]) {
      const verb = actionVerbMatch[1].toLowerCase();
      let object = actionVerbMatch[2] ? actionVerbMatch[2].trim() : null;

      // Clean trailing punctuation from object
      if (object) {
        object = object.replace(/[.;,]+$/, '').trim();
      }

      return {
        action: verb,
        object: object || null,
        isCompound,
      };
    }

    // Single-word action
    if (/^[a-z]+$/i.test(text)) {
      return {
        action: text.toLowerCase(),
        object: null,
        isCompound: false,
      };
    }

    return { action: null, object: text || null, isCompound };
  }

  /**
   * Deterministically extracts quantitative numbers, percentages, durations, currencies, and ranges.
   */
  private static extractQuantitativeValues(text: string): RequirementQuantitativeValueDto[] {
    const results: RequirementQuantitativeValueDto[] = [];
    const seenTexts = new Set<string>();

    // 1. Ranges: "between 8 and 64 characters", "between 1 and 100"
    const rangeRegex =
      /\bbetween\s+(\d+(?:\.\d+)?)\s+(?:and|to|-)\s+(\d+(?:\.\d+)?)(?:\s+([a-zA-Z%]+))?\b/gi;
    let match: RegExpExecArray | null;
    while ((match = rangeRegex.exec(text)) !== null) {
      const fullText = match[0];
      if (!seenTexts.has(fullText)) {
        seenTexts.add(fullText);
        results.push({
          text: fullText,
          minimum: parseFloat(match[1]!),
          maximum: parseFloat(match[2]!),
          unit: match[3]?.toLowerCase(),
          operator: 'RANGE',
        });
      }
    }

    // 2. Minimums: "at least 8 characters", "minimum of 5 attempts", "no less than 10"
    const minRegex =
      /\b(?:at\s+least|minimum(?:\s+of)?|no\s+less\s+than)\s+(\d+(?:\.\d+)?)(?:\s+([a-zA-Z%]+))?\b/gi;
    while ((match = minRegex.exec(text)) !== null) {
      const fullText = match[0];
      if (!seenTexts.has(fullText)) {
        seenTexts.add(fullText);
        const val = parseFloat(match[1]!);
        results.push({
          text: fullText,
          value: val,
          minimum: val,
          unit: match[2]?.toLowerCase(),
          operator: 'MINIMUM',
        });
      }
    }

    // 3. Maximums: "at most 5 attempts", "maximum of 5 active sessions", "maximum 5", "up to 100"
    const maxRegex =
      /\b(?:at\s+most|maximum(?:\s+of)?|no\s+more\s+than|up\s+to)\s+(\d+(?:\.\d+)?)(?:\s+([a-zA-Z%]+(?:\s+[a-zA-Z]+)?))?\b/gi;
    while ((match = maxRegex.exec(text)) !== null) {
      const fullText = match[0];
      if (!seenTexts.has(fullText)) {
        seenTexts.add(fullText);
        const val = parseFloat(match[1]!);
        results.push({
          text: fullText,
          value: val,
          maximum: val,
          unit: match[2]?.toLowerCase(),
          operator: 'MAXIMUM',
        });
      }
    }

    // 4. Within / Durations: "within 2 seconds", "within 30 minutes"
    const withinRegex =
      /\bwithin\s+(\d+(?:\.\d+)?)\s*(seconds?|minutes?|hours?|days?|ms|milliseconds?)\b/gi;
    while ((match = withinRegex.exec(text)) !== null) {
      const fullText = match[0];
      if (!seenTexts.has(fullText)) {
        seenTexts.add(fullText);
        const val = parseFloat(match[1]!);
        results.push({
          text: fullText,
          value: val,
          maximum: val,
          unit: match[2]?.toLowerCase(),
          operator: 'WITHIN',
        });
      }
    }

    // 5. Percentages: "99.9% availability", "100 percent"
    const percentRegex = /\b(\d+(?:\.\d+)?)\s*(?:%|\bpercent(?:age)?\b)/gi;
    while ((match = percentRegex.exec(text)) !== null) {
      const fullText = match[0];
      if (!seenTexts.has(fullText)) {
        seenTexts.add(fullText);
        results.push({
          text: fullText,
          value: parseFloat(match[1]!),
          unit: 'percent',
          operator: 'PERCENTAGE',
        });
      }
    }

    // 6. Currencies: "₹100,000", "$500", "€50", "100000 INR"
    const currencyRegex =
      /(?:(₹|\$|€|£|INR|USD|EUR|GBP)\s*([\d,]+(?:\.\d+)?)|([\d,]+(?:\.\d+)?)\s*(INR|USD|EUR|GBP|rupees|dollars|euros))\b/gi;
    while ((match = currencyRegex.exec(text)) !== null) {
      const fullText = match[0];
      if (!seenTexts.has(fullText)) {
        seenTexts.add(fullText);
        const rawNum = (match[2] || match[3] || '').replace(/,/g, '');
        const unit = (match[1] || match[4] || '').toUpperCase();
        if (rawNum) {
          results.push({
            text: fullText,
            value: parseFloat(rawNum),
            unit:
              unit === '₹'
                ? 'INR'
                : unit === '$'
                  ? 'USD'
                  : unit === '€'
                    ? 'EUR'
                    : unit === '£'
                      ? 'GBP'
                      : unit,
            operator: 'EQUAL',
          });
        }
      }
    }

    // 7. General number + unit or number word + unit (e.g. "five login attempts", "5 active sessions", "8 characters")
    const unitRegex =
      /\b(?:(\d+(?:\.\d+)?)|(zero|one|two|three|four|five|six|seven|eight|nine|ten))\s+(?:(?:login|failed|consecutive|active)\s+)?(attempts?|characters?|users?|files?|sessions?|tokens?|records?|requests?|items?|seconds?|minutes?|hours?|days?)\b/gi;
    while ((match = unitRegex.exec(text)) !== null) {
      const fullText = match[0];
      let alreadyCaptured = false;
      for (const seen of seenTexts) {
        if (seen.includes(fullText) || fullText.includes(seen)) {
          alreadyCaptured = true;
          break;
        }
      }
      if (!alreadyCaptured) {
        seenTexts.add(fullText);
        const val = match[1]
          ? parseFloat(match[1])
          : (WORD_NUMBERS[match[2]?.toLowerCase() ?? ''] ?? 0);
        results.push({
          text: fullText,
          value: val,
          unit: match[3]?.toLowerCase(),
          operator: 'EQUAL',
        });
      }
    }

    return results;
  }

  /**
   * Extracts constraints phrases.
   */
  private static extractConstraints(
    text: string,
    qValues: readonly RequirementQuantitativeValueDto[],
  ): RequirementConstraintDto[] {
    const constraints: RequirementConstraintDto[] = [];
    const seenTexts = new Set<string>();

    for (const q of qValues) {
      if (!seenTexts.has(q.text)) {
        seenTexts.add(q.text);
        constraints.push({ text: q.text });
      }
    }

    // Additional constraints: "before payment", "at rest", "in transit", "via HTTPS"
    const prepRegex =
      /\b(?:before|after|during|at\s+rest|in\s+transit|via\s+https|via\s+tls|using\s+[\w-]+)\b[^,;.]*/gi;
    let match: RegExpExecArray | null;
    while ((match = prepRegex.exec(text)) !== null) {
      const full = match[0].trim();
      if (full && !seenTexts.has(full) && full.length > 5) {
        seenTexts.add(full);
        constraints.push({ text: full });
      }
    }

    return constraints;
  }

  /**
   * Extracts expected outcome if present.
   */
  private static extractExpectedOutcome(postClause: string): string | null {
    if (!postClause) return null;

    // Matches outcome markers: "resulting in ...", "to prevent ...", "so that ..."
    const outcomeRegex = /\b(?:resulting\s+in|so\s+that|in\s+order\s+to)\s+([^,;.]+)/i;
    const match = postClause.match(outcomeRegex);
    if (match && match[1]) {
      return match[1].trim();
    }

    return null;
  }

  /**
   * Parses Agile User Story format.
   */
  private static parseUserStory(text: string): {
    actor: string | null;
    action: string | null;
    object: string | null;
    expectedOutcome: string | null;
    conditions: RequirementConditionDto[];
  } | null {
    const storyRegex =
      /^As\s+(?:an?|the)\s+([^,]+?),\s*I\s+(?:want|need|wish)\s+(?:to\s+)?([^,]+?)(?:,\s*|\s+)so\s+that\s+([^.]+)/i;

    const match = text.match(storyRegex);
    if (!match || !match[1] || !match[2]) {
      return null;
    }

    const actor = match[1].trim();
    const actionPart = match[2].trim();
    const outcomePart = match[3] ? match[3].trim() : null;

    // Split action into verb and object if possible
    const verbMatch = actionPart.match(/^([a-z]+)\s+(.*)$/i);
    const action = verbMatch ? actionPart : actionPart;
    const object = verbMatch && verbMatch[2] ? verbMatch[2].trim() : null;

    return {
      actor,
      action,
      object,
      expectedOutcome: outcomePart,
      conditions: [],
    };
  }
}
