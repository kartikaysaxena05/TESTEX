/**
 * @file packages/core/src/post-fix/post-fix-types.ts
 * Domain types, policies, bounds, and interfaces for Post-Fix Jira & Notification Updates (V7 Phase 107).
 */

import type {
  PostFixSyncOutcome,
  PostFixSyncStatus,
  PostFixJiraUpdateStatus,
  PostFixNotificationDeliveryStatus,
  PostFixSyncRecordDto,
  ExecutePostFixSyncInputDto,
  RetryPostFixSyncInputDto,
  GetPostFixSyncStatusInputDto,
  ListPostFixSyncHistoryInputDto,
} from '@ai-quality/contracts';

export const POST_FIX_SYNC_VERSION = '1.0.0' as const;

export const POST_FIX_BOUNDS = {
  MAX_RETRIES: 3,
  MAX_CUSTOM_NOTE_LENGTH: 1000,
  MAX_COMMENT_LENGTH: 30000,
  MAX_EVIDENCE_REFERENCES: 50,
} as const;

export interface AuthoritativeVerificationFacts {
  readonly outcome: PostFixSyncOutcome;
  readonly testCaseId: string;
  readonly testCaseKey: string;
  readonly testCaseTitle: string;
  readonly testCaseVersionNumber: number;
  readonly requirementId?: string | null;
  readonly requirementKey?: string | null;
  readonly targetEnvironmentName: string;
  readonly originalExecutionId: string;
  readonly verificationExecutionId?: string | null;
  readonly verificationTestRunId?: string | null;
  readonly verificationAttemptNumber: number;
  readonly isSignatureMatch?: boolean | null;
  readonly completedAt: Date;
  readonly evidenceReferences: readonly {
    readonly type: string;
    readonly name: string;
    readonly uri?: string;
  }[];
  readonly regressionDetails?: {
    readonly regressionCount: number;
    readonly regressedTestKeys: readonly string[];
  };
  readonly blockerReason?: string | null;
}

export interface PostFixJiraUpdateResult {
  readonly commentStatus: PostFixJiraUpdateStatus;
  readonly commentId?: string;
  readonly transitionStatus: PostFixJiraUpdateStatus;
  readonly fromStatus?: string;
  readonly toStatus?: string;
  readonly transitionId?: string;
  readonly error?: string;
}

export interface PostFixNotificationResult {
  readonly status: PostFixNotificationDeliveryStatus;
  readonly recipient?: string;
  readonly subject?: string;
  readonly error?: string;
}

export interface IPostFixExternalUpdateService {
  executeSync(input: ExecutePostFixSyncInputDto): Promise<PostFixSyncRecordDto>;
  retrySync(input: RetryPostFixSyncInputDto): Promise<PostFixSyncRecordDto>;
  getStatus(input: GetPostFixSyncStatusInputDto): Promise<PostFixSyncRecordDto | null>;
  listHistory(input: ListPostFixSyncHistoryInputDto): Promise<readonly PostFixSyncRecordDto[]>;
}
