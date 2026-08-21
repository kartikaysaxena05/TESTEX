import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { StructuralAreaDetector } from './structural-area-detector.js';
import { ArchitectureSignalDetector } from './architecture-signal-detector.js';
import { ApplicationKindDetector } from './application-kind-detector.js';
import type { RepositoryFileDto, FrameworkProfileDto } from '@ai-quality/contracts';

describe('Architecture Structural Detector Unit Tests', () => {
  const areaDetector = new StructuralAreaDetector();
  const signalDetector = new ArchitectureSignalDetector();
  const kindDetector = new ApplicationKindDetector();

  const createFile = (
    relativePath: string,
    classification: string = 'SOURCE',
  ): RepositoryFileDto => ({
    id: `id-${relativePath}`,
    sourceId: 'src-1',
    relativePath,
    name: relativePath.split('/').pop()!,
    extension: '.ts',
    language: 'TypeScript',
    classification,
    sizeBytes: 100,
    contentHash: 'hash',
    indexStatus: 'INDEXED',
    symbolCount: 1,
    importCount: 1,
    indexedAt: new Date().toISOString(),
  });

  it('should detect structural areas and assign functional roles', () => {
    const files = [
      createFile('src/controllers/user.controller.ts'),
      createFile('src/services/user.service.ts'),
      createFile('tests/user.spec.ts', 'TEST'),
      createFile('database/schema.prisma', 'DATABASE'),
    ];

    const areas = areaDetector.detectAreas(files);

    assert.ok(areas.some(a => a.relativePath === 'src/controllers' && a.role === 'APPLICATION'));
    assert.ok(areas.some(a => a.relativePath === 'src/services' && a.role === 'APPLICATION'));
    assert.ok(areas.some(a => a.relativePath === 'tests' && a.role === 'TEST'));
    assert.ok(areas.some(a => a.relativePath === 'database' && a.role === 'DATABASE'));
  });

  it('should detect Layered Architecture signal for controllers + services + repositories', () => {
    const files = [
      createFile('src/controllers/user.controller.ts'),
      createFile('src/services/user.service.ts'),
      createFile('src/repositories/user.repository.ts'),
    ];

    const areas = areaDetector.detectAreas(files);
    const signals = signalDetector.detectSignals(areas, null);

    assert.ok(signals.some(s => s.kind === 'LAYERED_STRUCTURE'));
  });

  it('should detect Monorepo and Frontend/Backend Split signals for apps/web + apps/api', () => {
    const files = [
      createFile('apps/web/src/App.tsx'),
      createFile('apps/api/src/main.ts'),
      createFile('packages/shared/src/index.ts'),
    ];

    const areas = areaDetector.detectAreas(files);
    const signals = signalDetector.detectSignals(areas, null);

    assert.ok(signals.some(s => s.kind === 'MONOREPO_STRUCTURE'));
    assert.ok(signals.some(s => s.kind === 'FRONTEND_BACKEND_SPLIT'));

    const { primaryKind } = kindDetector.detectKinds({
      frameworkProfile: null,
      technologyProfile: null,
      structuralAreas: areas,
      entryCandidates: [],
    });

    assert.strictEqual(primaryKind, 'MULTI_APPLICATION');
  });

  it('should classify WEB_FRONTEND when React framework is present without backend', () => {
    const frameworkProfile: FrameworkProfileDto = {
      sourceId: 'src-1',
      primaryEcosystem: 'Node.js',
      packageManager: null,
      manifests: [],
      frameworks: [
        {
          id: 'react',
          name: 'React',
          category: 'UI_LIBRARY',
          confidence: 'HIGH',
          declaredVersion: '^18.0.0',
          resolvedVersion: null,
          evidence: [],
        },
      ],
      dependencies: [],
      directDependencyCount: 1,
      devDependencyCount: 0,
      analyzedAt: new Date().toISOString(),
      warnings: [],
    };

    const { primaryKind } = kindDetector.detectKinds({
      frameworkProfile,
      technologyProfile: null,
      structuralAreas: [],
      entryCandidates: [],
    });

    assert.strictEqual(primaryKind, 'WEB_FRONTEND');
  });

  it('should classify WEB_BACKEND when NestJS framework is present without frontend', () => {
    const frameworkProfile: FrameworkProfileDto = {
      sourceId: 'src-1',
      primaryEcosystem: 'Node.js',
      packageManager: null,
      manifests: [],
      frameworks: [
        {
          id: 'nestjs',
          name: 'NestJS',
          category: 'FRAMEWORK',
          confidence: 'HIGH',
          declaredVersion: '^10.0.0',
          resolvedVersion: null,
          evidence: [],
        },
      ],
      dependencies: [],
      directDependencyCount: 1,
      devDependencyCount: 0,
      analyzedAt: new Date().toISOString(),
      warnings: [],
    };

    const { primaryKind } = kindDetector.detectKinds({
      frameworkProfile,
      technologyProfile: null,
      structuralAreas: [],
      entryCandidates: [],
    });

    assert.strictEqual(primaryKind, 'WEB_BACKEND');
  });
});
