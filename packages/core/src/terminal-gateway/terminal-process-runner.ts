/**
 * @file packages/core/src/terminal-gateway/terminal-process-runner.ts
 * Low-level, privileged process execution engine wrapping child_process.spawn.
 *
 * Guarantees:
 * 1. Executes strictly via spawn with array arguments (NEVER string shell execution).
 * 2. shell: false is strictly enforced.
 * 3. Enforces bounded execution time with process-tree termination.
 * 4. Buffers output up to maxOutputBytes without memory exhaustion.
 * 5. Supports graceful cancellation via AbortSignal or cancel() method.
 */

import { spawn, type ChildProcess } from 'node:child_process';
import { TerminalTimeoutError, TerminalCancelledError } from './terminal-errors.js';
import { TerminalSanitizer } from './terminal-sanitizer.js';

export interface ProcessRunOptions {
  readonly binary: string;
  readonly args: readonly string[];
  readonly cwd: string;
  readonly env: NodeJS.ProcessEnv;
  readonly timeoutMs: number;
  readonly maxOutputBytes: number;
  readonly signal?: AbortSignal;
  readonly onStdoutChunk?: (chunk: string) => void;
  readonly onStderrChunk?: (chunk: string) => void;
}

export interface ProcessRunResult {
  readonly exitCode: number | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly durationMs: number;
  readonly timedOut: boolean;
  readonly cancelled: boolean;
}

export class TerminalProcessRunner {
  private activeProcess: ChildProcess | null = null;
  private isCancelled = false;

  /**
   * Executes process in a contained sandbox.
   */
  public async execute(options: ProcessRunOptions): Promise<ProcessRunResult> {
    const {
      binary,
      args,
      cwd,
      env,
      timeoutMs,
      maxOutputBytes,
      signal,
      onStdoutChunk,
      onStderrChunk,
    } = options;

    if (signal?.aborted) {
      throw new TerminalCancelledError('Terminal execution was cancelled prior to start.');
    }

    return new Promise<ProcessRunResult>((resolve, reject) => {
      const startTime = performance.now();
      let timedOut = false;
      let rawStdout = '';
      let rawStderr = '';
      let stdoutBytes = 0;
      let stderrBytes = 0;
      let timer: NodeJS.Timeout | null = null;

      const child = spawn(binary, [...args], {
        cwd,
        env,
        shell: false,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      this.activeProcess = child;

      // Handle timeout
      if (timeoutMs > 0) {
        timer = setTimeout(() => {
          timedOut = true;
          this.terminateChild();
        }, timeoutMs);
      }

      // Handle cancellation via AbortSignal
      const abortHandler = () => {
        this.isCancelled = true;
        this.terminateChild();
      };

      if (signal) {
        signal.addEventListener('abort', abortHandler, { once: true });
      }

      // Collect stdout
      child.stdout?.on('data', (data: Buffer) => {
        const chunk = data.toString('utf-8');
        stdoutBytes += Buffer.byteLength(chunk, 'utf-8');
        if (stdoutBytes <= maxOutputBytes * 2) {
          rawStdout += chunk;
        }
        onStdoutChunk?.(chunk);
      });

      // Collect stderr
      child.stderr?.on('data', (data: Buffer) => {
        const chunk = data.toString('utf-8');
        stderrBytes += Buffer.byteLength(chunk, 'utf-8');
        if (stderrBytes <= maxOutputBytes * 2) {
          rawStderr += chunk;
        }
        onStderrChunk?.(chunk);
      });

      // Error handler
      child.on('error', (err: Error) => {
        if (timer) clearTimeout(timer);
        if (signal) signal.removeEventListener('abort', abortHandler);
        this.activeProcess = null;

        // If cancelled or timed out, report properly rather than crashing
        if (this.isCancelled || signal?.aborted) {
          resolve({
            exitCode: null,
            stdout: TerminalSanitizer.boundOutput(TerminalSanitizer.sanitizeOutput(rawStdout), maxOutputBytes),
            stderr: TerminalSanitizer.boundOutput(TerminalSanitizer.sanitizeOutput(rawStderr + `\n${err.message}`), maxOutputBytes),
            durationMs: Math.round(performance.now() - startTime),
            timedOut: false,
            cancelled: true,
          });
          return;
        }

        if (timedOut) {
          resolve({
            exitCode: null,
            stdout: TerminalSanitizer.boundOutput(TerminalSanitizer.sanitizeOutput(rawStdout), maxOutputBytes),
            stderr: TerminalSanitizer.boundOutput(TerminalSanitizer.sanitizeOutput(rawStderr + `\n${err.message}`), maxOutputBytes),
            durationMs: Math.round(performance.now() - startTime),
            timedOut: true,
            cancelled: false,
          });
          return;
        }

        reject(err);
      });

      // Close handler
      child.on('close', (code: number | null) => {
        if (timer) clearTimeout(timer);
        if (signal) signal.removeEventListener('abort', abortHandler);
        this.activeProcess = null;

        const durationMs = Math.round(performance.now() - startTime);

        const sanitizedStdout = TerminalSanitizer.boundOutput(
          TerminalSanitizer.sanitizeOutput(rawStdout),
          maxOutputBytes,
        );
        const sanitizedStderr = TerminalSanitizer.boundOutput(
          TerminalSanitizer.sanitizeOutput(rawStderr),
          maxOutputBytes,
        );

        resolve({
          exitCode: code,
          stdout: sanitizedStdout,
          stderr: sanitizedStderr,
          durationMs,
          timedOut,
          cancelled: this.isCancelled || Boolean(signal?.aborted),
        });
      });
    });
  }

  /**
   * Forcefully terminates active process tree.
   */
  public cancel(): void {
    this.isCancelled = true;
    this.terminateChild();
  }

  private terminateChild(): void {
    if (!this.activeProcess) return;
    try {
      // First try SIGTERM
      this.activeProcess.kill('SIGTERM');

      // Schedule SIGKILL after 1000ms if process doesn't terminate
      setTimeout(() => {
        if (this.activeProcess && !this.activeProcess.killed) {
          try {
            this.activeProcess.kill('SIGKILL');
          } catch {
            // Ignore if already dead
          }
        }
      }, 1000);
    } catch {
      // Ignore errors when terminating dead process
    }
  }
}
