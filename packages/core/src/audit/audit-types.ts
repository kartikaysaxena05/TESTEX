/**
 * @file packages/core/src/audit/audit-types.ts
 * Type definitions, bounds, constants, and service interfaces for V7 Phase 108
 * Complete Repair & Reverification Audit Trail.
 */

import type {
  RepairAuditActorType,
  RepairAuditEventType,
  RepairSessionStatus,
  RepairAuditEventDto,
  RepairSessionDto,
  RepairAuditTimelineDto,
  GetRepairTimelineInputDto,
  GetRepairSessionInputDto,
  ListRepairSessionsInputDto,
  ExportRepairTimelineInputDto,
  ExportRepairTimelineResultDto,
  RecordRepairAuditEventInputDto,
} from '@ai-quality/contracts';

export {
  RepairAuditActorType,
  RepairAuditEventType,
  RepairSessionStatus,
  RepairAuditEventDto,
  RepairSessionDto,
  RepairAuditTimelineDto,
  GetRepairTimelineInputDto,
  GetRepairSessionInputDto,
  ListRepairSessionsInputDto,
  ExportRepairTimelineInputDto,
  ExportRepairTimelineResultDto,
  RecordRepairAuditEventInputDto,
};

export const REPAIR_AUDIT_VERSION = '1.0.0';

export const AUDIT_BOUNDS = {
  MAX_REASON_LENGTH: 2000,
  MAX_ACTOR_ID_LENGTH: 128,
  MAX_SOURCE_COMPONENT_LENGTH: 64,
  MAX_STATE_LENGTH: 64,
  DEFAULT_TIMELINE_LIMIT: 100,
  MAX_TIMELINE_LIMIT: 500,
  MAX_EXPORT_SIZE_BYTES: 10 * 1024 * 1024, // 10MB
} as const;

export interface IRepairAuditTrailService {
  getOrCreateSession(params: {
    readonly projectId: string;
    readonly failureCaseId: string;
    readonly actorId?: string;
  }): Promise<RepairSessionDto>;

  recordEvent(input: RecordRepairAuditEventInputDto): Promise<RepairAuditEventDto>;

  getTimeline(input: GetRepairTimelineInputDto): Promise<RepairAuditTimelineDto>;

  getSession(input: GetRepairSessionInputDto): Promise<RepairSessionDto | null>;

  listSessions(input: ListRepairSessionsInputDto): Promise<readonly RepairSessionDto[]>;

  exportTimeline(input: ExportRepairTimelineInputDto): Promise<ExportRepairTimelineResultDto>;

  syncHistoricalEvents(params: {
    readonly projectId: string;
    readonly failureCaseId: string;
  }): Promise<number>;
}
