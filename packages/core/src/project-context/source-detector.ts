/**
 * @file packages/core/src/project-context/source-detector.ts
 * Safe, read-only inspection engine for detecting project technology, frameworks,
 * structure, entry points, and target reachability across connected sources (Phase 123).
 *
 * CRITICAL SECURITY INVARIANTS:
 * 1. Read-only filesystem operations only. Never execute scripts or repository binaries.
 * 2. Repository contents are strictly treated as untrusted data.
 * 3. Bounded directory traversal with limits on file count and depth to prevent DoS.
 * 4. Symlinks are not followed out of the project root.
 */

import fs from 'node:fs';
import path from 'node:path';
import type {
  DetectedTechnologyDto,
  RepositorySummaryDto,
  EnvironmentType,
  ConnectivityCheckResultDto,
} from '@ai-quality/contracts';
import { WebsiteTargetConnectivityChecker } from '../website-targets/connectivity-checker.js';
import { ProjectContextDetectionFailedError } from './project-context-errors.js';

export interface SourceDetectorLimits {
  readonly maxFilesToScan?: number;
  readonly maxDepth?: number;
}

export class SourceDetector {
  private readonly connectivityChecker: WebsiteTargetConnectivityChecker;
  private readonly maxFiles: number;
  private readonly maxDepth: number;

  constructor(
    connectivityChecker?: WebsiteTargetConnectivityChecker,
    limits?: SourceDetectorLimits,
  ) {
    this.connectivityChecker = connectivityChecker ?? new WebsiteTargetConnectivityChecker();
    this.maxFiles = limits?.maxFilesToScan ?? 5_000;
    this.maxDepth = limits?.maxDepth ?? 8;
  }

  /**
   * Performs read-only detection on a local project folder or imported Git repository directory.
   */
  public async detectLocalFolder(rootPath: string): Promise<{
    detectedTechnology: DetectedTechnologyDto;
    repositorySummary: RepositorySummaryDto;
  }> {
    if (!rootPath || typeof rootPath !== 'string' || rootPath.trim().length === 0) {
      throw new ProjectContextDetectionFailedError(
        undefined,
        'Root path is required for local folder detection.',
      );
    }

    const normalizedRoot = path.normalize(rootPath.trim());
    if (!fs.existsSync(normalizedRoot)) {
      throw new ProjectContextDetectionFailedError(
        undefined,
        `Directory does not exist for source detection: "${normalizedRoot}"`,
      );
    }

    let canonicalRoot: string;
    try {
      canonicalRoot = fs.realpathSync(normalizedRoot);
      const stat = fs.statSync(canonicalRoot);
      if (!stat.isDirectory()) {
        throw new ProjectContextDetectionFailedError(
          undefined,
          `Path is not a directory: "${canonicalRoot}"`,
        );
      }
    } catch (err: unknown) {
      if (err instanceof ProjectContextDetectionFailedError) {
        throw err;
      }
      throw new ProjectContextDetectionFailedError(
        undefined,
        `Failed to resolve directory "${normalizedRoot}": ${err instanceof Error ? err.message : String(err)}`,
        err,
      );
    }

    // 1. Inspect Git metadata
    const gitInfo = this.inspectGitMetadata(canonicalRoot);

    // 2. Scan file system with bounded traversal
    const scanResult = this.scanDirectory(canonicalRoot);

    // 3. Inspect configuration & manifests
    const manifestInfo = this.inspectManifests(canonicalRoot, scanResult.discoveredFiles);

    // 4. Synthesize languages & primary language
    const languages = this.deriveLanguages(scanResult.extensionCounts);
    const primaryLanguage = languages[0] ?? null;

    // 5. Synthesize frameworks & test frameworks
    const frameworks = Array.from(new Set([...manifestInfo.frameworks, ...scanResult.frameworks]));
    const testFramework = manifestInfo.testFramework ?? scanResult.testFramework ?? null;
    const packageManager = manifestInfo.packageManager ?? scanResult.packageManager ?? null;

    const detectedTechnology: DetectedTechnologyDto = {
      primaryLanguage,
      languages,
      frameworks,
      packageManager,
      testFramework,
      likelyEntryPoints: Array.from(
        new Set([...manifestInfo.entryPoints, ...scanResult.likelyEntryPoints]),
      ),
      testDirectories: scanResult.testDirectories,
      requirementsFiles: scanResult.requirementsFiles,
      configurationFiles: scanResult.configurationFiles,
    };

    const structureSummary =
      `Scanned ${scanResult.scannedFileCount} files (${(scanResult.totalSizeBytes / 1024).toFixed(1)} KB) across ${scanResult.scannedDirCount} directories. ${
        primaryLanguage
          ? `Primary language: ${primaryLanguage}.`
          : 'No dominant programming language detected.'
      } ${frameworks.length > 0 ? `Frameworks: ${frameworks.join(', ')}.` : ''}`.trim();

    const repositorySummary: RepositorySummaryDto = {
      fileCount: scanResult.scannedFileCount,
      totalSizeBytes: scanResult.totalSizeBytes,
      structureSummary,
      isGitRepo: gitInfo.isGit,
      branch: gitInfo.branch,
      commit: gitInfo.commit,
    };

    return {
      detectedTechnology,
      repositorySummary,
    };
  }

  /**
   * Performs read-only detection against a target website URL using the ConnectivityChecker.
   */
  public async detectWebsite(
    baseUrl: string,
    environmentType?: EnvironmentType,
  ): Promise<ConnectivityCheckResultDto> {
    return this.connectivityChecker.check(baseUrl, {
      environmentType: environmentType ?? 'LOCAL',
    });
  }

  /**
   * Safe inspection of Git HEAD and branch references without executing git CLI.
   */
  private inspectGitMetadata(root: string): {
    isGit: boolean;
    branch: string | null;
    commit: string | null;
  } {
    const gitDir = path.join(root, '.git');
    if (!fs.existsSync(gitDir)) {
      return { isGit: false, branch: null, commit: null };
    }

    try {
      let headContent = '';
      const headFile = path.join(gitDir, 'HEAD');
      if (fs.existsSync(headFile)) {
        headContent = fs.readFileSync(headFile, 'utf-8').trim();
      }

      if (headContent.startsWith('ref: refs/heads/')) {
        const branch = headContent.replace('ref: refs/heads/', '').trim();
        let commit: string | null = null;
        const refPath = path.join(gitDir, 'refs', 'heads', branch);
        if (fs.existsSync(refPath)) {
          commit = fs.readFileSync(refPath, 'utf-8').trim();
        }
        return { isGit: true, branch, commit };
      }

      if (/^[0-9a-fA-F]{40}$/.test(headContent)) {
        return { isGit: true, branch: null, commit: headContent };
      }

      return { isGit: true, branch: null, commit: null };
    } catch {
      return { isGit: true, branch: null, commit: null };
    }
  }

  /**
   * Bounded directory scanning to collect extensions, file counts, and recognizable configurations.
   */
  private scanDirectory(canonicalRoot: string): {
    scannedFileCount: number;
    scannedDirCount: number;
    totalSizeBytes: number;
    extensionCounts: Map<string, number>;
    discoveredFiles: Set<string>;
    configurationFiles: string[];
    likelyEntryPoints: string[];
    testDirectories: string[];
    requirementsFiles: string[];
    packageManager: string | null;
    frameworks: string[];
    testFramework: string | null;
  } {
    const ignoredDirs = new Set([
      '.git',
      'node_modules',
      '.next',
      'dist',
      'build',
      'out',
      '.turbo',
      '.cache',
      'coverage',
      '.venv',
      'venv',
      '__pycache__',
      '.idea',
      '.vscode',
    ]);

    const extensionCounts = new Map<string, number>();
    const discoveredFiles = new Set<string>();
    const configurationFiles: string[] = [];
    const likelyEntryPoints: string[] = [];
    const testDirectoriesSet = new Set<string>();
    const requirementsFiles: string[] = [];
    const frameworksSet = new Set<string>();
    let packageManager: string | null = null;
    let testFramework: string | null = null;

    let scannedFileCount = 0;
    let scannedDirCount = 0;
    let totalSizeBytes = 0;

    interface QueueItem {
      dir: string;
      rel: string;
      depth: number;
    }

    const queue: QueueItem[] = [{ dir: canonicalRoot, rel: '', depth: 0 }];

    while (queue.length > 0 && scannedFileCount < this.maxFiles) {
      const item = queue.shift()!;
      scannedDirCount++;

      let entries: fs.Dirent[] = [];
      try {
        entries = fs.readdirSync(item.dir, { withFileTypes: true });
      } catch {
        continue;
      }

      for (const entry of entries) {
        if (scannedFileCount >= this.maxFiles) break;

        const relPath = item.rel ? `${item.rel}/${entry.name}` : entry.name;
        const fullPath = path.join(item.dir, entry.name);

        if (entry.isDirectory()) {
          if (ignoredDirs.has(entry.name)) {
            continue;
          }

          // Check if this is a test directory
          const lowerDir = entry.name.toLowerCase();
          if (
            ['test', 'tests', '__tests__', 'e2e', 'spec', 'specs'].includes(lowerDir) ||
            relPath.includes('test/') ||
            relPath.includes('tests/')
          ) {
            testDirectoriesSet.add(relPath);
          }

          if (item.depth < this.maxDepth) {
            queue.push({
              dir: fullPath,
              rel: relPath,
              depth: item.depth + 1,
            });
          }
        } else if (entry.isFile()) {
          scannedFileCount++;
          discoveredFiles.add(relPath);

          try {
            const stat = fs.statSync(fullPath);
            totalSizeBytes += stat.size;
          } catch {
            // Ignore stat failures on dynamic files
          }

          const ext = path.extname(entry.name).toLowerCase();
          if (ext) {
            extensionCounts.set(ext, (extensionCounts.get(ext) ?? 0) + 1);
          }

          // Check configuration files
          const lowerName = entry.name.toLowerCase();
          if (
            [
              'package.json',
              'tsconfig.json',
              'vite.config.ts',
              'vite.config.js',
              'next.config.js',
              'next.config.mjs',
              'next.config.ts',
              'playwright.config.ts',
              'playwright.config.js',
              'jest.config.js',
              'jest.config.ts',
              'vitest.config.ts',
              'vitest.config.js',
              'dockerfile',
              'docker-compose.yml',
              'docker-compose.yaml',
              '.env.example',
              'requirements.txt',
              'pyproject.toml',
              'cargo.toml',
              'go.mod',
              'pom.xml',
              'build.gradle',
            ].includes(lowerName)
          ) {
            configurationFiles.push(relPath);
          }

          // Check package manager lockfiles
          if (entry.name === 'pnpm-lock.yaml') packageManager = 'pnpm';
          else if (entry.name === 'yarn.lock' && !packageManager) packageManager = 'yarn';
          else if (entry.name === 'package-lock.json' && !packageManager) packageManager = 'npm';
          else if ((entry.name === 'bun.lockb' || entry.name === 'bun.lock') && !packageManager)
            packageManager = 'bun';
          else if (entry.name === 'Cargo.lock') packageManager = 'cargo';
          else if (entry.name === 'go.sum') packageManager = 'go';
          else if (entry.name === 'poetry.lock') packageManager = 'poetry';

          // Check test frameworks from filenames
          if (lowerName.includes('playwright.config')) testFramework = 'Playwright';
          else if (lowerName.includes('vitest.config')) testFramework = 'Vitest';
          else if (lowerName.includes('jest.config') && !testFramework) testFramework = 'Jest';
          else if (lowerName.includes('cypress.config')) testFramework = 'Cypress';

          // Check likely application entry points
          if (
            [
              'src/index.ts',
              'src/index.js',
              'src/main.ts',
              'src/main.js',
              'src/app.tsx',
              'src/app.jsx',
              'app/page.tsx',
              'app/page.jsx',
              'pages/index.tsx',
              'pages/index.jsx',
              'main.py',
              'app.py',
              'server.js',
              'server.ts',
              'index.html',
            ].includes(relPath.toLowerCase())
          ) {
            likelyEntryPoints.push(relPath);
          }

          // Check requirements/specification files
          if (
            ['requirements.md', 'prd.md', 'specification.md', 'specs.md', 'readme.md'].includes(
              lowerName,
            ) ||
            relPath.startsWith('specs/') ||
            relPath.startsWith('docs/requirements') ||
            relPath.startsWith('doc/requirements')
          ) {
            requirementsFiles.push(relPath);
          }
        }
      }
    }

    return {
      scannedFileCount,
      scannedDirCount,
      totalSizeBytes,
      extensionCounts,
      discoveredFiles,
      configurationFiles,
      likelyEntryPoints,
      testDirectories: Array.from(testDirectoriesSet),
      requirementsFiles,
      packageManager,
      frameworks: Array.from(frameworksSet),
      testFramework,
    };
  }

  /**
   * Safely reads and inspects manifests like package.json for dependencies, scripts, and entry points.
   */
  private inspectManifests(
    root: string,
    discoveredFiles: Set<string>,
  ): {
    frameworks: string[];
    packageManager: string | null;
    testFramework: string | null;
    entryPoints: string[];
  } {
    const frameworks: string[] = [];
    let packageManager: string | null = null;
    let testFramework: string | null = null;
    const entryPoints: string[] = [];

    // 1. Node.js package.json
    const packageJsonPath = path.join(root, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      try {
        const raw = fs.readFileSync(packageJsonPath, 'utf-8');
        const pkg = JSON.parse(raw) as Record<string, unknown>;

        packageManager = 'npm'; // Default for package.json unless lockfile specifies otherwise

        if (pkg.main && typeof pkg.main === 'string') {
          entryPoints.push(pkg.main);
        }
        if (pkg.module && typeof pkg.module === 'string') {
          entryPoints.push(pkg.module);
        }

        const deps = {
          ...(typeof pkg.dependencies === 'object' && pkg.dependencies ? pkg.dependencies : {}),
          ...(typeof pkg.devDependencies === 'object' && pkg.devDependencies
            ? pkg.devDependencies
            : {}),
        } as Record<string, unknown>;

        if (deps['next']) frameworks.push('Next.js');
        if (deps['react'] || deps['react-dom']) frameworks.push('React');
        if (deps['vue']) frameworks.push('Vue');
        if (deps['nuxt']) frameworks.push('Nuxt');
        if (deps['@angular/core']) frameworks.push('Angular');
        if (deps['svelte']) frameworks.push('Svelte');
        if (deps['express']) frameworks.push('Express');
        if (deps['@nestjs/core']) frameworks.push('NestJS');
        if (deps['fastify']) frameworks.push('Fastify');
        if (deps['electron']) frameworks.push('Electron');
        if (deps['tailwindcss']) frameworks.push('Tailwind CSS');

        if (deps['@playwright/test'] || deps['playwright']) testFramework = 'Playwright';
        else if (deps['vitest']) testFramework = 'Vitest';
        else if (deps['jest']) testFramework = 'Jest';
        else if (deps['cypress']) testFramework = 'Cypress';
        else if (deps['mocha']) testFramework = 'Mocha';
      } catch {
        // Untrusted/malformed package.json is gracefully ignored
      }
    }

    // 2. Python requirements.txt
    const reqPath = path.join(root, 'requirements.txt');
    if (fs.existsSync(reqPath)) {
      try {
        const content = fs.readFileSync(reqPath, 'utf-8');
        if (/fastapi/i.test(content)) frameworks.push('FastAPI');
        if (/django/i.test(content)) frameworks.push('Django');
        if (/flask/i.test(content)) frameworks.push('Flask');
        if (/pytest/i.test(content)) testFramework = 'pytest';
        if (!packageManager) packageManager = 'pip';
      } catch {
        // Graceful ignore
      }
    }

    return {
      frameworks,
      packageManager,
      testFramework,
      entryPoints,
    };
  }

  /**
   * Translates extension counts into sorted languages list.
   */
  private deriveLanguages(counts: Map<string, number>): string[] {
    const extToLanguage: Record<string, string> = {
      '.ts': 'TypeScript',
      '.tsx': 'TypeScript',
      '.js': 'JavaScript',
      '.jsx': 'JavaScript',
      '.mjs': 'JavaScript',
      '.cjs': 'JavaScript',
      '.py': 'Python',
      '.java': 'Java',
      '.go': 'Go',
      '.rs': 'Rust',
      '.rb': 'Ruby',
      '.php': 'PHP',
      '.cs': 'C#',
      '.cpp': 'C++',
      '.c': 'C',
      '.html': 'HTML',
      '.css': 'CSS',
      '.scss': 'SCSS',
      '.sql': 'SQL',
      '.sh': 'Shell',
      '.bash': 'Shell',
    };

    const langCounts = new Map<string, number>();
    for (const [ext, count] of counts.entries()) {
      const lang = extToLanguage[ext];
      if (lang) {
        langCounts.set(lang, (langCounts.get(lang) ?? 0) + count);
      }
    }

    return Array.from(langCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([lang]) => lang);
  }
}
