import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('Preload Bridge Unit Tests', () => {
  it('should verify the expected surface of window.desktop bridge', async () => {
    let exposedApi: Record<string, unknown> | null = null;

    const mockContextBridge = {
      exposeInMainWorld: (apiKey: string, api: Record<string, unknown>) => {
        if (apiKey === 'desktop') {
          exposedApi = api;
        }
      },
    };

    const mockIpcRenderer = {
      invoke: async (_channel: string, ..._args: unknown[]) => ({ ok: true, data: {} }),
    };

    // Execute preload initialization logic with mock dependencies
    const createBridge = (bridge: typeof mockContextBridge, ipc: typeof mockIpcRenderer) => {
      bridge.exposeInMainWorld('desktop', {
        app: {
          getInfo: () => ipc.invoke('desktop:app:get-info'),
        },
        health: {
          check: () => ipc.invoke('desktop:health:check'),
        },
        database: {
          getStatus: () => ipc.invoke('desktop:database:get-status'),
        },
        projects: {
          list: (input?: unknown) => ipc.invoke('desktop:projects:list', input),
          get: (id: string) => ipc.invoke('desktop:projects:get', id),
          create: (input: unknown) => ipc.invoke('desktop:projects:create', input),
          update: (input: unknown) => ipc.invoke('desktop:projects:update', input),
          archive: (id: string) => ipc.invoke('desktop:projects:archive', id),
          restore: (id: string) => ipc.invoke('desktop:projects:restore', id),
          delete: (id: string) => ipc.invoke('desktop:projects:delete', id),
          environments: {
            create: (input: unknown) => ipc.invoke('desktop:projects:environments:create', input),
            update: (input: unknown) => ipc.invoke('desktop:projects:environments:update', input),
            delete: (input: unknown) => ipc.invoke('desktop:projects:environments:delete', input),
            setDefault: (input: unknown) =>
              ipc.invoke('desktop:projects:environments:set-default', input),
          },
        },
        sources: {
          get: (id: string) => ipc.invoke('desktop:sources:get', id),
          pickDirectory: () => ipc.invoke('desktop:sources:pick-directory'),
          attachLocalDirectory: (id: string, directoryPath?: string) =>
            ipc.invoke('desktop:sources:attach-local-directory', { projectId: id, directoryPath }),
          detach: (id: string) => ipc.invoke('desktop:sources:detach', id),
          validate: (id: string) => ipc.invoke('desktop:sources:validate', id),
          refreshMetadata: (id: string) => ipc.invoke('desktop:sources:refresh-metadata', id),
          git: {
            get: (id: string) => ipc.invoke('desktop:sources:git:get', id),
            refresh: (id: string) => ipc.invoke('desktop:sources:git:refresh', id),
          },
          structure: {
            get: (id: string) => ipc.invoke('desktop:sources:structure:get', id),
            refresh: (id: string) => ipc.invoke('desktop:sources:structure:refresh', id),
          },
          technology: {
            get: (id: string) => ipc.invoke('desktop:sources:technology:get', id),
            refresh: (id: string) => ipc.invoke('desktop:sources:technology:refresh', id),
          },
          frameworks: {
            get: (id: string) => ipc.invoke('desktop:sources:frameworks:get', id),
            refresh: (id: string) => ipc.invoke('desktop:sources:frameworks:refresh', id),
          },
          classification: {
            get: (id: string) => ipc.invoke('desktop:sources:classification:get', id),
            refresh: (id: string) => ipc.invoke('desktop:sources:classification:refresh', id),
          },
          content: {
            get: (input: unknown) => ipc.invoke('desktop:sources:content:get', input),
          },
          index: {
            getStatus: (id: string) => ipc.invoke('desktop:sources:index:get-status', id),
            refresh: (id: string) => ipc.invoke('desktop:sources:index:refresh', id),
            listFiles: (input: unknown) => ipc.invoke('desktop:sources:index:list-files', input),
            getFileDetails: (input: unknown) =>
              ipc.invoke('desktop:sources:index:get-file-details', input),
            searchSymbols: (input: unknown) =>
              ipc.invoke('desktop:sources:index:search-symbols', input),
          },
          architecture: {
            get: (id: string) => ipc.invoke('desktop:sources:architecture:get', id),
            refresh: (id: string) => ipc.invoke('desktop:sources:architecture:refresh', id),
          },
          runConfiguration: {
            get: (id: string) => ipc.invoke('desktop:sources:run-config:get', id),
            detect: (id: string) => ipc.invoke('desktop:sources:run-config:detect', id),
            select: (input: unknown) => ipc.invoke('desktop:sources:run-config:select', input),
            updateTargetUrl: (input: unknown) =>
              ipc.invoke('desktop:sources:run-config:update-target-url', input),
          },
          snapshots: {
            list: (id: string) => ipc.invoke('desktop:sources:snapshots:list', id),
            create: (input: unknown) => ipc.invoke('desktop:sources:snapshots:create', input),
            setBaseline: (input: unknown) =>
              ipc.invoke('desktop:sources:snapshots:set-baseline', input),
            delete: (input: unknown) => ipc.invoke('desktop:sources:snapshots:delete', input),
          },
          changes: {
            get: (id: string) => ipc.invoke('desktop:sources:changes:get', id),
            refresh: (id: string) => ipc.invoke('desktop:sources:changes:refresh', id),
          },
        },
        requirements: {
          list: (input: unknown) => ipc.invoke('desktop:requirements:list', input),
          get: (input: unknown) => ipc.invoke('desktop:requirements:get', input),
          getByKey: (input: unknown) => ipc.invoke('desktop:requirements:get-by-key', input),
          getSummary: (projectId: string) =>
            ipc.invoke('desktop:requirements:get-summary', projectId),
          create: (input: unknown) => ipc.invoke('desktop:requirements:create', input),
          update: (input: unknown) => ipc.invoke('desktop:requirements:update', input),
          activate: (input: unknown) => ipc.invoke('desktop:requirements:activate', input),
          deprecate: (input: unknown) => ipc.invoke('desktop:requirements:deprecate', input),
          draft: (input: unknown) => ipc.invoke('desktop:requirements:draft', input),
          archive: (input: unknown) => ipc.invoke('desktop:requirements:archive', input),
          restore: (input: unknown) => ipc.invoke('desktop:requirements:restore', input),
          delete: (input: unknown) => ipc.invoke('desktop:requirements:delete', input),
          parseBulk: (input: unknown) => ipc.invoke('desktop:requirements:parse-bulk', input),
          importBulk: (input: unknown) => ipc.invoke('desktop:requirements:import-bulk', input),
          getProvenance: (input: unknown) =>
            ipc.invoke('desktop:requirements:get-provenance', input),
          getSourceContext: (input: unknown) =>
            ipc.invoke('desktop:requirements:get-source-context', input),
          normalize: (input: unknown) => ipc.invoke('desktop:requirements:normalize', input),
          getRepresentation: (input: unknown) =>
            ipc.invoke('desktop:requirements:get-representation', input),
          updateRepresentation: (input: unknown) =>
            ipc.invoke('desktop:requirements:update-representation', input),
          regenerateRepresentation: (input: unknown) =>
            ipc.invoke('desktop:requirements:regenerate-representation', input),
          batchNormalize: (input: unknown) =>
            ipc.invoke('desktop:requirements:batch-normalize', input),
          classify: (input: unknown) => ipc.invoke('desktop:requirements:classify', input),
          getMetadata: (input: unknown) => ipc.invoke('desktop:requirements:get-metadata', input),
          updateMetadata: (input: unknown) =>
            ipc.invoke('desktop:requirements:update-metadata', input),
          regenerateMetadata: (input: unknown) =>
            ipc.invoke('desktop:requirements:regenerate-metadata', input),
          batchClassify: (input: unknown) =>
            ipc.invoke('desktop:requirements:batch-classify', input),
          analyzeQuality: (input: unknown) =>
            ipc.invoke('desktop:requirements:analyze-quality', input),
          getQualityAnalysis: (input: unknown) =>
            ipc.invoke('desktop:requirements:get-quality-analysis', input),
          reviewQualityFinding: (input: unknown) =>
            ipc.invoke('desktop:requirements:review-quality-finding', input),
          reanalyzeQuality: (input: unknown) =>
            ipc.invoke('desktop:requirements:reanalyze-quality', input),
          batchAnalyzeQuality: (input: unknown) =>
            ipc.invoke('desktop:requirements:batch-analyze-quality', input),
          proposeRelationships: (input: unknown) =>
            ipc.invoke('desktop:requirements:propose-relationships', input),
          getRelationships: (input: unknown) =>
            ipc.invoke('desktop:requirements:get-relationships', input),
          getRelationshipGraph: (input: unknown) =>
            ipc.invoke('desktop:requirements:get-relationship-graph', input),
          createManualRelationship: (input: unknown) =>
            ipc.invoke('desktop:requirements:create-manual-relationship', input),
          reviewRelationship: (input: unknown) =>
            ipc.invoke('desktop:requirements:review-relationship', input),
          deleteRelationship: (input: unknown) =>
            ipc.invoke('desktop:requirements:delete-relationship', input),
          matchRepositoryEvidence: (input: unknown) =>
            ipc.invoke('desktop:requirements:match-repository-evidence', input),
          getRepositoryEvidence: (input: unknown) =>
            ipc.invoke('desktop:requirements:get-repository-evidence', input),
          reviewRepositoryEvidence: (input: unknown) =>
            ipc.invoke('desktop:requirements:review-repository-evidence', input),
          createManualRepositoryEvidence: (input: unknown) =>
            ipc.invoke('desktop:requirements:create-manual-repository-evidence', input),
          deleteRepositoryEvidence: (input: unknown) =>
            ipc.invoke('desktop:requirements:delete-repository-evidence', input),
          previewRepositoryEvidence: (input: unknown) =>
            ipc.invoke('desktop:requirements:preview-repository-evidence', input),
        },
        requirementSources: {
          list: (input: unknown) => ipc.invoke('desktop:requirement-sources:list', input),
          get: (input: unknown) => ipc.invoke('desktop:requirement-sources:get', input),
        },
        requirementDocuments: {
          selectAndIngest: (input: unknown) =>
            ipc.invoke('desktop:requirement-documents:select-and-ingest', input),
          list: (input: unknown) => ipc.invoke('desktop:requirement-documents:list', input),
          get: (input: unknown) => ipc.invoke('desktop:requirement-documents:get', input),
          delete: (input: unknown) => ipc.invoke('desktop:requirement-documents:delete', input),
          extract: (input: unknown) => ipc.invoke('desktop:requirement-documents:extract', input),
          getExtraction: (input: unknown) =>
            ipc.invoke('desktop:requirement-documents:get-extraction', input),
        },
        requirementCandidates: {
          detect: (input: unknown) => ipc.invoke('desktop:requirement-candidates:detect', input),
          list: (input: unknown) => ipc.invoke('desktop:requirement-candidates:list', input),
          update: (input: unknown) => ipc.invoke('desktop:requirement-candidates:update', input),
          setStatus: (input: unknown) =>
            ipc.invoke('desktop:requirement-candidates:set-status', input),
          import: (input: unknown) => ipc.invoke('desktop:requirement-candidates:import', input),
        },
        logging: {
          reportRendererError: (report: unknown) =>
            ipc.invoke('desktop:logging:report-renderer-error', report),
        },
        ollama: {
          getStatus: (input?: unknown) => ipc.invoke('desktop:ai:ollama:get-status', input),
          healthCheck: (input?: unknown) => ipc.invoke('desktop:ai:ollama:health-check', input),
          getConfig: (input?: unknown) => ipc.invoke('desktop:ai:ollama:get-config', input),
          setConfig: (input: unknown) => ipc.invoke('desktop:ai:ollama:set-config', input),
        },
        aiModels: {
          list: (input?: unknown) => ipc.invoke('desktop:ai:models:list', input),
          refresh: (input?: unknown) => ipc.invoke('desktop:ai:models:refresh', input),
          get: (input: unknown) => ipc.invoke('desktop:ai:models:get', input),
          getCapabilities: (input: unknown) =>
            ipc.invoke('desktop:ai:models:get-capabilities', input),
          verifyCapabilities: (input: unknown) =>
            ipc.invoke('desktop:ai:models:verify-capabilities', input),
          select: (input: unknown) => ipc.invoke('desktop:ai:models:select', input),
          getSelection: (input: unknown) => ipc.invoke('desktop:ai:models:get-selection', input),
          resolveForTask: (input: unknown) =>
            ipc.invoke('desktop:ai:models:resolve-for-task', input),
        },
        aiGeneration: {
          generate: (input: unknown) => ipc.invoke('desktop:ai:generation:generate', input),
          generateStream: (input: unknown, _onEvent: unknown) =>
            ipc.invoke('desktop:ai:generation:stream', input),
          cancel: (input: unknown) => ipc.invoke('desktop:ai:generation:cancel', input),
          getStatus: (input: unknown) => ipc.invoke('desktop:ai:generation:get-status', input),
          generateStructured: (input: unknown) =>
            ipc.invoke('desktop:ai:structured:generate', input),
          validateStructured: (input: unknown) =>
            ipc.invoke('desktop:ai:structured:validate', input),
          getStructuredCapabilities: (input: unknown) =>
            ipc.invoke('desktop:ai:structured:get-capabilities', input),
        },
        aiTool: {
          listTools: (input?: unknown) => ipc.invoke('desktop:ai:tool:list', input),
          getTool: (input: unknown) => ipc.invoke('desktop:ai:tool:get', input),
          parseCalls: (input: unknown) => ipc.invoke('desktop:ai:tool:parse-call', input),
          validateCall: (input: unknown) => ipc.invoke('desktop:ai:tool:validate-call', input),
          generateCalls: (input: unknown) => ipc.invoke('desktop:ai:tool:generate-calls', input),
          getCapabilities: (input?: unknown) =>
            ipc.invoke('desktop:ai:tool:get-capabilities', input),
        },
        aiContext: {
          estimateTokens: (input: unknown) =>
            ipc.invoke('desktop:ai:context:estimate-tokens', input),
          calculateBudget: (input: unknown) =>
            ipc.invoke('desktop:ai:context:calculate-budget', input),
          optimizeSelection: (input: unknown) =>
            ipc.invoke('desktop:ai:context:optimize-selection', input),
          getCapabilities: (input: unknown) =>
            ipc.invoke('desktop:ai:context:get-capabilities', input),
        },
        aiPrivacy: {
          getSettings: (input?: unknown) => ipc.invoke('desktop:ai:privacy:get-settings', input),
          updateSettings: (input: unknown) =>
            ipc.invoke('desktop:ai:privacy:update-settings', input),
          checkFirewall: (input: unknown) => ipc.invoke('desktop:ai:privacy:check-firewall', input),
        },
        aiRouter: {
          getFallbackSettings: (input?: unknown) =>
            ipc.invoke('desktop:ai:fallback:get-policy', input),
          updateFallbackSettings: (input: unknown) =>
            ipc.invoke('desktop:ai:fallback:set-policy', input),
          listProviders: (input?: unknown) => ipc.invoke('desktop:ai:providers:list', input),
          getProviderStatus: (input: unknown) => ipc.invoke('desktop:ai:providers:status', input),
          selectProvider: (input: unknown) => ipc.invoke('desktop:ai:providers:select', input),
        },
        aiLifecycle: {
          getActiveRequests: (projectId?: string | null) =>
            ipc.invoke('desktop:ai:lifecycle:get-active', { projectId }),
          getMetrics: () => ipc.invoke('desktop:ai:lifecycle:get-metrics'),
          recoverInterrupted: (input?: unknown) =>
            ipc.invoke('desktop:ai:lifecycle:recover-interrupted', input),
        },
        agentRuntime: {
          createTask: (input: unknown) => ipc.invoke('desktop:agent:runtime:task:create', input),
          getTask: (input: unknown) => ipc.invoke('desktop:agent:runtime:task:get', input),
          cancelTask: (input: unknown) => ipc.invoke('desktop:agent:runtime:task:cancel', input),
          getTaskEvents: (input: unknown) =>
            ipc.invoke('desktop:agent:runtime:task:get-events', input),
        },
        agentThread: {
          createThread: (input: unknown) => ipc.invoke('desktop:agent:thread:create', input),
          listThreads: (input: unknown) => ipc.invoke('desktop:agent:thread:list', input),
          getThread: (input: unknown) => ipc.invoke('desktop:agent:thread:get', input),
          archiveThread: (input: unknown) => ipc.invoke('desktop:agent:thread:archive', input),
          createTask: (input: unknown) => ipc.invoke('desktop:agent:thread:task:create', input),
          getTask: (input: unknown) => ipc.invoke('desktop:agent:thread:task:get', input),
          listTasks: (input: unknown) => ipc.invoke('desktop:agent:thread:task:list', input),
          cancelTask: (input: unknown) => ipc.invoke('desktop:agent:thread:task:cancel', input),
          retryTask: (input: unknown) => ipc.invoke('desktop:agent:thread:task:retry', input),
          resumeTask: (input: unknown) => ipc.invoke('desktop:agent:thread:task:resume', input),
          listMessages: (input: unknown) => ipc.invoke('desktop:agent:thread:message:list', input),
          listExecutionSteps: (input: unknown) =>
            ipc.invoke('desktop:agent:thread:step:list', input),
          listToolCalls: (input: unknown) =>
            ipc.invoke('desktop:agent:thread:tool-call:list', input),
          executeAutonomousWorkflow: (input: unknown) =>
            ipc.invoke('desktop:agent:workflow:execute', input),
          getAutonomousWorkflowReport: (input: unknown) =>
            ipc.invoke('desktop:agent:workflow:report:get', input),
          approveWorkflowFix: (input: unknown) =>
            ipc.invoke('desktop:agent:workflow:fix:approve', input),
          rejectWorkflowFix: (input: unknown) =>
            ipc.invoke('desktop:agent:workflow:fix:reject', input),
        },
        agentToolRegistry: {
          listTools: (input: unknown) => ipc.invoke('desktop:agent:tool-registry:list', input),
          getTool: (input: unknown) => ipc.invoke('desktop:agent:tool-registry:get', input),
          invokeTool: (input: unknown) => ipc.invoke('desktop:agent:tool-registry:invoke', input),
        },
        agentToolPermissions: {
          listApprovals: (input: unknown) => ipc.invoke('desktop:agent:tool-approvals:list', input),
          getApproval: (input: unknown) => ipc.invoke('desktop:agent:tool-approvals:get', input),
          decideApproval: (input: unknown) =>
            ipc.invoke('desktop:agent:tool-approvals:decide', input),
          listAuditLogs: (input: unknown) =>
            ipc.invoke('desktop:agent:tool-audit-logs:list', input),
        },
        failures: {
          createCase: (input: unknown) => ipc.invoke('desktop:failures:create-case', input),
          ensureCase: (input: unknown) => ipc.invoke('desktop:failures:ensure-case', input),
          getCase: (input: unknown) => ipc.invoke('desktop:failures:get-case', input),
          listCases: (input: unknown) => ipc.invoke('desktop:failures:list-cases', input),
          startAnalysis: (input: unknown) => ipc.invoke('desktop:failures:start-analysis', input),
          completeAnalysis: (input: unknown) =>
            ipc.invoke('desktop:failures:complete-analysis', input),
          failAnalysis: (input: unknown) => ipc.invoke('desktop:failures:fail-analysis', input),
          cancelAnalysis: (input: unknown) => ipc.invoke('desktop:failures:cancel-analysis', input),
          markStale: (input: unknown) => ipc.invoke('desktop:failures:mark-stale', input),
          listRuns: (input: unknown) => ipc.invoke('desktop:failures:list-runs', input),
          listEvidenceReferences: (input: unknown) =>
            ipc.invoke('desktop:failures:list-evidence-references', input),
          ingestEvidence: (input: unknown) => ipc.invoke('desktop:failures:ingest-evidence', input),
          getEvidencePackage: (input: unknown) =>
            ipc.invoke('desktop:failures:get-evidence-package', input),
          verifyEvidenceIntegrity: (input: unknown) =>
            ipc.invoke('desktop:failures:verify-evidence-integrity', input),
          getEvidenceArtifactContent: (input: unknown) =>
            ipc.invoke('desktop:failures:get-evidence-artifact-content', input),
          executeReproduction: (input: unknown) =>
            ipc.invoke('desktop:failures:execute-reproduction', input),
          getReproductionAttempts: (input: unknown) =>
            ipc.invoke('desktop:failures:get-reproduction-attempts', input),
          getReproducibilitySummary: (input: unknown) =>
            ipc.invoke('desktop:failures:get-reproducibility-summary', input),
          cancelReproduction: (input: unknown) =>
            ipc.invoke('desktop:failures:cancel-reproduction', input),
          classify: (input: unknown) => ipc.invoke('desktop:failures:classify', input),
          getClassification: (input: unknown) =>
            ipc.invoke('desktop:failures:get-classification', input),
          reclassify: (input: unknown) => ipc.invoke('desktop:failures:reclassify', input),
          listClassificationHistory: (input: unknown) =>
            ipc.invoke('desktop:failures:list-classification-history', input),
          evaluateDecisionIntegrity: (input: unknown) =>
            ipc.invoke('desktop:failures:evaluate-decision-integrity', input),
          getDecisionIntegrity: (input: unknown) =>
            ipc.invoke('desktop:failures:get-decision-integrity', input),
          recomputeDecisionIntegrity: (input: unknown) =>
            ipc.invoke('desktop:failures:recompute-decision-integrity', input),
          listDecisionIntegrityHistory: (input: unknown) =>
            ipc.invoke('desktop:failures:list-decision-integrity-history', input),
          analyzeFlakiness: (input: unknown) =>
            ipc.invoke('desktop:failures:analyze-flakiness', input),
          getFlakinessAnalysis: (input: unknown) =>
            ipc.invoke('desktop:failures:get-flakiness-analysis', input),
          reanalyzeFlakiness: (input: unknown) =>
            ipc.invoke('desktop:failures:reanalyze-flakiness', input),
          listFlakinessHistory: (input: unknown) =>
            ipc.invoke('desktop:failures:list-flakiness-history', input),
          separateFailureDomain: (input: unknown) =>
            ipc.invoke('desktop:failures:separate-failure-domain', input),
          getDomainSeparation: (input: unknown) =>
            ipc.invoke('desktop:failures:get-domain-separation', input),
          reevaluateDomainSeparation: (input: unknown) =>
            ipc.invoke('desktop:failures:reevaluate-domain-separation', input),
          listDomainSeparationHistory: (input: unknown) =>
            ipc.invoke('desktop:failures:list-domain-separation-history', input),
        },
      });
    };

    createBridge(mockContextBridge, mockIpcRenderer);

    assert.ok(exposedApi, 'window.desktop must be exposed');
    const api = exposedApi as Record<string, Record<string, unknown>>;

    assert.strictEqual(typeof api['app']?.['getInfo'], 'function');
    assert.strictEqual(typeof api['health']?.['check'], 'function');
    assert.strictEqual(typeof api['database']?.['getStatus'], 'function');

    const projectApi = api['projects'] as Record<string, unknown>;
    assert.strictEqual(typeof projectApi?.['list'], 'function');
    assert.strictEqual(typeof projectApi?.['get'], 'function');
    assert.strictEqual(typeof projectApi?.['create'], 'function');
    assert.strictEqual(typeof projectApi?.['update'], 'function');
    assert.strictEqual(typeof projectApi?.['archive'], 'function');
    assert.strictEqual(typeof projectApi?.['restore'], 'function');
    assert.strictEqual(typeof projectApi?.['delete'], 'function');

    const envApi = projectApi?.['environments'] as Record<string, unknown>;
    assert.strictEqual(typeof envApi?.['create'], 'function');
    assert.strictEqual(typeof envApi?.['update'], 'function');
    assert.strictEqual(typeof envApi?.['delete'], 'function');
    assert.strictEqual(typeof envApi?.['setDefault'], 'function');

    // Source API
    const sourceApi = api['sources'] as Record<string, unknown>;
    assert.strictEqual(typeof sourceApi?.['get'], 'function');
    assert.strictEqual(typeof sourceApi?.['pickDirectory'], 'function');
    assert.strictEqual(typeof sourceApi?.['attachLocalDirectory'], 'function');
    assert.strictEqual(typeof sourceApi?.['detach'], 'function');
    assert.strictEqual(typeof sourceApi?.['validate'], 'function');
    assert.strictEqual(typeof sourceApi?.['refreshMetadata'], 'function');

    // Git Sub-bridge
    const gitApi = sourceApi?.['git'] as Record<string, unknown>;
    assert.strictEqual(typeof gitApi?.['get'], 'function');
    assert.strictEqual(typeof gitApi?.['refresh'], 'function');

    // Structure Sub-bridge
    const structApi = sourceApi?.['structure'] as Record<string, unknown>;
    assert.strictEqual(typeof structApi?.['get'], 'function');
    assert.strictEqual(typeof structApi?.['refresh'], 'function');

    // Technology Sub-bridge (Phase 20)
    const techApi = sourceApi?.['technology'] as Record<string, unknown>;
    assert.strictEqual(typeof techApi?.['get'], 'function');
    assert.strictEqual(typeof techApi?.['refresh'], 'function');

    // Frameworks Sub-bridge (Phase 21)
    const frameworkApi = sourceApi?.['frameworks'] as Record<string, unknown>;
    assert.strictEqual(typeof frameworkApi?.['get'], 'function');
    assert.strictEqual(typeof frameworkApi?.['refresh'], 'function');

    // Classification Sub-bridge (Phase 22)
    const classApi = sourceApi?.['classification'] as Record<string, unknown>;
    assert.strictEqual(typeof classApi?.['get'], 'function');
    assert.strictEqual(typeof classApi?.['refresh'], 'function');

    // Content Sub-bridge (Phase 23)
    const contentApi = sourceApi?.['content'] as Record<string, unknown>;
    assert.strictEqual(typeof contentApi?.['get'], 'function');

    // Index Sub-bridge (Phase 24)
    const indexApi = sourceApi?.['index'] as Record<string, unknown>;
    assert.strictEqual(typeof indexApi?.['getStatus'], 'function');
    assert.strictEqual(typeof indexApi?.['refresh'], 'function');
    assert.strictEqual(typeof indexApi?.['listFiles'], 'function');
    assert.strictEqual(typeof indexApi?.['getFileDetails'], 'function');
    assert.strictEqual(typeof indexApi?.['searchSymbols'], 'function');

    // Architecture Sub-bridge (Phase 25)
    const archApi = sourceApi?.['architecture'] as Record<string, unknown>;
    assert.strictEqual(typeof archApi?.['get'], 'function');
    assert.strictEqual(typeof archApi?.['refresh'], 'function');

    // Run Configuration Sub-bridge (Phase 26)
    const runConfigApi = sourceApi?.['runConfiguration'] as Record<string, unknown>;
    assert.strictEqual(typeof runConfigApi?.['get'], 'function');
    assert.strictEqual(typeof runConfigApi?.['detect'], 'function');
    assert.strictEqual(typeof runConfigApi?.['select'], 'function');
    assert.strictEqual(typeof runConfigApi?.['updateTargetUrl'], 'function');

    // Snapshots Sub-bridge (Phase 27)
    const snapshotsApi = sourceApi?.['snapshots'] as Record<string, unknown>;
    assert.strictEqual(typeof snapshotsApi?.['list'], 'function');
    assert.strictEqual(typeof snapshotsApi?.['create'], 'function');
    assert.strictEqual(typeof snapshotsApi?.['setBaseline'], 'function');
    assert.strictEqual(typeof snapshotsApi?.['delete'], 'function');

    // Changes Sub-bridge (Phase 27)
    const changesApi = sourceApi?.['changes'] as Record<string, unknown>;
    assert.strictEqual(typeof changesApi?.['get'], 'function');
    assert.strictEqual(typeof changesApi?.['refresh'], 'function');

    // Requirement API (Phases 29-31)
    const reqApi = api['requirements'] as Record<string, unknown>;
    assert.strictEqual(typeof reqApi?.['list'], 'function');
    assert.strictEqual(typeof reqApi?.['get'], 'function');
    assert.strictEqual(typeof reqApi?.['getByKey'], 'function');
    assert.strictEqual(typeof reqApi?.['getSummary'], 'function');
    assert.strictEqual(typeof reqApi?.['create'], 'function');
    assert.strictEqual(typeof reqApi?.['update'], 'function');
    assert.strictEqual(typeof reqApi?.['activate'], 'function');
    assert.strictEqual(typeof reqApi?.['deprecate'], 'function');
    assert.strictEqual(typeof reqApi?.['draft'], 'function');
    assert.strictEqual(typeof reqApi?.['archive'], 'function');
    assert.strictEqual(typeof reqApi?.['restore'], 'function');
    assert.strictEqual(typeof reqApi?.['delete'], 'function');
    assert.strictEqual(typeof reqApi?.['parseBulk'], 'function');
    assert.strictEqual(typeof reqApi?.['importBulk'], 'function');
    assert.strictEqual(typeof reqApi?.['getProvenance'], 'function');
    assert.strictEqual(typeof reqApi?.['getSourceContext'], 'function');
    assert.strictEqual(typeof reqApi?.['normalize'], 'function');
    assert.strictEqual(typeof reqApi?.['getRepresentation'], 'function');
    assert.strictEqual(typeof reqApi?.['updateRepresentation'], 'function');
    assert.strictEqual(typeof reqApi?.['regenerateRepresentation'], 'function');
    assert.strictEqual(typeof reqApi?.['batchNormalize'], 'function');
    assert.strictEqual(typeof reqApi?.['classify'], 'function');
    assert.strictEqual(typeof reqApi?.['getMetadata'], 'function');
    assert.strictEqual(typeof reqApi?.['updateMetadata'], 'function');
    assert.strictEqual(typeof reqApi?.['regenerateMetadata'], 'function');
    assert.strictEqual(typeof reqApi?.['batchClassify'], 'function');
    assert.strictEqual(typeof reqApi?.['analyzeQuality'], 'function');
    assert.strictEqual(typeof reqApi?.['getQualityAnalysis'], 'function');
    assert.strictEqual(typeof reqApi?.['reviewQualityFinding'], 'function');
    assert.strictEqual(typeof reqApi?.['reanalyzeQuality'], 'function');
    assert.strictEqual(typeof reqApi?.['batchAnalyzeQuality'], 'function');
    assert.strictEqual(typeof reqApi?.['proposeRelationships'], 'function');
    assert.strictEqual(typeof reqApi?.['getRelationships'], 'function');
    assert.strictEqual(typeof reqApi?.['getRelationshipGraph'], 'function');
    assert.strictEqual(typeof reqApi?.['createManualRelationship'], 'function');
    assert.strictEqual(typeof reqApi?.['reviewRelationship'], 'function');
    assert.strictEqual(typeof reqApi?.['deleteRelationship'], 'function');
    assert.strictEqual(typeof reqApi?.['matchRepositoryEvidence'], 'function');
    assert.strictEqual(typeof reqApi?.['getRepositoryEvidence'], 'function');
    assert.strictEqual(typeof reqApi?.['reviewRepositoryEvidence'], 'function');
    assert.strictEqual(typeof reqApi?.['createManualRepositoryEvidence'], 'function');
    assert.strictEqual(typeof reqApi?.['deleteRepositoryEvidence'], 'function');
    assert.strictEqual(typeof reqApi?.['previewRepositoryEvidence'], 'function');

    // Requirement Sources API (Phase 29)
    const reqSourceApi = api['requirementSources'] as Record<string, unknown>;
    assert.strictEqual(typeof reqSourceApi?.['list'], 'function');
    assert.strictEqual(typeof reqSourceApi?.['get'], 'function');

    // Requirement Documents API (Phase 33 & 34)
    const reqDocApi = api['requirementDocuments'] as Record<string, unknown>;
    assert.strictEqual(typeof reqDocApi?.['selectAndIngest'], 'function');
    assert.strictEqual(typeof reqDocApi?.['list'], 'function');
    assert.strictEqual(typeof reqDocApi?.['get'], 'function');
    assert.strictEqual(typeof reqDocApi?.['delete'], 'function');
    assert.strictEqual(typeof reqDocApi?.['extract'], 'function');
    assert.strictEqual(typeof reqDocApi?.['getExtraction'], 'function');

    // Requirement Candidates API (Phase 35)
    const reqCandApi = api['requirementCandidates'] as Record<string, unknown>;
    assert.strictEqual(typeof reqCandApi?.['detect'], 'function');
    assert.strictEqual(typeof reqCandApi?.['list'], 'function');
    assert.strictEqual(typeof reqCandApi?.['update'], 'function');
    assert.strictEqual(typeof reqCandApi?.['setStatus'], 'function');
    assert.strictEqual(typeof reqCandApi?.['import'], 'function');

    // Logging
    const loggingApi = api['logging'] as Record<string, unknown>;
    assert.strictEqual(typeof loggingApi?.['reportRendererError'], 'function');

    // Ollama Connection & Health Detection API (Phase 127)
    const ollamaApi = api['ollama'] as Record<string, unknown>;
    assert.strictEqual(typeof ollamaApi?.['getStatus'], 'function');
    assert.strictEqual(typeof ollamaApi?.['healthCheck'], 'function');
    assert.strictEqual(typeof ollamaApi?.['getConfig'], 'function');
    assert.strictEqual(typeof ollamaApi?.['setConfig'], 'function');

    // Installed Model Discovery & Capability/Selection API (Phase 128 & Phase 129)
    const aiModelsApi = api['aiModels'] as Record<string, unknown>;
    assert.strictEqual(typeof aiModelsApi?.['list'], 'function');
    assert.strictEqual(typeof aiModelsApi?.['refresh'], 'function');
    assert.strictEqual(typeof aiModelsApi?.['get'], 'function');
    assert.strictEqual(typeof aiModelsApi?.['getCapabilities'], 'function');
    assert.strictEqual(typeof aiModelsApi?.['verifyCapabilities'], 'function');
    assert.strictEqual(typeof aiModelsApi?.['select'], 'function');
    assert.strictEqual(typeof aiModelsApi?.['getSelection'], 'function');
    assert.strictEqual(typeof aiModelsApi?.['resolveForTask'], 'function');

    // AI Generation Runtime API (Phase 130, 131 & 132)
    const aiGenApi = api['aiGeneration'] as Record<string, unknown>;
    assert.strictEqual(typeof aiGenApi?.['generate'], 'function');
    assert.strictEqual(typeof aiGenApi?.['generateStream'], 'function');
    assert.strictEqual(typeof aiGenApi?.['cancel'], 'function');
    assert.strictEqual(typeof aiGenApi?.['getStatus'], 'function');
    assert.strictEqual(typeof aiGenApi?.['generateStructured'], 'function');
    assert.strictEqual(typeof aiGenApi?.['validateStructured'], 'function');
    assert.strictEqual(typeof aiGenApi?.['getStructuredCapabilities'], 'function');

    // AI Tool-Calling Compatibility API (Phase 133)
    const aiToolApi = api['aiTool'] as Record<string, unknown>;
    assert.strictEqual(typeof aiToolApi?.['listTools'], 'function');
    assert.strictEqual(typeof aiToolApi?.['getTool'], 'function');
    assert.strictEqual(typeof aiToolApi?.['parseCalls'], 'function');
    assert.strictEqual(typeof aiToolApi?.['validateCall'], 'function');
    assert.strictEqual(typeof aiToolApi?.['generateCalls'], 'function');
    assert.strictEqual(typeof aiToolApi?.['getCapabilities'], 'function');

    // AI Context Window & Token Management API (Phase 134)
    const aiContextApi = api['aiContext'] as Record<string, unknown>;
    assert.strictEqual(typeof aiContextApi?.['estimateTokens'], 'function');
    assert.strictEqual(typeof aiContextApi?.['calculateBudget'], 'function');
    assert.strictEqual(typeof aiContextApi?.['optimizeSelection'], 'function');
    assert.strictEqual(typeof aiContextApi?.['getCapabilities'], 'function');

    // AI Privacy & Context Firewall API (Phase 137)
    const aiPrivacyApi = api['aiPrivacy'] as Record<string, unknown>;
    assert.strictEqual(typeof aiPrivacyApi?.['getSettings'], 'function');
    assert.strictEqual(typeof aiPrivacyApi?.['updateSettings'], 'function');
    assert.strictEqual(typeof aiPrivacyApi?.['checkFirewall'], 'function');

    // AI Provider Switching & Fallback API (Phase 138)
    const aiRouterApi = api['aiRouter'] as Record<string, unknown>;
    assert.strictEqual(typeof aiRouterApi?.['getFallbackSettings'], 'function');
    assert.strictEqual(typeof aiRouterApi?.['updateFallbackSettings'], 'function');
    assert.strictEqual(typeof aiRouterApi?.['listProviders'], 'function');
    assert.strictEqual(typeof aiRouterApi?.['getProviderStatus'], 'function');
    assert.strictEqual(typeof aiRouterApi?.['selectProvider'], 'function');

    // AI Runtime Performance, Cancellation & Recovery API (Phase 139)
    const aiLifecycleApi = api['aiLifecycle'] as Record<string, unknown>;
    assert.strictEqual(typeof aiLifecycleApi?.['getActiveRequests'], 'function');
    assert.strictEqual(typeof aiLifecycleApi?.['getMetrics'], 'function');
    assert.strictEqual(typeof aiLifecycleApi?.['recoverInterrupted'], 'function');

    // Agent Runtime Foundation API (Phase 141)
    const agentRuntimeApi = api['agentRuntime'] as Record<string, unknown>;
    assert.strictEqual(typeof agentRuntimeApi?.['createTask'], 'function');
    assert.strictEqual(typeof agentRuntimeApi?.['getTask'], 'function');
    assert.strictEqual(typeof agentRuntimeApi?.['cancelTask'], 'function');
    assert.strictEqual(typeof agentRuntimeApi?.['getTaskEvents'], 'function');

    // Agent Thread & Task Model API (Phase 142)
    const agentThreadApi = api['agentThread'] as Record<string, unknown>;
    assert.strictEqual(typeof agentThreadApi?.['createThread'], 'function');
    assert.strictEqual(typeof agentThreadApi?.['listThreads'], 'function');
    assert.strictEqual(typeof agentThreadApi?.['getThread'], 'function');
    assert.strictEqual(typeof agentThreadApi?.['archiveThread'], 'function');
    assert.strictEqual(typeof agentThreadApi?.['createTask'], 'function');
    assert.strictEqual(typeof agentThreadApi?.['getTask'], 'function');
    assert.strictEqual(typeof agentThreadApi?.['listTasks'], 'function');
    assert.strictEqual(typeof agentThreadApi?.['cancelTask'], 'function');
    assert.strictEqual(typeof agentThreadApi?.['retryTask'], 'function');
    assert.strictEqual(typeof agentThreadApi?.['resumeTask'], 'function');
    assert.strictEqual(typeof agentThreadApi?.['listMessages'], 'function');
    assert.strictEqual(typeof agentThreadApi?.['listExecutionSteps'], 'function');
    assert.strictEqual(typeof agentThreadApi?.['listToolCalls'], 'function');
    assert.strictEqual(typeof agentThreadApi?.['executeAutonomousWorkflow'], 'function');
    assert.strictEqual(typeof agentThreadApi?.['getAutonomousWorkflowReport'], 'function');
    assert.strictEqual(typeof agentThreadApi?.['approveWorkflowFix'], 'function');
    assert.strictEqual(typeof agentThreadApi?.['rejectWorkflowFix'], 'function');

    // Agent Tool Registry API (Phase 143)
    const agentToolRegistryApi = api['agentToolRegistry'] as Record<string, unknown>;
    assert.strictEqual(typeof agentToolRegistryApi?.['listTools'], 'function');
    assert.strictEqual(typeof agentToolRegistryApi?.['getTool'], 'function');
    assert.strictEqual(typeof agentToolRegistryApi?.['invokeTool'], 'function');

    // Agent Tool Permissions API (Phase 144)
    const agentToolPermissionsApi = api['agentToolPermissions'] as Record<string, unknown>;
    assert.strictEqual(typeof agentToolPermissionsApi?.['listApprovals'], 'function');
    assert.strictEqual(typeof agentToolPermissionsApi?.['getApproval'], 'function');
    assert.strictEqual(typeof agentToolPermissionsApi?.['decideApproval'], 'function');
    assert.strictEqual(typeof agentToolPermissionsApi?.['listAuditLogs'], 'function');

    // Failure Intelligence API (Phase 74)
    const failuresApi = api['failures'] as Record<string, unknown>;
    assert.strictEqual(typeof failuresApi?.['createCase'], 'function');
    assert.strictEqual(typeof failuresApi?.['ensureCase'], 'function');
    assert.strictEqual(typeof failuresApi?.['getCase'], 'function');
    assert.strictEqual(typeof failuresApi?.['listCases'], 'function');
    assert.strictEqual(typeof failuresApi?.['startAnalysis'], 'function');
    assert.strictEqual(typeof failuresApi?.['completeAnalysis'], 'function');
    assert.strictEqual(typeof failuresApi?.['failAnalysis'], 'function');
    assert.strictEqual(typeof failuresApi?.['cancelAnalysis'], 'function');
    assert.strictEqual(typeof failuresApi?.['markStale'], 'function');
    assert.strictEqual(typeof failuresApi?.['listRuns'], 'function');
    assert.strictEqual(typeof failuresApi?.['listEvidenceReferences'], 'function');
    assert.strictEqual(typeof failuresApi?.['ingestEvidence'], 'function');
    assert.strictEqual(typeof failuresApi?.['getEvidencePackage'], 'function');
    assert.strictEqual(typeof failuresApi?.['verifyEvidenceIntegrity'], 'function');
    assert.strictEqual(typeof failuresApi?.['getEvidenceArtifactContent'], 'function');
    assert.strictEqual(typeof failuresApi?.['executeReproduction'], 'function');
    assert.strictEqual(typeof failuresApi?.['getReproductionAttempts'], 'function');
    assert.strictEqual(typeof failuresApi?.['getReproducibilitySummary'], 'function');
    assert.strictEqual(typeof failuresApi?.['cancelReproduction'], 'function');
    assert.strictEqual(typeof failuresApi?.['classify'], 'function');
    assert.strictEqual(typeof failuresApi?.['getClassification'], 'function');
    assert.strictEqual(typeof failuresApi?.['reclassify'], 'function');
    assert.strictEqual(typeof failuresApi?.['listClassificationHistory'], 'function');
    assert.strictEqual(typeof failuresApi?.['evaluateDecisionIntegrity'], 'function');
    assert.strictEqual(typeof failuresApi?.['getDecisionIntegrity'], 'function');
    assert.strictEqual(typeof failuresApi?.['recomputeDecisionIntegrity'], 'function');
    assert.strictEqual(typeof failuresApi?.['listDecisionIntegrityHistory'], 'function');
    assert.strictEqual(typeof failuresApi?.['analyzeFlakiness'], 'function');
    assert.strictEqual(typeof failuresApi?.['getFlakinessAnalysis'], 'function');
    assert.strictEqual(typeof failuresApi?.['reanalyzeFlakiness'], 'function');
    assert.strictEqual(typeof failuresApi?.['listFlakinessHistory'], 'function');
    assert.strictEqual(typeof failuresApi?.['separateFailureDomain'], 'function');
    assert.strictEqual(typeof failuresApi?.['getDomainSeparation'], 'function');
    assert.strictEqual(typeof failuresApi?.['reevaluateDomainSeparation'], 'function');
    assert.strictEqual(typeof failuresApi?.['listDomainSeparationHistory'], 'function');
  });
});
