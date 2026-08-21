import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { RunConfigService } from './run-config-service.js';
import type { RunConfigRepository } from './run-config-repository.js';
import type { SourceRepository } from '../source-repository.js';
import type { ProjectRepository } from '../../projects/project-repository.js';
import type { FrameworkProfileService } from '../frameworks/framework-profile-service.js';
import type { ArchitectureService } from '../architecture/architecture-service.js';
import type { StartupCandidateDetector } from './startup-candidate-detector.js';
import type { RuntimeChecker } from './runtime-checker.js';

describe('RunConfigService Unit Tests', () => {
  const mockProjectRepo = {
    getProjectById: async (id: string) => {
      if (id === 'proj-archived') return { id, name: 'Archived', status: 'ARCHIVED' };
      if (id === 'proj-active') return { id, name: 'Active', status: 'ACTIVE' };
      return null;
    },
  } as unknown as ProjectRepository;

  const mockSourceRepo = {
    getSourceByProjectId: async (projectId: string) => {
      if (projectId === 'proj-active') {
        return {
          id: 'src-1',
          projectId,
          kind: 'LOCAL_DIRECTORY',
          displayName: 'web-app',
          rootPath: '/tmp/repo',
        };
      }
      return null;
    },
  } as unknown as SourceRepository;

  it('should validate and update target URL for valid HTTP/HTTPS URLs', async () => {
    let savedTargetUrl: string | null = null;
    const mockRepo = {
      getSelectedConfiguration: async () => ({
        id: 'cfg-1',
        sourceId: 'src-1',
        applicationUnitRoot: '.',
        runtime: 'Node.js',
        packageManager: 'pnpm',
        startupKind: 'PACKAGE_SCRIPT',
        executable: 'pnpm',
        args: ['dev'],
        workingDirectory: '.',
        targetUrl: savedTargetUrl,
        environmentVariableNames: [],
        confidence: 'HIGH',
        safety: 'SAFE_STRUCTURE',
        source: 'DETECTED',
        status: 'CONFIGURED',
        isSelected: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
      updateTargetUrl: async (_sourceId: string, url: string | null) => {
        savedTargetUrl = url;
        return {
          id: 'cfg-1',
          sourceId: 'src-1',
          applicationUnitRoot: '.',
          runtime: 'Node.js',
          packageManager: 'pnpm',
          startupKind: 'PACKAGE_SCRIPT',
          executable: 'pnpm',
          args: ['dev'],
          workingDirectory: '.',
          targetUrl: savedTargetUrl,
          environmentVariableNames: [],
          confidence: 'HIGH',
          safety: 'SAFE_STRUCTURE',
          source: 'DETECTED',
          status: 'CONFIGURED',
          isSelected: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
      },
    } as unknown as RunConfigRepository;

    const service = new RunConfigService(
      mockRepo,
      mockSourceRepo,
      mockProjectRepo,
      {} as FrameworkProfileService,
      {} as ArchitectureService,
      {} as StartupCandidateDetector,
      {} as RuntimeChecker,
    );

    const updated = await service.updateTargetUrl('proj-active', 'http://localhost:3000');
    assert.ok(updated);
    assert.strictEqual(updated.targetUrl, 'http://localhost:3000');
  });

  it('should reject invalid or forbidden target URL schemes (javascript:, file:, data:)', async () => {
    const service = new RunConfigService(
      {} as RunConfigRepository,
      mockSourceRepo,
      mockProjectRepo,
      {} as FrameworkProfileService,
      {} as ArchitectureService,
      {} as StartupCandidateDetector,
      {} as RuntimeChecker,
    );

    await assert.rejects(
      async () => {
        await service.updateTargetUrl('proj-active', 'javascript:alert(1)');
      },
      {
        name: 'ProjectValidationError',
        message: /Target URL scheme must be http: or https:/,
      },
    );

    await assert.rejects(
      async () => {
        await service.updateTargetUrl('proj-active', 'file:///etc/passwd');
      },
      {
        name: 'ProjectValidationError',
      },
    );
  });
});
