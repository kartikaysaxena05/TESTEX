/**
 * @file packages/core/src/execution/browser-provider.ts
 * Centralized Playwright browser runtime provider and lifecycle abstraction.
 */

import {
  chromium,
  firefox,
  webkit,
  type Browser,
  type BrowserContext,
  type Page,
} from 'playwright';
import {
  type BrowserEngine,
  type ExecutionCapabilitiesDto,
  EXECUTION_BOUNDS,
  type BrowserLaunchConfig,
  type ExecutionContextConfig,
  type IBrowserRuntimeProvider,
} from './execution-types.js';
import {
  BrowserLaunchFailedError,
  BrowserUnsupportedError,
  ExecutionSecurityViolationError,
} from './execution-errors.js';
import type { ILogger } from '../logging/index.js';

/**
 * Disallowed / dangerous Chromium flags that must never be accepted from untrusted input.
 */
const DISALLOWED_ARG_PATTERNS = [
  /^--no-sandbox$/i,
  /^--disable-web-security$/i,
  /^--remote-debugging-port/i,
  /^--remote-debugging-address/i,
  /^--disable-gpu-sandbox$/i,
  /^--single-process$/i,
  /^--allow-running-insecure-content$/i,
  /^--disable-features=.*isolate/i,
  /^--disable-setuid-sandbox$/i,
  /^--unsafely-treat-insecure-origin-as-secure/i,
];

export class PlaywrightBrowserProvider implements IBrowserRuntimeProvider {
  private readonly logger?: ILogger;
  private cachedCapabilities: ExecutionCapabilitiesDto | null = null;

  constructor(logger?: ILogger) {
    this.logger = logger;
  }

  /**
   * Sanitizes and validates launch arguments against security boundaries.
   */
  public sanitizeLaunchArgs(args?: readonly string[]): string[] {
    if (!args || args.length === 0) {
      return [];
    }

    const sanitized: string[] = [];
    for (const arg of args) {
      const trimmed = arg.trim();
      if (!trimmed) continue;

      for (const pattern of DISALLOWED_ARG_PATTERNS) {
        if (pattern.test(trimmed)) {
          throw new ExecutionSecurityViolationError(
            `Insecure browser launch argument '${trimmed}' is prohibited by platform security policy.`,
          );
        }
      }

      sanitized.push(trimmed);
    }

    return sanitized;
  }

  /**
   * Discovers and returns the runtime execution capabilities.
   */
  public async getCapabilities(): Promise<ExecutionCapabilitiesDto> {
    if (this.cachedCapabilities) {
      return this.cachedCapabilities;
    }

    const chromiumAvailable = await this.isBrowserAvailable('chromium');
    const chromiumVersion = chromiumAvailable ? await this.getExecutableVersion('chromium') : null;

    const capabilities: ExecutionCapabilitiesDto = {
      playwrightInstalled: true,
      playwrightVersion: '1.62.1',
      supportedBrowsers: [...EXECUTION_BOUNDS.SUPPORTED_BROWSERS],
      defaultBrowser: EXECUTION_BOUNDS.DEFAULT_BROWSER_ENGINE,
      chromiumAvailable,
      chromiumVersion,
      runtimeStatus: chromiumAvailable ? 'READY' : 'DEGRADED',
      activeExecutionsCount: 0,
    };

    this.cachedCapabilities = capabilities;
    return capabilities;
  }

  /**
   * Launches a browser instance under strict lifecycle controls.
   */
  public async launch(config?: Partial<BrowserLaunchConfig>): Promise<Browser> {
    const engine = config?.engine ?? EXECUTION_BOUNDS.DEFAULT_BROWSER_ENGINE;
    const headless = config?.headless ?? true;
    const timeout = config?.timeoutMs ?? EXECUTION_BOUNDS.DEFAULT_TIMEOUT_MS;
    const sanitizedArgs = this.sanitizeLaunchArgs(config?.additionalArgs);

    this.logger?.info('browser_runtime.launch_requested', {
      engine,
      headless,
      timeoutMs: timeout,
    });

    try {
      switch (engine) {
        case 'chromium': {
          return await chromium.launch({
            headless,
            timeout,
            slowMo: config?.slowMo,
            args: sanitizedArgs,
          });
        }
        case 'firefox': {
          return await firefox.launch({
            headless,
            timeout,
            slowMo: config?.slowMo,
            args: sanitizedArgs,
          });
        }
        case 'webkit': {
          return await webkit.launch({
            headless,
            timeout,
            slowMo: config?.slowMo,
            args: sanitizedArgs,
          });
        }
        default:
          throw new BrowserUnsupportedError(engine);
      }
    } catch (err) {
      if (
        err instanceof ExecutionSecurityViolationError ||
        err instanceof BrowserUnsupportedError
      ) {
        throw err;
      }
      this.logger?.error('browser_runtime.launch_failed', {
        engine,
        error: err instanceof Error ? err.message : String(err),
      });
      throw new BrowserLaunchFailedError(engine, err);
    }
  }

  /**
   * Creates an isolated browser context with controlled configurations.
   */
  public async createContext(
    browser: Browser,
    config?: Partial<ExecutionContextConfig>,
  ): Promise<BrowserContext> {
    try {
      const context = await browser.newContext({
        viewport: config?.viewport ?? EXECUTION_BOUNDS.DEFAULT_VIEWPORT,
        userAgent: config?.userAgent,
        locale: config?.locale ?? EXECUTION_BOUNDS.DEFAULT_LOCALE,
        timezoneId: config?.timezoneId ?? EXECUTION_BOUNDS.DEFAULT_TIMEZONE,
        ignoreHTTPSErrors: config?.ignoreHTTPSErrors ?? false,
      });
      return context;
    } catch (err) {
      this.logger?.error('browser_runtime.context_creation_failed', {
        error: err instanceof Error ? err.message : String(err),
      });
      throw new BrowserLaunchFailedError('context', err);
    }
  }

  /**
   * Creates a new page within the given browser context.
   */
  public async createPage(context: BrowserContext): Promise<Page> {
    try {
      return await context.newPage();
    } catch (err) {
      this.logger?.error('browser_runtime.page_creation_failed', {
        error: err instanceof Error ? err.message : String(err),
      });
      throw new BrowserLaunchFailedError('page', err);
    }
  }

  /**
   * Checks whether the specified browser binary is available and launchable.
   */
  public async isBrowserAvailable(engine: BrowserEngine = 'chromium'): Promise<boolean> {
    try {
      const executablePath =
        engine === 'chromium'
          ? chromium.executablePath()
          : engine === 'firefox'
            ? firefox.executablePath()
            : webkit.executablePath();
      return Boolean(executablePath && executablePath.length > 0);
    } catch {
      return false;
    }
  }

  /**
   * Retrieves the browser version string if available.
   */
  public async getExecutableVersion(engine: BrowserEngine = 'chromium'): Promise<string | null> {
    try {
      if (engine === 'chromium') {
        const browser = await chromium.launch({ headless: true });
        const version = browser.version();
        await browser.close();
        return version;
      }
      return null;
    } catch {
      return null;
    }
  }
}
