/**
 * @file packages/core/src/ai-provider/token-estimator.ts
 * Centralized, deterministic token estimation service for V9 Phase 134.
 *
 * Provides:
 * - Deterministic word/character-based heuristic estimation for English/code tokens (~3.8 chars/token).
 * - Category-based token breakdowns (system prompt, user prompt, requirements, tests, repo code, tools, history).
 * - Documented estimation strategy preventing scattered heuristics across the application.
 */

import type {
  TokenEstimationResultDto,
  TokenEstimationDetailDto,
  AiToolDefinitionDto,
  AiProjectContextDto,
} from '@ai-quality/contracts';

export class TokenEstimatorService {
  /**
   * Average characters per token across common LLM tokenizers (tiktoken, Llama BPE, Qwen byte-level BPE).
   * Typically 3.5 to 4.2 chars per token for mixed English prose and code.
   * We use 3.8 as a balanced, conservative baseline.
   */
  private static readonly CHARS_PER_TOKEN = 3.8;

  /**
   * Estimates token count for a raw string.
   */
  public static estimateString(text?: string | null): number {
    if (!text || text.length === 0) return 0;
    // BPE tokenizers split whitespace/punctuation: minimum 1 token for non-empty text
    return Math.max(1, Math.ceil(text.length / this.CHARS_PER_TOKEN));
  }

  /**
   * Estimates token count for tool definitions.
   */
  public static estimateTools(tools?: readonly AiToolDefinitionDto[]): number {
    if (!tools || tools.length === 0) return 0;
    const serialized = JSON.stringify(
      tools.map((t) => ({
        name: t.name,
        description: t.description,
        parameters: t.inputSchema,
      })),
    );
    // Overhead for JSON wrapping & tool call schema instructions
    return this.estimateString(serialized) + 40;
  }

  /**
   * Estimates token count for unified project context sections.
   */
  public static estimateProjectContext(context?: AiProjectContextDto | null): {
    total: number;
    breakdown: readonly TokenEstimationDetailDto[];
  } {
    if (!context) {
      return { total: 0, breakdown: [] };
    }

    const details: TokenEstimationDetailDto[] = [];
    let total = 0;

    if (context.repositoryInfo?.trim()) {
      const text = context.repositoryInfo.trim();
      const tokens = this.estimateString(text);
      total += tokens;
      details.push({
        category: 'REPOSITORY_CODE',
        estimatedTokens: tokens,
        characterCount: text.length,
        isEstimated: true,
      });
    }

    if (context.requirements?.trim()) {
      const text = context.requirements.trim();
      const tokens = this.estimateString(text);
      total += tokens;
      details.push({
        category: 'REQUIREMENTS',
        estimatedTokens: tokens,
        characterCount: text.length,
        isEstimated: true,
      });
    }

    if (context.testInfo?.trim()) {
      const text = context.testInfo.trim();
      const tokens = this.estimateString(text);
      total += tokens;
      details.push({
        category: 'TEST_CONTEXT',
        estimatedTokens: tokens,
        characterCount: text.length,
        isEstimated: true,
      });
    }

    if (context.targetInfo?.trim()) {
      const text = context.targetInfo.trim();
      const tokens = this.estimateString(text);
      total += tokens;
      details.push({
        category: 'TARGET_ENVIRONMENT',
        estimatedTokens: tokens,
        characterCount: text.length,
        isEstimated: true,
      });
    }

    if (context.relevantMetadata && Object.keys(context.relevantMetadata).length > 0) {
      const serialized = JSON.stringify(context.relevantMetadata);
      const tokens = this.estimateString(serialized);
      total += tokens;
      details.push({
        category: 'PROJECT_METADATA',
        estimatedTokens: tokens,
        characterCount: serialized.length,
        isEstimated: true,
      });
    }

    return { total, breakdown: details };
  }

  /**
   * Estimates tokens for conversation history messages.
   */
  public static estimateMessages(
    messages?: readonly { readonly role: string; readonly content: string }[],
  ): { total: number; breakdown: readonly TokenEstimationDetailDto[] } {
    if (!messages || messages.length === 0) {
      return { total: 0, breakdown: [] };
    }

    let total = 0;
    const details: TokenEstimationDetailDto[] = [];

    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i]!;
      // Message format overhead: <|im_start|>role\ncontent<|im_end|>\n (~4 tokens per message)
      const contentTokens = this.estimateString(msg.content);
      const msgTokens = contentTokens + 4;
      total += msgTokens;
      details.push({
        category: `MESSAGE_${i}_${msg.role.toUpperCase()}`,
        estimatedTokens: msgTokens,
        characterCount: msg.content.length,
        isEstimated: true,
      });
    }

    return { total, breakdown: details };
  }

  /**
   * Produces a structured token estimation result for arbitrary items.
   */
  public static estimate(
    items: readonly { readonly category: string; readonly content: string }[],
  ): TokenEstimationResultDto {
    const breakdown: TokenEstimationDetailDto[] = [];
    let totalTokens = 0;

    for (const item of items) {
      const tokens = this.estimateString(item.content);
      totalTokens += tokens;
      breakdown.push({
        category: item.category,
        estimatedTokens: tokens,
        characterCount: item.content.length,
        isEstimated: true,
      });
    }

    return {
      totalTokens,
      breakdown,
      method: 'ESTIMATED_HEURISTIC',
    };
  }
}
