import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { StartupCandidateDetector } from './startup-candidate-detector.js';
import type { FrameworkProfileDto, ApplicationArchitectureProfileDto } from '@ai-quality/contracts';

describe('StartupCandidateDetector Unit Tests', () => {
  const detector = new StartupCandidateDetector();

  it('should detect pnpm dev candidate with HIGH confidence when pnpm is detected', () => {
    const frameworkProfile: FrameworkProfileDto = {
      sourceId: 'src-1',
      primaryEcosystem: 'Node.js',
      packageManager: {
        name: 'pnpm',
        confidence: 'HIGH',
        isAmbiguous: false,
        evidence: ['pnpm-lock.yaml'],
      },
      manifests: [
        {
          relativePath: 'package.json',
          ecosystem: 'npm',
          directDependencyCount: 2,
          devDependencyCount: 0,
          scriptNames: ['dev', 'build', 'start'],
        },
      ],
      frameworks: [],
      dependencies: [],
      directDependencyCount: 2,
      devDependencyCount: 0,
      analyzedAt: new Date().toISOString(),
      warnings: [],
    };

    const candidates = detector.detectCandidates({
      frameworkProfile,
      architectureProfile: null,
    });

    assert.ok(candidates.length >= 1);
    assert.strictEqual(candidates[0]?.executable, 'pnpm');
    assert.deepStrictEqual(candidates[0]?.args, ['dev']);
    assert.strictEqual(candidates[0]?.confidence, 'HIGH');
  });

  it('should return multiple candidates requiring review when package manager is ambiguous', () => {
    const frameworkProfile: FrameworkProfileDto = {
      sourceId: 'src-1',
      primaryEcosystem: 'Node.js',
      packageManager: {
        name: 'npm',
        confidence: 'LOW',
        isAmbiguous: true,
        evidence: ['package.json', 'pnpm-lock.yaml'],
      },
      manifests: [
        {
          relativePath: 'package.json',
          ecosystem: 'npm',
          directDependencyCount: 2,
          devDependencyCount: 0,
          scriptNames: ['dev'],
        },
      ],
      frameworks: [],
      dependencies: [],
      directDependencyCount: 2,
      devDependencyCount: 0,
      analyzedAt: new Date().toISOString(),
      warnings: [],
    };

    const candidates = detector.detectCandidates({
      frameworkProfile,
      architectureProfile: null,
    });

    assert.strictEqual(candidates.length, 2);
    assert.ok(candidates.some(c => c.executable === 'npm' && c.safety === 'REQUIRES_REVIEW'));
    assert.ok(candidates.some(c => c.executable === 'pnpm' && c.safety === 'REQUIRES_REVIEW'));
  });

  it('should detect Django python manage.py runserver command', () => {
    const frameworkProfile: FrameworkProfileDto = {
      sourceId: 'src-1',
      primaryEcosystem: 'Python',
      packageManager: {
        name: 'pip',
        confidence: 'HIGH',
        isAmbiguous: false,
        evidence: ['requirements.txt'],
      },
      manifests: [],
      frameworks: [
        {
          id: 'django',
          name: 'Django',
          category: 'FRAMEWORK',
          confidence: 'HIGH',
          declaredVersion: '^4.2',
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

    const architectureProfile: ApplicationArchitectureProfileDto = {
      sourceId: 'src-1',
      status: 'CURRENT',
      architectureVersion: 1,
      primaryKind: 'WEB_BACKEND',
      confidence: 'HIGH',
      applicationKinds: [],
      applicationUnits: [],
      entryCandidates: [
        {
          relativePath: 'manage.py',
          kind: 'FRAMEWORK_ENTRY',
          confidence: 'HIGH',
          rank: 1,
          evidence: [],
        },
      ],
      primaryEntryCandidate: null,
      structuralAreas: [],
      architectureSignals: [],
      moduleHubs: [],
      analyzedAt: new Date().toISOString(),
      warnings: [],
    };

    const candidates = detector.detectCandidates({
      frameworkProfile,
      architectureProfile,
    });

    assert.ok(candidates.some(c => c.executable === 'python' && c.args[0] === 'manage.py'));
  });
});
