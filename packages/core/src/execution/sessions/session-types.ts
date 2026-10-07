/**
 * @file packages/core/src/execution/sessions/session-types.ts
 * Type definitions, bounds, lifecycle states, and contracts for Browser Execution Sessions and Authentication Management.
 */

import type { Browser, BrowserContext, Page } from 'playwright';
import type {
  AuthStrategy,
  AuthValidationType,
  AuthProfileStatus,
  BrowserSessionLifecycleStatus,
  AuthProfileDto,
  CreateAuthProfileInputDto,
  UpdateAuthProfileInputDto,
  ListAuthProfilesInputDto,
  AuthValidationResultDto,
} from '@ai-quality/contracts';
import type { BrowserEngine } from '../execution-types.js';

export {
  AuthStrategy,
  AuthValidationType,
  AuthProfileStatus,
  BrowserSessionLifecycleStatus,
  AuthProfileDto,
  CreateAuthProfileInputDto,
  UpdateAuthProfileInputDto,
  ListAuthProfilesInputDto,
  AuthValidationResultDto,
};

/**
 * Bounds and timeout limits for browser execution sessions and authentication.
 */
export const SESSION_BOUNDS = {
  DEFAULT_CREATION_TIMEOUT_MS: 15000,
  DEFAULT_AUTH_TIMEOUT_MS: 20000,
  DEFAULT_VALIDATION_TIMEOUT_MS: 10000,
  DEFAULT_CLEANUP_TIMEOUT_MS: 5000,
  MAX_CONCURRENT_SESSIONS: 10,
  MAX_AUTH_ATTEMPTS: 2,
  MAX_STORAGE_STATE_SIZE_BYTES: 2 * 1024 * 1024, // 2MB
} as const;

/**
 * Resolved credential pair retrieved securely without storing in plaintext.
 */
export interface ResolvedCredentials {
  readonly username?: string;
  readonly password?: string;
  readonly token?: string;
  readonly secretReference: string;
}

/**
 * Pluggable credential resolver for secure secret references.
 */
export interface ICredentialResolver {
  resolve(projectId: string, credentialReference: string): Promise<ResolvedCredentials | null>;
}

/**
 * Parameters for creating an isolated browser execution session.
 */
export interface SessionCreationOptions {
  readonly testRunId: string;
  readonly projectId: string;
  readonly executionId?: string;
  readonly environmentId?: string;
  readonly authProfileId?: string;
  readonly browserEngine?: BrowserEngine;
  readonly headless?: boolean;
  readonly viewport?: { readonly width: number; readonly height: number } | null;
  readonly userAgent?: string;
  readonly locale?: string;
  readonly timezoneId?: string;
  readonly ignoreHTTPSErrors?: boolean;
  readonly extraHeaders?: Record<string, string>;
  readonly storageStateKey?: string;
  readonly abortSignal?: AbortSignal;
  readonly evidenceCoordinator?: import('../evidence/evidence-capture-coordinator.js').EvidenceCaptureCoordinator;
}

/**
 * Authoritative runtime Browser Execution Session tracking active Playwright resources.
 */
export interface BrowserExecutionSession {
  readonly sessionId: string;
  readonly testRunId: string;
  readonly projectId: string;
  readonly environmentId?: string;
  readonly authProfileId?: string;
  readonly browserEngine: BrowserEngine;
  readonly isFresh: boolean;
  readonly storageStateRestored: boolean;
  readonly createdAt: Date;
  status: BrowserSessionLifecycleStatus;
  browser: Browser;
  context: BrowserContext;
  page: Page;
  evidenceCoordinator?: import('../evidence/evidence-capture-coordinator.js').EvidenceCaptureCoordinator;
  authenticatedAt?: Date;
  closedAt?: Date;
  failureCode?: string;
  failureMessage?: string;
  close(): Promise<void>;
}

/**
 * Result of an authentication or session validation attempt.
 */
export interface AuthenticationAttemptResult {
  readonly status: 'AUTHENTICATED' | 'FAILED' | 'CANCELLED' | 'UNSUPPORTED' | 'NOT_REQUIRED';
  readonly durationMs: number;
  readonly strategy: AuthStrategy;
  readonly isRestored: boolean;
  readonly finalUrl?: string;
  readonly errorMessage?: string;
  readonly errorCode?: string;
}
