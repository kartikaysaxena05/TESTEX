/**
 * @file packages/core/src/execution/healing/healing-candidate-scorer.ts
 * Deterministic 0-100 candidate scoring model for locator self-healing.
 */

import type { ExecutableTargetDescriptorDto } from '@ai-quality/contracts';
import type {
  IHealingCandidateScorer,
  ElementSemanticSignature,
  HealingCandidateEvaluation,
} from './healing-types.js';

const CONFLICTING_KEYWORD_GROUPS: readonly (readonly string[])[] = [
  ['delete', 'remove', 'trash', 'destroy', 'cancel', 'discard'],
  ['save', 'submit', 'confirm', 'apply', 'update', 'create'],
  ['login', 'signin', 'log in', 'sign in'],
  ['signup', 'register', 'sign up', 'create account'],
  ['enable', 'activate', 'turn on'],
  ['disable', 'deactivate', 'turn off'],
  ['next', 'forward', 'continue'],
  ['prev', 'previous', 'back'],
];

export class HealingCandidateScorer implements IHealingCandidateScorer {
  /**
   * Evaluates and scores a single candidate against the original target descriptor.
   */
  public scoreCandidate(
    originalTarget: ExecutableTargetDescriptorDto,
    candidate: ElementSemanticSignature,
    isDestructiveAction: boolean = false,
  ): HealingCandidateEvaluation {
    const breakdown: Record<string, number> = {};
    let totalScore = 0;

    // 1. Security Field Compatibility Check (Hard Disqualification)
    const isTargetPassword = this.isPasswordField(originalTarget);
    const isCandidatePassword = this.isCandidatePasswordField(candidate);
    if (isTargetPassword !== isCandidatePassword) {
      return {
        candidate: {
          candidateIndex: candidate.elementIndex,
          tagName: candidate.tagName,
          role: candidate.role ?? null,
          accessibleName: candidate.accessibleName ?? null,
          label: candidate.label ?? null,
          testId: candidate.testId ?? null,
          inputType: candidate.inputType ?? null,
          selectorRecipe: candidate.selectorRecipe,
          score: 0,
          scoreBreakdown: { securityMismatch: -100 },
          isDisqualified: true,
          disqualificationReason:
            'Security violation: Cannot heal between password and non-password fields.',
          isVisible: candidate.isVisible,
          isEnabled: candidate.isEnabled,
        },
        locator: candidate.locator,
        isDisqualified: true,
        disqualificationReason:
          'Security violation: Cannot heal between password and non-password fields.',
      };
    }

    // 2. Role / Tag Match (up to 25 pts)
    const roleScore = this.evaluateRoleMatch(originalTarget, candidate);
    breakdown.roleMatch = roleScore;
    totalScore += roleScore;

    // 3. Accessible Name / Text Similarity (up to 30 pts)
    const nameScore = this.evaluateNameSimilarity(originalTarget, candidate);
    breakdown.nameMatch = nameScore;
    totalScore += nameScore;

    // 4. Label Match (up to 15 pts)
    const labelScore = this.evaluateLabelMatch(originalTarget, candidate);
    breakdown.labelMatch = labelScore;
    totalScore += labelScore;

    // 5. Test ID / Attribute Match (up to 15 pts)
    const testIdScore = this.evaluateTestIdMatch(originalTarget, candidate);
    breakdown.testIdMatch = testIdScore;
    totalScore += testIdScore;

    // 6. Input Type / Tag Match (up to 10 pts)
    const inputTypeScore = this.evaluateInputTypeMatch(originalTarget, candidate);
    breakdown.inputTypeMatch = inputTypeScore;
    totalScore += inputTypeScore;

    // 7. Form / Context Text Match (up to 5 pts)
    const contextScore = this.evaluateContextMatch(originalTarget, candidate);
    breakdown.contextMatch = contextScore;
    totalScore += contextScore;

    // 8. Conflicting Action Keyword Penalty (-50 pts / Disqualification)
    const keywordConflict = this.detectKeywordConflict(originalTarget, candidate);
    if (keywordConflict) {
      breakdown.conflictingActionKeyword = -50;
      totalScore -= 50;
    }

    // 9. Visibility and Enabled State Penalties
    if (!candidate.isVisible) {
      breakdown.invisiblePenalty = -30;
      totalScore -= 30;
    }
    if (!candidate.isEnabled) {
      breakdown.disabledPenalty = -20;
      totalScore -= 20;
    }

    // Clamp score to [0, 100]
    const finalScore = Math.min(Math.max(0, totalScore), 100);

    const isDisqualified = keywordConflict !== null || finalScore < (isDestructiveAction ? 50 : 25);

    return {
      candidate: {
        candidateIndex: candidate.elementIndex,
        tagName: candidate.tagName,
        role: candidate.role ?? null,
        accessibleName: candidate.accessibleName ?? null,
        label: candidate.label ?? null,
        testId: candidate.testId ?? null,
        inputType: candidate.inputType ?? null,
        selectorRecipe: candidate.selectorRecipe,
        score: finalScore,
        scoreBreakdown: breakdown,
        isDisqualified,
        disqualificationReason: keywordConflict
          ? `Conflicting action keywords detected: ${keywordConflict}`
          : isDisqualified
            ? 'Score below baseline qualification floor'
            : null,
        isVisible: candidate.isVisible,
        isEnabled: candidate.isEnabled,
      },
      locator: candidate.locator,
      isDisqualified,
      disqualificationReason: keywordConflict
        ? `Conflicting action keywords detected: ${keywordConflict}`
        : isDisqualified
          ? 'Score below baseline qualification floor'
          : null,
    };
  }

  /**
   * Evaluates and ranks multiple candidate signatures deterministically.
   */
  public rankCandidates(
    originalTarget: ExecutableTargetDescriptorDto,
    candidates: readonly ElementSemanticSignature[],
    isDestructiveAction: boolean = false,
  ): readonly HealingCandidateEvaluation[] {
    const evaluated = candidates.map(c =>
      this.scoreCandidate(originalTarget, c, isDestructiveAction),
    );

    return [...evaluated].sort((a, b) => {
      // Non-disqualified candidates first
      if (a.isDisqualified !== b.isDisqualified) {
        return a.isDisqualified ? 1 : -1;
      }
      // Highest score first
      if (b.candidate.score !== a.candidate.score) {
        return b.candidate.score - a.candidate.score;
      }
      // Stable tie-breaker: candidateIndex asc
      return a.candidate.candidateIndex - b.candidate.candidateIndex;
    });
  }

  private isPasswordField(target: ExecutableTargetDescriptorDto): boolean {
    const nameOrLabel =
      `${target.name ?? ''} ${target.label ?? ''} ${target.placeholder ?? ''} ${target.testId ?? ''}`.toLowerCase();
    return nameOrLabel.includes('password') || nameOrLabel.includes('passcode');
  }

  private isCandidatePasswordField(candidate: ElementSemanticSignature): boolean {
    if (candidate.inputType === 'password') return true;
    const nameOrLabel =
      `${candidate.accessibleName ?? ''} ${candidate.label ?? ''} ${candidate.placeholder ?? ''} ${candidate.testId ?? ''}`.toLowerCase();
    return nameOrLabel.includes('password') || nameOrLabel.includes('passcode');
  }

  private evaluateRoleMatch(
    target: ExecutableTargetDescriptorDto,
    candidate: ElementSemanticSignature,
  ): number {
    if (!target.role && !target.kind) return 15;
    const targetRole = (target.role ?? target.kind ?? '').toLowerCase();
    const candidateRole = (candidate.role ?? candidate.tagName).toLowerCase();

    if (targetRole === candidateRole) return 30;
    if (
      (targetRole === 'button' && candidate.tagName === 'button') ||
      (targetRole === 'textbox' && candidate.tagName === 'input') ||
      (targetRole === 'link' && candidate.tagName === 'a')
    ) {
      return 25;
    }
    return 0;
  }

  private evaluateNameSimilarity(
    target: ExecutableTargetDescriptorDto,
    candidate: ElementSemanticSignature,
  ): number {
    const targetText = (target.name ?? target.text ?? target.placeholder ?? '').trim();
    const candidateText = (candidate.accessibleName ?? candidate.placeholder ?? '').trim();

    if (!targetText || !candidateText) {
      return targetText === candidateText ? 40 : 0;
    }

    const tNorm = targetText.toLowerCase();
    const cNorm = candidateText.toLowerCase();

    if (tNorm === cNorm) return 40;
    if (tNorm.includes(cNorm) || cNorm.includes(tNorm)) return 35;

    // Token overlap similarity
    const tTokens = new Set(tNorm.split(/\s+/).filter(Boolean));
    const cTokens = new Set(cNorm.split(/\s+/).filter(Boolean));
    let intersection = 0;
    for (const t of tTokens) {
      if (cTokens.has(t)) intersection++;
    }
    const union = new Set([...tTokens, ...cTokens]).size;
    const jaccard = union > 0 ? intersection / union : 0;

    if (jaccard >= 0.5) return Math.round(20 + jaccard * 20);
    return Math.round(jaccard * 20);
  }

  private evaluateLabelMatch(
    target: ExecutableTargetDescriptorDto,
    candidate: ElementSemanticSignature,
  ): number {
    if (!target.label || !candidate.label) return 0;
    const t = target.label.trim().toLowerCase();
    const c = candidate.label.trim().toLowerCase();
    if (t === c) return 15;
    if (t.includes(c) || c.includes(t)) return 10;
    return 0;
  }

  private evaluateTestIdMatch(
    target: ExecutableTargetDescriptorDto,
    candidate: ElementSemanticSignature,
  ): number {
    if (!target.testId || !candidate.testId) return 0;
    const t = target.testId.trim().toLowerCase();
    const c = candidate.testId.trim().toLowerCase();
    if (t === c) return 20;
    if (t.includes(c) || c.includes(t)) return 10;
    // Prefix / token match for drifted versions (e.g. "btn-login-v1" vs "btn-login-v2")
    const tPrefix = t.replace(/[-_v0-9]+$/, '');
    const cPrefix = c.replace(/[-_v0-9]+$/, '');
    if (tPrefix.length >= 3 && tPrefix === cPrefix) return 10;
    return 0;
  }

  private evaluateInputTypeMatch(
    target: ExecutableTargetDescriptorDto,
    candidate: ElementSemanticSignature,
  ): number {
    if (!candidate.inputType) return 5;
    const targetSummary = `${target.strategy} ${target.name ?? ''}`.toLowerCase();
    if (candidate.inputType === 'checkbox' && targetSummary.includes('check')) return 10;
    if (candidate.inputType === 'radio' && targetSummary.includes('radio')) return 10;
    if (candidate.inputType === 'submit' && targetSummary.includes('submit')) return 10;
    return 5;
  }

  private evaluateContextMatch(
    target: ExecutableTargetDescriptorDto,
    candidate: ElementSemanticSignature,
  ): number {
    if (!candidate.contextText) return 0;
    const targetTerms = `${target.name ?? ''} ${target.label ?? ''} ${target.text ?? ''}`
      .toLowerCase()
      .split(/\s+/);
    const context = candidate.contextText.toLowerCase();
    const matches = targetTerms.filter(term => term.length > 2 && context.includes(term));
    return matches.length > 0 ? 5 : 0;
  }

  private detectKeywordConflict(
    target: ExecutableTargetDescriptorDto,
    candidate: ElementSemanticSignature,
  ): string | null {
    const targetText =
      `${target.name ?? ''} ${target.text ?? ''} ${target.label ?? ''}`.toLowerCase();
    const candidateText =
      `${candidate.accessibleName ?? ''} ${candidate.label ?? ''}`.toLowerCase();

    for (let i = 0; i < CONFLICTING_KEYWORD_GROUPS.length; i++) {
      const groupA = CONFLICTING_KEYWORD_GROUPS[i];
      if (!groupA) continue;
      const targetHasA = groupA.some(k => targetText.includes(k));

      if (targetHasA) {
        for (let j = 0; j < CONFLICTING_KEYWORD_GROUPS.length; j++) {
          if (i === j) continue;
          const groupB = CONFLICTING_KEYWORD_GROUPS[j];
          if (!groupB) continue;
          const candidateHasB = groupB.some(k => candidateText.includes(k));
          const candidateHasA = groupA.some(k => candidateText.includes(k));
          if (candidateHasB && !candidateHasA) {
            return `Target contains group [${groupA.join(', ')}] but candidate contains conflicting group [${groupB.join(', ')}]`;
          }
        }
      }
    }

    return null;
  }
}
