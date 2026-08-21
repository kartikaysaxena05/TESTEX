import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { SourceContentService } from './source-content-service.js';
import type { SourceRepository } from '../source-repository.js';
import type { ProjectRepository } from '../../projects/project-repository.js';
import type { SourceStructureService } from '../structure/source-structure-service.js';
import type { SourceStructureDto } from '@ai-quality/contracts';

describe('SourceContentService Unit & Security Tests', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'source-content-tests-'));
  const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), 'source-outside-tests-'));

  // Create sample repository files
  fs.mkdirSync(path.join(tempDir, 'src'), { recursive: true });
  fs.mkdirSync(path.join(tempDir, 'tests'), { recursive: true });
  fs.mkdirSync(path.join(tempDir, 'public'), { recursive: true });

  // 1. Regular text file with unicode
  const appContent = 'export const app = "🚀 AI Quality Platform";';
  fs.writeFileSync(path.join(tempDir, 'src', 'app.ts'), appContent, 'utf-8');

  // 2. Text file with UTF-8 BOM
  const bomContent = '\uFEFFexport const withBom = true;';
  fs.writeFileSync(path.join(tempDir, 'src', 'bom.ts'), bomContent, 'utf-8');

  // 3. Test file
  fs.writeFileSync(
    path.join(tempDir, 'tests', 'app.test.ts'),
    'describe("app", () => {});',
    'utf-8',
  );

  // 4. Sensitive files
  fs.writeFileSync(path.join(tempDir, '.env'), 'DATABASE_PASSWORD=SUPER_SECRET_123', 'utf-8');
  fs.writeFileSync(path.join(tempDir, '.env.production'), 'API_KEY=PROD_SECRET_456', 'utf-8');
  fs.writeFileSync(path.join(tempDir, 'id_rsa'), '-----BEGIN RSA PRIVATE KEY-----', 'utf-8');
  fs.writeFileSync(path.join(tempDir, 'server.key'), '-----BEGIN PRIVATE KEY-----', 'utf-8');

  // 5. Binary files
  fs.writeFileSync(path.join(tempDir, 'public', 'logo.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47])); // PNG header
  fs.writeFileSync(
    path.join(tempDir, 'src', 'binary.dat'),
    Buffer.from([0x68, 0x65, 0x00, 0x6c, 0x6f]),
  ); // Contains NUL byte

  // 6. Oversized file (> 1 MB)
  const largeBuffer = Buffer.alloc(1024 * 1024 + 100, 'a');
  fs.writeFileSync(path.join(tempDir, 'src', 'large.txt'), largeBuffer);

  // 7. Outside file for symlink test
  fs.writeFileSync(
    path.join(outsideDir, 'secret-outside.ts'),
    'export const outside = true;',
    'utf-8',
  );
  try {
    fs.symlinkSync(
      path.join(outsideDir, 'secret-outside.ts'),
      path.join(tempDir, 'src', 'symlink-outside.ts'),
    );
  } catch {
    // Windows symlinks may require elevated privileges
  }

  const dummyStructure: SourceStructureDto = {
    sourceId: 'src-123',
    rootName: 'sample-repo',
    entries: [
      { relativePath: 'src/app.ts', name: 'app.ts', kind: 'FILE', depth: 2 },
      { relativePath: 'src/bom.ts', name: 'bom.ts', kind: 'FILE', depth: 2 },
      { relativePath: 'tests/app.test.ts', name: 'app.test.ts', kind: 'FILE', depth: 2 },
      { relativePath: '.env', name: '.env', kind: 'FILE', depth: 1 },
      { relativePath: '.env.production', name: '.env.production', kind: 'FILE', depth: 1 },
      { relativePath: 'id_rsa', name: 'id_rsa', kind: 'FILE', depth: 1 },
      { relativePath: 'server.key', name: 'server.key', kind: 'FILE', depth: 1 },
      { relativePath: 'public/logo.png', name: 'logo.png', kind: 'FILE', depth: 2 },
      { relativePath: 'src/binary.dat', name: 'binary.dat', kind: 'FILE', depth: 2 },
      { relativePath: 'src/large.txt', name: 'large.txt', kind: 'FILE', depth: 2 },
      {
        relativePath: 'src/symlink-outside.ts',
        name: 'symlink-outside.ts',
        kind: 'FILE',
        depth: 2,
      },
      { relativePath: 'src/missing.ts', name: 'missing.ts', kind: 'FILE', depth: 2 },
    ],
    summary: {
      filesDiscovered: 12,
      directoriesDiscovered: 3,
      symlinksDiscovered: 1,
      totalDiscovered: 16,
      includedFiles: 12,
      includedDirectories: 3,
      totalIncluded: 15,
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

  const mockProjectRepo = {
    getProjectById: async (id: string) => ({ id, name: 'Sample Project', status: 'ACTIVE' }),
  } as unknown as ProjectRepository;

  const mockSourceRepo = {
    getSourceByProjectId: async (projectId: string) => ({
      id: 'src-123',
      projectId,
      kind: 'LOCAL_DIRECTORY',
      displayName: 'sample-repo',
      rootPath: tempDir,
      availability: 'AVAILABLE',
    }),
  } as unknown as SourceRepository;

  const mockStructureService = {
    getSourceStructure: async (_projectId: string) => dummyStructure,
  } as unknown as SourceStructureService;

  const service = new SourceContentService(mockSourceRepo, mockProjectRepo, mockStructureService);

  it('should read standard application source file with UTF-8 encoding and metadata', async () => {
    const result = await service.readSourceFile('proj-123', 'src/app.ts');

    assert.strictEqual(result.status, 'AVAILABLE');
    assert.strictEqual(result.content, appContent);
    assert.strictEqual(result.category, 'SOURCE');
    assert.strictEqual(result.language, 'TypeScript');
    assert.strictEqual(result.encoding, 'UTF-8');
    assert.strictEqual(result.sizeBytes, Buffer.byteLength(appContent));
  });

  it('should strip UTF-8 BOM if present in source file', async () => {
    const result = await service.readSourceFile('proj-123', 'src/bom.ts');

    assert.strictEqual(result.status, 'AVAILABLE');
    assert.strictEqual(result.content, 'export const withBom = true;');
  });

  it('should read test files correctly', async () => {
    const result = await service.readSourceFile('proj-123', 'tests/app.test.ts');

    assert.strictEqual(result.status, 'AVAILABLE');
    assert.strictEqual(result.category, 'TEST');
    assert.strictEqual(result.language, 'TypeScript');
  });

  it('should strictly deny reading sensitive secret files (.env, private keys)', async () => {
    // 1. .env
    const envResult = await service.readSourceFile('proj-123', '.env');
    assert.strictEqual(envResult.status, 'SENSITIVE');
    assert.strictEqual(envResult.content, null);

    // 2. .env.production
    const prodEnvResult = await service.readSourceFile('proj-123', '.env.production');
    assert.strictEqual(prodEnvResult.status, 'SENSITIVE');
    assert.strictEqual(prodEnvResult.content, null);

    // 3. id_rsa
    const rsaResult = await service.readSourceFile('proj-123', 'id_rsa');
    assert.strictEqual(rsaResult.status, 'SENSITIVE');
    assert.strictEqual(rsaResult.content, null);

    // 4. server.key
    const keyResult = await service.readSourceFile('proj-123', 'server.key');
    assert.strictEqual(keyResult.status, 'SENSITIVE');
    assert.strictEqual(keyResult.content, null);
  });

  it('should reject path traversal, absolute paths, and NUL byte escapes', async () => {
    // Path traversal
    const travResult = await service.readSourceFile('proj-123', '../../secret.txt');
    assert.strictEqual(travResult.status, 'NOT_AUTHORIZED');
    assert.strictEqual(travResult.content, null);

    // Absolute POSIX path
    const absResult = await service.readSourceFile('proj-123', '/etc/passwd');
    assert.strictEqual(absResult.status, 'NOT_AUTHORIZED');
    assert.strictEqual(absResult.content, null);

    // Windows drive path
    const winResult = await service.readSourceFile(
      'proj-123',
      'C:\\Windows\\System32\\drivers\\etc\\hosts',
    );
    assert.strictEqual(winResult.status, 'NOT_AUTHORIZED');
    assert.strictEqual(winResult.content, null);

    // NUL byte injection
    const nulResult = await service.readSourceFile('proj-123', 'src/app.ts\0.txt');
    assert.strictEqual(nulResult.status, 'NOT_AUTHORIZED');
    assert.strictEqual(nulResult.content, null);
  });

  it('should reject files not included in filtered repository structure', async () => {
    const unlistedResult = await service.readSourceFile('proj-123', 'node_modules/react/index.js');
    assert.strictEqual(unlistedResult.status, 'FILTERED');
    assert.strictEqual(unlistedResult.content, null);
  });

  it('should reject binary files by extension or embedded NUL bytes', async () => {
    // Known binary extension
    const pngResult = await service.readSourceFile('proj-123', 'public/logo.png');
    assert.strictEqual(pngResult.status, 'BINARY');
    assert.strictEqual(pngResult.content, null);

    // Embedded NUL bytes
    const datResult = await service.readSourceFile('proj-123', 'src/binary.dat');
    assert.strictEqual(datResult.status, 'BINARY');
    assert.strictEqual(datResult.content, null);
  });

  it('should reject oversized files exceeding 1 MB without reading full content', async () => {
    const largeResult = await service.readSourceFile('proj-123', 'src/large.txt');
    assert.strictEqual(largeResult.status, 'TOO_LARGE');
    assert.strictEqual(largeResult.content, null);
    assert.ok(largeResult.sizeBytes > 1024 * 1024);
  });

  it('should handle missing files safely', async () => {
    const missingResult = await service.readSourceFile('proj-123', 'src/missing.ts');
    assert.strictEqual(missingResult.status, 'NOT_FOUND');
    assert.strictEqual(missingResult.content, null);
  });

  it('should read bounded batches safely', async () => {
    const batch = await service.readTextFiles('proj-123', ['src/app.ts', 'src/bom.ts']);
    assert.strictEqual(batch.length, 2);
    assert.strictEqual(batch[0]?.status, 'AVAILABLE');
    assert.strictEqual(batch[1]?.status, 'AVAILABLE');
  });
});
