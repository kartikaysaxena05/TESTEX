/**
 * @file packages/core/src/sources/architecture/entry-point-detector.ts
 * Deterministic discovery and ranking of application entry-point candidates.
 */

import type {
  EntryPointCandidateDto,
  EntryPointKind,
  ArchitectureConfidence,
  DetectionEvidenceDto,
  FrameworkProfileDto,
  RepositoryFileDto,
} from '@ai-quality/contracts';
import { MAX_ENTRY_CANDIDATES, MAX_EVIDENCE_PER_CANDIDATE } from './architecture-types.js';

export interface EntryDetectionContext {
  readonly indexedFiles: readonly RepositoryFileDto[];
  readonly frameworkProfile: FrameworkProfileDto | null;
  readonly importsByFilePath?: Map<string, readonly string[]>;
}

export class EntryPointDetector {
  /**
   * Detects and ranks entry point candidates deterministically from indexed repository files and framework evidence.
   */
  detectCandidates(ctx: EntryDetectionContext): readonly EntryPointCandidateDto[] {
    const candidates: EntryPointCandidateDto[] = [];
    const filesByPath = new Map<string, RepositoryFileDto>();

    for (const file of ctx.indexedFiles) {
      filesByPath.set(file.relativePath, file);
    }

    const frameworks = new Set(
      (ctx.frameworkProfile?.frameworks ?? []).map(f => f.id.toLowerCase()),
    );

    // 1. Next.js Conventions (Framework Entry)
    if (frameworks.has('nextjs') || frameworks.has('next')) {
      const nextPatterns = [
        {
          path: 'app/layout.tsx',
          kind: 'FRAMEWORK_ENTRY' as EntryPointKind,
          role: 'Root App Layout',
        },
        {
          path: 'src/app/layout.tsx',
          kind: 'FRAMEWORK_ENTRY' as EntryPointKind,
          role: 'Root App Layout',
        },
        { path: 'app/page.tsx', kind: 'FRAMEWORK_ENTRY' as EntryPointKind, role: 'Root App Page' },
        {
          path: 'src/app/page.tsx',
          kind: 'FRAMEWORK_ENTRY' as EntryPointKind,
          role: 'Root App Page',
        },
        {
          path: 'pages/_app.tsx',
          kind: 'FRAMEWORK_ENTRY' as EntryPointKind,
          role: 'Custom App Root',
        },
        {
          path: 'src/pages/_app.tsx',
          kind: 'FRAMEWORK_ENTRY' as EntryPointKind,
          role: 'Custom App Root',
        },
        { path: 'pages/index.tsx', kind: 'FRAMEWORK_ENTRY' as EntryPointKind, role: 'Home Page' },
        {
          path: 'src/pages/index.tsx',
          kind: 'FRAMEWORK_ENTRY' as EntryPointKind,
          role: 'Home Page',
        },
      ];

      for (const pattern of nextPatterns) {
        if (filesByPath.has(pattern.path)) {
          candidates.push({
            relativePath: pattern.path,
            kind: pattern.kind,
            confidence: 'HIGH',
            rank: 1,
            evidence: [
              {
                kind: 'FRAMEWORK',
                source: 'framework-profile',
                detail: 'Next.js framework detected',
              },
              {
                kind: 'FILE_PATH',
                source: pattern.path,
                detail: `Recognized Next.js ${pattern.role}`,
              },
            ],
          });
        }
      }
    }

    // 2. React + Vite / Client Frontend (React, Vite, Vue, Angular)
    if (
      frameworks.has('react') ||
      frameworks.has('vite') ||
      frameworks.has('vue') ||
      frameworks.has('angular')
    ) {
      const clientPatterns = [
        'src/main.tsx',
        'src/main.jsx',
        'src/index.tsx',
        'src/index.jsx',
        'src/main.ts',
        'src/main.js',
      ];

      for (const p of clientPatterns) {
        if (filesByPath.has(p)) {
          const evidence: DetectionEvidenceDto[] = [];
          if (frameworks.has('react'))
            evidence.push({
              kind: 'FRAMEWORK',
              source: 'framework-profile',
              detail: 'React framework detected',
            });
          if (frameworks.has('vite'))
            evidence.push({
              kind: 'FRAMEWORK',
              source: 'framework-profile',
              detail: 'Vite build tool detected',
            });
          if (frameworks.has('vue'))
            evidence.push({
              kind: 'FRAMEWORK',
              source: 'framework-profile',
              detail: 'Vue framework detected',
            });
          if (frameworks.has('angular'))
            evidence.push({
              kind: 'FRAMEWORK',
              source: 'framework-profile',
              detail: 'Angular framework detected',
            });

          evidence.push({
            kind: 'FILE_PATH',
            source: p,
            detail: 'Standard client application bootstrap entry',
          });

          candidates.push({
            relativePath: p,
            kind: 'CLIENT',
            confidence: 'HIGH',
            rank: 1,
            evidence,
          });
        }
      }
    }

    // 3. NestJS Server Entry
    if (frameworks.has('nestjs') || frameworks.has('@nestjs/core')) {
      const nestPatterns = ['src/main.ts', 'main.ts'];
      for (const p of nestPatterns) {
        if (filesByPath.has(p)) {
          candidates.push({
            relativePath: p,
            kind: 'SERVER',
            confidence: 'HIGH',
            rank: 1,
            evidence: [
              {
                kind: 'FRAMEWORK',
                source: 'framework-profile',
                detail: 'NestJS framework detected',
              },
              { kind: 'FILE_PATH', source: p, detail: 'NestJS server bootstrap entry point' },
            ],
          });
        }
      }
    }

    // 4. Express Server Entry
    if (frameworks.has('express')) {
      const expressPatterns = [
        { path: 'src/server.ts', conf: 'HIGH' as ArchitectureConfidence },
        { path: 'src/app.ts', conf: 'HIGH' as ArchitectureConfidence },
        { path: 'server.ts', conf: 'HIGH' as ArchitectureConfidence },
        { path: 'server.js', conf: 'HIGH' as ArchitectureConfidence },
        { path: 'app.js', conf: 'HIGH' as ArchitectureConfidence },
        { path: 'src/index.ts', conf: 'MEDIUM' as ArchitectureConfidence },
        { path: 'index.js', conf: 'MEDIUM' as ArchitectureConfidence },
      ];

      for (const p of expressPatterns) {
        if (filesByPath.has(p.path)) {
          candidates.push({
            relativePath: p.path,
            kind: 'SERVER',
            confidence: p.conf,
            rank: p.conf === 'HIGH' ? 1 : 2,
            evidence: [
              {
                kind: 'FRAMEWORK',
                source: 'framework-profile',
                detail: 'Express framework detected',
              },
              {
                kind: 'FILE_PATH',
                source: p.path,
                detail: 'Express HTTP server entry point candidate',
              },
            ],
          });
        }
      }
    }

    // 5. Python (FastAPI, Django, Flask, generic)
    const pythonFiles = [
      'main.py',
      'app.py',
      'src/main.py',
      'src/app.py',
      'manage.py',
      'wsgi.py',
      'asgi.py',
    ];
    for (const p of pythonFiles) {
      if (filesByPath.has(p)) {
        const evidence: DetectionEvidenceDto[] = [
          { kind: 'FILE_PATH', source: p, detail: 'Python executable candidate' },
        ];

        let kind: EntryPointKind = 'APPLICATION';
        let confidence: ArchitectureConfidence = 'MEDIUM';

        if (p === 'manage.py' || p === 'wsgi.py' || p === 'asgi.py') {
          kind = 'FRAMEWORK_ENTRY';
          if (frameworks.has('django')) {
            confidence = 'HIGH';
            evidence.push({
              kind: 'FRAMEWORK',
              source: 'framework-profile',
              detail: 'Django framework detected',
            });
          }
        } else if (frameworks.has('fastapi')) {
          kind = 'SERVER';
          confidence = 'HIGH';
          evidence.push({
            kind: 'FRAMEWORK',
            source: 'framework-profile',
            detail: 'FastAPI framework detected',
          });
        } else if (frameworks.has('flask')) {
          kind = 'SERVER';
          confidence = 'HIGH';
          evidence.push({
            kind: 'FRAMEWORK',
            source: 'framework-profile',
            detail: 'Flask framework detected',
          });
        }

        candidates.push({
          relativePath: p,
          kind,
          confidence,
          rank: confidence === 'HIGH' ? 1 : 2,
          evidence,
        });
      }
    }

    // 6. Java / Spring Boot
    for (const [p, file] of filesByPath.entries()) {
      if (
        file.extension === '.java' &&
        (file.name.endsWith('Application.java') || file.name === 'Main.java')
      ) {
        const evidence: DetectionEvidenceDto[] = [
          { kind: 'FILE_PATH', source: p, detail: 'Java main application class candidate' },
        ];
        let confidence: ArchitectureConfidence = 'MEDIUM';
        if (frameworks.has('spring') || frameworks.has('springboot')) {
          confidence = 'HIGH';
          evidence.push({
            kind: 'FRAMEWORK',
            source: 'framework-profile',
            detail: 'Spring Boot framework detected',
          });
        }

        candidates.push({
          relativePath: p,
          kind: 'APPLICATION',
          confidence,
          rank: confidence === 'HIGH' ? 1 : 2,
          evidence,
        });
      }
    }

    // 7. Go
    for (const [p, file] of filesByPath.entries()) {
      if (
        file.extension === '.go' &&
        (p === 'main.go' || (p.startsWith('cmd/') && p.endsWith('/main.go')))
      ) {
        candidates.push({
          relativePath: p,
          kind: 'APPLICATION',
          confidence: 'HIGH',
          rank: 1,
          evidence: [{ kind: 'FILE_PATH', source: p, detail: 'Go main application entry point' }],
        });
      }
    }

    // 8. Rust Binary vs Library
    if (filesByPath.has('src/main.rs')) {
      candidates.push({
        relativePath: 'src/main.rs',
        kind: 'APPLICATION',
        confidence: 'HIGH',
        rank: 1,
        evidence: [
          {
            kind: 'FILE_PATH',
            source: 'src/main.rs',
            detail: 'Rust application binary entry point',
          },
        ],
      });
    }
    if (filesByPath.has('src/lib.rs')) {
      candidates.push({
        relativePath: 'src/lib.rs',
        kind: 'LIBRARY',
        confidence: 'HIGH',
        rank: 1,
        evidence: [{ kind: 'FILE_PATH', source: 'src/lib.rs', detail: 'Rust library crate root' }],
      });
    }

    // 9. .NET (C#)
    if (filesByPath.has('Program.cs') || filesByPath.has('src/Program.cs')) {
      const rel = filesByPath.has('Program.cs') ? 'Program.cs' : 'src/Program.cs';
      candidates.push({
        relativePath: rel,
        kind: 'APPLICATION',
        confidence: 'HIGH',
        rank: 1,
        evidence: [{ kind: 'FILE_PATH', source: rel, detail: '.NET program entry point' }],
      });
    }

    // 10. Flutter
    if (filesByPath.has('lib/main.dart')) {
      const evidence: DetectionEvidenceDto[] = [
        { kind: 'FILE_PATH', source: 'lib/main.dart', detail: 'Flutter application entry point' },
      ];
      if (frameworks.has('flutter')) {
        evidence.push({
          kind: 'FRAMEWORK',
          source: 'framework-profile',
          detail: 'Flutter SDK detected',
        });
      }
      candidates.push({
        relativePath: 'lib/main.dart',
        kind: 'APPLICATION',
        confidence: 'HIGH',
        rank: 1,
        evidence,
      });
    }

    // 11. Generic Top-Level Entry Points (if no high-confidence candidate found yet)
    if (candidates.length === 0) {
      const genericPatterns = [
        'src/main.ts',
        'src/app.ts',
        'src/index.ts',
        'main.ts',
        'app.ts',
        'index.ts',
        'index.js',
      ];
      for (const p of genericPatterns) {
        if (filesByPath.has(p)) {
          candidates.push({
            relativePath: p,
            kind: 'APPLICATION',
            confidence: 'MEDIUM',
            rank: 2,
            evidence: [
              {
                kind: 'FILE_PATH',
                source: p,
                detail: 'Generic application source entry candidate',
              },
            ],
          });
        }
      }
    }

    // Deduplicate by relativePath preserving highest confidence / rank
    const dedupedMap = new Map<string, EntryPointCandidateDto>();
    for (const c of candidates) {
      const existing = dedupedMap.get(c.relativePath);
      if (!existing || (existing.confidence !== 'HIGH' && c.confidence === 'HIGH')) {
        dedupedMap.set(c.relativePath, {
          ...c,
          evidence: c.evidence.slice(0, MAX_EVIDENCE_PER_CANDIDATE),
        });
      }
    }

    const sorted = Array.from(dedupedMap.values()).sort((a, b) => {
      if (a.confidence === 'HIGH' && b.confidence !== 'HIGH') return -1;
      if (b.confidence === 'HIGH' && a.confidence !== 'HIGH') return 1;
      if (a.rank !== b.rank) return a.rank - b.rank;
      return a.relativePath.localeCompare(b.relativePath);
    });

    return sorted.slice(0, MAX_ENTRY_CANDIDATES);
  }
}
