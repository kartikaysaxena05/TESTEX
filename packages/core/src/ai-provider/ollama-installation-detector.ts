/**
 * @file packages/core/src/ai-provider/ollama-installation-detector.ts
 * Safe, non-invasive detection of Ollama installation status on the host OS (Phase 127).
 * Strictly forbids automatic installation, shell script execution, or OS mutation.
 */

import fs from 'node:fs';
import path from 'node:path';
import type { OllamaInstallationState } from '@ai-quality/contracts';

export interface OllamaInstallationInspectionResult {
  readonly state: OllamaInstallationState;
  readonly detectedPath?: string;
  readonly isCustomEndpoint: boolean;
}

export class OllamaInstallationDetector {
  public static readonly DEFAULT_LOCAL_ENDPOINT = 'http://127.0.0.1:11434';

  private static customBinaryLookupFn?: () => string | null;

  /**
   * For testing: override binary lookup without modifying OS filesystem.
   */
  public static setBinaryLookupForTest(fn?: () => string | null): void {
    this.customBinaryLookupFn = fn;
  }

  /**
   * Evaluates if a given endpoint matches standard local Ollama loopback instances.
   */
  public static isDefaultEndpoint(endpoint: string): boolean {
    if (!endpoint || typeof endpoint !== 'string') {
      return false;
    }
    try {
      const parsed = new URL(endpoint.trim());
      const isLoopback =
        parsed.hostname === '127.0.0.1' ||
        parsed.hostname === 'localhost' ||
        parsed.hostname === '::1';
      const port = parsed.port || (parsed.protocol === 'https:' ? '443' : '80');
      return isLoopback && port === '11434';
    } catch {
      return false;
    }
  }

  /**
   * Non-invasively checks standard OS binary locations for Ollama installation.
   * Does NOT spawn processes, execute shell scripts, or modify system files.
   */
  public static findOllamaBinary(): string | null {
    if (this.customBinaryLookupFn) {
      return this.customBinaryLookupFn();
    }

    const platform = process.platform;
    const candidates: string[] = [];

    if (platform === 'darwin') {
      candidates.push(
        '/usr/local/bin/ollama',
        '/opt/homebrew/bin/ollama',
        '/Applications/Ollama.app',
      );
    } else if (platform === 'linux') {
      candidates.push(
        '/usr/local/bin/ollama',
        '/usr/bin/ollama',
        '/bin/ollama',
      );
    } else if (platform === 'win32') {
      const localAppData = process.env['LOCALAPPDATA'];
      if (localAppData) {
        candidates.push(path.join(localAppData, 'Programs', 'Ollama', 'ollama.exe'));
      }
      const programFiles = process.env['ProgramFiles'];
      if (programFiles) {
        candidates.push(path.join(programFiles, 'Ollama', 'ollama.exe'));
      }
    }

    // Also check directories in system PATH safely
    const pathEnv = process.env['PATH'];
    if (pathEnv) {
      const separator = platform === 'win32' ? ';' : ':';
      const binaryName = platform === 'win32' ? 'ollama.exe' : 'ollama';
      const pathDirs = pathEnv.split(separator).filter(Boolean);
      for (const dir of pathDirs) {
        candidates.push(path.join(dir, binaryName));
      }
    }

    for (const candidate of candidates) {
      try {
        if (fs.existsSync(candidate)) {
          return candidate;
        }
      } catch {
        // Ignore permission or file system traversal errors safely
      }
    }

    return null;
  }

  /**
   * Deterministically resolves the installation state.
   */
  public static detect(
    endpoint: string,
    isHealthy: boolean,
  ): OllamaInstallationInspectionResult {
    const isCustom = !this.isDefaultEndpoint(endpoint);

    if (isCustom) {
      return {
        state: 'CUSTOM_ENDPOINT',
        isCustomEndpoint: true,
      };
    }

    if (isHealthy) {
      return {
        state: 'INSTALLED_AND_RUNNING',
        isCustomEndpoint: false,
      };
    }

    const detectedPath = this.findOllamaBinary();
    if (detectedPath) {
      return {
        state: 'INSTALLED_AND_STOPPED',
        detectedPath,
        isCustomEndpoint: false,
      };
    }

    return {
      state: 'NOT_INSTALLED',
      isCustomEndpoint: false,
    };
  }
}
