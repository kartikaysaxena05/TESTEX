/**
 * @file apps/desktop/src/renderer/features/dashboard/usePlatformHealth.ts
 * Real-time platform diagnostic and infrastructure health hook.
 */

import { useState, useEffect, useCallback } from 'react';
import type {
  DatabaseStatusState,
  AiProviderStatusDto,
  AppInfo,
  HealthInfo,
} from '@ai-quality/contracts';

export type HealthBadgeStatus = 'ready' | 'degraded' | 'error' | 'neutral';

export interface ServiceHealthItem {
  readonly id: string;
  readonly name: string;
  readonly status: HealthBadgeStatus;
  readonly statusLabel: string;
  readonly detail?: string;
}

export interface PlatformHealthState {
  readonly isChecking: boolean;
  readonly services: readonly ServiceHealthItem[];
  readonly appInfo: AppInfo | null;
  readonly healthInfo: HealthInfo | null;
  readonly refresh: () => Promise<void>;
}

export function usePlatformHealth(): PlatformHealthState {
  const [isChecking, setIsChecking] = useState<boolean>(true);
  const [dbStatus, setDbStatus] = useState<DatabaseStatusState>('connected');
  const [dbLatency, setDbLatency] = useState<number | undefined>(undefined);
  const [aiProviders, setAiProviders] = useState<readonly AiProviderStatusDto[]>([]);
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null);
  const [healthInfo, setHealthInfo] = useState<HealthInfo | null>(null);

  const checkHealth = useCallback(async () => {
    setIsChecking(true);
    try {
      // 1. Database Connectivity
      if (window.desktop?.database?.getStatus) {
        try {
          const dbRes = await window.desktop.database.getStatus();
          if (dbRes.ok) {
            setDbStatus(dbRes.data.status);
            setDbLatency(dbRes.data.latencyMs);
          } else {
            setDbStatus('unavailable');
          }
        } catch {
          setDbStatus('unavailable');
        }
      }

      // 2. AI Provider Status
      if (window.desktop?.ai?.getProviderStatus) {
        try {
          const aiRes = await window.desktop.ai.getProviderStatus();
          if (aiRes.ok) {
            setAiProviders(aiRes.data);
          }
        } catch {
          setAiProviders([]);
        }
      }

      // 3. Desktop Runtime Health
      if (window.desktop?.health?.check) {
        try {
          const hRes = await window.desktop.health.check();
          if (hRes.ok) {
            setHealthInfo(hRes.data);
          }
        } catch {
          // ignore
        }
      }

      // 4. App Info
      if (window.desktop?.app?.getInfo) {
        try {
          const appRes = await window.desktop.app.getInfo();
          if (appRes.ok) {
            setAppInfo(appRes.data);
          }
        } catch {
          // ignore
        }
      }
    } finally {
      setIsChecking(false);
    }
  }, []);

  useEffect(() => {
    void checkHealth();
  }, [checkHealth]);

  // Compute semantic service health entries from real runtime state
  const services: ServiceHealthItem[] = [];

  // 1. PostgreSQL Database
  let dbBadge: HealthBadgeStatus = 'ready';
  let dbLabel = 'Connected';
  if (dbStatus === 'unavailable') {
    dbBadge = 'error';
    dbLabel = 'Unavailable';
  } else if (dbStatus === 'not-configured') {
    dbBadge = 'degraded';
    dbLabel = 'Not Configured';
  }
  services.push({
    id: 'postgres',
    name: 'PostgreSQL Database',
    status: dbBadge,
    statusLabel: dbLabel,
    detail: dbLatency !== undefined ? `${dbLatency}ms latency` : undefined,
  });

  // 2. Vector Store (pgvector)
  const isDbHealthy = dbStatus === 'connected';
  services.push({
    id: 'vector',
    name: 'Vector Store (pgvector)',
    status: isDbHealthy ? 'ready' : dbBadge,
    statusLabel: isDbHealthy ? 'Ready' : dbLabel,
    detail: isDbHealthy ? '1536-dim embeddings' : undefined,
  });

  // 3. AI Provider Gateway
  const primaryProvider = aiProviders[0];
  let aiBadge: HealthBadgeStatus = 'neutral';
  let aiLabel = 'Not Configured';
  let aiDetail: string | undefined;

  if (primaryProvider) {
    if (primaryProvider.status === 'READY') {
      aiBadge = 'ready';
      aiLabel = 'Ready';
      aiDetail = primaryProvider.providerId;
    } else if (primaryProvider.status === 'NOT_CONFIGURED') {
      aiBadge = 'degraded';
      aiLabel = 'Configuration Required';
    } else if (primaryProvider.status === 'AUTHENTICATION_FAILED') {
      aiBadge = 'degraded';
      aiLabel = 'Auth Failed';
    } else {
      aiBadge = 'error';
      aiLabel = 'Unavailable';
    }
  } else if (aiProviders.length > 0) {
    aiBadge = 'ready';
    aiLabel = 'Configured';
  }
  services.push({
    id: 'ai-provider',
    name: 'AI Provider Gateway',
    status: aiBadge,
    statusLabel: aiLabel,
    detail: aiDetail,
  });

  // 4. RAG Engine
  const isRagReady = isDbHealthy && aiBadge === 'ready';
  services.push({
    id: 'rag-engine',
    name: 'RAG Retrieval Engine',
    status: isRagReady ? 'ready' : isDbHealthy ? 'degraded' : 'error',
    statusLabel: isRagReady ? 'Ready' : isDbHealthy ? 'Pending AI Setup' : 'Unavailable',
    detail: isRagReady ? 'Hybrid search & context packs' : undefined,
  });

  // 5. Desktop Runtime
  const isDesktopOk = healthInfo?.status !== 'error';
  services.push({
    id: 'desktop-runtime',
    name: 'Desktop Runtime',
    status: isDesktopOk ? 'ready' : 'error',
    statusLabel: isDesktopOk ? 'Connected' : 'Error',
    detail: appInfo ? `${appInfo.platform} / ${appInfo.arch}` : undefined,
  });

  return {
    isChecking,
    services,
    appInfo,
    healthInfo,
    refresh: checkHealth,
  };
}
