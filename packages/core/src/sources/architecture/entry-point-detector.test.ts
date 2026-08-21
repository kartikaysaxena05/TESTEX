import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { EntryPointDetector } from './entry-point-detector.js';
import type { RepositoryFileDto, FrameworkProfileDto } from '@ai-quality/contracts';

describe('EntryPointDetector Unit Tests', () => {
  const detector = new EntryPointDetector();

  const createFile = (
    relativePath: string,
    name: string,
    extension: string,
  ): RepositoryFileDto => ({
    id: `id-${relativePath}`,
    sourceId: 'src-1',
    relativePath,
    name,
    extension,
    language: 'TypeScript',
    classification: 'SOURCE',
    sizeBytes: 100,
    contentHash: 'hash',
    indexStatus: 'INDEXED',
    symbolCount: 1,
    importCount: 1,
    indexedAt: new Date().toISOString(),
  });

  it('should detect React + Vite entry candidate with HIGH confidence', () => {
    const files = [
      createFile('src/main.tsx', 'main.tsx', '.tsx'),
      createFile('src/App.tsx', 'App.tsx', '.tsx'),
    ];

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
        {
          id: 'vite',
          name: 'Vite',
          category: 'BUILD_TOOL',
          confidence: 'HIGH',
          declaredVersion: '^5.0.0',
          resolvedVersion: null,
          evidence: [],
        },
      ],
      dependencies: [],
      directDependencyCount: 2,
      devDependencyCount: 0,
      analyzedAt: new Date().toISOString(),
      warnings: [],
    };

    const candidates = detector.detectCandidates({ indexedFiles: files, frameworkProfile });

    assert.ok(candidates.length >= 1);
    assert.strictEqual(candidates[0]?.relativePath, 'src/main.tsx');
    assert.strictEqual(candidates[0]?.kind, 'CLIENT');
    assert.strictEqual(candidates[0]?.confidence, 'HIGH');
  });

  it('should detect Next.js framework entry conventions (layout/page) with HIGH confidence', () => {
    const files = [
      createFile('app/layout.tsx', 'layout.tsx', '.tsx'),
      createFile('app/page.tsx', 'page.tsx', '.tsx'),
    ];

    const frameworkProfile: FrameworkProfileDto = {
      sourceId: 'src-1',
      primaryEcosystem: 'Node.js',
      packageManager: null,
      manifests: [],
      frameworks: [
        {
          id: 'nextjs',
          name: 'Next.js',
          category: 'FRAMEWORK',
          confidence: 'HIGH',
          declaredVersion: '^14.0.0',
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

    const candidates = detector.detectCandidates({ indexedFiles: files, frameworkProfile });

    assert.ok(candidates.length >= 2);
    assert.ok(
      candidates.some(c => c.relativePath === 'app/layout.tsx' && c.kind === 'FRAMEWORK_ENTRY'),
    );
    assert.ok(
      candidates.some(c => c.relativePath === 'app/page.tsx' && c.kind === 'FRAMEWORK_ENTRY'),
    );
  });

  it('should detect NestJS server bootstrap entry point with HIGH confidence', () => {
    const files = [
      createFile('src/main.ts', 'main.ts', '.ts'),
      createFile('src/app.module.ts', 'app.module.ts', '.ts'),
    ];

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

    const candidates = detector.detectCandidates({ indexedFiles: files, frameworkProfile });

    assert.ok(candidates.length >= 1);
    assert.strictEqual(candidates[0]?.relativePath, 'src/main.ts');
    assert.strictEqual(candidates[0]?.kind, 'SERVER');
    assert.strictEqual(candidates[0]?.confidence, 'HIGH');
  });

  it('should distinguish Rust binary application from Rust library crate', () => {
    // 1. Rust Binary
    const binFiles = [createFile('src/main.rs', 'main.rs', '.rs')];
    const binCandidates = detector.detectCandidates({
      indexedFiles: binFiles,
      frameworkProfile: null,
    });
    assert.strictEqual(binCandidates[0]?.relativePath, 'src/main.rs');
    assert.strictEqual(binCandidates[0]?.kind, 'APPLICATION');

    // 2. Rust Library
    const libFiles = [createFile('src/lib.rs', 'lib.rs', '.rs')];
    const libCandidates = detector.detectCandidates({
      indexedFiles: libFiles,
      frameworkProfile: null,
    });
    assert.strictEqual(libCandidates[0]?.relativePath, 'src/lib.rs');
    assert.strictEqual(libCandidates[0]?.kind, 'LIBRARY');
  });

  it('should return empty candidates when repository contains only non-entry files', () => {
    const files = [
      createFile('src/utils/math.ts', 'math.ts', '.ts'),
      createFile('src/utils/string.ts', 'string.ts', '.ts'),
    ];

    const candidates = detector.detectCandidates({ indexedFiles: files, frameworkProfile: null });
    assert.strictEqual(candidates.length, 0);
  });
});
