/**
 * @file packages/core/src/sources/run-config/runtime-checker.ts
 * Bounded local tool availability checker using non-shell child_process execution.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { RuntimeAvailabilityDto } from '@ai-quality/contracts';

const execFileAsync = promisify(execFile);

export class RuntimeChecker {
  /**
   * Checks tool availability and retrieves version using shell: false.
   */
  async checkRuntime(
    runtimeExecutable: string,
    versionFlag = '--version',
  ): Promise<RuntimeAvailabilityDto> {
    try {
      const { stdout } = await execFileAsync(runtimeExecutable, [versionFlag], {
        shell: false,
        timeout: 2500,
        maxBuffer: 64 * 1024,
      });

      const firstLine = (stdout || '').trim().split('\n')[0] ?? '';
      return {
        runtime: runtimeExecutable,
        available: true,
        version: firstLine.slice(0, 100) || 'Available',
      };
    } catch {
      return {
        runtime: runtimeExecutable,
        available: false,
        version: null,
      };
    }
  }

  /**
   * Checks multiple common runtimes relevant to discovered ecosystems.
   */
  async checkCommonRuntimes(
    runtimes: readonly string[],
  ): Promise<readonly RuntimeAvailabilityDto[]> {
    const results = await Promise.all(
      runtimes.map(async rt => {
        const flag = rt === 'go' ? 'version' : '--version';
        return await this.checkRuntime(rt, flag);
      }),
    );
    return results;
  }
}
