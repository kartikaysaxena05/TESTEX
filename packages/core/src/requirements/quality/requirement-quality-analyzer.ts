/**
 * @file packages/core/src/requirements/quality/requirement-quality-analyzer.ts
 * Pure deterministic rule-based analyzer for requirement quality, testability,
 * ambiguity, missing information, atomicity, and clarification generation.
 */

import type {
  RequirementTestabilityStatus,
  QualityFindingSeverity,
  QualityFindingCode,
} from '@ai-quality/contracts';
import {
  ANALYZER_VERSION,
  QUALITY_LIMITS,
  QUALITY_SCORE_WEIGHTS,
  type QualityFindingDraft,
  type QualityAnalysisDraft,
  type QualityAnalyzerInput,
} from './quality-types.js';

export class RequirementQualityAnalyzer {
  /**
   * Pure deterministic quality analysis of a requirement.
   */
  public static analyze(input: QualityAnalyzerInput): QualityAnalysisDraft {
    const text = input.originalText?.trim() ?? '';

    if (!text || text.length < 5) {
      return {
        testabilityStatus: 'UNDETERMINED',
        qualityScore: null,
        analyzerVersion: ANALYZER_VERSION,
        findings: [],
        clarificationQuestions: [],
      };
    }

    const findings: QualityFindingDraft[] = [];

    // 1. Ambiguous and/or operator
    this.detectAmbiguousAndOr(text, findings);

    // 2. Open-ended lists (etc., and so on)
    this.detectOpenEndedLists(text, findings);

    // 3. Undefined timing / vague performance
    this.detectUndefinedTiming(text, findings);

    // 4. Undefined capacity and scale
    this.detectUndefinedCapacity(text, findings);

    // 5. Vague quantities
    this.detectVagueQuantities(text, findings);

    // 6. Subjective criteria & unmeasurable quality attributes
    this.detectSubjectiveCriteria(text, findings);

    // 7. Context-aware vague qualifiers
    this.detectVagueQualifiers(text, findings);

    // 8. Modality analysis (Weak, Mixed, Optional)
    this.detectModalityIssues(text, findings);

    // 9. Missing structural details (Actor, Action, Object, Outcome, Condition)
    this.detectStructuralIssues(text, input, findings);

    // 10. Undefined & Unresolved references
    this.detectUndefinedReferences(text, findings);

    // 11. Complex negation & double negatives
    this.detectComplexNegation(text, findings);

    // 12. Compound requirements & Atomicity
    this.detectCompoundRequirements(text, input, findings);

    // 13. Unbounded superlatives & Incomplete comparisons
    this.detectSuperlativesAndComparisons(text, findings);

    // Sort findings deterministically by startOffset, then severity, then code
    const sortedFindings = this.sortAndDeduplicateFindings(findings).slice(
      0,
      QUALITY_LIMITS.MAX_FINDINGS_PER_REQ,
    );

    // Derive deterministic clarification questions from findings
    const clarificationQuestions = this.deriveClarificationQuestions(sortedFindings);

    // Derive testability status
    const testabilityStatus = this.deriveTestabilityStatus(text, input, sortedFindings);

    // Calculate deterministic quality score
    const qualityScore = this.calculateQualityScore(testabilityStatus, sortedFindings);

    return {
      testabilityStatus,
      qualityScore,
      analyzerVersion: ANALYZER_VERSION,
      findings: sortedFindings,
      clarificationQuestions,
    };
  }

  /**
   * 1. Detects ambiguous 'and/or' constructs.
   */
  private static detectAmbiguousAndOr(text: string, findings: QualityFindingDraft[]): void {
    const regex = /\band\/or\b/gi;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
      findings.push({
        code: 'AMBIGUOUS_LOGICAL_OPERATOR',
        category: 'AMBIGUITY',
        severity: 'WARNING',
        message:
          "The construct 'and/or' creates ambiguous logical conditions and branching requirements.",
        evidenceText: match[0],
        startOffset: match.index,
        endOffset: match.index + match[0].length,
        suggestedClarification:
          'Should this requirement require both conditions, either condition, or at least one?',
      });
    }
  }

  /**
   * 2. Detects open-ended list markers (etc., and so on, and more).
   */
  private static detectOpenEndedLists(text: string, findings: QualityFindingDraft[]): void {
    const patterns: { regex: RegExp; msg: string }[] = [
      {
        regex: /\betc\b\.?/gi,
        msg: "The term 'etc.' creates an open-ended specification without definite boundaries.",
      },
      {
        regex: /\band\s+so\s+on\b/gi,
        msg: "The phrase 'and so on' leaves the set of required elements undefined.",
      },
      {
        regex: /\band\s+more\b/gi,
        msg: "The phrase 'and more' leaves additional behaviors or items unspecified.",
      },
      {
        regex: /\bincluding\s+but\s+not\s+limited\s+to\b/gi,
        msg: "The phrase 'including but not limited to' leaves test verification boundaries open-ended.",
      },
    ];

    for (const p of patterns) {
      let match: RegExpExecArray | null;
      while ((match = p.regex.exec(text)) !== null) {
        findings.push({
          code: 'OPEN_ENDED_LIST',
          category: 'SPECIFICITY',
          severity: 'WARNING',
          message: p.msg,
          evidenceText: match[0],
          startOffset: match.index,
          endOffset: match.index + match[0].length,
          suggestedClarification: 'What complete, exhaustive set of items or fields is required?',
        });
      }
    }
  }

  /**
   * 3. Detects undefined timing and vague performance terms.
   */
  private static detectUndefinedTiming(text: string, findings: QualityFindingDraft[]): void {
    const patterns: { regex: RegExp; evidenceText?: string }[] = [
      { regex: /\bquickly\b/gi },
      { regex: /\bfast\b(?!\s+(?:fail|forward))/gi },
      { regex: /\breal-?time\b(?!\s*(?:clock|analytics\s+engine))/gi },
      { regex: /\bwithout\s+delay\b/gi },
      { regex: /\bin\s+a\s+timely\s+manner\b/gi },
      { regex: /\binstantaneous(?:ly)?\b/gi },
      { regex: /\bas\s+fast\s+as\s+possible\b/gi },
      { regex: /\bpromptly\b/gi },
    ];

    for (const p of patterns) {
      let match: RegExpExecArray | null;
      while ((match = p.regex.exec(text)) !== null) {
        // Exclude if followed directly by numbers/units (e.g. "fast (under 200ms)")
        const matchEnd = match.index + match[0].length;
        const following = text.slice(matchEnd, matchEnd + 25);
        if (/\b\d+\s*(?:ms|s|sec|seconds?|minutes?|hours?)\b/i.test(following)) {
          continue;
        }

        findings.push({
          code: 'UNDEFINED_TIME_CONSTRAINT',
          category: 'MEASURABILITY',
          severity: 'ERROR',
          message: `The timing term '${match[0]}' is subjective and lacks a measurable latency or duration threshold.`,
          evidenceText: match[0],
          startOffset: match.index,
          endOffset: matchEnd,
          suggestedClarification: 'What is the maximum acceptable response or processing time?',
        });
      }
    }
  }

  /**
   * 4. Detects undefined capacity, throughput, and scale.
   */
  private static detectUndefinedCapacity(text: string, findings: QualityFindingDraft[]): void {
    const patterns: { regex: RegExp; code: QualityFindingCode; msg: string; q: string }[] = [
      {
        regex: /\b(?:high|heavy|large)\s+(?:transaction\s+volume|load|throughput|traffic)\b/gi,
        code: 'UNDEFINED_CAPACITY',
        msg: 'The capacity requirement lacks specific throughput (RPS/TPS) or load metrics.',
        q: 'What transaction throughput or concurrent request rate must the system support, and over what interval?',
      },
      {
        regex:
          /\b(?:large|high)\s+number\s+of\s+(?:users|requests|clients|connections|files|records)\b/gi,
        code: 'UNDEFINED_SCALE',
        msg: 'The scale requirement does not state a concrete numeric limit or concurrency boundary.',
        q: 'What exact maximum number of concurrent users, requests, or records is required?',
      },
      {
        regex: /\b(?:at\s+scale|massive\s+scale|infinite\s+scale)\b/gi,
        code: 'UNDEFINED_SCALE',
        msg: 'The scalability expectation is unquantified.',
        q: 'What specific scaling threshold or dimensional growth criteria apply?',
      },
    ];

    for (const p of patterns) {
      let match: RegExpExecArray | null;
      while ((match = p.regex.exec(text)) !== null) {
        findings.push({
          code: p.code,
          category: 'MEASURABILITY',
          severity: 'WARNING',
          message: p.msg,
          evidenceText: match[0],
          startOffset: match.index,
          endOffset: match.index + match[0].length,
          suggestedClarification: p.q,
        });
      }
    }
  }

  /**
   * 5. Detects vague quantities.
   */
  private static detectVagueQuantities(text: string, findings: QualityFindingDraft[]): void {
    const regex = /\b(?:several|many|few|some|various|multiple)\b/gi;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
      const matchEnd = match.index + match[0].length;
      const following = text.slice(matchEnd, matchEnd + 30);

      // Check context: if following has explicit range/numbers (e.g. "multiple (2-5) items") skip
      if (/\(\s*\d+[\s\-,]+\d*\s*\)/.test(following)) {
        continue;
      }

      findings.push({
        code: 'VAGUE_QUANTITY',
        category: 'SPECIFICITY',
        severity: 'WARNING',
        message: `The quantifier '${match[0]}' represents an undefined test boundary.`,
        evidenceText: match[0],
        startOffset: match.index,
        endOffset: matchEnd,
        suggestedClarification: 'What exact quantity, range, or threshold is required?',
      });
    }
  }

  /**
   * 6. Detects subjective criteria & unmeasurable quality attributes.
   */
  private static detectSubjectiveCriteria(text: string, findings: QualityFindingDraft[]): void {
    const subjectiveTerms = [
      { regex: /\buser[- ]friendly\b/gi, term: 'user-friendly' },
      { regex: /\bintuitive\b/gi, term: 'intuitive' },
      { regex: /\bbeautiful\b/gi, term: 'beautiful' },
      { regex: /\bmodern\b/gi, term: 'modern' },
      { regex: /\bclean\b/gi, term: 'clean' },
      { regex: /\bseamless(?:ly)?\b/gi, term: 'seamless' },
      { regex: /\bdelightful\b/gi, term: 'delightful' },
      { regex: /\bstate[- ]of[- ]the[- ]art\b/gi, term: 'state-of-the-art' },
      { regex: /\brobust(?:ly)?\b/gi, term: 'robust' },
    ];

    for (const item of subjectiveTerms) {
      let match: RegExpExecArray | null;
      while ((match = item.regex.exec(text)) !== null) {
        findings.push({
          code: 'SUBJECTIVE_CRITERION',
          category: 'MEASURABILITY',
          severity: 'ERROR',
          message: `The criterion '${match[0]}' is subjective and cannot be objectively verified without measurable acceptance criteria.`,
          evidenceText: match[0],
          startOffset: match.index,
          endOffset: match.index + match[0].length,
          suggestedClarification: `What objective, measurable acceptance criteria define '${match[0]}'?`,
        });
      }
    }
  }

  /**
   * 7. Detects context-aware vague qualifiers.
   */
  private static detectVagueQualifiers(text: string, findings: QualityFindingDraft[]): void {
    const qualifiers = [
      { regex: /\beasy(?:\s+to\s+use)?\b/gi, term: 'easy' },
      { regex: /\bsimple\b/gi, term: 'simple' },
      { regex: /\bappropriate(?:ly)?\b/gi, term: 'appropriate' },
      { regex: /\badequate(?:ly)?\b/gi, term: 'adequate' },
      { regex: /\befficient(?:ly)?\b/gi, term: 'efficient' },
      { regex: /\beffective(?:ly)?\b/gi, term: 'effective' },
      { regex: /\breasonable\b/gi, term: 'reasonable' },
      { regex: /\bsufficient(?:ly)?\b/gi, term: 'sufficient' },
      { regex: /\bminimal\b(?!\s+(?:impact|viable))/gi, term: 'minimal' },
      { regex: /\bas\s+needed\b/gi, term: 'as needed' },
      { regex: /\bif\s+necessary\b/gi, term: 'if necessary' },
      { regex: /\bwhere\s+possible\b/gi, term: 'where possible' },
      { regex: /\bapproximately\b/gi, term: 'approximately' },
      { regex: /\busually\b/gi, term: 'usually' },
      { regex: /\bgenerally\b/gi, term: 'generally' },
      { regex: /\boften\b/gi, term: 'often' },
      { regex: /\bnormal\b(?!\s+(?:distribution|temperature|state))/gi, term: 'normal' },
    ];

    for (const item of qualifiers) {
      let match: RegExpExecArray | null;
      while ((match = item.regex.exec(text)) !== null) {
        const matchEnd = match.index + match[0].length;
        const preceding = text.slice(Math.max(0, match.index - 20), match.index);
        const following = text.slice(matchEnd, matchEnd + 25);

        // Context check: skip if part of precise definitions (e.g. "minimal 8 characters", "within normal operating range of 20-30C")
        if (/\b\d+\b/.test(following) || /\b\d+\b/.test(preceding)) {
          continue;
        }

        findings.push({
          code: 'VAGUE_TERM',
          category: 'AMBIGUITY',
          severity: 'WARNING',
          message: `The qualifier '${match[0]}' is ambiguous and lacks explicit verification criteria.`,
          evidenceText: match[0],
          startOffset: match.index,
          endOffset: matchEnd,
          suggestedClarification: `What specific rule or metric governs '${match[0]}'?`,
        });
      }
    }
  }

  /**
   * 8. Detects modality issues: weak modality, mixed modality, and optional behavior.
   */
  private static detectModalityIssues(text: string, findings: QualityFindingDraft[]): void {
    const weakModalities = [
      { regex: /\bshould\b/gi, term: 'should' },
      { regex: /\bcould\b/gi, term: 'could' },
      { regex: /\bmight\b/gi, term: 'might' },
      { regex: /\bpreferably\b/gi, term: 'preferably' },
      { regex: /\bideally\b/gi, term: 'ideally' },
      { regex: /\brecommended\s+to\b/gi, term: 'recommended to' },
    ];

    let hasWeak = false;
    const hasStrict = /\b(?:shall|must|required\s+to)\b/i.test(text);

    for (const w of weakModalities) {
      let match: RegExpExecArray | null;
      while ((match = w.regex.exec(text)) !== null) {
        hasWeak = true;
        findings.push({
          code: 'WEAK_MODALITY',
          category: 'CONSISTENCY',
          severity: 'WARNING',
          message: `The modal word '${match[0]}' expresses a recommendation rather than a binding requirement obligation.`,
          evidenceText: match[0],
          startOffset: match.index,
          endOffset: match.index + match[0].length,
          suggestedClarification:
            'Is this behavior mandatory (shall/must) or optional/recommended?',
        });
      }
    }

    if (hasStrict && hasWeak) {
      findings.push({
        code: 'MIXED_MODALITY',
        category: 'CONSISTENCY',
        severity: 'WARNING',
        message:
          'The requirement contains both strict (shall/must) and weak (should/could) modalities, creating inconsistent obligation levels.',
        evidenceText: null,
        startOffset: null,
        endOffset: null,
        suggestedClarification:
          'Should all obligations in this requirement share the same binding level?',
      });
    }

    // Optional behavior check (may, optional)
    const optionalRegex = /\b(?:may|can\s+optionally|is\s+optional)\b/gi;
    let optMatch: RegExpExecArray | null;
    while ((optMatch = optionalRegex.exec(text)) !== null) {
      findings.push({
        code: 'OPTIONAL_BEHAVIOR',
        category: 'CONSISTENCY',
        severity: 'INFO',
        message: `The phrase '${optMatch[0]}' specifies optional behavior.`,
        evidenceText: optMatch[0],
        startOffset: optMatch.index,
        endOffset: optMatch.index + optMatch[0].length,
        suggestedClarification:
          'Is this feature optional in all deployments or required under specific configurations?',
      });
    }
  }

  /**
   * 9. Detects structural issues (missing action, object, outcome, condition).
   */
  private static detectStructuralIssues(
    text: string,
    input: QualityAnalyzerInput,
    findings: QualityFindingDraft[],
  ): void {
    // Check undefined expected outcome (e.g. "handle the error", "process appropriately")
    const vagueOutcomeRegex =
      /\b(?:handle\s+(?:the\s+)?(?:error|failure|exception|case)|take\s+appropriate\s+action|process\s+appropriately)\b/gi;
    let outcomeMatch: RegExpExecArray | null;
    while ((outcomeMatch = vagueOutcomeRegex.exec(text)) !== null) {
      findings.push({
        code: 'UNDEFINED_EXPECTED_OUTCOME',
        category: 'COMPLETENESS',
        severity: 'ERROR',
        message: `The expected outcome '${outcomeMatch[0]}' does not define the concrete observable response or state change.`,
        evidenceText: outcomeMatch[0],
        startOffset: outcomeMatch.index,
        endOffset: outcomeMatch.index + outcomeMatch[0].length,
        suggestedClarification:
          'What observable outcome, error code, or recovery action should occur?',
      });
    }

    // Check undefined condition (e.g. "if required", "when necessary", "if applicable")
    const vagueConditionRegex =
      /\b(?:if\s+required|when\s+necessary|under\s+certain\s+conditions|if\s+applicable|as\s+appropriate)\b/gi;
    let condMatch: RegExpExecArray | null;
    while ((condMatch = vagueConditionRegex.exec(text)) !== null) {
      findings.push({
        code: 'UNDEFINED_CONDITION',
        category: 'COMPLETENESS',
        severity: 'WARNING',
        message: `The condition trigger '${condMatch[0]}' lacks an explicit, determinable rule.`,
        evidenceText: condMatch[0],
        startOffset: condMatch.index,
        endOffset: condMatch.index + condMatch[0].length,
        suggestedClarification:
          'Under what exact prerequisite conditions is this behavior required?',
      });
    }

    // Missing action check from structured input or heuristic
    const hasAction =
      input.action ||
      /\b(?:shall|must|should|may)\s+(?:not\s+)?([a-z]+)/i.test(text) ||
      /\b(?:display|show|send|receive|validate|verify|calculate|store|delete|update|create|generate|reject|allow|block|log|render|redirect|authenticate|authorize|encrypt|decrypt)\b/i.test(
        text,
      );

    if (!hasAction && text.length > 20) {
      findings.push({
        code: 'MISSING_ACTION',
        category: 'COMPLETENESS',
        severity: 'ERROR',
        message: 'No observable system action or predicate could be identified.',
        evidenceText: null,
        startOffset: null,
        endOffset: null,
        suggestedClarification: 'What specific action must the system perform?',
      });
    }
  }

  /**
   * 10. Detects undefined references (standard timeout, default config).
   */
  private static detectUndefinedReferences(text: string, findings: QualityFindingDraft[]): void {
    const regex =
      /\b(?:standard\s+timeout|default\s+(?:configuration|settings?|timeout)|appropriate\s+(?:protocol|format)|relevant\s+policy)\b/gi;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
      findings.push({
        code: 'UNDEFINED_REFERENCE',
        category: 'AMBIGUITY',
        severity: 'WARNING',
        message: `The reference '${match[0]}' is undefined and not tied to an explicit value or specification.`,
        evidenceText: match[0],
        startOffset: match.index,
        endOffset: match.index + match[0].length,
        suggestedClarification: `Which explicit value, standard, or document section defines the '${match[0]}'?`,
      });
    }
  }

  /**
   * 11. Detects complex negation and double negatives.
   */
  private static detectComplexNegation(text: string, findings: QualityFindingDraft[]): void {
    const doubleNegativeRegex =
      /\b(?:shall\s+not\s+allow\s+[^.]*?\bnot\b|cannot\s+fail\s+to|never\s+disallow|not\s+unauthorized|not\s+invalid)\b/gi;
    let match: RegExpExecArray | null;
    while ((match = doubleNegativeRegex.exec(text)) !== null) {
      findings.push({
        code: 'COMPLEX_NEGATION',
        category: 'AMBIGUITY',
        severity: 'WARNING',
        message: `The phrasing '${match[0]}' contains complex or double negation that impairs readability and verification.`,
        evidenceText: match[0],
        startOffset: match.index,
        endOffset: match.index + match[0].length,
        suggestedClarification:
          'Can this requirement be stated affirmatively to remove ambiguous negative logic?',
      });
    }
  }

  /**
   * 12. Detects compound requirements & non-atomic obligations.
   */
  private static detectCompoundRequirements(
    text: string,
    input: QualityAnalyzerInput,
    findings: QualityFindingDraft[],
  ): void {
    // Check multiple 'shall' or 'must'
    const strictModals = text.match(/\b(?:shall|must)\b/gi);
    if (strictModals && strictModals.length > 1) {
      findings.push({
        code: 'COMPOUND_REQUIREMENT',
        category: 'ATOMICITY',
        severity: 'WARNING',
        message: `The requirement contains ${strictModals.length} distinct 'shall/must' statements, indicating a non-atomic compound requirement.`,
        evidenceText: null,
        startOffset: null,
        endOffset: null,
        suggestedClarification:
          'Should these distinct obligations be separated into distinct atomic requirements?',
      });
      return;
    }

    // Check multiple action verbs chained with 'and' (e.g. create X, send Y, update Z, and notify W)
    const chainedActions = text.match(/,\s+(?:and\s+)?([a-z]+ing|[a-z]+)\b/gi);
    if (chainedActions && chainedActions.length >= 3) {
      findings.push({
        code: 'COMPOUND_REQUIREMENT',
        category: 'ATOMICITY',
        severity: 'INFO',
        message:
          'The requirement chains multiple distinct operations together and may benefit from decomposition.',
        evidenceText: null,
        startOffset: null,
        endOffset: null,
        suggestedClarification:
          'Should these operations be verified independently as separate requirements?',
      });
    }
  }

  /**
   * 13. Detects unbounded superlatives and incomplete comparisons.
   */
  private static detectSuperlativesAndComparisons(
    text: string,
    findings: QualityFindingDraft[],
  ): void {
    // Incomplete comparison: faster, better, easier without "than"
    const comparisonRegex =
      /\b(?:faster|easier|better|more\s+efficient|higher\s+performance)\b(?!\s+(?:than|compared\s+to))/gi;
    let compMatch: RegExpExecArray | null;
    while ((compMatch = comparisonRegex.exec(text)) !== null) {
      findings.push({
        code: 'UNDEFINED_COMPARISON_BASELINE',
        category: 'MEASURABILITY',
        severity: 'ERROR',
        message: `The comparative term '${compMatch[0]}' lacks an explicit baseline or benchmark to measure against.`,
        evidenceText: compMatch[0],
        startOffset: compMatch.index,
        endOffset: compMatch.index + compMatch[0].length,
        suggestedClarification: `Faster or better than what baseline, and by what measurable amount?`,
      });
    }

    // Unbounded superlatives: fastest, best, optimal
    const superlativeRegex =
      /\b(?:fastest|best|optimal|highest\s+quality|maximum\s+possible|minimum\s+possible)\b/gi;
    let supMatch: RegExpExecArray | null;
    while ((supMatch = superlativeRegex.exec(text)) !== null) {
      findings.push({
        code: 'UNBOUNDED_SUPERLATIVE',
        category: 'SPECIFICITY',
        severity: 'WARNING',
        message: `The superlative '${supMatch[0]}' represents an unbounded ideal rather than an objective test threshold.`,
        evidenceText: supMatch[0],
        startOffset: supMatch.index,
        endOffset: supMatch.index + supMatch[0].length,
        suggestedClarification: `What measurable threshold defines '${supMatch[0]}'?`,
      });
    }
  }

  /**
   * Derives testability status deterministically.
   */
  private static deriveTestabilityStatus(
    text: string,
    input: QualityAnalyzerInput,
    findings: readonly QualityFindingDraft[],
  ): RequirementTestabilityStatus {
    const errorCount = findings.filter(f => f.severity === 'ERROR').length;
    const warningCount = findings.filter(f => f.severity === 'WARNING').length;

    // Check if requirement is purely subjective with no verifiable action
    const isPurelySubjective =
      findings.some(f => f.code === 'SUBJECTIVE_CRITERION') &&
      !/\b(?:within\s+\d+|after\s+\d+|at\s+least\s+\d+|reject|authenticate|encrypt|HTTP\s+\d{3})\b/i.test(
        text,
      );

    if (isPurelySubjective && errorCount >= 1 && warningCount === 0) {
      return 'NOT_TESTABLE';
    }

    if (errorCount > 1 || (errorCount === 1 && warningCount >= 2)) {
      return 'PARTIALLY_TESTABLE';
    }

    if (errorCount === 1) {
      return 'PARTIALLY_TESTABLE';
    }

    if (warningCount > 0) {
      return 'PARTIALLY_TESTABLE';
    }

    // Check for strong testability signals (observable action, quantitative constraint, boolean rejection, state transition)
    const hasObservableBehavior =
      /\b(?:reject|allow|authenticate|authorize|encrypt|decrypt|validate|display|send|store|delete|lock|expire|calculate|generate|redirect|return)\b/i.test(
        text,
      );
    const hasQuantitativeConstraint =
      /\b(?:\d+\s*(?:ms|s|sec|seconds?|%|characters?|users?|attempts?|items?|requests?))\b/i.test(
        text,
      );
    const hasStateTransition =
      /\b(?:after\s+\d+|when\s+[^,]+,\s+the\s+[^,]+\s+shall\s+become)\b/i.test(text);

    if (hasObservableBehavior || hasQuantitativeConstraint || hasStateTransition) {
      return 'TESTABLE';
    }

    return 'PARTIALLY_TESTABLE';
  }

  /**
   * Calculates deterministic quality score: 100 - penalties clamped to [0, 100].
   */
  private static calculateQualityScore(
    status: RequirementTestabilityStatus,
    findings: readonly QualityFindingDraft[],
  ): number | null {
    if (status === 'UNDETERMINED') return null;

    let score = 100;
    for (const f of findings) {
      score -= QUALITY_SCORE_WEIGHTS[f.severity] ?? 5;
    }

    return Math.max(0, Math.min(100, score));
  }

  /**
   * Derives unique clarification questions from findings.
   */
  private static deriveClarificationQuestions(findings: readonly QualityFindingDraft[]): string[] {
    const questions: string[] = [];
    const seen = new Set<string>();

    for (const f of findings) {
      if (f.suggestedClarification && !seen.has(f.suggestedClarification)) {
        seen.add(f.suggestedClarification);
        questions.push(f.suggestedClarification);
      }
    }

    return questions.slice(0, QUALITY_LIMITS.MAX_CLARIFICATION_QUESTIONS);
  }

  /**
   * Sorts findings by startOffset, then severity, then code, and removes duplicates.
   */
  private static sortAndDeduplicateFindings(
    findings: QualityFindingDraft[],
  ): QualityFindingDraft[] {
    const severityRank: Record<QualityFindingSeverity, number> = {
      ERROR: 1,
      WARNING: 2,
      INFO: 3,
    };

    const uniqueMap = new Map<string, QualityFindingDraft>();

    for (const f of findings) {
      const key = `${f.code}:${f.startOffset ?? -1}:${f.evidenceText ?? ''}`;
      if (!uniqueMap.has(key)) {
        uniqueMap.set(key, f);
      }
    }

    return Array.from(uniqueMap.values()).sort((a, b) => {
      // 1. startOffset (nulls last)
      if (a.startOffset !== null && b.startOffset !== null) {
        if (a.startOffset !== b.startOffset) {
          return a.startOffset - b.startOffset;
        }
      } else if (a.startOffset !== null) {
        return -1;
      } else if (b.startOffset !== null) {
        return 1;
      }

      // 2. Severity rank
      const rankA = severityRank[a.severity] ?? 2;
      const rankB = severityRank[b.severity] ?? 2;
      const sevDiff = rankA - rankB;
      if (sevDiff !== 0) return sevDiff;

      // 3. Code
      return a.code.localeCompare(b.code);
    });
  }
}
