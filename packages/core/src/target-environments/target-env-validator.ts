/**
 * @file packages/core/src/target-environments/target-env-validator.ts
 * Rigorous validation for Target Environment URLs, SSRF protection, browser options, and production safety (Phase 122).
 */

import {
  TargetEnvValidationError,
  TargetEnvProductionSafetyError,
} from './target-env-errors.js';
import type { BrowserEngine, EnvironmentType } from '@ai-quality/contracts';

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);

const BLOCKED_METADATA_IPS = [
  '169.254.169.254',
  '169.254.',
  'fe80:',
  'fd00:ec2::254',
];

const LOOPBACK_HOSTS = new Set([
  'localhost',
  '127.0.0.1',
  '::1',
  '0.0.0.0',
]);

export interface TargetNormalizedUrlResult {
  readonly normalizedUrl: string;
  readonly protocol: 'http:' | 'https:';
  readonly hostname: string;
  readonly port: number | null;
  readonly isLoopback: boolean;
}

export class TargetEnvValidator {
  /**
   * Validates and normalizes target web URL.
   */
  public static validateAndNormalizeUrl(
    rawUrl: string,
    environmentType?: EnvironmentType,
    isProduction?: boolean,
  ): TargetNormalizedUrlResult {
    if (!rawUrl || typeof rawUrl !== 'string' || !rawUrl.trim()) {
      throw new TargetEnvValidationError('Target URL is required.');
    }

    const trimmed = rawUrl.trim();

    let parsed: URL;
    try {
      parsed = new URL(trimmed);
    } catch {
      throw new TargetEnvValidationError(`Malformed URL target: "${trimmed}".`);
    }

    // 1. Protocol allowlist check
    if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) {
      throw new TargetEnvValidationError(
        `Disallowed URL protocol "${parsed.protocol}". Only HTTP and HTTPS are permitted for web application targets.`,
      );
    }

    // 2. Reject embedded user credentials (e.g. https://user:pass@host)
    if (parsed.username || parsed.password) {
      throw new TargetEnvValidationError(
        'Target URLs must not contain embedded username or password credentials.',
      );
    }

    // 3. SSRF & Cloud Metadata IP check
    const hostLower = parsed.hostname.toLowerCase();
    for (const blocked of BLOCKED_METADATA_IPS) {
      if (hostLower === blocked || hostLower.startsWith(blocked)) {
        throw new TargetEnvValidationError(
          `Access to cloud metadata or link-local address "${hostLower}" is strictly prohibited.`,
        );
      }
    }

    // 4. Loopback check against Production tier
    const isLoopback = LOOPBACK_HOSTS.has(hostLower) || hostLower.startsWith('127.');
    const isProd = environmentType === 'PRODUCTION' || Boolean(isProduction);

    if (isProd && isLoopback) {
      throw new TargetEnvProductionSafetyError(
        `Production environments cannot target loopback host "${hostLower}".`,
      );
    }

    // 5. Normalization
    let port: number | null = null;
    if (parsed.port) {
      const p = parseInt(parsed.port, 10);
      if ((parsed.protocol === 'http:' && p !== 80) || (parsed.protocol === 'https:' && p !== 443)) {
        port = p;
      }
    }

    let pathname = parsed.pathname;
    if (pathname === '/' && !parsed.search && !parsed.hash) {
      pathname = '';
    }

    const portPart = port ? `:${port}` : '';
    const normalizedUrl = `${parsed.protocol}//${hostLower}${portPart}${pathname}${parsed.search}${parsed.hash}`;

    return {
      normalizedUrl,
      protocol: parsed.protocol as 'http:' | 'https:',
      hostname: hostLower,
      port,
      isLoopback,
    };
  }

  /**
   * Validates browser engine choice.
   */
  public static validateBrowserEngine(engine: string): BrowserEngine {
    const valid: readonly BrowserEngine[] = ['chromium', 'firefox', 'webkit'];
    const lower = engine.toLowerCase() as BrowserEngine;
    if (!valid.includes(lower)) {
      throw new TargetEnvValidationError(
        `Unsupported browser engine "${engine}". Supported engines: ${valid.join(', ')}.`,
      );
    }
    return lower;
  }

  /**
   * Validates viewport dimensions.
   */
  public static validateViewport(width: number, height: number): { width: number; height: number } {
    if (!Number.isInteger(width) || width < 320 || width > 3840) {
      throw new TargetEnvValidationError(
        `Invalid viewport width ${width}. Must be an integer between 320 and 3840 pixels.`,
      );
    }
    if (!Number.isInteger(height) || height < 240 || height > 2160) {
      throw new TargetEnvValidationError(
        `Invalid viewport height ${height}. Must be an integer between 240 and 2160 pixels.`,
      );
    }
    return { width, height };
  }
}
