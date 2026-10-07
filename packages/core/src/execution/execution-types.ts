/**
 * @file packages/core/src/execution/execution-types.ts
 * Core execution domain types, bounds, configuration constants, and lifecycle contracts.
 */

import type { PrismaClient } from '@prisma/client';
import type { Browser, BrowserContext, Page } from 'playwright';
import type {
  BrowserEngine,
  ExecutionCapabilitiesDto,
  ExecutionMode,
  ExecutionRequestDto,
  ExecutionResultFoundationDto,
  ExecutionResultOutcome,
  ExecutionStatus,
  RuntimeSmokeInputDto,
  RuntimeSmokeResultDto,
  TestEligibilityDto,
  TestEligibilityStatus,
  ValidateTestEligibilityInputDto,
} from '@ai-quality/contracts';
import type { ILogger } from '../logging/index.js';

export {
  BrowserEngine,
  ExecutionCapabilitiesDto,
  ExecutionMode,
  ExecutionRequestDto,
  ExecutionResultFoundationDto,
  ExecutionResultOutcome,
  ExecutionStatus,
  RuntimeSmokeInputDto,
  RuntimeSmokeResultDto,
  TestEligibilityDto,
  TestEligibilityStatus,
  ValidateTestEligibilityInputDto,
};

/**
 * Execution bounds and baseline configuration limits.
 */
export const EXECUTION_BOUNDS = {
  DEFAULT_BROWSER_ENGINE: 'chromium' as const,
  DEFAULT_TIMEOUT_MS: 30000,
  MIN_TIMEOUT_MS: 1000,
  MAX_TIMEOUT_MS: 300000,
  DEFAULT_VIEWPORT: { width: 1280, height: 720 },
  DEFAULT_LOCALE: 'en-US',
  DEFAULT_TIMEZONE: 'UTC',
  MAX_CONCURRENT_EXECUTIONS: 10,
  CLEANUP_TIMEOUT_MS: 5000,
  SUPPORTED_BROWSERS: ['chromium', 'firefox', 'webkit'] as const,
  CERTIFIED_BROWSERS: ['chromium'] as const,
} as const;

/**
 * Controlled browser launch configuration.
 */
export interface BrowserLaunchConfig {
  readonly engine: BrowserEngine;
  readonly headless: boolean;
  readonly timeoutMs: number;
  readonly slowMo?: number;
  readonly devtools?: boolean;
  readonly additionalArgs?: readonly string[];
}

/**
 * Controlled browser context configuration.
 */
export interface ExecutionContextConfig {
  readonly viewport?: { readonly width: number; readonly height: number } | null;
  readonly userAgent?: string;
  readonly locale?: string;
  readonly timezoneId?: string;
  readonly ignoreHTTPSErrors?: boolean;
  readonly bypassCSP?: boolean;
}

/**
 * Authoritative runtime execution context tracking active browser lifecycle resources.
 */
export interface IExecutionContext {
  readonly executionId: string;
  readonly projectId?: string;
  readonly testCaseId?: string;
  readonly testCaseVersionNumber?: number;
  readonly browserEngine: BrowserEngine;
  readonly headless: boolean;
  readonly createdAt: Date;
  readonly browser: Browser;
  readonly context: BrowserContext;
  readonly page: Page;
  readonly abortController?: AbortController;
  close(): Promise<void>;
}

/**
 * Browser runtime provider abstraction.
 */
export interface IBrowserRuntimeProvider {
  getCapabilities(): Promise<ExecutionCapabilitiesDto>;
  launch(config?: Partial<BrowserLaunchConfig>): Promise<Browser>;
  createContext(
    browser: Browser,
    config?: Partial<ExecutionContextConfig>,
  ): Promise<BrowserContext>;
  createPage(context: BrowserContext): Promise<Page>;
  isBrowserAvailable(engine?: BrowserEngine): Promise<boolean>;
  getExecutableVersion(engine?: BrowserEngine): Promise<string | null>;
}

/**
 * Test Execution Service dependencies.
 */
export interface TestExecutionServiceDependencies {
  readonly prisma: PrismaClient;
  readonly logger?: ILogger;
  readonly browserProvider?: IBrowserRuntimeProvider;
  readonly runtimeRegistry?: import('./runtime-registry.js').ExecutionRuntimeRegistry;
}
