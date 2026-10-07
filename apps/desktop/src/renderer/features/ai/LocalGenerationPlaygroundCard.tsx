/**
 * @file apps/desktop/src/renderer/features/ai/LocalGenerationPlaygroundCard.tsx
 * Runtime Verification Playground for V9 Phase 130 Local Model Chat & Generation Runtime.
 * Allows developers and users to verify Ollama local model text generation, parameter tuning,
 * prompt execution, active request cancellation, and deterministic response inspection.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import type {
  AiModelDto,
  LocalGenerationResultDto,
  StructuredGenerationResultDto,
  AiGenerationLifecycleState,
  AiStreamEventDto,
} from '@ai-quality/contracts';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
  Badge,
  Button,
  Alert,
  Spinner,
} from '../../ui/index.js';

export interface LocalGenerationPlaygroundCardProps {
  readonly projectId?: string | null;
}

export const LocalGenerationPlaygroundCard: React.FC<LocalGenerationPlaygroundCardProps> = ({
  projectId,
}) => {
  const [ollamaConnected, setOllamaConnected] = useState<boolean | null>(null);
  const [models, setModels] = useState<readonly AiModelDto[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>('');
  const [prompt, setPrompt] = useState<string>('Explain in 2 sentences why automated software testing prevents defects.');
  const [systemPrompt, setSystemPrompt] = useState<string>('You are an expert software quality engineering assistant.');
  const [showAdvanced, setShowAdvanced] = useState<boolean>(false);
  const [temperature, setTemperature] = useState<number>(0.7);
  const [maxTokens, setMaxTokens] = useState<number>(1024);
  const [enableStreaming, setEnableStreaming] = useState<boolean>(true);
  const [enableStructured, setEnableStructured] = useState<boolean>(false);
  const [selectedSchema, setSelectedSchema] = useState<string>('TestPlan');
  const [structuredResult, setStructuredResult] = useState<StructuredGenerationResultDto | null>(null);

  const [state, setState] = useState<AiGenerationLifecycleState>('IDLE');
  const [activeRequestId, setActiveRequestId] = useState<string | null>(null);
  const [result, setResult] = useState<LocalGenerationResultDto | null>(null);
  const [streamingText, setStreamingText] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [elapsedMs, setElapsedMs] = useState<number>(0);

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef<number>(0);
  const lastSequenceRef = useRef<number>(-1);
  const unsubscribeRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      unsubscribeRef.current?.();
    };
  }, []);

  const fetchOllamaAndModels = useCallback(async () => {
    const desktop = window.desktop;
    if (!desktop) return;

    try {
      const statusRes = await desktop.ollama.getStatus({ projectId });
      if (statusRes.ok && statusRes.data) {
        setOllamaConnected(statusRes.data.health.state === 'AVAILABLE');
      } else {
        setOllamaConnected(false);
      }

      const modelsRes = await desktop.aiModels.list({ projectId });
      if (modelsRes.ok && modelsRes.data?.models) {
        setModels(modelsRes.data.models);
        if (modelsRes.data.models.length > 0 && !selectedModel) {
          const first = modelsRes.data.models[0];
          if (first) {
            setSelectedModel(first.id);
          }
        }
      }
    } catch {
      setOllamaConnected(false);
    }
  }, [projectId, selectedModel]);

  useEffect(() => {
    void fetchOllamaAndModels();
  }, [fetchOllamaAndModels]);

  const handleGenerate = async () => {
    const desktop = window.desktop;
    if (!desktop || !prompt.trim()) return;

    const reqId = crypto.randomUUID();
    setActiveRequestId(reqId);
    setState('RUNNING');
    setErrorMessage(null);
    setResult(null);
    setStreamingText('');
    setElapsedMs(0);
    lastSequenceRef.current = -1;

    startTimeRef.current = performance.now();
    timerRef.current = setInterval(() => {
      setElapsedMs(Math.round(performance.now() - startTimeRef.current));
    }, 100);

    if (enableStreaming && desktop.aiGeneration.generateStream) {
      try {
        const unsub = await desktop.aiGeneration.generateStream(
          {
            requestId: reqId,
            projectId,
            providerId: 'OLLAMA',
            modelId: selectedModel || undefined,
            prompt: prompt.trim(),
            systemPrompt: systemPrompt.trim() || undefined,
            parameters: {
              temperature,
              maxTokens,
            },
          },
          (event: AiStreamEventDto) => {
            // Guard against duplicate or unordered chunks
            if (event.type === 'DELTA' && event.sequence <= lastSequenceRef.current) {
              return;
            }
            lastSequenceRef.current = event.sequence;

            if (event.type === 'START') {
              setState('RUNNING');
            } else if (event.type === 'DELTA') {
              if (event.accumulatedText != null) {
                setStreamingText(event.accumulatedText);
              } else if (event.deltaText) {
                setStreamingText((prev) => prev + event.deltaText);
              }
            } else if (event.type === 'COMPLETE') {
              if (timerRef.current) {
                clearInterval(timerRef.current);
                timerRef.current = null;
              }
              const finalContent = event.accumulatedText || event.content || '';
              setStreamingText(finalContent);
              setState('COMPLETED');
              setResult({
                requestId: event.requestId,
                provider: event.provider || 'OLLAMA',
                model: event.model || selectedModel || 'default',
                content: finalContent,
                finishReason: event.finishReason || 'stop',
                durationMs: event.durationMs ?? Math.round(performance.now() - startTimeRef.current),
                usage: event.usage,
                state: 'COMPLETED',
              });
              if (event.durationMs) {
                setElapsedMs(event.durationMs);
              }
              setActiveRequestId(null);
            } else if (event.type === 'CANCELLED') {
              if (timerRef.current) {
                clearInterval(timerRef.current);
                timerRef.current = null;
              }
              setState('CANCELLED');
              setActiveRequestId(null);
            } else if (event.type === 'ERROR') {
              if (timerRef.current) {
                clearInterval(timerRef.current);
                timerRef.current = null;
              }
              setState('PROVIDER_ERROR');
              setErrorMessage(event.error || 'Stream generation failed.');
              setActiveRequestId(null);
            }
          },
        );
        unsubscribeRef.current = unsub;
      } catch (err: unknown) {
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }
        setState('PROVIDER_ERROR');
        setErrorMessage(err instanceof Error ? err.message : String(err));
        setActiveRequestId(null);
      }
    } else if (enableStructured && desktop.aiGeneration.generateStructured) {
      // Structured Output Generation (Phase 132)
      try {
        const res = await desktop.aiGeneration.generateStructured({
          requestId: reqId,
          projectId,
          providerId: 'OLLAMA',
          modelId: selectedModel || undefined,
          schemaName: selectedSchema,
          prompt: prompt.trim(),
          systemPrompt: systemPrompt.trim() || undefined,
          parameters: {
            temperature,
            maxTokens,
          },
        });

        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }

        if (res.ok) {
          setStructuredResult(res.data);
          setStreamingText(res.data.rawContent);
          setState(res.data.validationStatus === 'VALID' ? 'COMPLETED' : 'INVALID_RESPONSE');
          setElapsedMs(res.data.durationMs);
        } else {
          setState('PROVIDER_ERROR');
          setErrorMessage(res.error.message || 'Structured AI generation failed.');
        }
      } catch (err: unknown) {
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }
        setState('PROVIDER_ERROR');
        setErrorMessage(err instanceof Error ? err.message : String(err));
      } finally {
        setActiveRequestId(null);
      }
    } else {
      // Non-streaming batch generation
      try {
        const res = await desktop.aiGeneration.generate({
          requestId: reqId,
          projectId,
          providerId: 'OLLAMA',
          modelId: selectedModel || undefined,
          prompt: prompt.trim(),
          systemPrompt: systemPrompt.trim() || undefined,
          parameters: {
            temperature,
            maxTokens,
          },
        });

        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }

        if (res.ok) {
          setResult(res.data);
          setStreamingText(res.data.content);
          setState('COMPLETED');
          setElapsedMs(res.data.durationMs);
        } else {
          setState('PROVIDER_ERROR');
          setErrorMessage(res.error.message || 'AI Generation failed.');
        }
      } catch (err: unknown) {
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }
        setState('PROVIDER_ERROR');
        setErrorMessage(err instanceof Error ? err.message : String(err));
      } finally {
        setActiveRequestId(null);
      }
    }
  };

  const handleCancel = async () => {
    const desktop = window.desktop;
    if (!desktop || !activeRequestId) return;

    try {
      await desktop.aiGeneration.cancel({ requestId: activeRequestId });
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      unsubscribeRef.current?.();
      setState('CANCELLED');
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setActiveRequestId(null);
    }
  };

  return (
    <Card className="ai-generation-playground-card">
      <CardHeader>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <CardTitle level={2}>Local Model Generation Runtime (Phase 130)</CardTitle>
            <CardDescription>
              Execute production-ready local AI generation through Ollama with bounded project context, parameter controls, and real-time cancellation.
            </CardDescription>
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <Badge variant={ollamaConnected ? 'success' : 'neutral'}>
              Ollama: {ollamaConnected === true ? 'Connected' : ollamaConnected === false ? 'Offline' : 'Checking...'}
            </Badge>
            <Badge
              variant={
                state === 'RUNNING'
                  ? 'warning'
                  : state === 'COMPLETED'
                  ? 'success'
                  : state === 'CANCELLED'
                  ? 'neutral'
                  : state === 'PROVIDER_ERROR'
                  ? 'danger'
                  : 'neutral'
              }
            >
              Status: {state}
            </Badge>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        {errorMessage && (
          <div style={{ marginBottom: '16px' }}>
            <Alert variant="danger">{errorMessage}</Alert>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '6px' }}>
              Target Model:
            </label>
            <select
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              disabled={state === 'RUNNING'}
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: '6px',
                border: '1px solid var(--border-subtle, #333)',
                background: 'var(--surface-overlay, #1e1e1e)',
                color: 'var(--text-primary, #fff)',
              }}
            >
              {models.length === 0 && <option value="">Auto-resolve default model</option>}
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name || m.id} ({m.parameters ?? 'local'})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '6px' }}>
              Advanced Controls:
            </label>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setShowAdvanced(!showAdvanced)}
                style={{ width: '100%' }}
              >
                {showAdvanced ? 'Hide Parameters' : 'Configure Parameters (Temp, Tokens)'}
              </Button>
            </div>
            <div style={{ marginTop: '6px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', cursor: 'pointer', color: 'var(--text-secondary, #aaa)' }}>
                <input
                  type="checkbox"
                  checked={enableStreaming}
                  disabled={state === 'RUNNING' || enableStructured}
                  onChange={(e) => setEnableStreaming(e.target.checked)}
                />
                Stream response tokens progressively (Phase 131)
              </label>
            </div>
            <div style={{ marginTop: '6px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', cursor: 'pointer', color: 'var(--text-secondary, #aaa)' }}>
                <input
                  type="checkbox"
                  checked={enableStructured}
                  disabled={state === 'RUNNING'}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setEnableStructured(checked);
                    if (checked) setEnableStreaming(false);
                  }}
                />
                Enforce validated structured output schema (Phase 132)
              </label>
            </div>
            {enableStructured && (
              <div style={{ marginTop: '8px' }}>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, marginBottom: '2px' }}>
                  Target Schema:
                </label>
                <select
                  value={selectedSchema}
                  onChange={(e) => setSelectedSchema(e.target.value)}
                  disabled={state === 'RUNNING'}
                  style={{
                    width: '100%',
                    padding: '4px 8px',
                    borderRadius: '4px',
                    border: '1px solid var(--border-subtle, #333)',
                    background: 'var(--surface-overlay, #1e1e1e)',
                    color: '#fff',
                    fontSize: '0.8rem',
                  }}
                >
                  <option value="TestPlan">TestPlan (v1 - Steps, Target, Expected)</option>
                  <option value="BugReportSummary">BugReportSummary (v1 - Severity, Steps)</option>
                  <option value="ClassificationResult">ClassificationResult (v1 - Category, Tags)</option>
                </select>
              </div>
            )}
          </div>
        </div>

        {showAdvanced && (
          <div
            style={{
              padding: '12px',
              borderRadius: '6px',
              background: 'var(--surface-muted, #1a1a1a)',
              marginBottom: '16px',
              border: '1px solid var(--border-subtle, #333)',
            }}
          >
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '4px' }}>
                  Temperature: {temperature}
                </label>
                <input
                  type="range"
                  min="0.0"
                  max="1.5"
                  step="0.05"
                  value={temperature}
                  disabled={state === 'RUNNING'}
                  onChange={(e) => setTemperature(parseFloat(e.target.value))}
                  style={{ width: '100%' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '4px' }}>
                  Max Output Tokens: {maxTokens}
                </label>
                <input
                  type="number"
                  min="64"
                  max="8192"
                  step="64"
                  value={maxTokens}
                  disabled={state === 'RUNNING'}
                  onChange={(e) => setMaxTokens(parseInt(e.target.value, 10) || 1024)}
                  style={{
                    width: '100%',
                    padding: '6px 10px',
                    borderRadius: '4px',
                    border: '1px solid var(--border-subtle, #333)',
                    background: 'var(--surface-overlay, #222)',
                    color: '#fff',
                  }}
                />
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '4px' }}>
                System Prompt (Optional):
              </label>
              <input
                type="text"
                value={systemPrompt}
                disabled={state === 'RUNNING'}
                onChange={(e) => setSystemPrompt(e.target.value)}
                placeholder="System instructions for the model..."
                style={{
                  width: '100%',
                  padding: '6px 10px',
                  borderRadius: '4px',
                  border: '1px solid var(--border-subtle, #333)',
                  background: 'var(--surface-overlay, #222)',
                  color: '#fff',
                }}
              />
            </div>
          </div>
        )}

        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '6px' }}>
            User Prompt:
          </label>
          <textarea
            value={prompt}
            disabled={state === 'RUNNING'}
            onChange={(e) => setPrompt(e.target.value)}
            rows={4}
            placeholder="Type your generation prompt here..."
            style={{
              width: '100%',
              padding: '10px 12px',
              borderRadius: '6px',
              border: '1px solid var(--border-subtle, #333)',
              background: 'var(--surface-overlay, #1e1e1e)',
              color: 'var(--text-primary, #fff)',
              fontFamily: 'inherit',
              resize: 'vertical',
            }}
          />
        </div>

        {state === 'RUNNING' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px', background: 'var(--surface-muted, #1a1a1a)', borderRadius: '6px', marginBottom: '16px' }}>
            <Spinner size="sm" />
            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary, #aaa)' }}>
              {enableStreaming ? 'Streaming response from local model...' : 'Generating response via local Ollama...'} (Elapsed: {elapsedMs}ms)
            </span>
          </div>
        )}

        {(streamingText.length > 0 || result) && (
          <div style={{ marginTop: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Model Output:</span>
                {state === 'RUNNING' && (
                  <Badge variant="warning">Streaming</Badge>
                )}
                {state === 'CANCELLED' && (
                  <Badge variant="neutral">Cancelled (Partial)</Badge>
                )}
                {structuredResult && (
                  <Badge variant={structuredResult.validationStatus === 'VALID' ? 'success' : 'danger'}>
                    Schema: {structuredResult.schemaName} ({structuredResult.validationStatus})
                  </Badge>
                )}
                {structuredResult && structuredResult.retryCount > 0 && (
                  <Badge variant="warning">
                    Retries: {structuredResult.retryCount}
                  </Badge>
                )}
              </div>
              <div style={{ display: 'flex', gap: '8px', fontSize: '0.8rem', color: 'var(--text-secondary, #888)' }}>
                <span>Model: {structuredResult?.model || result?.model || selectedModel || 'local'}</span>
                <span>•</span>
                <span>Duration: {structuredResult?.durationMs ?? result?.durationMs ?? elapsedMs}ms</span>
                {(structuredResult?.usage?.totalTokens || result?.usage?.totalTokens) && (
                  <>
                    <span>•</span>
                    <span>Tokens: {structuredResult?.usage?.totalTokens ?? result?.usage?.totalTokens}</span>
                  </>
                )}
                {!result?.usage && !structuredResult?.usage && streamingText.length > 0 && (
                  <>
                    <span>•</span>
                    <span>Chars: {streamingText.length}</span>
                  </>
                )}
              </div>
            </div>

            {structuredResult && structuredResult.validationErrors.length > 0 && (
              <div style={{ marginBottom: '8px', padding: '8px 12px', borderRadius: '4px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)' }}>
                <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#ef4444' }}>Schema Validation Errors:</span>
                <ul style={{ margin: '4px 0 0 16px', padding: 0, fontSize: '0.75rem', color: '#f87171' }}>
                  {structuredResult.validationErrors.map((err, i) => (
                    <li key={i}>{err.path ? `${err.path}: ` : ''}{err.message}</li>
                  ))}
                </ul>
              </div>
            )}
            <div
              style={{
                padding: '14px',
                borderRadius: '6px',
                background: 'var(--surface-overlay, #1a1a1a)',
                border: '1px solid var(--border-subtle, #333)',
                whiteSpace: 'pre-wrap',
                fontFamily: 'monospace',
                fontSize: '0.9rem',
                lineHeight: 1.5,
              }}
            >
              {streamingText || result?.content}
              {state === 'RUNNING' && (
                <span
                  style={{
                    display: 'inline-block',
                    width: '8px',
                    height: '14px',
                    marginLeft: '4px',
                    background: 'var(--color-primary, #3b82f6)',
                    verticalAlign: 'middle',
                  }}
                />
              )}
            </div>
          </div>
        )}
      </CardContent>

      <CardFooter style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
        {state === 'RUNNING' ? (
          <Button variant="danger" onClick={handleCancel}>
            Cancel Generation
          </Button>
        ) : (
          <Button
            variant="primary"
            onClick={handleGenerate}
            disabled={!prompt.trim()}
          >
            Generate Response
          </Button>
        )}
      </CardFooter>
    </Card>
  );
};
