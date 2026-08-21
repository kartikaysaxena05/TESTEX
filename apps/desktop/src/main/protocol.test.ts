import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { resolveRendererFilePath } from './protocol.js';

describe('Custom Protocol Path Resolution and Security Tests', () => {
  let tempDir: string;

  before(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'renderer-test-'));
    writeFileSync(join(tempDir, 'index.html'), '<html><body>Mock</body></html>');
    writeFileSync(join(tempDir, 'app.js'), 'console.log("mock");');
  });

  after(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('should resolve legitimate app://renderer/index.html', () => {
    const resolved = resolveRendererFilePath('app://renderer/index.html', tempDir);
    assert.strictEqual(resolved, join(tempDir, 'index.html'));
  });

  it('should resolve root app://renderer/ to index.html', () => {
    const resolved = resolveRendererFilePath('app://renderer/', tempDir);
    assert.strictEqual(resolved, join(tempDir, 'index.html'));
  });

  it('should resolve sub-assets in renderer directory', () => {
    const resolved = resolveRendererFilePath('app://renderer/app.js', tempDir);
    assert.strictEqual(resolved, join(tempDir, 'app.js'));
  });

  it('should block path traversal attempts with ../', () => {
    const resolved = resolveRendererFilePath('app://renderer/../../package.json', tempDir);
    assert.strictEqual(resolved, null, 'Path traversal with ../ must be blocked');
  });

  it('should block URL-encoded path traversal attempts (%2e%2e)', () => {
    const resolved = resolveRendererFilePath(
      'app://renderer/%2e%2e%2f%2e%2e%2fpackage.json',
      tempDir,
    );
    assert.strictEqual(resolved, null, 'Encoded path traversal must be blocked');
  });

  it('should block null byte injection attempts', () => {
    const resolved = resolveRendererFilePath('app://renderer/index.html%00.png', tempDir);
    assert.strictEqual(resolved, null, 'Null byte injection must be blocked');
  });

  it('should reject requests with an invalid host', () => {
    const resolved = resolveRendererFilePath('app://unauthorized-host/index.html', tempDir);
    assert.strictEqual(resolved, null, 'Invalid host must be rejected');
  });

  it('should reject non-app schemes', () => {
    const resolved = resolveRendererFilePath('http://renderer/index.html', tempDir);
    assert.strictEqual(resolved, null, 'Non-app schemes must be rejected');
  });

  it('should return null for non-existent files', () => {
    const resolved = resolveRendererFilePath('app://renderer/missing-file.js', tempDir);
    assert.strictEqual(resolved, null, 'Non-existent files must return null');
  });
});
