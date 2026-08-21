import { useState, useEffect, useCallback } from 'react';
import type {
  DatabaseStatus,
  AiProviderStatusDto,
  EmbeddingIndexStatusDto,
} from '@ai-quality/contracts';
import { useProject } from '../context/ProjectContext.js';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
  Badge,
  type BadgeVariant,
  Button,
} from '../ui/index.js';

export function SettingsScreen() {
  const { selectedProjectId } = useProject();
  const [dbStatus, setDbStatus] = useState<DatabaseStatus | null>(null);
  const [aiStatuses, setAiStatuses] = useState<readonly AiProviderStatusDto[]>([]);
  const [embeddingStatus, setEmbeddingStatus] = useState<EmbeddingIndexStatusDto | null>(null);
  const [isLoadingDb, setIsLoadingDb] = useState<boolean>(false);
  const [isLoadingAi, setIsLoadingAi] = useState<boolean>(false);
  const [isIndexing, setIsIndexing] = useState<boolean>(false);

  const fetchDatabaseStatus = useCallback(async () => {
    if (!window.desktop?.database?.getStatus) {
      setDbStatus({ status: 'unavailable' });
      return;
    }

    setIsLoadingDb(true);
    try {
      const result = await window.desktop.database.getStatus();
      if (result.ok) {
        setDbStatus(result.data);
      } else {
        setDbStatus({ status: 'unavailable' });
      }
    } catch {
      setDbStatus({ status: 'unavailable' });
    } finally {
      setIsLoadingDb(false);
    }
  }, []);

  const fetchAiAndEmbeddingStatus = useCallback(async () => {
    if (!window.desktop?.ai) return;

    setIsLoadingAi(true);
    try {
      const aiResult = await window.desktop.ai.getProviderStatus();
      if (aiResult.ok) {
        setAiStatuses(aiResult.data);
      }

      if (selectedProjectId && window.desktop.ai.getEmbeddingIndexStatus) {
        const embResult = await window.desktop.ai.getEmbeddingIndexStatus({
          projectId: selectedProjectId,
        });
        if (embResult.ok) {
          setEmbeddingStatus(embResult.data);
        }
      }
    } catch {
      // Handled silently
    } finally {
      setIsLoadingAi(false);
    }
  }, [selectedProjectId]);

  const handleIndexRequirements = async () => {
    if (!selectedProjectId || !window.desktop?.ai?.indexSubjects) return;

    setIsIndexing(true);
    try {
      await window.desktop.ai.indexSubjects({
        projectId: selectedProjectId,
        subjectType: 'REQUIREMENT',
        forceReindex: true,
      });
      await fetchAiAndEmbeddingStatus();
    } catch {
      // Handled silently
    } finally {
      setIsIndexing(false);
    }
  };

  useEffect(() => {
    void fetchDatabaseStatus();
    void fetchAiAndEmbeddingStatus();
  }, [fetchDatabaseStatus, fetchAiAndEmbeddingStatus]);

  const getDbStatusBadge = () => {
    if (!dbStatus) {
      return <Badge variant="neutral">Checking...</Badge>;
    }

    let variant: BadgeVariant = 'neutral';
    let label = 'Not Configured';

    switch (dbStatus.status) {
      case 'connected':
        variant = 'success';
        label = 'Database Connected';
        break;
      case 'unavailable':
        variant = 'danger';
        label = 'Database Unavailable';
        break;
      case 'not-configured':
      default:
        variant = 'neutral';
        label = 'Database Not Configured';
        break;
    }

    return (
      <Badge variant={variant} dot={dbStatus.status === 'connected'}>
        {label}
      </Badge>
    );
  };

  const configuredProvider = aiStatuses.find(p => p.configured) ?? aiStatuses[0];

  return (
    <div
      className="screen-container"
      data-screen="settings"
      style={{
        maxWidth: '860px',
        margin: '0 auto',
        display: 'flex',
        flexDirection: 'column',
        gap: '1.5rem',
      }}
    >
      <Card variant="default">
        <CardHeader>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <CardTitle level={2}>PostgreSQL Infrastructure & pgvector</CardTitle>
              <CardDescription>
                Process-level database connection pool and vector extension status.
              </CardDescription>
            </div>
            {getDbStatusBadge()}
          </div>
        </CardHeader>
        <CardContent>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '0.75rem',
              fontSize: '0.85rem',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                borderBottom: '1px solid var(--border-subtle)',
                paddingBottom: '0.5rem',
              }}
            >
              <span style={{ color: 'var(--text-secondary)' }}>Status:</span>
              <span style={{ fontWeight: 500, color: 'var(--text-primary)' }}>
                {dbStatus?.status || 'Unknown'}
              </span>
            </div>
            {dbStatus?.databaseName && (
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  borderBottom: '1px solid var(--border-subtle)',
                  paddingBottom: '0.5rem',
                }}
              >
                <span style={{ color: 'var(--text-secondary)' }}>Database:</span>
                <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-accent)' }}>
                  {dbStatus.databaseName}
                </span>
              </div>
            )}
            {dbStatus?.serverVersion && (
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  borderBottom: '1px solid var(--border-subtle)',
                  paddingBottom: '0.5rem',
                }}
              >
                <span style={{ color: 'var(--text-secondary)' }}>Server Version:</span>
                <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
                  {dbStatus.serverVersion}
                </span>
              </div>
            )}
            {dbStatus?.latencyMs !== undefined && (
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  borderBottom: '1px solid var(--border-subtle)',
                  paddingBottom: '0.5rem',
                }}
              >
                <span style={{ color: 'var(--text-secondary)' }}>Query Latency:</span>
                <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-success)' }}>
                  {dbStatus.latencyMs} ms
                </span>
              </div>
            )}
          </div>
        </CardContent>
        <CardFooter>
          <Button
            variant="secondary"
            size="sm"
            loading={isLoadingDb}
            onClick={() => void fetchDatabaseStatus()}
          >
            Check Connection
          </Button>
        </CardFooter>
      </Card>

      <Card variant="default">
        <CardHeader>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <CardTitle level={2}>AI Provider Gateway & Embedding Foundation</CardTitle>
              <CardDescription>
                AI LLM provider configuration, vector embedding models, and retrieval state.
              </CardDescription>
            </div>
            {configuredProvider && (
              <Badge
                variant={configuredProvider.status === 'READY' ? 'success' : 'neutral'}
                dot={configuredProvider.status === 'READY'}
              >
                {configuredProvider.providerId} ({configuredProvider.status})
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '0.75rem',
              fontSize: '0.85rem',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                borderBottom: '1px solid var(--border-subtle)',
                paddingBottom: '0.5rem',
              }}
            >
              <span style={{ color: 'var(--text-secondary)' }}>Default Provider:</span>
              <span style={{ fontWeight: 500, color: 'var(--text-primary)' }}>
                {configuredProvider?.providerId || 'None'}
              </span>
            </div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                borderBottom: '1px solid var(--border-subtle)',
                paddingBottom: '0.5rem',
              }}
            >
              <span style={{ color: 'var(--text-secondary)' }}>Embedding Support:</span>
              <span style={{ fontWeight: 500, color: 'var(--color-success)' }}>
                {configuredProvider?.capabilities?.embeddings ? 'Enabled (1536 dims)' : 'Disabled'}
              </span>
            </div>
            {embeddingStatus && (
              <>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    borderBottom: '1px solid var(--border-subtle)',
                    paddingBottom: '0.5rem',
                  }}
                >
                  <span style={{ color: 'var(--text-secondary)' }}>Current Project Vectors:</span>
                  <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-accent)' }}>
                    {embeddingStatus.totalIndexed} active ({embeddingStatus.totalStale} stale)
                  </span>
                </div>
                {embeddingStatus.lastIndexedAt && (
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      borderBottom: '1px solid var(--border-subtle)',
                      paddingBottom: '0.5rem',
                    }}
                  >
                    <span style={{ color: 'var(--text-secondary)' }}>Last Indexed At:</span>
                    <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
                      {new Date(embeddingStatus.lastIndexedAt).toLocaleString()}
                    </span>
                  </div>
                )}
              </>
            )}
          </div>
        </CardContent>
        <CardFooter>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <Button
              variant="secondary"
              size="sm"
              loading={isLoadingAi}
              onClick={() => void fetchAiAndEmbeddingStatus()}
            >
              Refresh Status
            </Button>
            {selectedProjectId && (
              <Button
                variant="primary"
                size="sm"
                loading={isIndexing}
                onClick={() => void handleIndexRequirements()}
              >
                Index Requirements
              </Button>
            )}
          </div>
        </CardFooter>
      </Card>

      {/* RAG Context Retrieval Engine Configuration */}
      <Card>
        <CardHeader>
          <div
            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}
          >
            <div>
              <CardTitle level={2}>RAG & Requirement Context Retrieval Engine</CardTitle>
              <CardDescription>
                Multi-source grounded context assembly, authority tier ranking, and token budgeting.
              </CardDescription>
            </div>
            <Badge variant="success" dot={true}>
              requirement-rag-v1
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '0.75rem',
              fontSize: '0.85rem',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                borderBottom: '1px solid var(--border-subtle)',
                paddingBottom: '0.5rem',
              }}
            >
              <span style={{ color: 'var(--text-secondary)' }}>Context Budget Limits:</span>
              <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
                8,000 tokens / 32,000 chars / max 25 items
              </span>
            </div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                borderBottom: '1px solid var(--border-subtle)',
                paddingBottom: '0.5rem',
              }}
            >
              <span style={{ color: 'var(--text-secondary)' }}>Authority Hierarchy:</span>
              <span style={{ fontWeight: 500, color: 'var(--text-accent)' }}>
                Tiers 1–5 Deterministic & Confirmed &rarr; Tier 6 Vector Similarity &rarr; Tier 7
                Candidates
              </span>
            </div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                borderBottom: '1px solid var(--border-subtle)',
                paddingBottom: '0.5rem',
              }}
            >
              <span style={{ color: 'var(--text-secondary)' }}>Security Isolation:</span>
              <span style={{ fontWeight: 500, color: 'var(--color-success)' }}>
                Strict Project Isolation & Untrusted Content Delimitation
              </span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
