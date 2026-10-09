import type {
  ParseBulkRequirementsResult,
  RequirementCandidate,
  ParseMethod,
} from '@ai-quality/contracts';

export const BULK_PARSER_VERSION = 'bulk-parser-v1';
export const MAX_PASTED_TEXT_LENGTH = 500000;
export const MAX_CANDIDATES_PER_BATCH = 500;
export const MAX_CANDIDATE_TEXT_LENGTH = 20000;

interface RawBlock {
  lines: string[];
  lineStart: number;
  lineEnd: number;
  detectedPrefix?: string;
  parseMethod: ParseMethod;
  isHeading?: boolean;
}

/**
 * Pure, deterministic parser that extracts requirement candidates from raw pasted text.
 * No network calls, no AI, no database writes.
 */
export function parseBulkRequirementsText(rawText: string): ParseBulkRequirementsResult {
  if (!rawText || typeof rawText !== 'string' || !rawText.trim()) {
    return {
      candidates: [],
      totalParsed: 0,
      duplicateCount: 0,
      warningCount: 0,
      parseVersion: BULK_PARSER_VERSION,
    };
  }

  // Normalize line breaks
  const normalizedText = rawText.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const allLines = normalizedText.split('\n');

  const blocks: RawBlock[] = [];
  let currentBlock: RawBlock | null = null;

  for (let i = 0; i < allLines.length; i++) {
    const rawLine = allLines[i] ?? '';
    const lineNumber = i + 1;
    const trimmed = rawLine.trim();

    if (!trimmed) {
      // Blank line ends the current candidate block
      if (currentBlock) {
        blocks.push(currentBlock);
        currentBlock = null;
      }
      continue;
    }

    // Check for Markdown heading (e.g. # Heading, ## Section)
    const headingMatch = /^(#{1,6})\s+(.+)$/.exec(trimmed);
    if (headingMatch && headingMatch[2]) {
      if (currentBlock) {
        blocks.push(currentBlock);
        currentBlock = null;
      }
      blocks.push({
        lines: [headingMatch[2].trim()],
        lineStart: lineNumber,
        lineEnd: lineNumber,
        parseMethod: 'PLAIN_LINE',
        isHeading: true,
      });
      continue;
    }

    // Check for Prefix with identifier (e.g. REQ-001: Text, FR-02 - Text, AUTH_01: Text)
    const prefixMatch = /^([A-Za-z0-9_-]{2,32})\s*[:\-–—]\s*(.+)$/.exec(trimmed);
    if (prefixMatch && prefixMatch[1] && prefixMatch[2]) {
      if (currentBlock) {
        blocks.push(currentBlock);
      }
      currentBlock = {
        lines: [prefixMatch[2].trim()],
        lineStart: lineNumber,
        lineEnd: lineNumber,
        detectedPrefix: prefixMatch[1].trim(),
        parseMethod: 'PREFIXED',
      };
      continue;
    }

    // Check for Numbered list (e.g. 1. Text, 1) Text, (1) Text, [1] Text)
    const numberedMatch =
      /^(?:(\d+|[a-zA-Z])[.)]|\((\d+|[a-zA-Z])\)|\[(\d+|[a-zA-Z])\])\s+(.+)$/.exec(trimmed);
    if (numberedMatch && numberedMatch[4]) {
      if (currentBlock) {
        blocks.push(currentBlock);
      }
      const numLabel = numberedMatch[1] || numberedMatch[2] || numberedMatch[3];
      currentBlock = {
        lines: [numberedMatch[4].trim()],
        lineStart: lineNumber,
        lineEnd: lineNumber,
        detectedPrefix: numLabel ? `ITEM-${numLabel}` : undefined,
        parseMethod: 'NUMBERED',
      };
      continue;
    }

    // Check for Bullet points (e.g. - Text, * Text, • Text, + Text, – Text)
    const bulletMatch = /^[-*•+–—]\s+(.+)$/.exec(trimmed);
    if (bulletMatch && bulletMatch[1]) {
      if (currentBlock) {
        blocks.push(currentBlock);
      }
      currentBlock = {
        lines: [bulletMatch[1].trim()],
        lineStart: lineNumber,
        lineEnd: lineNumber,
        parseMethod: 'BULLET',
      };
      continue;
    }

    // Check for Indented continuation line
    const isIndented = /^\s{2,}|\t/.test(rawLine);
    if (isIndented && currentBlock) {
      currentBlock.lines.push(trimmed);
      currentBlock.lineEnd = lineNumber;
      continue;
    }

    // Plain line
    if (currentBlock) {
      blocks.push(currentBlock);
    }
    currentBlock = {
      lines: [trimmed],
      lineStart: lineNumber,
      lineEnd: lineNumber,
      parseMethod: 'PLAIN_LINE',
    };
  }

  if (currentBlock) {
    blocks.push(currentBlock);
  }

  // Filter headings if they are standalone
  const validBlocks = blocks.filter(b => !b.isHeading);

  const candidates: RequirementCandidate[] = [];
  const seenTexts = new Map<string, number>();
  let duplicateCount = 0;
  let totalWarnings = 0;

  for (let idx = 0; idx < validBlocks.length; idx++) {
    if (candidates.length >= MAX_CANDIDATES_PER_BATCH) {
      break;
    }

    const block = validBlocks[idx]!;
    const combinedText = block.lines.join(' ').trim();
    if (!combinedText) {
      continue;
    }

    const warnings: string[] = [];

    // Length check
    if (combinedText.length > MAX_CANDIDATE_TEXT_LENGTH) {
      warnings.push(
        `Candidate text exceeds maximum length of ${MAX_CANDIDATE_TEXT_LENGTH} characters.`,
      );
    }

    // Duplicate detection in batch (case-insensitive & whitespace-normalized)
    const normalizedKey = combinedText.toLowerCase().replace(/\s+/g, ' ');
    const previousIndex = seenTexts.get(normalizedKey);
    let isDuplicateInBatch = false;

    if (previousIndex !== undefined) {
      isDuplicateInBatch = true;
      duplicateCount++;
      warnings.push(
        `Duplicate requirement in current batch (matches candidate #${previousIndex + 1}).`,
      );
    } else {
      seenTexts.set(normalizedKey, candidates.length);
    }

    // Generate deterministic title from first sentence / word boundary
    const title = extractDeterministicTitle(combinedText);

    // Filter external key if it is not valid format
    let externalKey: string | null = null;
    if (block.detectedPrefix && !block.detectedPrefix.startsWith('ITEM-')) {
      if (/^[A-Za-z0-9_-]{1,64}$/.test(block.detectedPrefix)) {
        externalKey = block.detectedPrefix;
      }
    }

    if (warnings.length > 0) {
      totalWarnings += warnings.length;
    }

    candidates.push({
      candidateId: `candidate-${candidates.length + 1}`,
      originalText: combinedText,
      title,
      detectedExternalKey: externalKey,
      lineStart: block.lineStart,
      lineEnd: block.lineEnd,
      parseMethod: block.parseMethod,
      isDuplicateInBatch,
      warnings,
    });
  }

  return {
    candidates,
    totalParsed: candidates.length,
    duplicateCount,
    warningCount: totalWarnings,
    parseVersion: BULK_PARSER_VERSION,
  };
}

/**
 * Extracts a concise title deterministically from requirement text without AI.
 */
function extractDeterministicTitle(text: string): string {
  const trimmed = text.trim();
  const firstSentenceMatch = /^([^.!?\n]+[.!?]?)/.exec(trimmed);
  const sentence = firstSentenceMatch ? firstSentenceMatch[1]!.trim() : trimmed;

  if (sentence.length <= 80) {
    return sentence;
  }

  const truncated = sentence.slice(0, 77);
  const lastSpace = truncated.lastIndexOf(' ');
  if (lastSpace > 30) {
    return `${truncated.slice(0, lastSpace).trim()}...`;
  }
  return `${truncated.trim()}...`;
}
