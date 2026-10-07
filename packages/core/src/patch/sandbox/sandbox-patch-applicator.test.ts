/**
 * @file packages/core/src/patch/sandbox/sandbox-patch-applicator.test.ts
 * Unit tests for SandboxPatchApplicator: atomic line edits, conflict detection,
 * SHA-256 hash tracking, and claim vs actual diff verification.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { SandboxPatchApplicator } from './sandbox-patch-applicator.js';
import { PatchSandboxConflictError, PatchSandboxNotFoundError } from './sandbox-errors.js';

describe('SandboxPatchApplicator', () => {
  let tempDir: string;
  let sandboxRoot: string;

  before(() => {
    tempDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'applicator-test-')));
    sandboxRoot = path.join(tempDir, 'sandbox');
    fs.mkdirSync(sandboxRoot, { recursive: true });
  });

  after(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('applies clean structured line edit and computes before/after SHA256 hashes', () => {
    const filePath = 'src/validator.ts';
    const fullPath = path.join(sandboxRoot, filePath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });

    const originalContent = [
      'export function isValidAge(age: number): boolean {',
      '  return age > 18;',
      '}',
    ].join('\n');
    fs.writeFileSync(fullPath, originalContent, 'utf8');

    const result = SandboxPatchApplicator.applyPatchToSandbox({
      sandboxId: 'test-sandbox-id',
      sandboxRoot,
      targetFiles: [filePath],
      structuredEdits: [
        {
          filePath,
          startLine: 2,
          endLine: 2,
          originalContent: '  return age > 18;',
          replacementContent: '  return age >= 18;',
        },
      ],
      claimedFilesCount: 1,
      claimedLinesAdded: 1,
      claimedLinesRemoved: 1,
    });

    assert.equal(result.filesModified.length, 1);
    assert.equal(result.filesModified[0], filePath);
    assert.equal(result.linesAdded, 1);
    assert.equal(result.linesRemoved, 1);
    assert.equal(result.claimedVsActualDiffMatch, true);
    assert.ok(result.actualUnifiedDiff.includes('--- a/src/validator.ts'));
    assert.ok(result.actualUnifiedDiff.includes('+++ b/src/validator.ts'));
    assert.ok(result.fileHashesBefore[filePath]);
    assert.ok(result.fileHashesAfter[filePath]);
    assert.notEqual(result.fileHashesBefore[filePath], result.fileHashesAfter[filePath]);

    // Check disk content
    const updatedContent = fs.readFileSync(fullPath, 'utf8');
    assert.equal(
      updatedContent,
      ['export function isValidAge(age: number): boolean {', '  return age >= 18;', '}'].join('\n'),
    );
  });

  it('detects patch conflict when line on disk does not match expected patch hunk', () => {
    const filePath = 'src/conflict.ts';
    const fullPath = path.join(sandboxRoot, filePath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });

    const contentOnDisk = 'function doSomething() {\n  const x = 99;\n}\n';
    fs.writeFileSync(fullPath, contentOnDisk, 'utf8');

    assert.throws(
      () =>
        SandboxPatchApplicator.applyPatchToSandbox({
          sandboxId: 'test-sandbox-id',
          sandboxRoot,
          targetFiles: [filePath],
          structuredEdits: [
            {
              filePath,
              startLine: 2,
              endLine: 2,
              originalContent: '  const x = 42;', // mismatched expectation
              replacementContent: '  const x = 100;',
            },
          ],
          claimedFilesCount: 1,
          claimedLinesAdded: 1,
          claimedLinesRemoved: 1,
        }),
      PatchSandboxConflictError,
    );
  });

  it('throws PatchSandboxNotFoundError when target file does not exist', () => {
    assert.throws(
      () =>
        SandboxPatchApplicator.applyPatchToSandbox({
          sandboxId: 'test-sandbox-id',
          sandboxRoot,
          targetFiles: ['nonexistent.ts'],
          structuredEdits: [],
          claimedFilesCount: 1,
          claimedLinesAdded: 0,
          claimedLinesRemoved: 0,
        }),
      PatchSandboxNotFoundError,
    );
  });
});
