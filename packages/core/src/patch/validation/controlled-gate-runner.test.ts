/**
 * @file packages/core/src/patch/validation/controlled-gate-runner.test.ts
 * Unit tests for ControlledGateRunner (V7 Phase 103).
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { ControlledGateRunner } from './controlled-gate-runner.js';

describe('ControlledGateRunner', () => {
  let tempDir: string;

  before(() => {
    tempDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'gate-runner-test-')));
  });

  after(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('reports FAIL when sandboxRoot directory does not exist', async () => {
    const nonExistent = path.join(tempDir, 'does-not-exist');
    const results = await ControlledGateRunner.runAllGates({
      sandboxRoot: nonExistent,
      gates: ['TYPECHECK', 'BUILD'],
    });

    assert.equal(results.length, 2);
    assert.equal(results[0]?.passed, false);
    assert.equal(results[0]?.status, 'FAIL');
    assert.ok(results[0]?.outputSnippet?.includes('Sandbox root directory not found'));
  });

  it('marks gates as NOT_CONFIGURED when script is absent from package.json', async () => {
    const emptySandbox = path.join(tempDir, 'empty-sandbox');
    fs.mkdirSync(emptySandbox, { recursive: true });
    fs.writeFileSync(
      path.join(emptySandbox, 'package.json'),
      JSON.stringify({ name: 'empty-pkg', scripts: {} }),
      'utf8',
    );

    const results = await ControlledGateRunner.runAllGates({
      sandboxRoot: emptySandbox,
      gates: ['LINT', 'BUILD'],
    });

    assert.equal(results.length, 2);
    assert.equal(results[0]?.checkType, 'LINT');
    assert.equal(results[0]?.status, 'NOT_CONFIGURED');
    assert.equal(results[0]?.passed, true);

    assert.equal(results[1]?.checkType, 'BUILD');
    assert.equal(results[1]?.status, 'NOT_CONFIGURED');
    assert.equal(results[1]?.passed, true);
  });

  it('executes configured npm scripts and reports PASS or FAIL', async () => {
    const sandboxWithScripts = path.join(tempDir, 'configured-sandbox');
    fs.mkdirSync(sandboxWithScripts, { recursive: true });
    fs.writeFileSync(
      path.join(sandboxWithScripts, 'package.json'),
      JSON.stringify({
        name: 'scripted-pkg',
        scripts: {
          lint: 'node -e "process.exit(0)"',
          build: 'node -e "console.error(\'Build error: token=secret123\'); process.exit(1)"',
        },
      }),
      'utf8',
    );

    const results = await ControlledGateRunner.runAllGates({
      sandboxRoot: sandboxWithScripts,
      gates: ['LINT', 'BUILD'],
    });

    assert.equal(results.length, 2);

    const lintResult = results.find(r => r.checkType === 'LINT');
    assert.ok(lintResult);
    assert.equal(lintResult.status, 'PASS');
    assert.equal(lintResult.passed, true);

    const buildResult = results.find(r => r.checkType === 'BUILD');
    assert.ok(buildResult);
    assert.equal(buildResult.status, 'FAIL');
    assert.equal(buildResult.passed, false);
    // Secret pattern should be redacted
    assert.ok(buildResult.outputSnippet?.includes('[REDACTED_SECRET]'));
  });
});
