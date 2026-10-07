/**
 * @file packages/core/src/execution/retry/execution-recovery-coordinator.ts
 * Coordinates browser session recovery, context disposal, and authentication restoration across execution attempts.
 */

import type { PrismaClient } from '@prisma/client';
import type { BrowserExecutionSession } from '../sessions/session-types.js';
import type { BrowserSessionManager } from '../sessions/browser-session-manager.js';
import type { AuthProfileService } from '../sessions/auth-profile-service.js';
import type {
  IExecutionRecoveryCoordinator,
  RecoverySessionOptions,
  RecoverySessionResult,
} from './retry-types.js';
import { EvidenceCaptureCoordinator } from '../evidence/evidence-capture-coordinator.js';
import { ExecutionEvidenceService } from '../evidence/execution-evidence-service.js';
import type { ILogger } from '../../logging/index.js';

export interface ExecutionRecoveryCoordinatorDependencies {
  readonly prisma: PrismaClient;
  readonly sessionManager: BrowserSessionManager;
  readonly authProfileService?: AuthProfileService;
  readonly evidenceService?: ExecutionEvidenceService;
  readonly logger?: ILogger;
}

export class ExecutionRecoveryCoordinator implements IExecutionRecoveryCoordinator {
  private readonly prisma: PrismaClient;
  private readonly sessionManager: BrowserSessionManager;
  private readonly authProfileService?: AuthProfileService;
  private readonly evidenceService?: ExecutionEvidenceService;
  private readonly logger?: ILogger;

  constructor(deps: ExecutionRecoveryCoordinatorDependencies) {
    this.prisma = deps.prisma;
    this.sessionManager = deps.sessionManager;
    this.authProfileService = deps.authProfileService;
    this.evidenceService = deps.evidenceService;
    this.logger = deps.logger;
  }

  /**
   * Recovers or re-initializes a fresh browser execution session for a retry attempt.
   */
  public async recoverSession(options: RecoverySessionOptions): Promise<RecoverySessionResult> {
    const tStart = performance.now();

    this.logger?.info('execution_recovery.session_recovery_started', {
      projectId: options.projectId,
      testRunId: options.testRunId,
      executionId: options.executionId,
      attemptNumber: options.attemptNumber,
    });

    try {
      // 1. Close and clean up previous session if exists
      if (options.previousSession) {
        try {
          await this.sessionManager.closeSession(options.previousSession.sessionId);
        } catch (err) {
          this.logger?.warn('execution_recovery.previous_session_close_warning', {
            error: String(err),
          });
        }
      }

      // 2. Resolve active authentication profile if available
      let resolvedAuthProfileId: string | undefined = undefined;
      if (this.authProfileService && options.environmentId) {
        try {
          const authProfiles = await this.authProfileService.listProfiles({
            projectId: options.projectId,
            environmentId: options.environmentId,
          });

          const activeProfile = authProfiles.find(p => p.status === 'VALID' && p.isReusable);
          if (activeProfile) {
            resolvedAuthProfileId = activeProfile.id;
          }
        } catch (authErr) {
          this.logger?.warn('execution_recovery.auth_lookup_warning', {
            error: String(authErr),
          });
        }
      }

      // 3. Initialize Phase 70 EvidenceCaptureCoordinator for the new attempt
      let evidenceCoordinator: EvidenceCaptureCoordinator | undefined;
      if (this.evidenceService) {
        evidenceCoordinator = new EvidenceCaptureCoordinator({
          evidenceService: this.evidenceService,
          logger: this.logger,
        });
      }

      // 4. Create fresh, isolated BrowserExecutionSession
      const session = await this.sessionManager.createSession({
        projectId: options.projectId,
        testRunId: options.testRunId,
        executionId: options.executionId,
        environmentId: options.environmentId ?? undefined,
        authProfileId: resolvedAuthProfileId,
        browserEngine: options.browserEngine ?? 'chromium',
        headless: options.headless ?? true,
        evidenceCoordinator,
      });

      const durationMs = Math.round(performance.now() - tStart);

      this.logger?.info('execution_recovery.session_recovered_successfully', {
        sessionId: session.sessionId,
        attemptNumber: options.attemptNumber,
        durationMs,
      });

      return {
        success: true,
        session,
        durationMs,
      };
    } catch (err: unknown) {
      const durationMs = Math.round(performance.now() - tStart);
      const errorMessage = err instanceof Error ? err.message : String(err);

      this.logger?.error('execution_recovery.recovery_failed', {
        testRunId: options.testRunId,
        attemptNumber: options.attemptNumber,
        error: errorMessage,
        durationMs,
      });

      return {
        success: false,
        session: null,
        errorMessage: `Session recovery failed on attempt ${options.attemptNumber}: ${errorMessage}`,
        durationMs,
      };
    }
  }

  /**
   * Disposes an execution session safely.
   */
  public async disposeSession(session: BrowserExecutionSession): Promise<void> {
    await this.sessionManager.closeSession(session.sessionId);
  }
}
