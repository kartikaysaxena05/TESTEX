import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import type {
  ProjectSourceDto,
  GitStatusDto,
  SourceStructureDto,
  TechnologyProfileDto,
  FrameworkProfileDto,
  ClassificationProfileDto,
} from '@ai-quality/contracts';
import { SourceDetailsCard } from '../renderer/features/sources/SourceDetailsCard.js';
import { GitDetailsCard } from '../renderer/features/sources/GitDetailsCard.js';
import { StructureTreeView } from '../renderer/features/sources/StructureTreeView.js';
import { RepositoryStructureCard } from '../renderer/features/sources/RepositoryStructureCard.js';
import { TechnologyProfileCard } from '../renderer/features/sources/TechnologyProfileCard.js';
import { FrameworkProfileCard } from '../renderer/features/sources/FrameworkProfileCard.js';
import { FileClassificationCard } from '../renderer/features/sources/FileClassificationCard.js';
import { SourceFilePreviewModal } from '../renderer/features/sources/SourceFilePreviewModal.js';
import { RepositoryIndexCard } from '../renderer/features/sources/RepositoryIndexCard.js';
import { ApplicationArchitectureCard } from '../renderer/features/sources/ApplicationArchitectureCard.js';
import { RunConfigurationCard } from '../renderer/features/sources/RunConfigurationCard.js';
import { RepositorySnapshotsCard } from '../renderer/features/sources/RepositorySnapshotsCard.js';
import { RepositoryChangesCard } from '../renderer/features/sources/RepositoryChangesCard.js';
import { DetachSourceDialog } from '../renderer/features/sources/DetachSourceDialog.js';
import { ChangeSourceDialog } from '../renderer/features/sources/ChangeSourceDialog.js';
import { SourceScreen } from '../renderer/screens/SourceScreen.js';
import { ProjectProvider } from '../renderer/context/ProjectContext.js';

describe('Source Feature UI Component Unit Tests', () => {
  const dummyDateStr = new Date('2026-01-01T00:00:00.000Z').toISOString();

  const mockAvailableSource: ProjectSourceDto = {
    id: 'src-1111-2222',
    projectId: 'proj-1111-2222',
    kind: 'LOCAL_DIRECTORY',
    displayName: 'web-platform-frontend',
    rootPath: '/Users/test/workspace/web-platform-frontend',
    identityFingerprint: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    activeBaselineSnapshotId: null,
    availability: 'AVAILABLE',
    filesystemCreatedAt: dummyDateStr,
    filesystemModifiedAt: dummyDateStr,
    metadataRefreshedAt: dummyDateStr,
    createdAt: dummyDateStr,
    updatedAt: dummyDateStr,
    lastValidatedAt: dummyDateStr,
  };

  const mockUnavailableSource: ProjectSourceDto = {
    id: 'src-3333-4444',
    projectId: 'proj-1111-2222',
    kind: 'LOCAL_DIRECTORY',
    displayName: 'legacy-backend',
    rootPath: '/Volumes/External/legacy-backend',
    identityFingerprint: null,
    activeBaselineSnapshotId: null,
    availability: 'UNAVAILABLE',
    filesystemCreatedAt: null,
    filesystemModifiedAt: null,
    metadataRefreshedAt: null,
    createdAt: dummyDateStr,
    updatedAt: dummyDateStr,
    lastValidatedAt: null,
  };

  const mockDetectedGit: GitStatusDto = {
    gitAvailable: true,
    gitVersion: '2.50.1',
    isGitRepository: true,
    repositoryRoot: '/Users/test/workspace/web-platform-frontend',
    sourceRelationToRepository: 'ROOT',
    currentBranch: 'main',
    headCommit: 'e4d909c290d0fb1ca068ffaddf22cbd0e0ffae28',
    isDetachedHead: false,
    lastCheckedAt: dummyDateStr,
  };

  const mockNonGit: GitStatusDto = {
    gitAvailable: true,
    gitVersion: '2.50.1',
    isGitRepository: false,
    repositoryRoot: null,
    sourceRelationToRepository: 'UNKNOWN',
    currentBranch: null,
    headCommit: null,
    isDetachedHead: false,
    lastCheckedAt: dummyDateStr,
  };

  const mockStructure: SourceStructureDto = {
    sourceId: 'src-1111-2222',
    rootName: 'web-platform-frontend',
    entries: [
      { relativePath: 'src', name: 'src', kind: 'DIRECTORY', depth: 1 },
      { relativePath: 'src/components', name: 'components', kind: 'DIRECTORY', depth: 2 },
      { relativePath: 'src/components/Button.tsx', name: 'Button.tsx', kind: 'FILE', depth: 3 },
      { relativePath: 'package.json', name: 'package.json', kind: 'FILE', depth: 1 },
      { relativePath: 'external-symlink', name: 'external-symlink', kind: 'SYMLINK', depth: 1 },
    ],
    summary: {
      filesDiscovered: 4,
      directoriesDiscovered: 4,
      symlinksDiscovered: 1,
      totalDiscovered: 9,
      includedFiles: 2,
      includedDirectories: 2,
      totalIncluded: 5,
      ignoredEntries: 3,
      safetyExcludedEntries: 1,
      earlyPrunedDirectories: 2,
      ignoreFilesLoaded: 1,
      ignoreRulesLoaded: 5,
      warnings: [],
    },
    truncated: false,
    truncationReason: null,
    scannedAt: dummyDateStr,
  };

  const mockTruncatedStructure: SourceStructureDto = {
    ...mockStructure,
    truncated: true,
    truncationReason: 'MAX_ENTRIES',
  };

  const mockTechnologyProfile: TechnologyProfileDto = {
    sourceId: 'src-1111-2222',
    detectedLanguages: [
      {
        language: 'TypeScript',
        category: 'PROGRAMMING',
        fileCount: 45,
        percentage: 75,
        confidence: 'HIGH',
        evidenceExtensions: ['.ts', '.tsx'],
      },
      {
        language: 'CSS',
        category: 'STYLE',
        fileCount: 15,
        percentage: 25,
        confidence: 'HIGH',
        evidenceExtensions: ['.css'],
      },
    ],
    dominantLanguage: 'TypeScript',
    technologySignals: [
      {
        technology: 'Node.js Ecosystem',
        category: 'Runtime / Ecosystem',
        confidence: 'HIGH',
        evidence: ['package.json', 'TypeScript/JavaScript source files'],
      },
      {
        technology: 'Docker',
        category: 'DevOps / Infrastructure',
        confidence: 'HIGH',
        evidence: ['Dockerfile'],
      },
    ],
    totalIncludedFiles: 60,
    totalLanguageFiles: 60,
    unknownFiles: 0,
    analyzedAt: dummyDateStr,
  };

  describe('SourceDetailsCard', () => {
    it('should render available source metadata and verified identity accurately', () => {
      const html = renderToString(
        <SourceDetailsCard
          source={mockAvailableSource}
          onRefreshMetadata={() => {}}
          onChangeFolder={() => {}}
          onDetach={() => {}}
        />,
      );

      assert.ok(html.includes('web-platform-frontend'), 'Must render display name');
      assert.ok(html.includes('Local Directory'), 'Must render kind badge');
      assert.ok(html.includes('Available'), 'Must render Available status badge');
      assert.ok(html.includes('Identity Verified'), 'Must render identity verified badge');
      assert.ok(
        html.includes('/Users/test/workspace/web-platform-frontend'),
        'Must render canonical root path',
      );
      assert.ok(html.includes('Refresh Metadata'), 'Must render refresh metadata action');
      assert.ok(html.includes('Change Folder'), 'Must render change folder action');
      assert.ok(html.includes('Detach'), 'Must render detach action');
      assert.ok(html.includes('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'));
    });

    it('should render unavailable status badge when source directory is missing', () => {
      const html = renderToString(
        <SourceDetailsCard
          source={mockUnavailableSource}
          onRefreshMetadata={() => {}}
          onChangeFolder={() => {}}
          onDetach={() => {}}
        />,
      );

      assert.ok(html.includes('legacy-backend'), 'Must render display name');
      assert.ok(
        html.includes('Unavailable / Inaccessible'),
        'Must render Unavailable status badge',
      );
      assert.ok(html.includes('Not yet validated'), 'Must handle null lastValidatedAt');
    });
  });

  describe('GitDetailsCard', () => {
    it('should render detected Git repository state with branch and commit', () => {
      const html = renderToString(
        <GitDetailsCard gitStatus={mockDetectedGit} onRefreshGit={() => {}} />,
      );

      assert.ok(html.includes('Git Repository'), 'Must render Git header');
      assert.ok(html.includes('Repository Detected'), 'Must render detected badge');
      assert.ok(html.includes('Repository Root'), 'Must render root label');
      assert.ok(html.includes('main'), 'Must render branch name');
      assert.ok(html.includes('e4d909c290'), 'Must render truncated commit hash');
      assert.ok(html.includes('Recheck Git'), 'Must render recheck button');
    });

    it('should render non-Git repository message safely without error state', () => {
      const html = renderToString(
        <GitDetailsCard gitStatus={mockNonGit} onRefreshGit={() => {}} />,
      );

      assert.ok(html.includes('Not a Git Repository'), 'Must render not a repository badge');
      assert.ok(
        html.includes('not located inside a Git working tree'),
        'Must explain standard local directory handling',
      );
    });

    it('should render initial uninspected state when gitStatus is null', () => {
      const html = renderToString(<GitDetailsCard gitStatus={null} onRefreshGit={() => {}} />);

      assert.ok(html.includes('Git status not yet checked'), 'Must explain uninspected state');
      assert.ok(html.includes('Check Git Repository'), 'Must render check action');
    });
  });

  describe('TechnologyProfileCard', () => {
    it('should render dominant language, detected languages, and ecosystem signals', () => {
      const html = renderToString(
        <TechnologyProfileCard profile={mockTechnologyProfile} onRefreshProfile={() => {}} />,
      );

      assert.ok(html.includes('Technology Profile'), 'Must render title');
      assert.ok(html.includes('Primary: TypeScript'), 'Must render dominant language badge');
      assert.ok(html.includes('TypeScript'), 'Must render language name');
      assert.ok(html.includes('75%'), 'Must render language percentage');
      assert.ok(html.includes('Node.js Ecosystem'), 'Must render Node ecosystem signal');
      assert.ok(html.includes('Docker'), 'Must render Docker signal');
      assert.ok(html.includes('60 total files analyzed'), 'Must render total files analyzed');
      assert.ok(html.includes('Refresh Profile'), 'Must render action');
    });

    it('should render uninspected state when profile is null', () => {
      const html = renderToString(
        <TechnologyProfileCard profile={null} onRefreshProfile={() => {}} />,
      );

      assert.ok(html.includes('not yet analyzed'), 'Must render unanalyzed text');
      assert.ok(html.includes('Analyze Profile'), 'Must render action');
    });
  });

  describe('StructureTreeView', () => {
    it('should render tree entries with directory, file, and symlink indicators', () => {
      const html = renderToString(<StructureTreeView entries={mockStructure.entries} />);

      assert.ok(html.includes('src/'), 'Must render directory');
      assert.ok(html.includes('package.json'), 'Must render file');
      assert.ok(html.includes('external-symlink'), 'Must render symlink');
      assert.ok(html.includes('symlink'), 'Must render symlink label');
    });

    it('should render empty message when entries is empty', () => {
      const html = renderToString(<StructureTreeView entries={[]} />);
      assert.ok(html.includes('No files or directories discovered'));
    });
  });

  describe('RepositoryStructureCard', () => {
    it('should render discovery metrics summary, ignore rule counts, and tree view', () => {
      const html = renderToString(
        <RepositoryStructureCard structure={mockStructure} onRefreshStructure={() => {}} />,
      );

      assert.ok(html.includes('Repository Structure'), 'Must render title');
      assert.ok(html.includes('5 included'), 'Must render total count');
      assert.ok(html.includes('Included Files'), 'Must render files label');
      assert.ok(html.includes('Directories'), 'Must render directories label');
      assert.ok(html.includes('Ignored'), 'Must render ignored label');
      assert.ok(html.includes('Safety Excluded'), 'Must render safety excluded label');
      assert.ok(html.includes('.gitignore file'), 'Must render gitignore files loaded count');
      assert.ok(html.includes('5 active rules'), 'Must render active rules count');
      assert.ok(html.includes('Refresh Structure'), 'Must render action button');
    });

    it('should render truncation warning banner when scan is truncated', () => {
      const html = renderToString(
        <RepositoryStructureCard
          structure={mockTruncatedStructure}
          onRefreshStructure={() => {}}
        />,
      );

      assert.ok(html.includes('Partial Structure Discovery'), 'Must render warning title');
      assert.ok(html.includes('MAX_ENTRIES'), 'Must display truncation reason');
    });

    it('should render uninspected state when structure is null', () => {
      const html = renderToString(
        <RepositoryStructureCard structure={null} onRefreshStructure={() => {}} />,
      );

      assert.ok(html.includes('not yet discovered'), 'Must render undiscovered text');
      assert.ok(html.includes('Discover Structure'), 'Must render action');
    });
  });

  describe('DetachSourceDialog', () => {
    it('should render safety confirmation and reassurance when open', () => {
      const html = renderToString(
        <DetachSourceDialog
          isOpen={true}
          sourceName="web-platform-frontend"
          onConfirm={() => {}}
          onCancel={() => {}}
        />,
      );

      assert.ok(html.includes('Detach Source Project'), 'Must render dialog title');
      assert.ok(
        html.includes('Are you sure you want to detach') && html.includes('web-platform-frontend'),
        'Must render source name in description',
      );
      assert.ok(
        html.includes(
          'No source code, git histories, or files on your disk will be modified or deleted',
        ),
        'Must clearly state filesystem safety guarantee',
      );
      assert.ok(html.includes('Detach Project'), 'Must render confirm button');
    });

    it('should render nothing when isOpen is false', () => {
      const html = renderToString(
        <DetachSourceDialog
          isOpen={false}
          sourceName="web-platform-frontend"
          onConfirm={() => {}}
          onCancel={() => {}}
        />,
      );

      assert.strictEqual(html, '');
    });
  });

  describe('ChangeSourceDialog', () => {
    it('should render change source confirmation when open', () => {
      const html = renderToString(
        <ChangeSourceDialog
          isOpen={true}
          currentPath="/Users/test/workspace/web-platform-frontend"
          onConfirm={() => {}}
          onCancel={() => {}}
        />,
      );

      assert.ok(html.includes('Change Source Project Directory'), 'Must render dialog title');
      assert.ok(
        html.includes('/Users/test/workspace/web-platform-frontend'),
        'Must display current attached path',
      );
      assert.ok(html.includes('Choose New Folder'), 'Must render choose button');
    });
  });

  describe('FrameworkProfileCard', () => {
    const mockFrameworkProfile: FrameworkProfileDto = {
      sourceId: 'src-1111-2222',
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
          ecosystem: 'Node.js',
          directDependencyCount: 15,
          devDependencyCount: 8,
          scriptNames: ['build', 'dev', 'test'],
        },
      ],
      frameworks: [
        {
          id: 'nextjs',
          name: 'Next.js',
          category: 'FRAMEWORK',
          confidence: 'HIGH',
          declaredVersion: '^15.0.0',
          resolvedVersion: null,
          evidence: [
            {
              kind: 'DEPENDENCY',
              source: 'package.json',
              detail: 'next: ^15.0.0',
            },
          ],
        },
        {
          id: 'react',
          name: 'React',
          category: 'UI_LIBRARY',
          confidence: 'HIGH',
          declaredVersion: '^19.0.0',
          resolvedVersion: null,
          evidence: [
            {
              kind: 'DEPENDENCY',
              source: 'package.json',
              detail: 'react: ^19.0.0',
            },
          ],
        },
      ],
      dependencies: [
        {
          name: 'next',
          declaredVersion: '^15.0.0',
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
      ],
      directDependencyCount: 15,
      devDependencyCount: 8,
      analyzedAt: dummyDateStr,
      warnings: [],
    };

    it('should render framework badges, metrics, and evidence items', () => {
      const html = renderToString(<FrameworkProfileCard profile={mockFrameworkProfile} />);

      assert.ok(html.includes('Frameworks &amp; Dependencies'), 'Must render title');
      assert.ok(html.includes('Node.js'), 'Must render primary ecosystem badge');
      assert.ok(html.includes('PM: pnpm'), 'Must render package manager badge');
      assert.ok(html.includes('Next.js'), 'Must render Next.js framework');
      assert.ok(html.includes('React'), 'Must render React library');
      assert.ok(html.includes('^15.0.0'), 'Must render Next.js version constraint');
      assert.ok(html.includes('package.json: next: ^15.0.0'), 'Must render evidence');
      assert.ok(html.includes('15 direct'), 'Must render direct dependencies count');
    });

    it('should render empty state gracefully when profile is null', () => {
      const html = renderToString(<FrameworkProfileCard profile={null} />);

      assert.ok(html.includes('No framework profile available'), 'Must render empty state message');
    });
  });

  describe('FileClassificationCard', () => {
    const mockClassificationProfile: ClassificationProfileDto = {
      sourceId: 'src-1111-2222',
      summary: {
        totalFiles: 25,
        sourceFiles: 12,
        testFiles: 4,
        configurationFiles: 3,
        buildToolingFiles: 2,
        documentationFiles: 1,
        assetFiles: 1,
        databaseFiles: 1,
        migrationFiles: 1,
        generatedFiles: 0,
        scriptFiles: 0,
        templateFiles: 0,
        unknownFiles: 0,
      },
      files: [
        {
          relativePath: 'src/app.ts',
          category: 'SOURCE',
          confidence: 'HIGH',
          evidence: [{ type: 'DIRECTORY_CONTEXT', detail: 'Located under src/' }],
        },
        {
          relativePath: 'src/app.test.ts',
          category: 'TEST',
          confidence: 'HIGH',
          evidence: [{ type: 'FILENAME_PATTERN', detail: 'Matched test pattern' }],
        },
      ],
      analyzedAt: dummyDateStr,
      ruleVersion: 1,
    };

    it('should render category counts and file classifications table', () => {
      const html = renderToString(
        <FileClassificationCard
          profile={mockClassificationProfile}
          isAnalyzing={false}
          onRefreshProfile={() => {}}
        />,
      );

      assert.ok(html.includes('File Classification'), 'Must render title');
      assert.ok(html.includes('25 Included Files'), 'Must render total files badge');
      assert.ok(html.includes('12'), 'Must render source count');
      assert.ok(html.includes('4'), 'Must render tests count');
      assert.ok(html.includes('src/app.ts'), 'Must render file path');
      assert.ok(html.includes('src/app.test.ts'), 'Must render test file path');
      assert.ok(html.includes('Refresh Classification'), 'Must render refresh button');
    });

    it('should render uninspected state when profile is null', () => {
      const html = renderToString(
        <FileClassificationCard profile={null} isAnalyzing={false} onRefreshProfile={() => {}} />,
      );

      assert.ok(
        html.includes('No repository source attached or file classification not yet performed'),
        'Must render unperformed message',
      );
    });
  });

  describe('SourceFilePreviewModal', () => {
    it('should safely render source code and escape malicious script tags', () => {
      const maliciousContent = '<script>alert("xss attack")</script>';
      const html = renderToString(
        <SourceFilePreviewModal
          isOpen={true}
          relativePath="src/malicious.ts"
          contentDto={{
            sourceId: 'src-123',
            relativePath: 'src/malicious.ts',
            status: 'AVAILABLE',
            category: 'SOURCE',
            language: 'TypeScript',
            sizeBytes: 35,
            encoding: 'UTF-8',
            content: maliciousContent,
            readAt: new Date().toISOString(),
          }}
          isLoading={false}
          error={null}
          onClose={() => {}}
        />,
      );

      assert.ok(html.includes('Preview: src/malicious.ts'), 'Must render title');
      assert.ok(
        html.includes('&lt;script&gt;alert(&quot;xss attack&quot;)&lt;/script&gt;'),
        'Must escape malicious HTML',
      );
      assert.ok(html.includes('AVAILABLE'), 'Must render AVAILABLE status badge');
    });

    it('should render sensitive file warning banner', () => {
      const html = renderToString(
        <SourceFilePreviewModal
          isOpen={true}
          relativePath=".env"
          contentDto={{
            sourceId: 'src-123',
            relativePath: '.env',
            status: 'SENSITIVE',
            category: 'CONFIGURATION',
            language: null,
            sizeBytes: 0,
            encoding: 'UTF-8',
            content: null,
            readAt: new Date().toISOString(),
          }}
          isLoading={false}
          error={null}
          onClose={() => {}}
        />,
      );

      assert.ok(html.includes('Restricted Content'), 'Must render restricted banner');
      assert.ok(html.includes('SENSITIVE (DENIED)'), 'Must render sensitive badge');
    });

    it('should render binary file banner', () => {
      const html = renderToString(
        <SourceFilePreviewModal
          isOpen={true}
          relativePath="public/logo.png"
          contentDto={{
            sourceId: 'src-123',
            relativePath: 'public/logo.png',
            status: 'BINARY',
            category: 'ASSET',
            language: null,
            sizeBytes: 1024,
            encoding: 'UTF-8',
            content: null,
            readAt: new Date().toISOString(),
          }}
          isLoading={false}
          error={null}
          onClose={() => {}}
        />,
      );

      assert.ok(html.includes('Binary File'), 'Must render binary banner');
      assert.ok(html.includes('BINARY'), 'Must render binary badge');
    });
  });

  describe('RepositoryIndexCard', () => {
    it('should render index stats and metrics when indexed', () => {
      const html = renderToString(
        <RepositoryIndexCard
          status={{
            isIndexed: true,
            isRunning: false,
            schemaVersion: 1,
            parserVersion: 1,
            summary: {
              filesEligible: 25,
              filesIndexed: 23,
              filesSkipped: 2,
              filesFailed: 0,
              symbolsIndexed: 88,
              importsIndexed: 44,
              exportsIndexed: 30,
              unsupportedLanguageFiles: 1,
              durationMs: 35,
              truncated: false,
              warnings: [],
            },
            lastIndexedAt: new Date().toISOString(),
          }}
          isIndexing={false}
          onRefreshIndex={() => {}}
        />,
      );

      assert.ok(html.includes('Repository Index &amp; Source Intelligence'), 'Must render title');
      assert.ok(html.includes('Ready'), 'Must render Ready badge');
      assert.ok(html.includes('23'), 'Must render files indexed count');
      assert.ok(html.includes('88'), 'Must render symbols count');
      assert.ok(html.includes('44'), 'Must render imports count');
      assert.ok(html.includes('Rebuild Index'), 'Must render rebuild button');
    });

    it('should render Not Indexed state when not yet built', () => {
      const html = renderToString(
        <RepositoryIndexCard status={null} isIndexing={false} onRefreshIndex={() => {}} />,
      );

      assert.ok(html.includes('Not Indexed'), 'Must render Not Indexed badge');
      assert.ok(html.includes('Build Repository Index'), 'Must render build button');
    });
  });

  describe('ApplicationArchitectureCard', () => {
    it('should render architecture profile, primary kind, confidence, and entry candidates', () => {
      const html = renderToString(
        <ApplicationArchitectureCard
          profile={{
            sourceId: 'src-1',
            status: 'CURRENT',
            architectureVersion: 1,
            primaryKind: 'FULL_STACK_WEB',
            confidence: 'HIGH',
            applicationKinds: [{ kind: 'FULL_STACK_WEB', confidence: 'HIGH', evidence: [] }],
            applicationUnits: [],
            entryCandidates: [
              {
                relativePath: 'app/layout.tsx',
                kind: 'FRAMEWORK_ENTRY',
                confidence: 'HIGH',
                rank: 1,
                evidence: [
                  { kind: 'FILE_PATH', source: 'app/layout.tsx', detail: 'Next.js App Layout' },
                ],
              },
            ],
            primaryEntryCandidate: {
              relativePath: 'app/layout.tsx',
              kind: 'FRAMEWORK_ENTRY',
              confidence: 'HIGH',
              rank: 1,
              evidence: [
                { kind: 'FILE_PATH', source: 'app/layout.tsx', detail: 'Next.js App Layout' },
              ],
            },
            structuralAreas: [
              {
                relativePath: 'app',
                name: 'app',
                role: 'APPLICATION',
                fileCount: 4,
                primaryLanguages: ['TypeScript'],
                evidence: [],
              },
            ],
            architectureSignals: [
              {
                kind: 'FRAMEWORK_CONVENTIONAL_STRUCTURE',
                title: 'Next.js App/Pages Convention',
                confidence: 'HIGH',
                description: 'Next.js router',
                evidence: [],
              },
            ],
            moduleHubs: [{ relativePath: 'src/db.ts', incomingImports: 5, outgoingImports: 0 }],
            analyzedAt: new Date().toISOString(),
            warnings: [],
          }}
          isAnalyzing={false}
          onRefreshProfile={() => {}}
        />,
      );

      assert.ok(
        html.includes('Application Architecture &amp; Entry Points'),
        'Must render card title',
      );
      assert.ok(html.includes('FULL STACK WEB'), 'Must render primary kind');
      assert.ok(html.includes('HIGH Confidence'), 'Must render confidence badge');
      assert.ok(html.includes('app/layout.tsx'), 'Must render entry candidate');
      assert.ok(html.includes('Next.js App/Pages Convention'), 'Must render signal');
      assert.ok(html.includes('src/db.ts'), 'Must render module hub');
      assert.ok(html.includes('Refresh Architecture'), 'Must render refresh button');
    });

    it('should render Not Analyzed state when profile is null', () => {
      const html = renderToString(
        <ApplicationArchitectureCard
          profile={null}
          isAnalyzing={false}
          onRefreshProfile={() => {}}
        />,
      );

      assert.ok(html.includes('Not Analyzed'), 'Must render Not Analyzed badge');
      assert.ok(html.includes('Analyze Architecture'), 'Must render analyze button');
    });
  });

  describe('RunConfigurationCard', () => {
    it('should render selected candidate, working directory, and target URL', () => {
      const html = renderToString(
        <RunConfigurationCard
          profile={{
            sourceId: 'src-1',
            selectedConfiguration: {
              id: 'cfg-1',
              sourceId: 'src-1',
              applicationUnitRoot: '.',
              runtime: 'Node.js',
              packageManager: 'pnpm',
              startupKind: 'PACKAGE_SCRIPT',
              executable: 'pnpm',
              args: ['dev'],
              workingDirectory: '.',
              targetUrl: 'http://localhost:5173',
              environmentVariableNames: [],
              confidence: 'HIGH',
              safety: 'SAFE_STRUCTURE',
              source: 'USER_SELECTED',
              status: 'CONFIGURED',
              isSelected: true,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
            candidates: [
              {
                id: 'cand-1',
                applicationUnitRoot: '.',
                runtime: 'Node.js',
                packageManager: 'pnpm',
                startupKind: 'PACKAGE_SCRIPT',
                executable: 'pnpm',
                args: ['dev'],
                manifestScript: 'dev',
                workingDirectory: '.',
                confidence: 'HIGH',
                safety: 'SAFE_STRUCTURE',
                evidence: [],
              },
            ],
            runtimes: [{ runtime: 'node', available: true, version: 'v20.0.0' }],
            targetUrl: 'http://localhost:5173',
            targetUrlSource: 'USER_CONFIGURED',
            analyzedAt: new Date().toISOString(),
            warnings: [],
          }}
          isLoading={false}
          onDetect={() => {}}
        />,
      );

      assert.ok(html.includes('Application Run &amp; Startup Configuration'), 'Must render title');
      assert.ok(html.includes('Safe Structure'), 'Must render Safe Structure badge');
      assert.ok(html.includes('pnpm dev'), 'Must render executable and args');
      assert.ok(html.includes('http://localhost:5173'), 'Must render target URL');
    });
  });

  describe('RepositorySnapshotsCard', () => {
    it('should render baseline snapshot list and active baseline indicator', () => {
      const html = renderToString(
        <RepositorySnapshotsCard
          snapshots={[
            {
              id: 'snap-1',
              sourceId: 'src-1',
              indexRunId: 'run-1',
              label: 'Sprint 12 Baseline',
              kind: 'MANUAL_BASELINE',
              status: 'COMPLETE',
              snapshotVersion: 1,
              fingerprint: 'abcdef1234567890abcdef1234567890abcdef12',
              fileCount: 42,
              sourceFileCount: 30,
              testFileCount: 12,
              isBaseline: true,
              gitHeadCommit: null,
              gitBranch: null,
              createdAt: new Date().toISOString(),
            },
          ]}
          isLoading={false}
          onCreateSnapshot={() => {}}
        />,
      );

      assert.ok(html.includes('Repository Snapshots &amp; Baselines'), 'Must render title');
      assert.ok(html.includes('Sprint 12 Baseline'), 'Must render label');
      assert.ok(html.includes('Active Baseline'), 'Must render active baseline badge');
      assert.ok(html.includes('42 (30 src, 12 test)'), 'Must render file breakdown');
    });
  });

  describe('RepositoryChangesCard', () => {
    it('should render file changes, change types, and classification breakdowns', () => {
      const html = renderToString(
        <RepositoryChangesCard
          changeSet={{
            sourceId: 'src-1',
            baselineSnapshotId: 'snap-1',
            baselineLabel: 'Sprint 12 Baseline',
            currentIndexRunId: 'run-2',
            comparisonVersion: 1,
            isStale: false,
            totalChanges: 2,
            addedCount: 1,
            modifiedCount: 1,
            deletedCount: 0,
            renamedCount: 0,
            unchangedCount: 40,
            changesByClassification: { SOURCE: 1, TEST: 1 },
            changesByLanguage: { TypeScript: 2 },
            changes: [
              {
                changeType: 'MODIFIED',
                previousPath: 'src/main.ts',
                currentPath: 'src/main.ts',
                previousHash: 'h1',
                currentHash: 'h2',
                language: 'TypeScript',
                classification: 'SOURCE',
                directImporters: ['src/app.ts'],
              },
              {
                changeType: 'ADDED',
                previousPath: null,
                currentPath: 'tests/new.test.ts',
                previousHash: null,
                currentHash: 'h3',
                language: 'TypeScript',
                classification: 'TEST',
                directImporters: [],
              },
            ],
            comparedAt: new Date().toISOString(),
            warnings: [],
          }}
          isLoading={false}
          onRefreshChanges={() => {}}
        />,
      );

      assert.ok(html.includes('Repository Change Detection'), 'Must render title');
      assert.ok(html.includes('2 Changes'), 'Must render total changes');
      assert.ok(html.includes('1 Modified'), 'Must render modified badge');
      assert.ok(html.includes('1 Added'), 'Must render added badge');
      assert.ok(html.includes('src/main.ts'), 'Must render modified file');
      assert.ok(html.includes('tests/new.test.ts'), 'Must render added file');
    });
  });

  describe('SourceScreen', () => {
    it('should render honest EmptyState when no QA project is selected', () => {
      const html = renderToString(
        <MemoryRouter>
          <ProjectProvider>
            <SourceScreen />
          </ProjectProvider>
        </MemoryRouter>,
      );

      assert.ok(html.includes('No QA Project Selected'), 'Must render empty state title');
      assert.ok(
        html.includes(
          'Select or create an active project to connect and manage its local software source code',
        ),
        'Must render clear explanation',
      );
      assert.ok(html.includes('Go to Projects'), 'Must render action button');
    });
  });
});
