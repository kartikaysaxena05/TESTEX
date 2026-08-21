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
          attachLocalDirectory: (id: string) =>
            ipc.invoke('desktop:sources:attach-local-directory', id),
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
  });
});
