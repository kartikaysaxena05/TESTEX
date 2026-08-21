/**
 * @file packages/core/src/ai/rag/token-estimator.ts
 * Bounded, deterministic token estimator for context budgeting.
 */

export class TokenEstimator {
  /**
   * Estimates token count for a single text string using a 4 chars/token heuristic
   * adjusted for word density and code delimiters.
   */
  public static estimate(text: string): number {
    if (!text || text.length === 0) {
      return 0;
    }

    const trimmed = text.trim();
    if (trimmed.length === 0) {
      return 0;
    }

    // Heuristic: ~4 characters per token for typical technical text
    const charEstimate = Math.ceil(trimmed.length / 4);
    // Word boundary heuristic: split on whitespace and punctuation
    const words = trimmed.split(/\s+/).length;
    const wordEstimate = Math.ceil(words * 1.3);

    // Take the balanced maximum of character vs word heuristic
    return Math.max(charEstimate, wordEstimate);
  }

  /**
   * Estimates token count for a collection of strings.
   */
  public static estimateBatch(texts: readonly string[]): number {
    let total = 0;
    for (const t of texts) {
      total += TokenEstimator.estimate(t);
    }
    return total;
  }
}
