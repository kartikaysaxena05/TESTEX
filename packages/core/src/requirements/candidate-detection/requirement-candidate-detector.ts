/**
 * @file packages/core/src/requirements/candidate-detection/requirement-candidate-detector.ts
 * Pure deterministic requirement candidate detector operating on Phase-34 extraction models.
 */

import type {
  RequirementDocumentExtractionDto,
  DocumentBlockDto,
  DocumentTableDto,
  DocumentSectionDto,
  CandidateDetectionReasonDto,
  CandidateWarningDto,
} from '@ai-quality/contracts';
import {
  DETECTOR_VERSION,
  DETECTION_SCORE_WEIGHTS,
  CANDIDATE_DETECTION_LIMITS,
  type RawDetectedCandidate,
  type CandidateDetectionResult,
} from './detection-types.js';

export class RequirementCandidateDetector {
  readonly version = DETECTOR_VERSION;

  /**
   * Detects requirement candidates from a structured document extraction.
   * Pure, deterministic local computation.
   */
  detectCandidates(extraction: RequirementDocumentExtractionDto): CandidateDetectionResult {
    const candidates: RawDetectedCandidate[] = [];
    const sectionPathMap = this.buildSectionPathMap(extraction.sections);
    const seenTexts = new Map<string, number>(); // normalized text -> count

    let processedBlocks = 0;

    // 1. Process regular blocks (Paragraphs, List items, etc.)
    for (const block of extraction.blocks) {
      if (processedBlocks >= CANDIDATE_DETECTION_LIMITS.MAX_BLOCKS_PROCESSED) break;
      if (candidates.length >= CANDIDATE_DETECTION_LIMITS.MAX_CANDIDATES) break;
      processedBlocks++;

      // Skip non-text or code blocks
      if (block.type === 'CODE_BLOCK' || !block.text) {
        continue;
      }

      // If block is a heading, verify if it is an inline requirement statement
      if (block.type === 'HEADING') {
        const cands = this.evaluateBlock(block, sectionPathMap, true);
        for (const candidate of cands) {
          this.registerCandidate(candidate, candidates, seenTexts);
        }
        continue;
      }

      // Evaluate block
      const cands = this.evaluateBlock(block, sectionPathMap, false);
      for (const candidate of cands) {
        this.registerCandidate(candidate, candidates, seenTexts);
      }
    }

    // 2. Process table rows where applicable
    for (const table of extraction.tables) {
      if (candidates.length >= CANDIDATE_DETECTION_LIMITS.MAX_CANDIDATES) break;
      const tableCandidates = this.evaluateTable(table, sectionPathMap);
      for (const cand of tableCandidates) {
        if (candidates.length >= CANDIDATE_DETECTION_LIMITS.MAX_CANDIDATES) break;
        this.registerCandidate(cand, candidates, seenTexts);
      }
    }

    // Assign final source sequential orderIndex
    const sortedCandidates = candidates.map((cand, idx) => ({
      ...cand,
      orderIndex: idx + 1,
    }));

    return {
      candidates: sortedCandidates,
      totalDetected: sortedCandidates.length,
      detectorVersion: this.version,
    };
  }

  private registerCandidate(
    candidate: RawDetectedCandidate,
    candidates: RawDetectedCandidate[],
    seenTexts: Map<string, number>,
  ): void {
    const norm = candidate.sourceText.trim().toLowerCase().replace(/\s+/g, ' ');
    const count = seenTexts.get(norm) || 0;
    seenTexts.set(norm, count + 1);

    if (count > 0) {
      candidate.warnings.push({
        code: 'EXACT_DUPLICATE_CANDIDATE',
        message: 'Exact identical requirement candidate text already detected in this document.',
      });
    }

    candidates.push(candidate);
  }

  private evaluateBlock(
    block: DocumentBlockDto,
    sectionPathMap: Map<string, { path: string; title: string }>,
    isHeading: boolean,
  ): RawDetectedCandidate[] {
    if (!block.text) return [];

    if (isHeading) {
      const cand = this.evaluateSingleText(
        block.text,
        block,
        sectionPathMap,
        true,
        block.lineStart,
        block.lineEnd,
      );
      return cand ? [cand] : [];
    }

    const lines = block.text.split(/\r?\n/);
    if (lines.length > 1) {
      const lineCandidates: RawDetectedCandidate[] = [];
      for (let i = 0; i < lines.length; i++) {
        const lineText = lines[i]!.trim();
        if (lineText.length < CANDIDATE_DETECTION_LIMITS.MIN_CANDIDATE_LENGTH) continue;
        const lineStart = block.lineStart !== null ? block.lineStart + i : null;
        const lineEnd = lineStart;
        const cand = this.evaluateSingleText(
          lineText,
          block,
          sectionPathMap,
          false,
          lineStart,
          lineEnd,
        );
        if (cand) {
          lineCandidates.push(cand);
        }
      }
      if (lineCandidates.length > 0) {
        return lineCandidates;
      }
    }

    const single = this.evaluateSingleText(
      block.text,
      block,
      sectionPathMap,
      false,
      block.lineStart,
      block.lineEnd,
    );
    return single ? [single] : [];
  }

  private evaluateSingleText(
    text: string,
    block: DocumentBlockDto,
    sectionPathMap: Map<string, { path: string; title: string }>,
    isHeading: boolean,
    lineStart: number | null,
    lineEnd: number | null,
  ): RawDetectedCandidate | null {
    const rawText = text.trim();

    // 1. Length bounds
    if (
      rawText.length < CANDIDATE_DETECTION_LIMITS.MIN_CANDIDATE_LENGTH ||
      rawText.length > CANDIDATE_DETECTION_LIMITS.MAX_CANDIDATE_LENGTH
    ) {
      return null;
    }

    // 2. False-positive checks
    if (this.isTableOfContents(rawText)) return null;
    if (this.isDocumentMetadata(rawText)) return null;
    if (this.isStandardBoilerplate(rawText)) return null;
    if (this.isHeaderOrFooter(rawText)) return null;

    const reasons: CandidateDetectionReasonDto[] = [];
    const warnings: CandidateWarningDto[] = [];
    let externalKey: string | null = null;

    // 3. Check for Explicit Requirement ID
    const keyMatch = this.extractExternalKey(rawText);
    if (keyMatch) {
      externalKey = keyMatch.key;
      reasons.push({
        code: 'EXPLICIT_SOURCE_ID',
        description: `Explicit requirement identifier detected: ${externalKey}`,
        score: DETECTION_SCORE_WEIGHTS.EXPLICIT_SOURCE_ID,
        matchedText: externalKey,
      });
    }

    // 4. Modal Obligation Keywords (shall / must)
    const hasShall = /\bshall\b/i.test(rawText);
    const hasMust = /\bmust\b/i.test(rawText);

    if (hasShall) {
      reasons.push({
        code: 'EXPLICIT_SHALL',
        description: 'Contains mandatory obligation keyword "shall".',
        score: DETECTION_SCORE_WEIGHTS.EXPLICIT_SHALL,
        matchedText: 'shall',
      });
    }

    if (hasMust) {
      reasons.push({
        code: 'EXPLICIT_MUST',
        description: 'Contains mandatory obligation keyword "must".',
        score: DETECTION_SCORE_WEIGHTS.EXPLICIT_MUST,
        matchedText: 'must',
      });
    }

    // 5. Prohibition syntax (shall not, must not, may not, etc.)
    if (/\b(shall\s+not|must\s+not|may\s+not|cannot|will\s+not)\b/i.test(rawText)) {
      const match = rawText.match(/\b(shall\s+not|must\s+not|may\s+not|cannot|will\s+not)\b/i);
      reasons.push({
        code: 'PROHIBITION_PATTERN',
        description: 'Contains prohibition constraint pattern.',
        score: DETECTION_SCORE_WEIGHTS.PROHIBITION_PATTERN,
        matchedText: match ? match[0] : undefined,
      });
    }

    // 6. Passive / Required-to obligation
    if (
      /\b(is\s+required\s+to|are\s+required\s+to|required\s+to|shall\s+be\s+required\s+to)\b/i.test(
        rawText,
      )
    ) {
      reasons.push({
        code: 'REQUIRED_TO_PATTERN',
        description: 'Contains explicit obligation pattern "required to".',
        score: DETECTION_SCORE_WEIGHTS.REQUIRED_TO_PATTERN,
        matchedText: 'required to',
      });
    }

    // 7. User Story pattern ("As a <role>, I want <action> so that <benefit>")
    if (
      /^As\s+an?\s+([^,]+),\s*I\s+(?:want|need|wish)\s+to\s+([^,]+)\s+so\s+that\s+(.+)$/i.test(
        rawText,
      )
    ) {
      reasons.push({
        code: 'USER_STORY_PATTERN',
        description: 'Matches agile user story structure ("As a... I want to... so that...").',
        score: DETECTION_SCORE_WEIGHTS.USER_STORY_PATTERN,
      });
    }

    // 8. EARS pattern ("When <trigger>, the system shall <response>", etc.)
    if (
      /^(?:When|While|Where|If)\s+([^,]+),\s*the\s+(?:system|application|platform|user)\s+(?:shall|must)\s+(.+)$/i.test(
        rawText,
      )
    ) {
      reasons.push({
        code: 'EARS_PATTERN',
        description: 'Matches Easy Approach to Requirements Syntax (EARS) template.',
        score: DETECTION_SCORE_WEIGHTS.EARS_PATTERN,
      });
    }

    // 9. Numbered requirement in paragraph/list
    if (/^\s*\d+(?:\.\d+)+\.?\s+[A-Z]/.test(rawText) && (hasShall || hasMust || keyMatch)) {
      reasons.push({
        code: 'NUMBERED_REQUIREMENT',
        description: 'Structured numbered requirement item.',
        score: DETECTION_SCORE_WEIGHTS.NUMBERED_REQUIREMENT,
      });
    }

    // 10. Bullet list requirement
    if (block.type === 'LIST_ITEM' && (hasShall || hasMust || keyMatch)) {
      reasons.push({
        code: 'BULLET_REQUIREMENT',
        description: 'Bulleted list requirement item.',
        score: DETECTION_SCORE_WEIGHTS.BULLET_REQUIREMENT,
      });
    }

    // 11. Weaker signals: should / may (when no shall/must/key)
    if (!hasShall && !hasMust && reasons.length === 0) {
      if (/\bshould\b/i.test(rawText)) {
        reasons.push({
          code: 'WEAK_OBLIGATION_SHOULD',
          description: 'Contains recommendation keyword "should".',
          score: DETECTION_SCORE_WEIGHTS.WEAK_OBLIGATION_SHOULD,
          matchedText: 'should',
        });
        warnings.push({
          code: 'WEAK_OBLIGATION',
          message:
            'Uses weaker recommendation modal ("should") rather than mandatory obligation ("shall"/"must").',
        });
      } else if (
        /\bmay\b/i.test(rawText) &&
        /\b(?:user|admin|system|platform|application)\b/i.test(rawText)
      ) {
        reasons.push({
          code: 'OPTIONAL_CAPABILITY_MAY',
          description: 'Contains optional capability keyword "may".',
          score: DETECTION_SCORE_WEIGHTS.OPTIONAL_CAPABILITY_MAY,
          matchedText: 'may',
        });
      }
    }

    // If heading: only accept if strong obligation reasons exist (e.g. not just pure section title)
    if (isHeading) {
      const strongObligation = hasShall || hasMust || keyMatch;
      if (!strongObligation) {
        return null;
      }
    }

    // Section context check
    const sectionInfo = block.sectionId ? sectionPathMap.get(block.sectionId) : undefined;
    if (sectionInfo && this.isRequirementSectionTitle(sectionInfo.title)) {
      reasons.push({
        code: 'SECTION_CONTEXT',
        description: `Located in requirement section: "${sectionInfo.title}"`,
        score: DETECTION_SCORE_WEIGHTS.SECTION_CONTEXT,
      });
    }

    // If no detection reasons found, this is not a candidate
    if (reasons.length === 0) {
      return null;
    }

    // Calculate total deterministic score
    const totalScore = reasons.reduce((sum, r) => sum + r.score, 0);

    return {
      sourceBlockId: block.id,
      sourceTableId: null,
      sourceRowIndex: null,
      sourceText: rawText,
      externalKey,
      sectionId: block.sectionId || null,
      sectionPath: sectionInfo ? sectionInfo.path : null,
      pageNumber: block.pageNumber,
      lineStart,
      lineEnd,
      startOffset: block.startOffset,
      endOffset: block.endOffset,
      detectionMethod: 'RULE_BASED',
      detectionReasons: reasons,
      detectionScore: totalScore,
      warnings,
      orderIndex: 0,
    };
  }

  private evaluateTable(
    table: DocumentTableDto,
    sectionPathMap: Map<string, { path: string; title: string }>,
  ): RawDetectedCandidate[] {
    const candidates: RawDetectedCandidate[] = [];
    if (!table.rows || table.rows.length <= 1) return candidates;

    const headerRow = table.rows[0];
    if (!headerRow || !headerRow.cells || headerRow.cells.length === 0) return candidates;

    // Detect column indexes for ID and Description/Requirement
    let idColIdx = -1;
    let descColIdx = -1;

    headerRow.cells.forEach((cell, idx) => {
      const text = cell.text.trim().toLowerCase();
      if (/^(id|req\s*id|requirement\s*id|key|code|fr\s*#|nfr\s*#)$/i.test(text)) {
        idColIdx = idx;
      } else if (
        /^(requirement|description|specification|details|statement|functional\s*requirement)$/i.test(
          text,
        )
      ) {
        descColIdx = idx;
      }
    });

    // If no clear description column, check if table headers generally look like requirements
    const isReqTable =
      descColIdx !== -1 ||
      headerRow.cells.some(c => /requirement|specification|use\s*case|feature/i.test(c.text));

    if (!isReqTable) return candidates;

    const sectionInfo = table.sectionId ? sectionPathMap.get(table.sectionId) : undefined;

    // Process data rows
    for (let rIdx = 1; rIdx < table.rows.length; rIdx++) {
      const row = table.rows[rIdx]!;
      if (!row.cells || row.cells.length === 0) continue;

      let extractedKey: string | null = null;
      let textContent = '';

      if (descColIdx !== -1 && row.cells[descColIdx]) {
        textContent = row.cells[descColIdx]!.text.trim();
      } else {
        // Fallback: take longest cell
        textContent = row.cells
          .reduce((longest, c) => (c.text.length > longest.length ? c.text : longest), '')
          .trim();
      }

      if (idColIdx !== -1 && row.cells[idColIdx]) {
        extractedKey = row.cells[idColIdx]!.text.trim();
      }

      if (textContent.length < CANDIDATE_DETECTION_LIMITS.MIN_CANDIDATE_LENGTH) {
        continue;
      }

      const reasons: CandidateDetectionReasonDto[] = [
        {
          code: 'REQUIREMENT_TABLE_ROW',
          description: `Extracted from requirement table row (row ${rIdx}).`,
          score: DETECTION_SCORE_WEIGHTS.REQUIREMENT_TABLE_ROW,
        },
      ];

      if (extractedKey) {
        reasons.push({
          code: 'EXPLICIT_SOURCE_ID',
          description: `Table ID column: ${extractedKey}`,
          score: DETECTION_SCORE_WEIGHTS.EXPLICIT_SOURCE_ID,
          matchedText: extractedKey,
        });
      }

      if (/\bshall\b/i.test(textContent)) {
        reasons.push({
          code: 'EXPLICIT_SHALL',
          description: 'Contains mandatory obligation keyword "shall".',
          score: DETECTION_SCORE_WEIGHTS.EXPLICIT_SHALL,
          matchedText: 'shall',
        });
      }

      if (/\bmust\b/i.test(textContent)) {
        reasons.push({
          code: 'EXPLICIT_MUST',
          description: 'Contains mandatory obligation keyword "must".',
          score: DETECTION_SCORE_WEIGHTS.EXPLICIT_MUST,
          matchedText: 'must',
        });
      }

      const totalScore = reasons.reduce((sum, r) => sum + r.score, 0);

      candidates.push({
        sourceBlockId: null,
        sourceTableId: table.id,
        sourceRowIndex: rIdx,
        sourceText: textContent,
        externalKey: extractedKey,
        sectionId: table.sectionId || null,
        sectionPath: sectionInfo ? sectionInfo.path : null,
        pageNumber: table.pageNumber,
        lineStart: null,
        lineEnd: null,
        startOffset: null,
        endOffset: null,
        detectionMethod: 'RULE_BASED',
        detectionReasons: reasons,
        detectionScore: totalScore,
        warnings: [],
        orderIndex: 0,
      });
    }

    return candidates;
  }

  private extractExternalKey(text: string): { key: string; remainingText: string } | null {
    // Patterns e.g. "REQ-001:", "[FR-12]", "NFR_04 -", "AUTH-REQ-02:"
    const match =
      /^\[?([A-Z]{2,10}(?:-[A-Z0-9]+)+(?:[-_]\d+)?|[A-Z]{2,6}-\d+|FR-\d+|NFR-\d+|BR-\d+|SR-\d+)\]?[\s:\-–—]+(.*)$/i.exec(
        text,
      );

    if (match && match[1] && match[2]) {
      const key = match[1].trim();
      const remainingText = match[2].trim();
      if (remainingText.length >= 10) {
        return { key, remainingText };
      }
    }

    return null;
  }

  private isTableOfContents(text: string): boolean {
    // Matches TOC dot leaders e.g. "3.2 Authentication ....... 14"
    return (
      /(\.{3,}|_{3,}|-{3,}|\s{4,})\s*\d+\s*$/.test(text) ||
      /^\s*table\s+of\s+contents\b/i.test(text)
    );
  }

  private isDocumentMetadata(text: string): boolean {
    return /^\s*(?:document\s+version|version|prepared\s+by|author|date|revision|approved\s+by|document\s+status|confidentiality)\s*[:-]/i.test(
      text,
    );
  }

  private isStandardBoilerplate(text: string): boolean {
    const t = text.toLowerCase();
    return (
      t.includes('this section describes the organization of this document') ||
      t.includes('the remainder of this document is organized as follows') ||
      (t.includes('see section') && t.includes('for more details')) ||
      t.startsWith('for further information, refer to')
    );
  }

  private isHeaderOrFooter(text: string): boolean {
    const t = text.toLowerCase();
    return (
      t === 'confidential' ||
      t === 'confidential — company internal' ||
      t === 'software requirements specification' ||
      t === 'software requirement specification' ||
      t === 'all rights reserved.'
    );
  }

  private isRequirementSectionTitle(title: string): boolean {
    const t = title.toLowerCase();
    return (
      t.includes('requirement') ||
      t.includes('specification') ||
      t.includes('functional') ||
      t.includes('business rule') ||
      t.includes('system capability') ||
      t.includes('security')
    );
  }

  private buildSectionPathMap(
    sections: readonly DocumentSectionDto[],
  ): Map<string, { path: string; title: string }> {
    const map = new Map<string, { path: string; title: string }>();
    const sectionById = new Map<string, DocumentSectionDto>();

    for (const sec of sections) {
      sectionById.set(sec.id, sec);
    }

    for (const sec of sections) {
      const titles: string[] = [sec.title];
      let currentParentId = sec.parentSectionId;

      while (currentParentId && sectionById.has(currentParentId)) {
        const parent = sectionById.get(currentParentId)!;
        titles.unshift(parent.title);
        currentParentId = parent.parentSectionId;
      }

      map.set(sec.id, {
        path: titles.join(' > '),
        title: sec.title,
      });
    }

    return map;
  }
}
