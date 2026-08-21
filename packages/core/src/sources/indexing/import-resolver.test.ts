import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ImportResolver } from './import-resolver.js';

describe('ImportResolver Unit Tests', () => {
  const knownPaths = new Set<string>([
    'src/services/user-service.ts',
    'src/services/user-repository.ts',
    'src/db/connection.ts',
    'src/components/Button/index.tsx',
    'app/models.py',
  ]);

  it('should resolve local relative imports with extension inference', () => {
    // 1. Sibling import without extension
    const res1 = ImportResolver.resolve(
      'src/services/user-service.ts',
      './user-repository',
      knownPaths,
    );
    assert.strictEqual(res1.isExternal, false);
    assert.strictEqual(res1.resolvedRelativePath, 'src/services/user-repository.ts');

    // 2. Parent directory import
    const res2 = ImportResolver.resolve(
      'src/services/user-service.ts',
      '../db/connection',
      knownPaths,
    );
    assert.strictEqual(res2.isExternal, false);
    assert.strictEqual(res2.resolvedRelativePath, 'src/db/connection.ts');

    // 3. Directory index import
    const res3 = ImportResolver.resolve(
      'src/services/user-service.ts',
      '../components/Button',
      knownPaths,
    );
    assert.strictEqual(res3.isExternal, false);
    assert.strictEqual(res3.resolvedRelativePath, 'src/components/Button/index.tsx');

    // 4. Python relative import
    const res4 = ImportResolver.resolve('app/main.py', './models', knownPaths);
    assert.strictEqual(res4.isExternal, false);
    assert.strictEqual(res4.resolvedRelativePath, 'app/models.py');
  });

  it('should classify non-relative imports as external dependencies', () => {
    const res = ImportResolver.resolve('src/services/user-service.ts', 'react', knownPaths);
    assert.strictEqual(res.isExternal, true);
    assert.strictEqual(res.resolvedRelativePath, null);

    const scopedRes = ImportResolver.resolve(
      'src/services/user-service.ts',
      '@prisma/client',
      knownPaths,
    );
    assert.strictEqual(scopedRes.isExternal, true);
    assert.strictEqual(scopedRes.resolvedRelativePath, null);
  });

  it('should handle unresolvable local relative imports honestly', () => {
    const res = ImportResolver.resolve(
      'src/services/user-service.ts',
      './non-existent-module',
      knownPaths,
    );
    assert.strictEqual(res.isExternal, false);
    assert.strictEqual(res.resolvedRelativePath, null);
  });
});
