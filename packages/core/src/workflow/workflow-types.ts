/**
 * @file packages/core/src/workflow/workflow-types.ts
 * Domain models, interfaces, and DTO contracts for Bug Status & External Workflow Synchronization.
 */

import type {
  InternalBugStatusDto,
  DefectVerificationStatusDto,
  SyncDirectionDto,
  SyncConflictPolicyDto,
  SyncResultStatusDto,
  BugWorkflowStateDto,
  WorkflowStatusMappingDto,
  WorkflowSyncEventDto,
  WorkflowConflictStateDto,
  GetWorkflowStateInputDto,
  UpdateInternalStatusInputDto,
  GetWorkflowStatusMappingsInputDto,
  SaveWorkflowStatusMappingInputDto,
  DeleteWorkflowStatusMappingInputDto,
  SyncWorkflowNowInputDto,
  ResolveWorkflowConflictInputDto,
  ListWorkflowSyncEventsInputDto,
} from '@ai-quality/contracts';

export type InternalBugStatus = InternalBugStatusDto;
export type DefectVerificationStatus = DefectVerificationStatusDto;
export type SyncDirection = SyncDirectionDto;
export type SyncConflictPolicy = SyncConflictPolicyDto;
export type SyncResultStatus = SyncResultStatusDto;
export type BugWorkflowState = BugWorkflowStateDto;
export type WorkflowStatusMapping = WorkflowStatusMappingDto;
export type WorkflowSyncEvent = WorkflowSyncEventDto;
export type WorkflowConflictState = WorkflowConflictStateDto;

export interface WorkflowTransitionResult {
  readonly valid: boolean;
  readonly reason?: string;
  readonly isNoOp?: boolean;
  readonly isResolution?: boolean;
  readonly isReopen?: boolean;
  readonly isClosure?: boolean;
}

export interface ConflictResolutionResult {
  readonly hasConflict: boolean;
  readonly resolvedWinner: 'INTERNAL' | 'EXTERNAL' | null;
  readonly reason: string;
  readonly suggestedAction?: string;
}

export interface DefaultStatusMappingDefinition {
  readonly externalStatusName: string;
  readonly internalStatus: InternalBugStatus;
  readonly direction: SyncDirection;
  readonly conflictPolicy: SyncConflictPolicy;
}

export const DEFAULT_JIRA_STATUS_MAPPINGS: readonly DefaultStatusMappingDefinition[] = [
  {
    externalStatusName: 'To Do',
    internalStatus: 'OPEN',
    direction: 'BIDIRECTIONAL',
    conflictPolicy: 'MANUAL_REVIEW',
  },
  {
    externalStatusName: 'Open',
    internalStatus: 'OPEN',
    direction: 'BIDIRECTIONAL',
    conflictPolicy: 'MANUAL_REVIEW',
  },
  {
    externalStatusName: 'Backlog',
    internalStatus: 'OPEN',
    direction: 'BIDIRECTIONAL',
    conflictPolicy: 'MANUAL_REVIEW',
  },
  {
    externalStatusName: 'Selected for Development',
    internalStatus: 'ACKNOWLEDGED',
    direction: 'BIDIRECTIONAL',
    conflictPolicy: 'MANUAL_REVIEW',
  },
  {
    externalStatusName: 'Acknowledged',
    internalStatus: 'ACKNOWLEDGED',
    direction: 'BIDIRECTIONAL',
    conflictPolicy: 'MANUAL_REVIEW',
  },
  {
    externalStatusName: 'In Progress',
    internalStatus: 'IN_PROGRESS',
    direction: 'BIDIRECTIONAL',
    conflictPolicy: 'MANUAL_REVIEW',
  },
  {
    externalStatusName: 'In Review',
    internalStatus: 'IN_PROGRESS',
    direction: 'BIDIRECTIONAL',
    conflictPolicy: 'MANUAL_REVIEW',
  },
  {
    externalStatusName: 'Done',
    internalStatus: 'RESOLVED',
    direction: 'BIDIRECTIONAL',
    conflictPolicy: 'MANUAL_REVIEW',
  },
  {
    externalStatusName: 'Resolved',
    internalStatus: 'RESOLVED',
    direction: 'BIDIRECTIONAL',
    conflictPolicy: 'MANUAL_REVIEW',
  },
  {
    externalStatusName: 'Closed',
    internalStatus: 'CLOSED',
    direction: 'BIDIRECTIONAL',
    conflictPolicy: 'MANUAL_REVIEW',
  },
  {
    externalStatusName: 'Reopened',
    internalStatus: 'REOPENED',
    direction: 'BIDIRECTIONAL',
    conflictPolicy: 'MANUAL_REVIEW',
  },
  {
    externalStatusName: 'Blocked',
    internalStatus: 'BLOCKED',
    direction: 'BIDIRECTIONAL',
    conflictPolicy: 'MANUAL_REVIEW',
  },
  {
    externalStatusName: "Won't Fix",
    internalStatus: 'WONT_FIX',
    direction: 'BIDIRECTIONAL',
    conflictPolicy: 'MANUAL_REVIEW',
  },
  {
    externalStatusName: "Won't Do",
    internalStatus: 'WONT_FIX',
    direction: 'BIDIRECTIONAL',
    conflictPolicy: 'MANUAL_REVIEW',
  },
  {
    externalStatusName: 'Duplicate',
    internalStatus: 'DUPLICATE',
    direction: 'BIDIRECTIONAL',
    conflictPolicy: 'MANUAL_REVIEW',
  },
] as const;

export interface IWorkflowSyncService {
  getState(input: GetWorkflowStateInputDto): Promise<BugWorkflowStateDto>;
  updateInternalStatus(input: UpdateInternalStatusInputDto): Promise<BugWorkflowStateDto>;
  getStatusMappings(
    input: GetWorkflowStatusMappingsInputDto,
  ): Promise<readonly WorkflowStatusMappingDto[]>;
  saveStatusMapping(input: SaveWorkflowStatusMappingInputDto): Promise<WorkflowStatusMappingDto>;
  deleteStatusMapping(
    input: DeleteWorkflowStatusMappingInputDto,
  ): Promise<{ readonly deleted: true }>;
  syncNow(input: SyncWorkflowNowInputDto): Promise<BugWorkflowStateDto>;
  resolveConflict(input: ResolveWorkflowConflictInputDto): Promise<BugWorkflowStateDto>;
  listSyncEvents(input: ListWorkflowSyncEventsInputDto): Promise<{
    readonly items: readonly WorkflowSyncEventDto[];
    readonly total: number;
    readonly page: number;
    readonly pageSize: number;
    readonly totalPages: number;
  }>;
  handleExternalUpdate(input: {
    readonly projectId: string;
    readonly externalSystem: string;
    readonly externalIssueIdOrKey: string;
    readonly externalStatusName: string;
    readonly externalStatusId?: string;
    readonly externalUpdatedAt?: Date | string;
    readonly actor?: string;
  }): Promise<BugWorkflowStateDto>;
}
