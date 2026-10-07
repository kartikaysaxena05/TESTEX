/**
 * @file packages/core/src/execution/sessions/browser-session-manager.ts
 * Central lifecycle coordinator for isolated browser execution sessions, Playwright contexts, and authentication.
 */

import * as crypto from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import {
  type BrowserExecutionSession,
  type SessionCreationOptions,
  SESSION_BOUNDS,
} from './session-types.js';
import { BrowserSessionNotFoundError } from './session-errors.js';
import { PlaywrightBrowserProvider } from '../browser-provider.js';
import { AuthLoginHandler } from './auth-login-handler.js';
import { StorageStateManager } from './storage-state-manager.js';
import type { ILogger } from '../../logging/index.js';

export class BrowserSessionManager {
  private readonly prisma: PrismaClient;
  private readonly browserProvider: PlaywrightBrowserProvider;
  private readonly authLoginHandler: AuthLoginHandler;
  private readonly storageStateManager: StorageStateManager;
  private readonly logger?: ILogger;
  private readonly activeSessions: Map<string, BrowserExecutionSession> = new Map();
  private readonly runToSessionIndex: Map<string, string> = new Map();

  constructor(
    prisma: PrismaClient,
    browserProvider?: PlaywrightBrowserProvider,
    authLoginHandler?: AuthLoginHandler,
    storageStateManager?: StorageStateManager,
    logger?: ILogger,
  ) {
    this.prisma = prisma;
    this.browserProvider = browserProvider ?? new PlaywrightBrowserProvider(logger);
    this.authLoginHandler = authLoginHandler ?? new AuthLoginHandler(undefined, logger);
    this.storageStateManager = storageStateManager ?? new StorageStateManager(undefined, logger);
    this.logger = logger;
  }

  /**
   * Creates a dedicated, isolated BrowserExecutionSession for a test run.
   */
  public async createSession(options: SessionCreationOptions): Promise<BrowserExecutionSession> {
    const sessionId = crypto.randomUUID();
    const tStart = performance.now();

    this.logger?.info('browser_session.creating', {
      sessionId,
      testRunId: options.testRunId,
      projectId: options.projectId,
      environmentId: options.environmentId,
    });

    // 1. Launch Browser
    const browserEngine = options.browserEngine ?? 'chromium';
    const browser = await this.browserProvider.launch({
      engine: browserEngine,
      headless: options.headless ?? true,
      timeoutMs: SESSION_BOUNDS.DEFAULT_CREATION_TIMEOUT_MS,
    });

    let storageStatePath: string | undefined;
    if (options.storageStateKey) {
      storageStatePath = await this.storageStateManager.loadStorageState(options.storageStateKey);
    }

    // 2. Create Isolated Browser Context
    const context = await browser.newContext({
      viewport: options.viewport ?? { width: 1280, height: 720 },
      userAgent: options.userAgent,
      locale: options.locale ?? 'en-US',
      timezoneId: options.timezoneId ?? 'UTC',
      ignoreHTTPSErrors: options.ignoreHTTPSErrors ?? false,
      extraHTTPHeaders: options.extraHeaders,
      storageState: storageStatePath,
    });

    // 3. Create Primary Page
    const page = await context.newPage();

    let isClosed = false;
    const evidenceCoordinator = options.evidenceCoordinator;
    if (evidenceCoordinator) {
      await evidenceCoordinator.initializeSession({
        context,
        page,
        projectId: options.projectId,
        testRunId: options.testRunId,
        executionId: options.executionId ?? options.testRunId,
      });
    }

    const session: BrowserExecutionSession = {
      sessionId,
      testRunId: options.testRunId,
      projectId: options.projectId,
      environmentId: options.environmentId,
      authProfileId: options.authProfileId,
      browserEngine,
      isFresh: !storageStatePath,
      storageStateRestored: Boolean(storageStatePath),
      createdAt: new Date(),
      status: 'CREATING',
      browser,
      context,
      page,
      evidenceCoordinator,
      close: async () => {
        if (isClosed) return;
        isClosed = true;
        await this.closeSession(sessionId);
      },
    };

    this.activeSessions.set(sessionId, session);
    this.runToSessionIndex.set(options.testRunId, sessionId);

    // 4. Execute Authentication if configured
    if (options.authProfileId) {
      session.status = 'AUTHENTICATING';
      const profile = await this.prisma.authenticationProfile.findUnique({
        where: { id: options.authProfileId },
      });

      if (profile && profile.projectId === options.projectId) {
        try {
          const authResult = await this.authLoginHandler.authenticate(profile, page, context, {
            abortSignal: options.abortSignal,
            isRestored: Boolean(storageStatePath),
          });

          if (authResult.status === 'AUTHENTICATED') {
            session.status = 'AUTHENTICATED';
            session.authenticatedAt = new Date();

            // If reusable, save snapshot
            if (profile.isReusable) {
              const stateKey =
                profile.storageStateKey ??
                this.storageStateManager.generateKey(options.projectId, profile.name);

              await this.storageStateManager.saveStorageState(
                context,
                stateKey,
                options.projectId,
                profile.id,
              );

              await this.prisma.authenticationProfile.update({
                where: { id: profile.id },
                data: {
                  storageStateKey: stateKey,
                  status: 'VALID',
                  lastValidatedAt: new Date(),
                  validationError: null,
                },
              });
            }
          } else if (authResult.status === 'CANCELLED') {
            session.status = 'CLOSED';
            await session.close();
            return session;
          }
        } catch (authErr) {
          session.status = 'FAILED';
          session.failureCode = 'AUTHENTICATION_FAILED';
          session.failureMessage = authErr instanceof Error ? authErr.message : String(authErr);
          await session.close();
          throw authErr;
        }
      }
    }

    session.status = 'READY';

    this.logger?.info('browser_session.ready', {
      sessionId,
      testRunId: options.testRunId,
      status: session.status,
      durationMs: Math.round(performance.now() - tStart),
    });

    return session;
  }

  /**
   * Retrieves an active browser execution session by ID.
   */
  public getSession(sessionId: string): BrowserExecutionSession {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      throw new BrowserSessionNotFoundError(sessionId);
    }
    return session;
  }

  /**
   * Retrieves an active browser execution session by associated TestRun ID.
   */
  public getSessionByRunId(testRunId: string): BrowserExecutionSession | null {
    const sessionId = this.runToSessionIndex.get(testRunId);
    if (!sessionId) {
      return null;
    }
    return this.activeSessions.get(sessionId) ?? null;
  }

  /**
   * Closes and cleans up a specific browser execution session.
   */
  public async closeSession(sessionId: string): Promise<void> {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      return;
    }

    session.status = 'CLOSING';
    const tStart = performance.now();

    try {
      // 0. Clean up evidence coordinator
      session.evidenceCoordinator?.dispose();

      // 1. Close context and pages
      await session.context.close().catch(() => {});

      // 2. Close browser process
      await session.browser.close().catch(() => {});

      session.status = 'CLOSED';
      session.closedAt = new Date();

      this.logger?.info('browser_session.closed', {
        sessionId,
        testRunId: session.testRunId,
        durationMs: Math.round(performance.now() - tStart),
      });
    } catch (err) {
      this.logger?.warn('browser_session.close_error', {
        sessionId,
        error: String(err),
      });
      session.status = 'FAILED';
    } finally {
      this.activeSessions.delete(sessionId);
      this.runToSessionIndex.delete(session.testRunId);
    }
  }

  /**
   * Closes all currently active browser execution sessions (used on application shutdown or crash recovery).
   */
  public async closeAllSessions(): Promise<number> {
    const count = this.activeSessions.size;
    if (count === 0) {
      return 0;
    }

    this.logger?.info('browser_session.closing_all', { activeCount: count });

    const closePromises = Array.from(this.activeSessions.keys()).map(id => this.closeSession(id));
    await Promise.allSettled(closePromises);

    this.activeSessions.clear();
    this.runToSessionIndex.clear();

    return count;
  }

  /**
   * Returns active sessions count.
   */
  public getActiveSessionsCount(): number {
    return this.activeSessions.size;
  }

  /**
   * Returns all currently active browser execution sessions.
   */
  public getActiveSessions(): readonly BrowserExecutionSession[] {
    return Array.from(this.activeSessions.values());
  }
}
