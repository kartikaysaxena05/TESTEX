import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ChangeDetector } from './change-detector.js';
import type { RepositoryFileDto } from '@ai-quality/contracts';
import type { RepositorySnapshotFile } from '@prisma/client';

describe('ChangeDetector Unit Tests', () => {
  const createBaseFile = (
    relativePath: string,
    contentHash: string,
    classification = 'SOURCE',
  ): RepositorySnapshotFile => ({
    id: `base-${relativePath}`,
    snapshotId: 'snap-1',
    relativePath,
    contentHash,
    language: 'TypeScript',
    classification,
    sizeBytes: 100,
    createdAt: new Date(),
  });

  const createCurFile = (
    relativePath: string,
    contentHash: string,
    classification = 'SOURCE',
  ): RepositoryFileDto => ({
    id: `cur-${relativePath}`,
    sourceId: 'src-1',
    relativePath,
    name: relativePath.split('/').pop()!,
    extension: '.ts',
    language: 'TypeScript',
    classification,
    sizeBytes: 100,
    contentHash,
    indexStatus: 'INDEXED',
    symbolCount: 1,
    importCount: 1,
    indexedAt: new Date().toISOString(),
  });

  it('should detect UNCHANGED, MODIFIED, ADDED, and DELETED file changes accurately', () => {
    const baseline = [
      createBaseFile('src/unchanged.ts', 'hash-100'),
      createBaseFile('src/modified.ts', 'hash-old'),
      createBaseFile('src/deleted.ts', 'hash-del'),
    ];

    const current = [
      createCurFile('src/unchanged.ts', 'hash-100'),
      createCurFile('src/modified.ts', 'hash-new'),
      createCurFile('src/added.ts', 'hash-add', 'TEST'),
    ];

    const res = ChangeDetector.compare({
      baselineFiles: baseline,
      currentFiles: current,
    });

    assert.strictEqual(res.unchangedCount, 1);
    assert.strictEqual(res.totalChanges, 3);
    assert.strictEqual(res.modifiedCount, 1);
    assert.strictEqual(res.addedCount, 1);
    assert.strictEqual(res.deletedCount, 1);
    assert.strictEqual(res.renamedCount, 0);

    assert.strictEqual(res.changesByClassification['TEST'], 1);
  });

  it('should detect 1-to-1 exact content hash rename candidate as RENAMED', () => {
    const baseline = [createBaseFile('src/old-name.ts', 'exact-identical-hash')];
    const current = [createCurFile('src/new-name.ts', 'exact-identical-hash')];

    const res = ChangeDetector.compare({
      baselineFiles: baseline,
      currentFiles: current,
    });

    assert.strictEqual(res.totalChanges, 1);
    assert.strictEqual(res.renamedCount, 1);
    assert.strictEqual(res.addedCount, 0);
    assert.strictEqual(res.deletedCount, 0);
    assert.strictEqual(res.changes[0]?.changeType, 'RENAMED');
    assert.strictEqual(res.changes[0]?.previousPath, 'src/old-name.ts');
    assert.strictEqual(res.changes[0]?.currentPath, 'src/new-name.ts');
  });

  it('should fallback to DELETED + ADDED when multiple files share the same content hash (ambiguity)', () => {
    const baseline = [
      createBaseFile('src/a.ts', 'duplicate-hash'),
      createBaseFile('src/b.ts', 'duplicate-hash'),
    ];
    const current = [createCurFile('src/c.ts', 'duplicate-hash')];

    const res = ChangeDetector.compare({
      baselineFiles: baseline,
      currentFiles: current,
    });

    assert.strictEqual(
      res.renamedCount,
      0,
      'Must not arbitrarily guess rename mapping when ambiguous',
    );
    assert.strictEqual(res.deletedCount, 2);
    assert.strictEqual(res.addedCount, 1);
  });

  it('should attach direct importer relationships to changed files', () => {
    const baseline = [createBaseFile('src/utils.ts', 'hash-1')];
    const current = [createCurFile('src/utils.ts', 'hash-2')];

    const importsMap = new Map<string, string[]>();
    importsMap.set('src/utils.ts', ['src/app.ts', 'src/api.ts']);

    const res = ChangeDetector.compare({
      baselineFiles: baseline,
      currentFiles: current,
      importsByPath: importsMap,
    });

    assert.strictEqual(res.changes[0]?.changeType, 'MODIFIED');
    assert.deepStrictEqual(res.changes[0]?.directImporters, ['src/app.ts', 'src/api.ts']);
  });
});
