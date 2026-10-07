/**
 * @file packages/core/src/auth/auth-audit-service.ts
 * Security audit service for V8 Phase 113 User Authentication Foundation.
 */

import type { PrismaClient, Prisma } from '@prisma/client';
import { AuthAuditAction, type IAuthAuditService } from './auth-types.js';
import { SecretRedactor } from '../execution/sessions/secret-redactor.js';
import { getLogger } from '../logging/index.js';

export class AuthAuditService implements IAuthAuditService {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Persists an audit event with guaranteed redaction of any sensitive credentials.
   */
  public async recordEvent(params: {
    readonly action: AuthAuditAction;
    readonly userId?: string | null;
    readonly actorEmail?: string | null;
    readonly metadata?: Record<string, unknown>;
    readonly ipAddress?: string | null;
  }): Promise<void> {
    try {
      // Deep redact metadata to ensure zero password, token, or hash leakage
      const sanitizedMetadata = params.metadata
        ? (SecretRedactor.redactObject(params.metadata) as Record<string, unknown>)
        : {};

      // Ensure explicit removal of any sensitive keys if accidentally supplied
      delete sanitizedMetadata['password'];
      delete sanitizedMetadata['passwordHash'];
      delete sanitizedMetadata['sessionToken'];
      delete sanitizedMetadata['rawToken'];

      await this.prisma.authAuditEvent.create({
        data: {
          action: params.action,
          userId: params.userId ?? null,
          actorEmail: params.actorEmail ?? null,
          metadata: sanitizedMetadata as Prisma.InputJsonValue,
          ipAddress: params.ipAddress ?? null,
        },
      });

      getLogger().debug('auth.audit_event_recorded', {
        action: params.action,
        userId: params.userId,
        actorEmail: params.actorEmail,
      });
    } catch (error) {
      getLogger().error('auth.audit_event_failed', {
        action: params.action,
        error: error instanceof Error ? error.message : String(error),
      });
      // Audit failure should not crash domain operations unless critical
    }
  }
}
