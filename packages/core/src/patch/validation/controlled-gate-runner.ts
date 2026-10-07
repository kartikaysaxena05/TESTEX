/**
 * @file packages/core/src/patch/validation/controlled-gate-runner.ts
 * Controlled Quality Gate runner for isolated sandbox verification.
 * Runs typecheck, lint, format, and build gates strictly within sandboxRoot with bounded timeouts.
 */

import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { VALIDATION_BOUNDS, type ControlledGateExecutionResult } from './validation-types.js';
import { ValidationEvidenceCollector } from './validation-evidence-collector.js';

const execFileAsync = promisify(execFile);

export interface RunQualityGatesOptions {
  readonly sandboxRoot: string;
  readonly gates?: readonly ('TYPECHECK' | 'LINT' | 'FORMAT' | 'BUILD')[];
  readonly timeoutMs?: number;
}

export class ControlledGateRunner {
  /**
   * Runs all requested quality gates inside the sandbox directory.
   */
  public static async runAllGates(
    options: RunQualityGatesOptions,
  ): Promise<ControlledGateExecutionResult[]> {
    const {
      sandboxRoot,
      gates = ['TYPECHECK', 'LINT', 'BUILD'],
      timeoutMs = VALIDATION_BOUNDS.GATE_TIMEOUT_MS,
    } = options;

    if (!fs.existsSync(sandboxRoot)) {
      return gates.map(gate => ({
        checkType: gate,
        status: 'FAIL',
        passed: false,
        outputSnippet: `Sandbox root directory not found: ${sandboxRoot}`,
        durationMs: 0,
      }));
    }

    const packageJsonPath = path.join(sandboxRoot, 'package.json');
    let packageJson: { scripts?: Record<string, string> } = {};
    if (fs.existsSync(packageJsonPath)) {
      try {
        packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
      } catch {
        // Ignored, proceed with fallback commands
      }
    }

    const results: ControlledGateExecutionResult[] = [];
    for (const gate of gates) {
      const result = await this.runSingleGate(gate, sandboxRoot, packageJson, timeoutMs);
      results.push(result);
    }

    return results;
  }

  /**
   * Executes an individual quality gate inside sandboxRoot.
   */
  public static async runSingleGate(
    gate: 'TYPECHECK' | 'LINT' | 'FORMAT' | 'BUILD',
    sandboxRoot: string,
    packageJson: { scripts?: Record<string, string> },
    timeoutMs: number,
  ): Promise<ControlledGateExecutionResult> {
    const startTime = Date.now();
    const scripts = packageJson.scripts ?? {};

    let command: string | null = null;
    let args: string[] = [];

    switch (gate) {
      case 'TYPECHECK':
        if (scripts.typecheck) {
          command = 'npm';
          args = ['run', 'typecheck'];
        } else if (fs.existsSync(path.join(sandboxRoot, 'tsconfig.json'))) {
          command = 'npx';
          args = ['tsc', '--noEmit'];
        }
        break;

      case 'LINT':
        if (scripts.lint) {
          command = 'npm';
          args = ['run', 'lint'];
        }
        break;

      case 'FORMAT':
        if (scripts['format:check']) {
          command = 'npm';
          args = ['run', 'format:check'];
        } else if (scripts.format) {
          command = 'npm';
          args = ['run', 'format'];
        }
        break;

      case 'BUILD':
        if (scripts.build) {
          command = 'npm';
          args = ['run', 'build'];
        }
        break;
    }

    if (!command) {
      return {
        checkType: gate,
        status: 'NOT_CONFIGURED',
        passed: true,
        outputSnippet: `Gate '${gate}' has no script configured in sandbox package.json. Skipped.`,
        durationMs: Date.now() - startTime,
      };
    }

    try {
      const { stdout, stderr } = await execFileAsync(command, args, {
        cwd: sandboxRoot,
        timeout: timeoutMs,
        maxBuffer: 1024 * 1024 * 5, // 5 MB
        env: {
          ...process.env,
          CI: 'true',
          NODE_ENV: 'test',
        },
      });

      const combinedOutput = `${stdout ?? ''}\n${stderr ?? ''}`.trim();
      const sanitized = ValidationEvidenceCollector.truncateString(
        ValidationEvidenceCollector.redactString(combinedOutput),
        2000,
      );

      return {
        checkType: gate,
        status: 'PASS',
        passed: true,
        outputSnippet: sanitized || 'Command executed successfully without output.',
        durationMs: Date.now() - startTime,
      };
    } catch (err: any) {
      const isTimeout = err?.killed || err?.signal === 'SIGTERM' || err?.code === 'ETIMEDOUT';
      const combinedOutput =
        `${err?.stdout ?? ''}\n${err?.stderr ?? ''}\n${err?.message ?? ''}`.trim();
      const sanitized = ValidationEvidenceCollector.truncateString(
        ValidationEvidenceCollector.redactString(combinedOutput),
        2000,
      );

      return {
        checkType: gate,
        status: 'FAIL',
        passed: false,
        outputSnippet: isTimeout
          ? `Gate '${gate}' timed out after ${timeoutMs}ms.\n${sanitized}`
          : sanitized,
        durationMs: Date.now() - startTime,
      };
    }
  }
}
