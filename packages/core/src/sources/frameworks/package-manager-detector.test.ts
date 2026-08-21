import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PackageManagerDetector } from './package-manager-detector.js';
import type { SourceStructureEntryDto } from '@ai-quality/contracts';

describe('PackageManagerDetector Unit Tests', () => {
  const detector = new PackageManagerDetector();

  it('should detect pnpm from pnpm-lock.yaml with HIGH confidence', () => {
    const entries: SourceStructureEntryDto[] = [
      { relativePath: 'package.json', name: 'package.json', kind: 'FILE', depth: 0 },
      { relativePath: 'pnpm-lock.yaml', name: 'pnpm-lock.yaml', kind: 'FILE', depth: 0 },
    ];

    const result = detector.detect(entries);
    assert.ok(result);
    assert.strictEqual(result.name, 'pnpm');
    assert.strictEqual(result.confidence, 'HIGH');
    assert.strictEqual(result.isAmbiguous, false);
  });

  it('should detect packageManager field from package.json with priority', () => {
    const entries: SourceStructureEntryDto[] = [
      { relativePath: 'package.json', name: 'package.json', kind: 'FILE', depth: 0 },
    ];

    const result = detector.detect(entries, 'yarn@4.1.0');
    assert.ok(result);
    assert.strictEqual(result.name, 'yarn');
    assert.strictEqual(result.confidence, 'HIGH');
    assert.strictEqual(result.isAmbiguous, false);
    assert.ok(result.evidence.some(e => e.includes('yarn@4.1.0')));
  });

  it('should flag conflicting lockfiles honestly as Ambiguous', () => {
    const entries: SourceStructureEntryDto[] = [
      { relativePath: 'package.json', name: 'package.json', kind: 'FILE', depth: 0 },
      { relativePath: 'package-lock.json', name: 'package-lock.json', kind: 'FILE', depth: 0 },
      { relativePath: 'pnpm-lock.yaml', name: 'pnpm-lock.yaml', kind: 'FILE', depth: 0 },
    ];

    const result = detector.detect(entries);
    assert.ok(result);
    assert.strictEqual(result.isAmbiguous, true);
    assert.strictEqual(result.confidence, 'LOW');
    assert.ok(result.evidence.includes('package-lock.json'));
    assert.ok(result.evidence.includes('pnpm-lock.yaml'));
  });

  it('should fallback to default package manager for known ecosystems', () => {
    const entries: SourceStructureEntryDto[] = [
      { relativePath: 'Cargo.toml', name: 'Cargo.toml', kind: 'FILE', depth: 0 },
    ];

    const result = detector.detect(entries);
    assert.ok(result);
    assert.strictEqual(result.name, 'Cargo');
    assert.strictEqual(result.confidence, 'HIGH');
  });
});
