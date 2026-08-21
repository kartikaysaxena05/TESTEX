import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { FrameworkProfileService } from './framework-profile-service.js';
import type { SourceRepository } from '../source-repository.js';
import type { ProjectRepository } from '../../projects/project-repository.js';
import type { SourceStructureService } from '../structure/source-structure-service.js';
import type { SourceStructureDto } from '@ai-quality/contracts';

describe('FrameworkProfileService Unit Tests', () => {
  it('should analyze a full monorepo with multiple manifests accurately', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fw-monorepo-'));
    const rootPjson = path.join(tempDir, 'package.json');
    const webDir = path.join(tempDir, 'apps', 'web');
    const apiDir = path.join(tempDir, 'apps', 'api');

    fs.mkdirSync(webDir, { recursive: true });
    fs.mkdirSync(apiDir, { recursive: true });

    fs.writeFileSync(
      rootPjson,
      JSON.stringify({ name: 'monorepo-root', packageManager: 'pnpm@9.0.0' }),
      'utf-8',
    );
    fs.writeFileSync(
      path.join(webDir, 'package.json'),
      JSON.stringify({
        name: 'web-app',
        dependencies: { next: '^15.0.0', react: '^19.0.0', 'react-dom': '^19.0.0' },
        devDependencies: { tailwindcss: '^4.0.0' },
      }),
      'utf-8',
    );
    fs.writeFileSync(
      path.join(apiDir, 'package.json'),
      JSON.stringify({
        name: 'api-service',
        dependencies: { '@nestjs/core': '^10.0.0', '@prisma/client': '^6.0.0' },
      }),
      'utf-8',
    );

    const mockSourceRepo = {
      getSourceByProjectId: async (_id: string) => ({
        id: 'src-mono',
        projectId: 'proj-mono',
        rootPath: tempDir,
        displayName: 'monorepo',
      }),
    } as unknown as SourceRepository;

    const mockProjectRepo = {
      getProjectById: async (_id: string) => ({ id: 'proj-mono', status: 'ACTIVE' }),
    } as unknown as ProjectRepository;

    const mockStructureDto: SourceStructureDto = {
      sourceId: 'src-mono',
      rootName: 'monorepo',
      entries: [
        { relativePath: 'package.json', name: 'package.json', kind: 'FILE', depth: 0 },
        { relativePath: 'apps/web/package.json', name: 'package.json', kind: 'FILE', depth: 2 },
        { relativePath: 'apps/api/package.json', name: 'package.json', kind: 'FILE', depth: 2 },
      ],
      summary: {
        filesDiscovered: 3,
        directoriesDiscovered: 2,
        symlinksDiscovered: 0,
        totalDiscovered: 5,
        includedFiles: 3,
        includedDirectories: 2,
        totalIncluded: 5,
        ignoredEntries: 0,
        safetyExcludedEntries: 0,
        earlyPrunedDirectories: 0,
        ignoreFilesLoaded: 0,
        ignoreRulesLoaded: 0,
        warnings: [],
      },
      truncated: false,
      truncationReason: null,
      scannedAt: new Date().toISOString(),
    };

    const mockStructureService = {
      getSourceStructure: async (_id: string) => mockStructureDto,
    } as unknown as SourceStructureService;

    const service = new FrameworkProfileService(
      mockSourceRepo,
      mockProjectRepo,
      mockStructureService,
    );

    const profile = await service.refreshFrameworkProfile('proj-mono');

    assert.strictEqual(profile.primaryEcosystem, 'Node.js');
    assert.strictEqual(profile.packageManager?.name, 'pnpm');
    assert.strictEqual(profile.manifests.length, 3);

    // Verify all major frameworks in monorepo are detected
    assert.ok(profile.frameworks.some(f => f.id === 'nextjs' && f.category === 'FRAMEWORK'));
    assert.ok(profile.frameworks.some(f => f.id === 'react' && f.category === 'UI_LIBRARY'));
    assert.ok(profile.frameworks.some(f => f.id === 'nestjs' && f.category === 'FRAMEWORK'));
    assert.ok(profile.frameworks.some(f => f.id === 'prisma' && f.category === 'ORM'));
    assert.ok(profile.frameworks.some(f => f.id === 'tailwind' && f.category === 'UI_LIBRARY'));

    // Check caching
    const cached = await service.getFrameworkProfile('proj-mono');
    assert.strictEqual(cached, profile);

    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('should return null when getFrameworkProfile is called on project with no attached source', async () => {
    const mockSourceRepo = {
      getSourceByProjectId: async (_id: string) => null,
    } as unknown as SourceRepository;
    const mockProjectRepo = {
      getProjectById: async (_id: string) => ({ id: 'proj-no-source', status: 'ACTIVE' }),
    } as unknown as ProjectRepository;

    const service = new FrameworkProfileService(mockSourceRepo, mockProjectRepo);
    const result = await service.getFrameworkProfile('proj-no-source');
    assert.strictEqual(result, null);
  });
});
