/**
 * @file packages/core/src/patch/diff/patch-parser.test.ts
 * Unit tests for unified diff parsing, validation, generation, and bounds checking.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PatchParser } from './patch-parser.js';
import { PatchProposalMalformedDiffError, PatchProposalOversizedError } from '../patch-errors.js';

describe('PatchParser (Unified Diff & Structured Edits)', () => {
  it('parses valid single-file unified diff into structured hunks and edit operations', () => {
    const diff = `--- a/src/validator.ts
+++ b/src/validator.ts
@@ -10,3 +10,3 @@
 function isValidAge(age: number): boolean {
-  return age > 18;
+  return age >= 18;
 }
`;

    const result = PatchParser.parseUnifiedDiff(diff);
    assert.equal(result.totalFilesChanged, 1);
    assert.equal(result.totalLinesAdded, 1);
    assert.equal(result.totalLinesRemoved, 1);
    assert.equal(result.totalChangedLines, 2);

    const file = result.files[0];
    assert.ok(file);
    assert.equal(file.filePath, 'src/validator.ts');
    assert.equal(file.hunks.length, 1);
    assert.equal(file.hunks[0]?.oldStart, 10);
    assert.equal(file.hunks[0]?.newStart, 10);
    assert.equal(file.structuredEdits.length, 1);
    assert.equal(file.structuredEdits[0]?.filePath, 'src/validator.ts');
    assert.equal(file.structuredEdits[0]?.originalContent, '  return age > 18;');
    assert.equal(file.structuredEdits[0]?.replacementContent, '  return age >= 18;');
  });

  it('generates valid canonical unified diff from original file content and structured edits', () => {
    const originalContent = `export function checkStatus(code: number): boolean {
  if (code === 200) {
    return true;
  }
  return false;
}`;

    const edits = [
      {
        filePath: 'src/status.ts',
        startLine: 5,
        endLine: 5,
        originalContent: '  return false;',
        replacementContent: '  return code === 201;',
      },
    ];

    const generatedDiff = PatchParser.generateUnifiedDiff('src/status.ts', originalContent, edits);
    assert.ok(generatedDiff.includes('--- a/src/status.ts'));
    assert.ok(generatedDiff.includes('+++ b/src/status.ts'));
    assert.ok(generatedDiff.includes('-  return false;'));
    assert.ok(generatedDiff.includes('+  return code === 201;'));

    // Verify generated diff parses cleanly back
    const reParsed = PatchParser.parseUnifiedDiff(generatedDiff);
    assert.equal(reParsed.totalFilesChanged, 1);
    assert.equal(reParsed.totalLinesAdded, 1);
    assert.equal(reParsed.totalLinesRemoved, 1);
  });

  it('validates hunk content against original file content', () => {
    const fileContent = `line 1
line 2
line 3
target line
line 5`;

    const validDiff = `--- a/test.txt
+++ b/test.txt
@@ -3,3 +3,3 @@
 line 3
-target line
+fixed line
 line 5
`;

    const contentMap = new Map<string, string>();
    contentMap.set('test.txt', fileContent);

    // Parsing with matching content succeeds
    const parsed = PatchParser.parseUnifiedDiff(validDiff, contentMap);
    assert.equal(parsed.totalFilesChanged, 1);

    // Diff referencing wrong original line throws PatchProposalMalformedDiffError
    const mismatchDiff = `--- a/test.txt
+++ b/test.txt
@@ -3,3 +3,3 @@
 line 3
-WRONG LINE
+fixed line
 line 5
`;

    assert.throws(
      () => PatchParser.parseUnifiedDiff(mismatchDiff, contentMap),
      (err: unknown) => err instanceof PatchProposalMalformedDiffError,
    );
  });

  it('rejects empty or whitespace-only diffs', () => {
    assert.throws(
      () => PatchParser.parseUnifiedDiff(''),
      (err: unknown) => err instanceof PatchProposalMalformedDiffError,
    );
    assert.throws(
      () => PatchParser.parseUnifiedDiff('   \n  \t '),
      (err: unknown) => err instanceof PatchProposalMalformedDiffError,
    );
  });

  it('rejects diff with mismatched hunk line counts', () => {
    const malformedHunkDiff = `--- a/file.ts
+++ b/file.ts
@@ -1,5 +1,5 @@
 context 1
-deleted line
+added line
 context 2
`; // declared 5 lines, but actual is 3 context/deleted lines

    assert.throws(
      () => PatchParser.parseUnifiedDiff(malformedHunkDiff),
      (err: unknown) => err instanceof PatchProposalMalformedDiffError,
    );
  });

  it('rejects oversized patches exceeding PATCH_BOUNDS', () => {
    // 1. Files count > 3
    assert.throws(
      () =>
        PatchParser.validateBounds({
          filesChanged: 4,
          linesAdded: 5,
          linesRemoved: 5,
          totalChangedLines: 10,
          diffLength: 200,
        }),
      (err: unknown) => err instanceof PatchProposalOversizedError,
    );

    // 2. Lines added > 50
    assert.throws(
      () =>
        PatchParser.validateBounds({
          filesChanged: 1,
          linesAdded: 51,
          linesRemoved: 5,
          totalChangedLines: 56,
          diffLength: 200,
        }),
      (err: unknown) => err instanceof PatchProposalOversizedError,
    );

    // 3. Lines removed > 30
    assert.throws(
      () =>
        PatchParser.validateBounds({
          filesChanged: 1,
          linesAdded: 5,
          linesRemoved: 31,
          totalChangedLines: 36,
          diffLength: 200,
        }),
      (err: unknown) => err instanceof PatchProposalOversizedError,
    );

    // 4. Total changed lines > 60
    assert.throws(
      () =>
        PatchParser.validateBounds({
          filesChanged: 2,
          linesAdded: 40,
          linesRemoved: 25,
          totalChangedLines: 65,
          diffLength: 200,
        }),
      (err: unknown) => err instanceof PatchProposalOversizedError,
    );

    // 5. Diff byte size > 64KB
    assert.throws(
      () =>
        PatchParser.validateBounds({
          filesChanged: 1,
          linesAdded: 5,
          linesRemoved: 5,
          totalChangedLines: 10,
          diffLength: 70 * 1024,
        }),
      (err: unknown) => err instanceof PatchProposalOversizedError,
    );
  });
});
