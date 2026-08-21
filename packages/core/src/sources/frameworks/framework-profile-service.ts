/**
 * @file packages/core/src/sources/frameworks/framework-profile-service.ts
 * Privileged service managing repository framework and dependency detection.
 */

import type { FrameworkProfileDto, ManifestSummaryDto, DependencyDto } from '@ai-quality/contracts';
import { getLogger } from '../../logging/logger.js';
import { ProjectRepository } from '../../projects/project-repository.js';
import {
  ProjectNotFoundError,
  ProjectArchivedError,
  ProjectValidationError,
} from '../../projects/project-errors.js';
import { SourceRepository } from '../source-repository.js';
import { SourceNotFoundError } from '../source-errors.js';
import { SourceStructureService } from '../structure/source-structure-service.js';
import { RECOGNIZED_MANIFESTS, MAX_DISCOVERED_MANIFESTS } from './manifest-allowlist.js';
import { SafeManifestParser } from './manifest-parser.js';
import { PackageManagerDetector } from './package-manager-detector.js';
import { FrameworkEngine } from './framework-engine.js';

export class FrameworkProfileService {
  private readonly cache = new Map<string, FrameworkProfileDto>();

  constructor(
    private readonly sourceRepository: SourceRepository = new SourceRepository(),
    private readonly projectRepository: ProjectRepository = new ProjectRepository(),
    private readonly structureService: SourceStructureService = new SourceStructureService(),
    private readonly manifestParser: SafeManifestParser = new SafeManifestParser(),
    private readonly packageManagerDetector: PackageManagerDetector = new PackageManagerDetector(),
    private readonly frameworkEngine: FrameworkEngine = new FrameworkEngine(),
  ) {}

  /**
   * Clears the in-memory framework profile cache for a source.
   */
  invalidateCache(sourceId: string): void {
    this.cache.delete(sourceId);
  }

  /**
   * Retrieves the cached framework profile, or analyzes if not yet cached.
   */
  async getFrameworkProfile(projectId: string): Promise<FrameworkProfileDto | null> {
    if (!projectId || typeof projectId !== 'string' || projectId.trim().length === 0) {
      throw new ProjectValidationError('Project ID is required.');
    }

    const project = await this.projectRepository.getProjectById(projectId);
    if (!project) {
      throw new ProjectNotFoundError();
    }

    const source = await this.sourceRepository.getSourceByProjectId(projectId);
    if (!source) {
      return null;
    }

    const cached = this.cache.get(source.id);
    if (cached) {
      return cached;
    }

    if (project.status === 'ACTIVE') {
      return this.refreshFrameworkProfile(projectId);
    }

    return {
      sourceId: source.id,
      primaryEcosystem: null,
      packageManager: null,
      manifests: [],
      frameworks: [],
      dependencies: [],
      directDependencyCount: 0,
      devDependencyCount: 0,
      analyzedAt: new Date().toISOString(),
      warnings: [],
    };
  }

  /**
   * Discovers and parses repository manifests to detect dependencies, package managers, and frameworks.
   */
  async refreshFrameworkProfile(projectId: string): Promise<FrameworkProfileDto> {
    const startTime = performance.now();

    if (!projectId || typeof projectId !== 'string' || projectId.trim().length === 0) {
      throw new ProjectValidationError('Project ID is required.');
    }

    const project = await this.projectRepository.getProjectById(projectId);
    if (!project) {
      throw new ProjectNotFoundError();
    }

    if (project.status === 'ARCHIVED') {
      throw new ProjectArchivedError('Cannot analyze framework profile on an archived project.');
    }

    const source = await this.sourceRepository.getSourceByProjectId(projectId);
    if (!source) {
      throw new SourceNotFoundError();
    }

    getLogger().info('source.framework_analysis_started', {
      projectId,
      sourceId: source.id,
      rootName: source.displayName,
    });

    const structure = await this.structureService.getSourceStructure(projectId);
    const entries = structure ? structure.entries : [];

    // 1. Identify recognized manifest file entries
    const manifestCandidates = entries.filter(e => {
      if (e.kind !== 'FILE') return false;
      return RECOGNIZED_MANIFESTS.some(m => m.filenamePattern.test(e.name));
    });

    const manifestSummaries: ManifestSummaryDto[] = [];
    const allDependencies: DependencyDto[] = [];
    const warnings: string[] = [];
    let discoveredPackageManagerField: string | undefined;

    const boundedManifests = manifestCandidates.slice(0, MAX_DISCOVERED_MANIFESTS);
    if (manifestCandidates.length > MAX_DISCOVERED_MANIFESTS) {
      warnings.push(
        `Discovered ${manifestCandidates.length} manifests. Truncated analysis to first ${MAX_DISCOVERED_MANIFESTS}.`,
      );
    }

    // 2. Safely parse each manifest
    for (const manifestEntry of boundedManifests) {
      const parseResult = await this.manifestParser.parseManifest(
        source.rootPath,
        manifestEntry.relativePath,
      );

      if (parseResult) {
        manifestSummaries.push(parseResult.manifestSummary);
        allDependencies.push(...parseResult.dependencies);
        warnings.push(...parseResult.warnings);
        if (parseResult.packageManagerField && !discoveredPackageManagerField) {
          discoveredPackageManagerField = parseResult.packageManagerField;
        }
      }
    }

    // 3. Detect Package Manager
    const packageManager = this.packageManagerDetector.detect(
      entries,
      discoveredPackageManagerField,
    );

    // 4. Detect Frameworks & Tools
    const frameworks = this.frameworkEngine.detect(allDependencies, entries);

    // 5. Determine Primary Ecosystem
    const ecosystemCounts = new Map<string, number>();
    for (const m of manifestSummaries) {
      ecosystemCounts.set(m.ecosystem, (ecosystemCounts.get(m.ecosystem) ?? 0) + 1);
    }
    let primaryEcosystem: string | null = null;
    let maxEcosystemCount = 0;
    for (const [eco, count] of ecosystemCounts.entries()) {
      if (count > maxEcosystemCount) {
        maxEcosystemCount = count;
        primaryEcosystem = eco;
      }
    }

    const directDependencyCount = allDependencies.filter(d => d.scope === 'RUNTIME').length;
    const devDependencyCount = allDependencies.filter(d => d.scope === 'DEVELOPMENT').length;
    const durationMs = Math.round(performance.now() - startTime);

    const profile: FrameworkProfileDto = {
      sourceId: source.id,
      primaryEcosystem,
      packageManager,
      manifests: manifestSummaries,
      frameworks,
      dependencies: allDependencies,
      directDependencyCount,
      devDependencyCount,
      analyzedAt: new Date().toISOString(),
      warnings,
    };

    this.cache.set(source.id, profile);

    getLogger().info('source.framework_analysis_completed', {
      projectId,
      sourceId: source.id,
      manifestsParsed: manifestSummaries.length,
      frameworksDetected: frameworks.length,
      directDependencies: directDependencyCount,
      devDependencies: devDependencyCount,
      packageManager: packageManager?.name,
      durationMs,
    });

    return profile;
  }
}
