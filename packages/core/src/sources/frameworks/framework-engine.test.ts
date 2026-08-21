import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { FrameworkEngine } from './framework-engine.js';
import type { DependencyDto, SourceStructureEntryDto } from '@ai-quality/contracts';

describe('FrameworkEngine Unit Tests', () => {
  const engine = new FrameworkEngine();

  it('should detect React and Next.js from manifest dependency evidence', () => {
    const deps: DependencyDto[] = [
      {
        name: 'next',
        declaredVersion: '^15.1.0',
        scope: 'RUNTIME',
        ecosystem: 'Node.js',
        sourceManifest: 'package.json',
      },
      {
        name: 'react',
        declaredVersion: '^19.0.0',
        scope: 'RUNTIME',
        ecosystem: 'Node.js',
        sourceManifest: 'package.json',
      },
      {
        name: 'react-dom',
        declaredVersion: '^19.0.0',
        scope: 'RUNTIME',
        ecosystem: 'Node.js',
        sourceManifest: 'package.json',
      },
    ];
    const entries: SourceStructureEntryDto[] = [
      { relativePath: 'next.config.ts', name: 'next.config.ts', kind: 'FILE', depth: 0 },
    ];

    const results = engine.detect(deps, entries);
    const nextFw = results.find(f => f.id === 'nextjs');
    const reactFw = results.find(f => f.id === 'react');

    assert.ok(nextFw);
    assert.strictEqual(nextFw.confidence, 'HIGH');
    assert.strictEqual(nextFw.declaredVersion, '^15.1.0');
    assert.strictEqual(nextFw.category, 'FRAMEWORK');

    assert.ok(reactFw);
    assert.strictEqual(reactFw.confidence, 'HIGH');
    assert.strictEqual(reactFw.declaredVersion, '^19.0.0');
    assert.strictEqual(reactFw.category, 'UI_LIBRARY');
  });

  it('should NOT detect React when only .tsx files exist without React dependency', () => {
    const deps: DependencyDto[] = [
      {
        name: 'lodash',
        declaredVersion: '^4.17.21',
        scope: 'RUNTIME',
        ecosystem: 'Node.js',
        sourceManifest: 'package.json',
      },
    ];
    const entries: SourceStructureEntryDto[] = [
      { relativePath: 'src/component.tsx', name: 'component.tsx', kind: 'FILE', depth: 1 },
    ];

    const results = engine.detect(deps, entries);
    const reactFw = results.find(f => f.id === 'react');
    assert.strictEqual(
      reactFw,
      undefined,
      'React must not be detected without dependency evidence',
    );
  });

  it('should accurately distinguish Vue from Nuxt', () => {
    // Vue only
    const vueDeps: DependencyDto[] = [
      {
        name: 'vue',
        declaredVersion: '^3.5.0',
        scope: 'RUNTIME',
        ecosystem: 'Node.js',
        sourceManifest: 'package.json',
      },
    ];
    const vueResults = engine.detect(vueDeps, []);
    assert.ok(vueResults.some(f => f.id === 'vue'));
    assert.strictEqual(
      vueResults.some(f => f.id === 'nuxt'),
      false,
    );

    // Nuxt + Vue
    const nuxtDeps: DependencyDto[] = [
      {
        name: 'nuxt',
        declaredVersion: '^3.12.0',
        scope: 'RUNTIME',
        ecosystem: 'Node.js',
        sourceManifest: 'package.json',
      },
      {
        name: 'vue',
        declaredVersion: '^3.5.0',
        scope: 'RUNTIME',
        ecosystem: 'Node.js',
        sourceManifest: 'package.json',
      },
    ];
    const nuxtResults = engine.detect(nuxtDeps, []);
    assert.ok(nuxtResults.some(f => f.id === 'nuxt'));
    assert.ok(nuxtResults.some(f => f.id === 'vue'));
  });

  it('should detect Python, Java, and Mobile frameworks accurately', () => {
    const deps: DependencyDto[] = [
      {
        name: 'fastapi',
        declaredVersion: '>=0.115.0',
        scope: 'RUNTIME',
        ecosystem: 'Python',
        sourceManifest: 'pyproject.toml',
      },
      {
        name: 'pytest',
        declaredVersion: '^8.0.0',
        scope: 'DEVELOPMENT',
        ecosystem: 'Python',
        sourceManifest: 'requirements-dev.txt',
      },
      {
        name: 'org.springframework.boot:spring-boot-starter-web',
        declaredVersion: '3.4.0',
        scope: 'RUNTIME',
        ecosystem: 'Java/JVM',
        sourceManifest: 'pom.xml',
      },
      {
        name: 'flutter_test',
        declaredVersion: null,
        scope: 'DEVELOPMENT',
        ecosystem: 'Dart/Flutter',
        sourceManifest: 'pubspec.yaml',
      },
    ];
    const entries: SourceStructureEntryDto[] = [
      { relativePath: 'pubspec.yaml', name: 'pubspec.yaml', kind: 'FILE', depth: 0 },
    ];

    const results = engine.detect(deps, entries);
    assert.ok(results.some(f => f.id === 'fastapi' && f.category === 'FRAMEWORK'));
    assert.ok(results.some(f => f.id === 'pytest' && f.category === 'TEST_FRAMEWORK'));
    assert.ok(results.some(f => f.id === 'spring_boot' && f.category === 'FRAMEWORK'));
    assert.ok(results.some(f => f.id === 'flutter' && f.category === 'FRAMEWORK'));
  });

  it('should detect ORM and Test tools (Prisma, Vitest, Playwright)', () => {
    const deps: DependencyDto[] = [
      {
        name: '@prisma/client',
        declaredVersion: '^6.2.0',
        scope: 'RUNTIME',
        ecosystem: 'Node.js',
        sourceManifest: 'package.json',
      },
      {
        name: 'prisma',
        declaredVersion: '^6.2.0',
        scope: 'DEVELOPMENT',
        ecosystem: 'Node.js',
        sourceManifest: 'package.json',
      },
      {
        name: 'vitest',
        declaredVersion: '^3.0.0',
        scope: 'DEVELOPMENT',
        ecosystem: 'Node.js',
        sourceManifest: 'package.json',
      },
      {
        name: '@playwright/test',
        declaredVersion: '^1.50.0',
        scope: 'DEVELOPMENT',
        ecosystem: 'Node.js',
        sourceManifest: 'package.json',
      },
    ];
    const entries: SourceStructureEntryDto[] = [
      { relativePath: 'prisma/schema.prisma', name: 'schema.prisma', kind: 'FILE', depth: 1 },
    ];

    const results = engine.detect(deps, entries);
    assert.ok(results.some(f => f.id === 'prisma' && f.category === 'ORM'));
    assert.ok(results.some(f => f.id === 'vitest' && f.category === 'TEST_FRAMEWORK'));
    assert.ok(results.some(f => f.id === 'playwright' && f.category === 'TEST_FRAMEWORK'));
  });
});
