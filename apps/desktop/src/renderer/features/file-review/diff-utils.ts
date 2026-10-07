/**
 * @file apps/desktop/src/renderer/features/file-review/diff-utils.ts
 * Parser and utility routines for rendering unified and split diffs in the desktop UI.
 */

export interface DiffLine {
  readonly type: 'added' | 'removed' | 'context' | 'header';
  readonly content: string;
  readonly oldLineNumber?: number;
  readonly newLineNumber?: number;
}

export interface SplitDiffRow {
  readonly oldLine?: {
    readonly lineNumber: number;
    readonly content: string;
    readonly type: 'removed' | 'context';
  };
  readonly newLine?: {
    readonly lineNumber: number;
    readonly content: string;
    readonly type: 'added' | 'context';
  };
}

export interface ParsedUiFileDiff {
  readonly oldPath: string;
  readonly newPath: string;
  readonly filePath: string;
  readonly linesAdded: number;
  readonly linesRemoved: number;
  readonly lines: readonly DiffLine[];
  readonly splitRows: readonly SplitDiffRow[];
}

export function parseUnifiedDiffForUi(diffText: string): ParsedUiFileDiff[] {
  if (!diffText || typeof diffText !== 'string' || !diffText.trim()) {
    return [];
  }

  const rawLines = diffText.replace(/\r\n/g, '\n').split('\n');
  const files: ParsedUiFileDiff[] = [];

  let i = 0;
  while (i < rawLines.length) {
    const line = rawLines[i];
    if (line === undefined) break;

    // Detect diff header: --- a/path or --- path
    if (!line.startsWith('--- ')) {
      i++;
      continue;
    }

    const oldPathRaw = line.substring(4).trim();
    i++;
    const nextLine = rawLines[i];
    if (i >= rawLines.length || !nextLine || !nextLine.startsWith('+++ ')) {
      continue;
    }

    const newPathRaw = nextLine.substring(4).trim();
    i++;

    const oldPath = oldPathRaw.replace(/^[ab]\//, '');
    const newPath = newPathRaw.replace(/^[ab]\//, '');
    const filePath = newPath === '/dev/null' ? oldPath : newPath;

    const diffLines: DiffLine[] = [];
    const splitRows: SplitDiffRow[] = [];
    let linesAdded = 0;
    let linesRemoved = 0;

    let currentOldLine = 1;
    let currentNewLine = 1;

    while (i < rawLines.length) {
      const current = rawLines[i];
      if (current === undefined || current.startsWith('--- ')) {
        break;
      }

      if (current.startsWith('@@ ')) {
        // Hunk header: @@ -oldStart,oldLen +newStart,newLen @@
        diffLines.push({
          type: 'header',
          content: current,
        });

        const match = current.match(/^@@\s+-(\d+)(?:,\d+)?\s+\+(\d+)(?:,\d+)?\s+@@/);
        if (match) {
          currentOldLine = parseInt(match[1] ?? '1', 10);
          currentNewLine = parseInt(match[2] ?? '1', 10);
        }
        i++;
        continue;
      }

      const prefix = current[0];
      const text = current.substring(1);

      if (prefix === '+') {
        linesAdded++;
        diffLines.push({
          type: 'added',
          content: text,
          newLineNumber: currentNewLine,
        });
        splitRows.push({
          newLine: {
            lineNumber: currentNewLine,
            content: text,
            type: 'added',
          },
        });
        currentNewLine++;
      } else if (prefix === '-') {
        linesRemoved++;
        diffLines.push({
          type: 'removed',
          content: text,
          oldLineNumber: currentOldLine,
        });
        splitRows.push({
          oldLine: {
            lineNumber: currentOldLine,
            content: text,
            type: 'removed',
          },
        });
        currentOldLine++;
      } else if (prefix === ' ') {
        diffLines.push({
          type: 'context',
          content: text,
          oldLineNumber: currentOldLine,
          newLineNumber: currentNewLine,
        });
        splitRows.push({
          oldLine: {
            lineNumber: currentOldLine,
            content: text,
            type: 'context',
          },
          newLine: {
            lineNumber: currentNewLine,
            content: text,
            type: 'context',
          },
        });
        currentOldLine++;
        currentNewLine++;
      } else if (current.trim().length === 0) {
        // Empty line inside diff
        diffLines.push({
          type: 'context',
          content: '',
          oldLineNumber: currentOldLine,
          newLineNumber: currentNewLine,
        });
        currentOldLine++;
        currentNewLine++;
      }

      i++;
    }

    files.push({
      oldPath,
      newPath,
      filePath,
      linesAdded,
      linesRemoved,
      lines: diffLines,
      splitRows,
    });
  }

  // If no standard --- / +++ headers were found, treat whole text as a single diff
  if (files.length === 0 && diffText.trim().length > 0) {
    const fallbackLines: DiffLine[] = [];
    const fallbackSplit: SplitDiffRow[] = [];
    let added = 0;
    let removed = 0;
    let oldNum = 1;
    let newNum = 1;

    for (const raw of rawLines) {
      if (raw.startsWith('+')) {
        added++;
        fallbackLines.push({ type: 'added', content: raw.substring(1), newLineNumber: newNum });
        fallbackSplit.push({
          newLine: { lineNumber: newNum, content: raw.substring(1), type: 'added' },
        });
        newNum++;
      } else if (raw.startsWith('-')) {
        removed++;
        fallbackLines.push({ type: 'removed', content: raw.substring(1), oldLineNumber: oldNum });
        fallbackSplit.push({
          oldLine: { lineNumber: oldNum, content: raw.substring(1), type: 'removed' },
        });
        oldNum++;
      } else if (raw.startsWith('@@')) {
        fallbackLines.push({ type: 'header', content: raw });
      } else {
        fallbackLines.push({
          type: 'context',
          content: raw.startsWith(' ') ? raw.substring(1) : raw,
          oldLineNumber: oldNum,
          newLineNumber: newNum,
        });
        fallbackSplit.push({
          oldLine: {
            lineNumber: oldNum,
            content: raw.startsWith(' ') ? raw.substring(1) : raw,
            type: 'context',
          },
          newLine: {
            lineNumber: newNum,
            content: raw.startsWith(' ') ? raw.substring(1) : raw,
            type: 'context',
          },
        });
        oldNum++;
        newNum++;
      }
    }

    files.push({
      oldPath: 'proposal',
      newPath: 'proposal',
      filePath: 'proposal',
      linesAdded: added,
      linesRemoved: removed,
      lines: fallbackLines,
      splitRows: fallbackSplit,
    });
  }

  return files;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
