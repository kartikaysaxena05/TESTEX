/**
 * @file packages/core/src/audit/repair-audit-trail-service.ts
 * Core business orchestrator for V7 Phase 108 Complete Repair & Reverification Audit Trail.
 * Manages append-only repair events, deterministic timeline queries, cross-phase historical
 * synchronization, multi-actor attribution, and structured exports.
 */

import crypto from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { getPrismaClient } from '../database/client.js';
import { SecretRedactor } from '../execution/sessions/secret-redactor.js';
import {
  AUDIT_BOUNDS,
  REPAIR_AUDIT_VERSION,
  type IRepairAuditTrailService,
  type RepairAuditEventDto,
  type RepairSessionDto,
  type RepairAuditTimelineDto,
  type GetRepairTimelineInputDto,
  type GetRepairSessionInputDto,
  type ListRepairSessionsInputDto,
  type ExportRepairTimelineInputDto,
  type ExportRepairTimelineResultDto,
  type RecordRepairAuditEventInputDto,
} from './audit-types.js';
import { AuditProjectMismatchError, AuditValidationError } from './audit-errors.js';
import { AuditTimelineAssembler } from './audit-timeline-assembler.js';
import { AuditTrailExporter } from './audit-trail-exporter.js';

export class RepairAuditTrailService implements IRepairAuditTrailService {
  private readonly prisma: PrismaClient;
  private readonly sessionLocks = new Map<string, Promise<void>>();

  constructor(options?: { readonly prisma?: PrismaClient }) {
    const client = options?.prisma ?? getPrismaClient();
    if (!client) {
      throw new Error('Database client unavailable for RepairAuditTrailService');
    }
    this.prisma = client;
  }

  /**
   * Acquire a local lock per failureCaseId to serialize concurrent event sequence allocation.
   */
  private async acquireLock(failureCaseId: string): Promise<() => void> {
    while (this.sessionLocks.has(failureCaseId)) {
      await this.sessionLocks.get(failureCaseId);
    }
    let resolveLock!: () => void;
    const lockPromise = new Promise<void>(resolve => {
      resolveLock = resolve;
    });
    this.sessionLocks.set(failureCaseId, lockPromise);

    return () => {
      this.sessionLocks.delete(failureCaseId);
      resolveLock();
    };
  }

  /**
   * Finds or initializes a canonical RepairSession for a FailureCase.
   */
  public async getOrCreateSession(params: {
    readonly projectId: string;
    readonly failureCaseId: string;
    readonly actorId?: string;
  }): Promise<RepairSessionDto> {
    const { projectId, failureCaseId } = params;

    // Verify Project & FailureCase ownership
    const failureCase = await this.prisma.failureCase.findUnique({
      where: { id: failureCaseId },
    });

    if (!failureCase) {
      throw new AuditValidationError(`Failure case ${failureCaseId} does not exist.`);
    }

    if (failureCase.projectId !== projectId) {
      throw new AuditProjectMismatchError(
        `Failure case ${failureCaseId} belongs to project ${failureCase.projectId}, not requested project ${projectId}.`,
      );
    }

    // Check for existing session
    const existing = await this.prisma.repairSession.findFirst({
      where: { projectId, failureCaseId },
      include: {
        auditEvents: {
          orderBy: { sequenceNumber: 'asc' },
          take: 10,
        },
      },
    });

    if (existing) {
      return this.mapSessionToDto(existing);
    }

    // Format stable sessionKey: RS-<shortUuid>
    const shortId = failureCaseId.replace(/-/g, '').slice(0, 8).toUpperCase();
    const sessionKey = `RS-${shortId}`;

    const created = await this.prisma.repairSession.create({
      data: {
        projectId,
        failureCaseId,
        sessionKey,
        status: 'ACTIVE',
        totalEventsCount: 0,
      },
      include: {
        auditEvents: true,
      },
    });

    return this.mapSessionToDto(created);
  }

  /**
   * Appends an authoritative audit event to the append-only ledger.
   */
  public async recordEvent(input: RecordRepairAuditEventInputDto): Promise<RepairAuditEventDto> {
    const { projectId, failureCaseId } = input;

    // 1. Verify Project & FailureCase ownership
    const failureCase = await this.prisma.failureCase.findUnique({
      where: { id: failureCaseId },
    });

    if (!failureCase) {
      throw new AuditValidationError(`Failure case ${failureCaseId} does not exist.`);
    }

    if (failureCase.projectId !== projectId) {
      throw new AuditProjectMismatchError(
        `Failure case ${failureCaseId} belongs to project ${failureCase.projectId}, not requested project ${projectId}.`,
      );
    }

    const releaseLock = await this.acquireLock(failureCaseId);
    try {
      // 2. Get or create RepairSession
      const session = await this.getOrCreateSession({ projectId, failureCaseId });

      // 3. Compute stable idempotency key if not provided
      const rawKey =
        input.idempotencyKey ||
        crypto
          .createHash('sha256')
          .update(
            `${projectId}:${failureCaseId}:${input.eventType}:${input.actorType}:${input.actorId}:${input.correlationId || session.id}:${input.causationId || ''}`,
          )
          .digest('hex');

      // 4. Deduplication: check if event already recorded
      const existingEvent = await this.prisma.repairAuditEvent.findUnique({
        where: { idempotencyKey: rawKey },
      });

      if (existingEvent) {
        return this.mapEventToDto(existingEvent);
      }

      // 5. Sequence Number Allocation
      const sequenceNumber = session.totalEventsCount + 1;

      // 6. Secret Redaction
      const safeActorId = SecretRedactor.redactText(input.actorId);
      const safeReason = input.reason ? SecretRedactor.redactText(input.reason) : undefined;

      // 7. Insert append-only event
      const event = await this.prisma.repairAuditEvent.create({
        data: {
          projectId,
          failureCaseId,
          repairSessionId: session.id,
          sequenceNumber,
          eventType: input.eventType,
          actorType: input.actorType,
          actorId: safeActorId.slice(0, AUDIT_BOUNDS.MAX_ACTOR_ID_LENGTH),
          sourceComponent: input.sourceComponent.slice(0, AUDIT_BOUNDS.MAX_SOURCE_COMPONENT_LENGTH),
          timestamp: new Date(),
          previousState: input.previousState?.slice(0, AUDIT_BOUNDS.MAX_STATE_LENGTH),
          newState: input.newState?.slice(0, AUDIT_BOUNDS.MAX_STATE_LENGTH),
          evidenceReferencesJson: (input.evidenceReferences as any) || [],
          repositoryStateJson: (input.repositoryState as any) || {},
          testRunReferencesJson: (input.testRunReferences as any) || [],
          jiraReferenceJson: (input.jiraReference as any) || {},
          notificationReferenceJson: (input.notificationReference as any) || {},
          reason: safeReason?.slice(0, AUDIT_BOUNDS.MAX_REASON_LENGTH),
          correlationId: input.correlationId || session.id,
          causationId: input.causationId,
          idempotencyKey: rawKey,
          schemaVersion: REPAIR_AUDIT_VERSION,
          metadataJson: (input.metadata as any) || {},
        },
      });

      // 8. Update Session status if milestone event
      let newSessionStatus = session.status;
      if (input.eventType === 'PATCH_APPROVED') {
        newSessionStatus = 'PATCH_APPROVED';
      } else if (input.eventType === 'PATCH_APPLIED') {
        newSessionStatus = 'PATCH_APPLIED';
      } else if (input.eventType === 'ROLLBACK_COMPLETED') {
        newSessionStatus = 'REVERTED';
      } else if (input.eventType === 'REPAIR_SESSION_COMPLETED') {
        newSessionStatus = 'COMPLETED';
      }

      await this.prisma.repairSession.update({
        where: { id: session.id },
        data: {
          totalEventsCount: sequenceNumber,
          status: newSessionStatus,
          completedAt: newSessionStatus === 'COMPLETED' ? new Date() : undefined,
        },
      });

      return this.mapEventToDto(event);
    } finally {
      releaseLock();
    }
  }

  /**
   * Synchronizes and backfills un-ingested lifecycle events from authoritative relational entities.
   */
  public async syncHistoricalEvents(params: {
    readonly projectId: string;
    readonly failureCaseId: string;
  }): Promise<number> {
    const { projectId, failureCaseId } = params;

    const session = await this.getOrCreateSession({ projectId, failureCaseId });

    const reconstructed = await AuditTimelineAssembler.reconstructLifecycleEvents({
      prisma: this.prisma,
      projectId,
      failureCaseId,
      correlationId: session.id,
    });

    if (reconstructed.length === 0) {
      return 0;
    }

    const releaseLock = await this.acquireLock(failureCaseId);
    let ingestedCount = 0;

    try {
      // Re-fetch current session state
      const currentSession = await this.prisma.repairSession.findUniqueOrThrow({
        where: { id: session.id },
      });

      let currentSeq = currentSession.totalEventsCount;

      for (const ev of reconstructed) {
        const existing = await this.prisma.repairAuditEvent.findUnique({
          where: { idempotencyKey: ev.idempotencyKey },
        });

        if (existing) {
          continue;
        }

        currentSeq += 1;
        await this.prisma.repairAuditEvent.create({
          data: {
            projectId,
            failureCaseId,
            repairSessionId: session.id,
            sequenceNumber: currentSeq,
            eventType: ev.eventType,
            actorType: ev.actorType,
            actorId: ev.actorId,
            sourceComponent: ev.sourceComponent,
            timestamp: ev.timestamp,
            previousState: ev.previousState || undefined,
            newState: ev.newState || undefined,
            evidenceReferencesJson: (ev.evidenceReferences as any) || [],
            repositoryStateJson: (ev.repositoryState as any) || {},
            testRunReferencesJson: (ev.testRunReferences as any) || [],
            jiraReferenceJson: (ev.jiraReference as any) || {},
            notificationReferenceJson: (ev.notificationReference as any) || {},
            reason: ev.reason || undefined,
            correlationId: ev.correlationId,
            causationId: ev.causationId || undefined,
            idempotencyKey: ev.idempotencyKey,
            schemaVersion: REPAIR_AUDIT_VERSION,
            metadataJson: (ev.metadata as any) || {},
          },
        });

        ingestedCount += 1;
      }

      if (ingestedCount > 0) {
        await this.prisma.repairSession.update({
          where: { id: session.id },
          data: { totalEventsCount: currentSeq },
        });
      }

      return ingestedCount;
    } finally {
      releaseLock();
    }
  }

  /**
   * Retrieves a deterministic, chronological audit timeline with optional filtering and pagination.
   */
  public async getTimeline(input: GetRepairTimelineInputDto): Promise<RepairAuditTimelineDto> {
    const { projectId, failureCaseId } = input;

    // 1. Verify project boundary
    const failureCase = await this.prisma.failureCase.findUnique({
      where: { id: failureCaseId },
    });

    if (!failureCase) {
      throw new AuditValidationError(`Failure case ${failureCaseId} not found.`);
    }

    if (failureCase.projectId !== projectId) {
      throw new AuditProjectMismatchError(
        `Cross-project access rejected: failure case ${failureCaseId} does not belong to project ${projectId}.`,
      );
    }

    // 2. Synchronize historical lifecycle events first to guarantee full coverage
    await this.syncHistoricalEvents({ projectId, failureCaseId });

    // 3. Build filter query
    const where: any = {
      projectId,
      failureCaseId,
    };

    if (input.eventTypeFilter && input.eventTypeFilter.length > 0) {
      where.eventType = { in: input.eventTypeFilter };
    }

    if (input.actorTypeFilter && input.actorTypeFilter.length > 0) {
      where.actorType = { in: input.actorTypeFilter };
    }

    const limit = Math.min(
      input.limit || AUDIT_BOUNDS.DEFAULT_TIMELINE_LIMIT,
      AUDIT_BOUNDS.MAX_TIMELINE_LIMIT,
    );
    const offset = input.offset || 0;

    // 4. Query events deterministically
    const [totalEvents, events, sessionRecord] = await Promise.all([
      this.prisma.repairAuditEvent.count({ where }),
      this.prisma.repairAuditEvent.findMany({
        where,
        orderBy: [{ timestamp: 'asc' }, { sequenceNumber: 'asc' }, { id: 'asc' }],
        take: limit,
        skip: offset,
      }),
      this.prisma.repairSession.findFirst({
        where: { projectId, failureCaseId },
      }),
    ]);

    return {
      projectId,
      failureCaseId,
      session: sessionRecord ? this.mapSessionToDto(sessionRecord) : null,
      totalEvents,
      events: events.map(e => this.mapEventToDto(e)),
      generatedAt: new Date().toISOString(),
    };
  }

  /**
   * Retrieves a RepairSession by ID or sessionKey with multi-tenant verification.
   */
  public async getSession(input: GetRepairSessionInputDto): Promise<RepairSessionDto | null> {
    const { projectId, sessionIdOrKey } = input;
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      sessionIdOrKey,
    );
    const session = await this.prisma.repairSession.findFirst({
      where: {
        projectId,
        ...(isUuid
          ? { OR: [{ id: sessionIdOrKey }, { sessionKey: sessionIdOrKey }] }
          : { sessionKey: sessionIdOrKey }),
      },
      include: {
        auditEvents: {
          orderBy: [{ timestamp: 'asc' }, { sequenceNumber: 'asc' }],
          take: 50,
        },
      },
    });

    if (!session) {
      return null;
    }

    return this.mapSessionToDto(session);
  }

  /**
   * Lists repair sessions for a project with optional filters.
   */
  public async listSessions(
    input: ListRepairSessionsInputDto,
  ): Promise<readonly RepairSessionDto[]> {
    const { projectId, failureCaseId, status } = input;

    const where: any = { projectId };
    if (failureCaseId) where.failureCaseId = failureCaseId;
    if (status) where.status = status;

    const limit = Math.min(input.limit || 20, 100);
    const offset = input.offset || 0;

    const sessions = await this.prisma.repairSession.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
      include: {
        auditEvents: {
          orderBy: [{ timestamp: 'asc' }, { sequenceNumber: 'asc' }],
          take: 5,
        },
      },
    });

    return sessions.map(s => this.mapSessionToDto(s));
  }

  /**
   * Exports the entire audit timeline as structured JSON or forensic Markdown report.
   */
  public async exportTimeline(
    input: ExportRepairTimelineInputDto,
  ): Promise<ExportRepairTimelineResultDto> {
    const { projectId, failureCaseId, format = 'JSON' } = input;

    // Retrieve full timeline without pagination limits
    const timeline = await this.getTimeline({
      projectId,
      failureCaseId,
      limit: AUDIT_BOUNDS.MAX_TIMELINE_LIMIT,
      offset: 0,
    });

    if (format === 'MARKDOWN') {
      return AuditTrailExporter.exportMarkdown(timeline);
    }

    return AuditTrailExporter.exportJson(timeline);
  }

  private mapEventToDto(record: any): RepairAuditEventDto {
    return {
      id: record.id,
      projectId: record.projectId,
      failureCaseId: record.failureCaseId,
      repairSessionId: record.repairSessionId || null,
      sequenceNumber: record.sequenceNumber,
      eventType: record.eventType,
      actorType: record.actorType,
      actorId: record.actorId,
      sourceComponent: record.sourceComponent,
      timestamp:
        record.timestamp instanceof Date
          ? record.timestamp.toISOString()
          : String(record.timestamp),
      previousState: record.previousState || null,
      newState: record.newState || null,
      evidenceReferences: (record.evidenceReferencesJson as any) || [],
      repositoryState: (record.repositoryStateJson as any) || {},
      testRunReferences: (record.testRunReferencesJson as any) || [],
      jiraReference: (record.jiraReferenceJson as any) || {},
      notificationReference: (record.notificationReferenceJson as any) || {},
      reason: record.reason || null,
      correlationId: record.correlationId,
      causationId: record.causationId || null,
      idempotencyKey: record.idempotencyKey,
      schemaVersion: record.schemaVersion || '1.0.0',
      metadata: (record.metadataJson as any) || {},
      createdAt:
        record.createdAt instanceof Date
          ? record.createdAt.toISOString()
          : String(record.createdAt),
    };
  }

  private mapSessionToDto(record: any): RepairSessionDto {
    return {
      id: record.id,
      projectId: record.projectId,
      failureCaseId: record.failureCaseId,
      sessionKey: record.sessionKey,
      status: record.status,
      totalEventsCount: record.totalEventsCount,
      startedAt:
        record.startedAt instanceof Date
          ? record.startedAt.toISOString()
          : String(record.startedAt),
      completedAt: record.completedAt
        ? record.completedAt instanceof Date
          ? record.completedAt.toISOString()
          : String(record.completedAt)
        : null,
      metadata: (record.metadataJson as any) || {},
      createdAt:
        record.createdAt instanceof Date
          ? record.createdAt.toISOString()
          : String(record.createdAt),
      updatedAt:
        record.updatedAt instanceof Date
          ? record.updatedAt.toISOString()
          : String(record.updatedAt),
      events: record.auditEvents ? record.auditEvents.map((e: any) => this.mapEventToDto(e)) : [],
    };
  }
}
