/**
 * @file packages/core/src/failures/reproduction/environment-reconstructor.ts
 * Reconstructs original execution environment and calculates environment equivalence & drift (V6 Phase 76).
 */

import {
  type EnvironmentEquivalenceStatus,
  type ReproductionEnvironmentComparisonDto,
  type HistoricalEnvironmentProfile,
  type TargetEnvironmentProfile,
} from './failure-reproduction-types.js';

export class EnvironmentReconstructor {
  /**
   * Reconstructs historical environment profile from execution and snapshot records.
   * Truthfulness rule: Unknown or unrecorded values must remain null/undefined.
   */
  public reconstructHistoricalEnvironment(rawExecution: {
    browserEngine?: string | null;
    environmentSnapshotJson?: any;
    environmentId?: string | null;
    testRun?: {
      environment?: {
        id: string;
        name: string;
        baseUrl?: string | null;
        browserEngine: string;
        viewportWidth?: number | null;
        viewportHeight?: number | null;
        locale?: string | null;
        timezoneId?: string | null;
      } | null;
    } | null;
  }): HistoricalEnvironmentProfile {
    const envMeta = rawExecution.testRun?.environment;
    const snap = rawExecution.environmentSnapshotJson as any;

    const browserEngine =
      rawExecution.browserEngine ||
      envMeta?.browserEngine ||
      snap?.browserEngine ||
      snap?.browser ||
      'chromium';

    let viewport: { width: number; height: number } | null = null;
    if (envMeta?.viewportWidth && envMeta?.viewportHeight) {
      viewport = { width: envMeta.viewportWidth, height: envMeta.viewportHeight };
    } else if (snap?.viewport?.width && snap?.viewport?.height) {
      viewport = { width: Number(snap.viewport.width), height: Number(snap.viewport.height) };
    }

    return {
      environmentId: rawExecution.environmentId ?? envMeta?.id ?? null,
      environmentName: envMeta?.name ?? snap?.environmentName ?? null,
      baseUrl: envMeta?.baseUrl ?? snap?.baseUrl ?? null,
      browserEngine,
      browserVersion: snap?.browserVersion ?? null,
      viewport,
      locale: envMeta?.locale ?? snap?.locale ?? null,
      timezone: envMeta?.timezoneId ?? snap?.timezone ?? snap?.timezoneId ?? null,
      operatingSystem: snap?.operatingSystem ?? snap?.os ?? null,
    };
  }

  /**
   * Compares the historical environment with the target reproduction environment.
   * Categorizes into EXACT, EQUIVALENT, DRIFTED, UNKNOWN, or INCOMPATIBLE.
   */
  public compareEnvironments(
    historical: HistoricalEnvironmentProfile,
    target: TargetEnvironmentProfile,
  ): ReproductionEnvironmentComparisonDto {
    const driftItems: string[] = [];

    // 1. Check if historical data is largely missing -> UNKNOWN
    if (!historical.baseUrl && !historical.viewport) {
      return {
        status: 'UNKNOWN',
        originalBaseUrl: historical.baseUrl ?? null,
        reproductionBaseUrl: target.baseUrl ?? null,
        originalBrowserEngine: historical.browserEngine,
        reproductionBrowserEngine: target.browserEngine,
        originalViewport: historical.viewport ?? null,
        reproductionViewport: target.viewport ?? null,
        driftItems: ['Historical environment parameters were not recorded.'],
      };
    }

    // 2. Base URL Comparison
    const normOrigUrl = (historical.baseUrl || '').trim().replace(/\/+$/, '').toLowerCase();
    const normTargetUrl = (target.baseUrl || '').trim().replace(/\/+$/, '').toLowerCase();
    if (normOrigUrl && normTargetUrl && normOrigUrl !== normTargetUrl) {
      driftItems.push(`Base URL changed from '${historical.baseUrl}' to '${target.baseUrl}'`);
    } else if (!normOrigUrl && normTargetUrl) {
      driftItems.push(`Base URL was unrecorded in original, reproduction uses '${target.baseUrl}'`);
    }

    // 3. Browser Engine Comparison
    const origEngine = (historical.browserEngine || 'chromium').toLowerCase();
    const targetEngine = (target.browserEngine || 'chromium').toLowerCase();
    if (origEngine !== targetEngine) {
      driftItems.push(
        `Browser engine mismatch: changed from '${historical.browserEngine}' to '${target.browserEngine}'`,
      );
    }

    // 4. Viewport Comparison
    if (historical.viewport && target.viewport) {
      const wDiff = Math.abs(historical.viewport.width - target.viewport.width);
      const hDiff = Math.abs(historical.viewport.height - target.viewport.height);
      if (wDiff > 0 || hDiff > 0) {
        driftItems.push(
          `Viewport changed from ${historical.viewport.width}x${historical.viewport.height} to ${target.viewport.width}x${target.viewport.height}`,
        );
      }
    } else if (!historical.viewport && target.viewport) {
      driftItems.push(
        `Viewport was unrecorded in original, reproduction uses ${target.viewport.width}x${target.viewport.height}`,
      );
    }

    // 5. Locale Comparison
    if (historical.locale && target.locale && historical.locale !== target.locale) {
      driftItems.push(`Locale changed from '${historical.locale}' to '${target.locale}'`);
    }

    // 6. Timezone Comparison
    if (historical.timezone && target.timezone && historical.timezone !== target.timezone) {
      driftItems.push(`Timezone changed from '${historical.timezone}' to '${target.timezone}'`);
    }

    // Determine status
    let status: EnvironmentEquivalenceStatus = 'EXACT';
    if (driftItems.length === 0) {
      status = 'EXACT';
    } else {
      // Check if drift is significant
      const hasEngineChange = origEngine !== targetEngine;
      const hasUrlChange = normOrigUrl && normTargetUrl && normOrigUrl !== normTargetUrl;
      const hasMajorViewportChange =
        historical.viewport &&
        target.viewport &&
        (Math.abs(historical.viewport.width - target.viewport.width) > 100 ||
          Math.abs(historical.viewport.height - target.viewport.height) > 100);

      if (hasEngineChange) {
        status = 'INCOMPATIBLE';
      } else if (hasUrlChange || hasMajorViewportChange) {
        status = 'DRIFTED';
      } else {
        status = 'EQUIVALENT';
      }
    }

    return {
      status,
      originalBaseUrl: historical.baseUrl ?? null,
      reproductionBaseUrl: target.baseUrl ?? null,
      originalBrowserEngine: historical.browserEngine,
      reproductionBrowserEngine: target.browserEngine,
      originalViewport: historical.viewport ?? null,
      reproductionViewport: target.viewport ?? null,
      driftItems,
    };
  }
}
