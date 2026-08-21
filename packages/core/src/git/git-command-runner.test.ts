import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { GitCommandRunner } from './git-command-runner.js';
import { GitTimeoutError } from './git-errors.js';

describe('GitCommandRunner Security and Execution Tests', () => {
  let tempDir: string;
  let sampleRepoDir: string;
  let runner: GitCommandRunner;

  before(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'git-runner-test-'));
    // Directory with special characters to test command injection resistance
    sampleRepoDir = path.join(tempDir, "special 'dir' with $paces & [brackets]");
    fs.mkdirSync(sampleRepoDir, { recursive: true });

    runner = new GitCommandRunner('git', 3000);

    // Initialize sample git repo safely
    await runner.runGit(['-C', sampleRepoDir, 'init']);
  });

  after(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore
    }
  });

  it('should verify Git version safely', async () => {
    const info = await runner.checkGitVersion();
    assert.strictEqual(info.available, true);
    assert.ok(info.version !== null);
    assert.ok(info.version.length > 0);
  });

  it('should detect working tree in a directory with spaces, quotes, and brackets without command injection', async () => {
    const isWorkTree = await runner.isInsideWorkTree(sampleRepoDir);
    assert.strictEqual(isWorkTree, true);

    const topLevel = await runner.getShowTopLevel(sampleRepoDir);
    assert.ok(topLevel !== null);
    assert.strictEqual(fs.realpathSync(topLevel), fs.realpathSync(sampleRepoDir));
  });

  it('should handle non-git directory safely without throwing', async () => {
    const nonGitDir = path.join(tempDir, 'plain-folder');
    fs.mkdirSync(nonGitDir, { recursive: true });

    const isWorkTree = await runner.isInsideWorkTree(nonGitDir);
    assert.strictEqual(isWorkTree, false);

    const topLevel = await runner.getShowTopLevel(nonGitDir);
    assert.strictEqual(topLevel, null);
  });

  it('should gracefully handle missing git executable without crashing', async () => {
    const badRunner = new GitCommandRunner('non_existent_git_binary_12345');
    const info = await badRunner.checkGitVersion();
    assert.strictEqual(info.available, false);
    assert.strictEqual(info.version, null);

    const isWorkTree = await badRunner.isInsideWorkTree(sampleRepoDir);
    assert.strictEqual(isWorkTree, false);
  });

  it('should throw GitTimeoutError when process exceeds timeout limit', async () => {
    // 50ms timeout on a command designed to sleep
    const timeoutRunner = new GitCommandRunner('sleep', 50);
    await assert.rejects(async () => await timeoutRunner.runGit(['2']), GitTimeoutError);
  });
});
