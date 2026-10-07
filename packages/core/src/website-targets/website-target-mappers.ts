/**
 * @file packages/core/src/website-targets/website-target-mappers.ts
 * Pure mapping functions converting Prisma WebsiteTarget models to serializable DTOs.
 */

import type { WebsiteTarget } from '@prisma/client';
import type {
  WebsiteTargetSummary,
  WebsiteTargetDetails,
  WebsiteTargetSnapshot,
  TargetAuthorizationState,
  TargetConnectionStatus,
  EnvironmentType,
} from '@ai-quality/contracts';

export function toWebsiteTargetSummary(target: WebsiteTarget): WebsiteTargetSummary {
  return {
    id: target.id,
    projectId: target.projectId,
    name: target.name,
    baseUrl: target.baseUrl,
    canonicalUrl: target.canonicalUrl,
    environmentType: target.environmentType as EnvironmentType,
    authorizationState: target.authorizationState as TargetAuthorizationState,
    authorizationConfirmedAt: target.authorizationConfirmedAt?.toISOString() ?? null,
    authorizationConfirmedBy: target.authorizationConfirmedBy ?? null,
    safeModeEnabled: target.safeModeEnabled,
    requiresAuth: target.requiresAuth,
    isActive: target.isActive,
    connectionStatus: target.connectionStatus as TargetConnectionStatus,
    lastCheckedAt: target.lastCheckedAt?.toISOString() ?? null,
    lastReachableAt: target.lastReachableAt?.toISOString() ?? null,
    lastFailureReason: target.lastFailureReason ?? null,
    lastStatusCode: target.lastStatusCode ?? null,
    lastResponseTimeMs: target.lastResponseTimeMs ?? null,
    resolvedFinalUrl: target.resolvedFinalUrl ?? null,
    redirectCount: target.redirectCount,
    tlsValid: target.tlsValid,
    notes: target.notes ?? null,
    environmentId: target.environmentId ?? null,
    createdAt: target.createdAt.toISOString(),
    updatedAt: target.updatedAt.toISOString(),
  };
}

export function toWebsiteTargetDetails(target: WebsiteTarget): WebsiteTargetDetails {
  return toWebsiteTargetSummary(target);
}

export function toWebsiteTargetSnapshot(target: WebsiteTarget): WebsiteTargetSnapshot {
  let parsed: URL;
  try {
    parsed = new URL(target.baseUrl);
  } catch {
    parsed = new URL('http://localhost');
  }

  const port = parsed.port
    ? Number.parseInt(parsed.port, 10)
    : parsed.protocol === 'https:'
      ? 443
      : 80;

  return {
    websiteTargetId: target.id,
    projectId: target.projectId,
    name: target.name,
    baseUrl: target.baseUrl,
    canonicalUrl: target.canonicalUrl,
    environmentType: target.environmentType as EnvironmentType,
    resolvedFinalUrl: target.resolvedFinalUrl || target.baseUrl,
    protocol: parsed.protocol.replace(':', ''),
    hostname: parsed.hostname,
    port,
    connectionStatus: target.connectionStatus as TargetConnectionStatus,
    tlsValid: target.tlsValid,
    timestamp: new Date().toISOString(),
    authorizationState: target.authorizationState as TargetAuthorizationState,
    safeModeEnabled: target.safeModeEnabled,
    requiresAuth: target.requiresAuth,
    environmentId: target.environmentId ?? null,
  };
}
