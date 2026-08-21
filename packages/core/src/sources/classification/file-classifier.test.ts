import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { FileClassifier } from './file-classifier.js';

describe('FileClassifier Unit & False-Positive Tests', () => {
  const classifier = new FileClassifier();

  it('should classify test files and fixtures across ecosystems correctly', () => {
    // Node / TS
    assert.strictEqual(classifier.classify('src/app.test.ts').category, 'TEST');
    assert.strictEqual(classifier.classify('src/components/button.spec.tsx').category, 'TEST');
    assert.strictEqual(classifier.classify('tests/fixtures/users.json').category, 'TEST');
    assert.strictEqual(classifier.classify('__snapshots__/button.snap').category, 'TEST');

    // Python
    assert.strictEqual(classifier.classify('tests/test_user.py').category, 'TEST');
    assert.strictEqual(classifier.classify('conftest.py').category, 'TEST');

    // Java
    assert.strictEqual(
      classifier.classify('src/test/java/com/example/UserTest.java').category,
      'TEST',
    );

    // Go
    assert.strictEqual(classifier.classify('pkg/auth/auth_test.go').category, 'TEST');

    // Rust
    assert.strictEqual(classifier.classify('tests/integration_test.rs').category, 'TEST');

    // .NET
    assert.strictEqual(classifier.classify('Services.Tests/UserTests.cs').category, 'TEST');
  });

  it('should prevent false positives on test, generated, and doc names', () => {
    // "contest.ts" must NOT be TEST
    const contestRes = classifier.classify('src/contest.ts');
    assert.strictEqual(contestRes.category, 'SOURCE');

    // "src/contest/app.ts" must NOT be TEST
    const contestDirRes = classifier.classify('src/contest/app.ts');
    assert.strictEqual(contestDirRes.category, 'SOURCE');

    // "generator.ts" must NOT be GENERATED
    const genRes = classifier.classify('src/generator.ts');
    assert.strictEqual(genRes.category, 'SOURCE');

    // "document-service.ts" must NOT be DOCUMENTATION
    const docRes = classifier.classify('src/document-service.ts');
    assert.strictEqual(docRes.category, 'SOURCE');

    // "image-service.ts" must NOT be ASSET
    const imgRes = classifier.classify('src/image-service.ts');
    assert.strictEqual(imgRes.category, 'SOURCE');

    // "migration-service.ts" must NOT be MIGRATION
    const migRes = classifier.classify('src/migration-service.ts');
    assert.strictEqual(migRes.category, 'SOURCE');
  });

  it('should respect priority order when multiple rules could match', () => {
    // Test fixture takes precedence over config format
    assert.strictEqual(classifier.classify('tests/fixtures/config.json').category, 'TEST');

    // Database migration path takes precedence over generic SQL
    assert.strictEqual(
      classifier.classify('prisma/migrations/001/migration.sql').category,
      'MIGRATION',
    );

    // Generic schema SQL outside migrations is DATABASE
    assert.strictEqual(classifier.classify('database/schema.sql').category, 'DATABASE');

    // Documentation inside src remains DOCUMENTATION
    assert.strictEqual(classifier.classify('src/README.md').category, 'DOCUMENTATION');

    // Shell script under scripts/ is SCRIPT
    assert.strictEqual(classifier.classify('scripts/deploy.sh').category, 'SCRIPT');
  });

  it('should classify build tooling, configuration, assets, and templates', () => {
    // Build & CI
    assert.strictEqual(classifier.classify('Dockerfile').category, 'BUILD_TOOLING');
    assert.strictEqual(classifier.classify('docker-compose.yml').category, 'BUILD_TOOLING');
    assert.strictEqual(classifier.classify('.github/workflows/ci.yml').category, 'BUILD_TOOLING');
    assert.strictEqual(classifier.classify('vite.config.ts').category, 'BUILD_TOOLING');

    // Config
    assert.strictEqual(classifier.classify('package.json').category, 'CONFIGURATION');
    assert.strictEqual(classifier.classify('tsconfig.json').category, 'CONFIGURATION');
    assert.strictEqual(classifier.classify('pnpm-lock.yaml').category, 'CONFIGURATION');
    assert.strictEqual(classifier.classify('.env.example').category, 'CONFIGURATION');

    // Assets
    assert.strictEqual(classifier.classify('public/logo.png').category, 'ASSET');
    assert.strictEqual(classifier.classify('assets/font.woff2').category, 'ASSET');

    // Template
    assert.strictEqual(classifier.classify('templates/email.hbs').category, 'TEMPLATE');

    // Unknown fallback
    const unk = classifier.classify('files/data.xyzabc');
    assert.strictEqual(unk.category, 'UNKNOWN');
    assert.strictEqual(unk.confidence, 'LOW');
  });
});
