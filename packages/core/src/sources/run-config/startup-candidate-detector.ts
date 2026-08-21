/**
 * @file packages/core/src/sources/run-config/startup-candidate-detector.ts
 * Deterministic discovery and ranking of application startup configuration candidates.
 */

import type {
  StartupCandidateDto,
  FrameworkProfileDto,
  ApplicationArchitectureProfileDto,
  DetectionEvidenceDto,
  ArchitectureConfidence,
  RunConfigSafety,
} from '@ai-quality/contracts';

export interface StartupDetectionContext {
  readonly frameworkProfile: FrameworkProfileDto | null;
  readonly architectureProfile: ApplicationArchitectureProfileDto | null;
}

export class StartupCandidateDetector {
  /**
   * Discovers startup candidates across application units, package managers, and manifests.
   */
  detectCandidates(ctx: StartupDetectionContext): readonly StartupCandidateDto[] {
    const candidates: StartupCandidateDto[] = [];
    const frameworks = new Set(
      (ctx.frameworkProfile?.frameworks ?? []).map(f => f.id.toLowerCase()),
    );

    const pm = ctx.frameworkProfile?.packageManager;
    const isAmbiguousPM = pm?.isAmbiguous ?? false;
    const detectedPM = pm?.name?.toLowerCase() ?? 'npm';

    const manifests = ctx.frameworkProfile?.manifests ?? [];

    // 1. Node.js / Manifest Scripts Discovery
    for (const manifest of manifests) {
      if (manifest.ecosystem === 'npm' || manifest.ecosystem === 'Node.js') {
        const scripts = manifest.scriptNames;
        const startupScriptCandidates = ['dev', 'start:dev', 'serve', 'preview', 'start'];
        const matchedScript = startupScriptCandidates.find(s => scripts.includes(s));

        if (matchedScript) {
          const unitRoot =
            manifest.relativePath === 'package.json'
              ? '.'
              : manifest.relativePath.replace(/\/package\.json$/, '');

          const isHighConfidence = !isAmbiguousPM && pm?.confidence === 'HIGH';
          const confidence: ArchitectureConfidence = isHighConfidence ? 'HIGH' : 'MEDIUM';

          const createCandidate = (
            packageManagerName: string,
            safety: RunConfigSafety = 'SAFE_STRUCTURE',
          ): StartupCandidateDto => {
            const args: string[] = [];
            if (packageManagerName === 'npm') {
              if (matchedScript === 'start') {
                args.push('start');
              } else {
                args.push('run', matchedScript);
              }
            } else {
              args.push(matchedScript);
            }

            const evidence: DetectionEvidenceDto[] = [
              {
                kind: 'MANIFEST',
                source: manifest.relativePath,
                detail: `Discovered startup script: "${matchedScript}"`,
              },
              {
                kind: 'PACKAGE_MANAGER',
                source: 'framework-profile',
                detail: `Package manager: ${packageManagerName}`,
              },
            ];

            return {
              id: `${unitRoot}-${packageManagerName}-${matchedScript}`,
              applicationUnitRoot: unitRoot,
              runtime: 'Node.js',
              packageManager: packageManagerName,
              startupKind: 'PACKAGE_SCRIPT',
              executable: packageManagerName,
              args,
              manifestScript: matchedScript,
              workingDirectory: unitRoot,
              confidence,
              safety,
              evidence,
            };
          };

          if (isAmbiguousPM) {
            candidates.push(createCandidate('npm', 'REQUIRES_REVIEW'));
            candidates.push(createCandidate('pnpm', 'REQUIRES_REVIEW'));
          } else {
            candidates.push(createCandidate(detectedPM, 'SAFE_STRUCTURE'));
          }
        }
      }
    }

    // 2. Python Ecosystem (Django / FastAPI / Flask)
    if (frameworks.has('django')) {
      const entry = ctx.architectureProfile?.entryCandidates.find(
        e => e.relativePath === 'manage.py' || e.relativePath.endsWith('/manage.py'),
      );
      const unitRoot =
        entry && entry.relativePath.includes('/')
          ? entry.relativePath.substring(0, entry.relativePath.lastIndexOf('/'))
          : '.';

      candidates.push({
        id: `django-manage-runserver-${unitRoot}`,
        applicationUnitRoot: unitRoot,
        runtime: 'Python',
        packageManager: 'pip',
        startupKind: 'FRAMEWORK_COMMAND',
        executable: 'python',
        args: ['manage.py', 'runserver'],
        manifestScript: null,
        workingDirectory: unitRoot,
        confidence: 'HIGH',
        safety: 'SAFE_STRUCTURE',
        evidence: [
          { kind: 'FRAMEWORK', source: 'Django', detail: 'Django framework verified' },
          {
            kind: 'ENTRY_POINT',
            source: entry?.relativePath ?? 'manage.py',
            detail: 'manage.py present',
          },
        ],
      });
    }

    // 3. Rust Binary (Cargo run)
    const hasRustBinary = ctx.architectureProfile?.entryCandidates.some(
      e => e.relativePath === 'src/main.rs',
    );
    const isLibraryOnly = ctx.architectureProfile?.primaryKind === 'LIBRARY';

    if (hasRustBinary && !isLibraryOnly) {
      candidates.push({
        id: 'cargo-run-app',
        applicationUnitRoot: '.',
        runtime: 'Rust',
        packageManager: 'cargo',
        startupKind: 'RUNTIME_ENTRY',
        executable: 'cargo',
        args: ['run'],
        manifestScript: null,
        workingDirectory: '.',
        confidence: 'HIGH',
        safety: 'SAFE_STRUCTURE',
        evidence: [
          {
            kind: 'ENTRY_POINT',
            source: 'src/main.rs',
            detail: 'Rust application main binary crate root',
          },
        ],
      });
    }

    // 4. Go Application (go run .)
    const hasGoMain = ctx.architectureProfile?.entryCandidates.some(
      e => e.relativePath === 'main.go',
    );
    if (hasGoMain) {
      candidates.push({
        id: 'go-run-app',
        applicationUnitRoot: '.',
        runtime: 'Go',
        packageManager: 'go',
        startupKind: 'RUNTIME_ENTRY',
        executable: 'go',
        args: ['run', '.'],
        manifestScript: null,
        workingDirectory: '.',
        confidence: 'HIGH',
        safety: 'SAFE_STRUCTURE',
        evidence: [
          { kind: 'ENTRY_POINT', source: 'main.go', detail: 'Go main package entry point' },
        ],
      });
    }

    return candidates;
  }
}
