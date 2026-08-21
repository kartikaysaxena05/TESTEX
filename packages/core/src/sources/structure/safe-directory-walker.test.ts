import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { SafeDirectoryWalker } from './safe-directory-walker.js';

describe('SafeDirectoryWalker with Filtering Unit Tests', () => {
  let tempDir: string;
  let testRoot: string;
  let outsideDir: string;

  before(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'walker-filtering-test-'));
    testRoot = path.join(tempDir, 'project-root');
    outsideDir = path.join(tempDir, 'outside-folder');

    fs.mkdirSync(testRoot, { recursive: true });
    fs.mkdirSync(outsideDir, { recursive: true });

    // Populate outside folder
    fs.writeFileSync(path.join(outsideDir, 'secret.txt'), 'secret', 'utf-8');

    // Populate project root
    fs.mkdirSync(path.join(testRoot, 'src', 'components'), { recursive: true });
    fs.mkdirSync(path.join(testRoot, 'src', 'utils'), { recursive: true });
    fs.mkdirSync(path.join(testRoot, 'dist', 'bundle'), { recursive: true });
    fs.mkdirSync(path.join(testRoot, 'coverage'), { recursive: true });
    fs.mkdirSync(path.join(testRoot, 'node_modules', 'lodash'), { recursive: true });
    fs.mkdirSync(path.join(testRoot, '.git', 'objects'), { recursive: true });
    fs.mkdirSync(path.join(testRoot, 'packages', 'client', 'src'), { recursive: true });
    fs.mkdirSync(path.join(testRoot, 'packages', 'client', 'dist'), { recursive: true });

    // Root .gitignore
    fs.writeFileSync(
      path.join(testRoot, '.gitignore'),
      `# Root Ignore
dist/
coverage/
*.log
!important.log
`,
      'utf-8',
    );

    // Nested .gitignore in packages/client
    fs.writeFileSync(
      path.join(testRoot, 'packages', 'client', '.gitignore'),
      `# Client Ignore
*.tmp
!client-dist/
`,
      'utf-8',
    );

    // Files
    fs.writeFileSync(path.join(testRoot, 'package.json'), '{}', 'utf-8');
    fs.writeFileSync(path.join(testRoot, '.env.example'), 'PORT=3000', 'utf-8');
    fs.writeFileSync(path.join(testRoot, 'src', 'index.ts'), 'export {};', 'utf-8');
    fs.writeFileSync(
      path.join(testRoot, 'src', 'components', 'Button.tsx'),
      'export const Button = null;',
      'utf-8',
    );
    fs.writeFileSync(path.join(testRoot, 'debug.log'), 'log', 'utf-8');
    fs.writeFileSync(path.join(testRoot, 'important.log'), 'important log', 'utf-8');
    fs.writeFileSync(path.join(testRoot, 'dist', 'app.js'), 'bundle', 'utf-8');
    fs.writeFileSync(path.join(testRoot, 'coverage', 'report.html'), 'report', 'utf-8');
    fs.writeFileSync(
      path.join(testRoot, 'node_modules', 'lodash', 'index.js'),
      'module.exports = {};',
      'utf-8',
    );
    fs.writeFileSync(path.join(testRoot, '.git', 'HEAD'), 'ref: refs/heads/main', 'utf-8');
    fs.writeFileSync(path.join(testRoot, 'packages', 'client', 'package.json'), '{}', 'utf-8');
    fs.writeFileSync(
      path.join(testRoot, 'packages', 'client', 'src', 'client.ts'),
      'export {};',
      'utf-8',
    );
    fs.writeFileSync(path.join(testRoot, 'packages', 'client', 'test.tmp'), 'tmp', 'utf-8');

    // Symlink inside project root pointing outside
    try {
      fs.symlinkSync(outsideDir, path.join(testRoot, 'external-link'), 'dir');
    } catch {
      // Ignore
    }
  });

  after(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore
    }
  });

  it('should discover and filter files according to .gitignore rules and security exclusions', async () => {
    const walker = new SafeDirectoryWalker();
    const result = await walker.walk(testRoot);

    assert.strictEqual(result.truncated, false);
    assert.strictEqual(result.ignoreFilesLoaded, 2);
    assert.ok(result.ignoreRulesLoaded >= 4);

    const relativePaths = result.entries.map(e => e.relativePath);

    // Included files
    assert.ok(relativePaths.includes('package.json'));
    assert.ok(relativePaths.includes('.env.example'));
    assert.ok(relativePaths.includes('src/index.ts'));
    assert.ok(relativePaths.includes('src/components/Button.tsx'));
    assert.ok(relativePaths.includes('important.log'), 'Negated !important.log must be included');
    assert.ok(relativePaths.includes('packages/client/src/client.ts'));

    // Filtered / Ignored files
    assert.strictEqual(relativePaths.includes('debug.log'), false, '*.log must be ignored');
    assert.strictEqual(relativePaths.includes('dist'), false, 'dist/ must be ignored');
    assert.strictEqual(
      relativePaths.includes('dist/app.js'),
      false,
      'dist/ internals must not be included',
    );
    assert.strictEqual(relativePaths.includes('coverage'), false, 'coverage/ must be ignored');
    assert.strictEqual(
      relativePaths.includes('node_modules'),
      false,
      'node_modules must be excluded',
    );
    assert.strictEqual(relativePaths.includes('.git'), false, '.git must be excluded');
    assert.strictEqual(
      relativePaths.includes('packages/client/test.tmp'),
      false,
      'Nested *.tmp must be ignored',
    );

    // Summary checks
    assert.ok(result.ignoredEntries >= 3);
    assert.ok(result.safetyExcludedEntries >= 2);
    assert.ok(result.earlyPrunedDirectories >= 3);
  });

  it('should prevent symlink escape', async () => {
    const walker = new SafeDirectoryWalker();
    const result = await walker.walk(testRoot);

    const relativePaths = result.entries.map(e => e.relativePath);
    assert.strictEqual(relativePaths.includes('external-link/secret.txt'), false);
  });

  it('should measure early directory pruning performance gain', async () => {
    const perfDir = path.join(tempDir, 'perf-test');
    fs.mkdirSync(path.join(perfDir, 'src'), { recursive: true });
    fs.mkdirSync(path.join(perfDir, 'node_modules', 'huge-lib', 'sub'), { recursive: true });
    fs.writeFileSync(path.join(perfDir, 'src', 'app.ts'), 'export {};', 'utf-8');

    // Create 100 dummy files in node_modules
    for (let i = 0; i < 100; i++) {
      fs.writeFileSync(
        path.join(perfDir, 'node_modules', 'huge-lib', 'sub', `file-${i}.js`),
        '1',
        'utf-8',
      );
    }

    const walker = new SafeDirectoryWalker();
    const start = performance.now();
    const result = await walker.walk(perfDir);
    const duration = performance.now() - start;

    assert.strictEqual(result.earlyPrunedDirectories, 1);
    assert.strictEqual(result.includedFiles, 1); // Only src/app.ts included
    assert.strictEqual(result.entries.length, 2); // src dir + app.ts
    assert.ok(duration < 200, `Early pruning should finish quickly (${duration}ms)`);
  });
});
