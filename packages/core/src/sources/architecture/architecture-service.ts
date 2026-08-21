/**
 * @file packages/core/src/sources/architecture/architecture-service.ts
 * Privileged orchestration service for application architecture analysis and entry-point discovery.
 */

import fs from 'node:fs';
import type {
  ApplicationArchitectureProfileDto,
  ApplicationKind,
  EntryPointCandidateDto,
  ArchitectureConfidence,
  ArchitectureAnalysisStatus,
  ApplicationKindDetectionDto,
  ApplicationUnitDto,
  StructuralAreaDto,
  ArchitectureSignalDto,
  ModuleHubDto,
} from '@ai-quality/contracts';
import { getLogger } from '../../logging/logger.js';
import { ProjectRepository } from '../../projects/project-repository.js';
import {
  ProjectNotFoundError,
  ProjectArchivedError,
  ProjectValidationError,
} from '../../projects/project-errors.js';
import { SourceRepository } from '../source-repository.js';
import { SourceNotFoundError } from '../source-errors.js';
import { FrameworkProfileService } from '../frameworks/framework-profile-service.js';
import { TechnologyProfileService } from '../technology/technology-profile-service.js';
import { RepositoryIndexRepository } from '../indexing/repository-index-repository.js';
import { EntryPointDetector } from './entry-point-detector.js';
import { StructuralAreaDetector } from './structural-area-detector.js';
import { ArchitectureSignalDetector } from './architecture-signal-detector.js';
import { ModuleHubCalculator } from './module-hub-calculator.js';
import { ApplicationKindDetector } from './application-kind-detector.js';
import { ArchitectureRepository } from './architecture-repository.js';
import { ARCHITECTURE_VERSION } from './architecture-types.js';

export class ArchitectureService {
  private activeAnalyses = new Set<string>();

  constructor(
    private readonly architectureRepository: ArchitectureRepository = new ArchitectureRepository(),
    private readonly sourceRepository: SourceRepository = new SourceRepository(),
    private readonly projectRepository: ProjectRepository = new ProjectRepository(),
    private readonly frameworkService: FrameworkProfileService = new FrameworkProfileService(),
    private readonly technologyService: TechnologyProfileService = new TechnologyProfileService(),
    private readonly indexRepository: RepositoryIndexRepository = new RepositoryIndexRepository(),
    private readonly entryPointDetector: EntryPointDetector = new EntryPointDetector(),
    private readonly structuralAreaDetector: StructuralAreaDetector = new StructuralAreaDetector(),
    private readonly signalDetector: ArchitectureSignalDetector = new ArchitectureSignalDetector(),
    private readonly kindDetector: ApplicationKindDetector = new ApplicationKindDetector(),
  ) {}

  /**
   * Retrieves the architecture profile for a project source, checking for staleness against the latest index run.
   */
  async getArchitectureProfile(
    projectId: string,
  ): Promise<ApplicationArchitectureProfileDto | null> {
    if (!projectId || typeof projectId !== 'string') {
      throw new ProjectValidationError('Project ID is required.');
    }

    const project = await this.projectRepository.getProjectById(projectId);
    if (!project) throw new ProjectNotFoundError();

    const source = await this.sourceRepository.getSourceByProjectId(projectId);
    if (!source) return null;

    const analysis = await this.architectureRepository.getAnalysisBySourceId(source.id);
    if (!analysis) return null;

    const latestIndexRun = await this.indexRepository.getLatestIndexRun(source.id);

    // Staleness check
    let status: ArchitectureAnalysisStatus = analysis.status as ArchitectureAnalysisStatus;
    if (
      latestIndexRun &&
      analysis.indexRunId &&
      (latestIndexRun.id !== analysis.indexRunId || latestIndexRun.status === 'RUNNING')
    ) {
      status = 'STALE';
    }

    const applicationKinds =
      analysis.applicationKindsJson as unknown as readonly ApplicationKindDetectionDto[];
    const applicationUnits =
      analysis.applicationUnitsJson as unknown as readonly ApplicationUnitDto[];
    const entryCandidates =
      analysis.entryCandidatesJson as unknown as readonly EntryPointCandidateDto[];
    const structuralAreas = analysis.structuralAreasJson as unknown as readonly StructuralAreaDto[];
    const architectureSignals = analysis.signalsJson as unknown as readonly ArchitectureSignalDto[];
    const moduleHubs = analysis.moduleHubsJson as unknown as readonly ModuleHubDto[];

    const primaryEntryCandidate =
      entryCandidates.length > 0 && entryCandidates[0]?.confidence === 'HIGH'
        ? entryCandidates[0]
        : null;

    return {
      sourceId: source.id,
      status,
      architectureVersion: analysis.architectureVersion,
      primaryKind: analysis.primaryKind as ApplicationKind,
      confidence: analysis.confidence as ArchitectureConfidence,
      applicationKinds: applicationKinds ?? [],
      applicationUnits: applicationUnits ?? [],
      entryCandidates: entryCandidates ?? [],
      primaryEntryCandidate,
      structuralAreas: structuralAreas ?? [],
      architectureSignals: architectureSignals ?? [],
      moduleHubs: moduleHubs ?? [],
      analyzedAt: analysis.analyzedAt.toISOString(),
      warnings: analysis.warnings,
    };
  }

  /**
   * Analyzes or refreshes the architecture profile from the current repository index and framework evidence.
   */
  async refreshArchitectureProfile(projectId: string): Promise<ApplicationArchitectureProfileDto> {
    if (!projectId || typeof projectId !== 'string') {
      throw new ProjectValidationError('Project ID is required.');
    }

    const project = await this.projectRepository.getProjectById(projectId);
    if (!project) throw new ProjectNotFoundError();

    if (project.status === 'ARCHIVED') {
      throw new ProjectArchivedError('Cannot analyze architecture of an archived project.');
    }

    const source = await this.sourceRepository.getSourceByProjectId(projectId);
    if (!source) throw new SourceNotFoundError();

    if (!fs.existsSync(source.rootPath)) {
      throw new SourceNotFoundError('Source root path is unavailable on disk.');
    }

    // In-flight concurrency lock per project
    if (this.activeAnalyses.has(projectId)) {
      const existing = await this.getArchitectureProfile(projectId);
      if (existing) return existing;
    }

    this.activeAnalyses.add(projectId);
    const startTime = performance.now();

    getLogger().info('repository.architecture_analysis_started', {
      projectId,
      sourceId: source.id,
      rootName: source.displayName,
    });

    try {
      // 1. Get Latest Index Run & Indexed Data
      const latestIndexRun = await this.indexRepository.getLatestIndexRun(source.id);
      const { files: indexedFiles, importEdges } =
        await this.architectureRepository.getIndexedDataForSource(source.id);

      // 2. Get Framework Profile & Technology Profile
      const [frameworkProfile, technologyProfile] = await Promise.all([
        this.frameworkService.getFrameworkProfile(projectId),
        this.technologyService.getTechnologyProfile(projectId),
      ]);

      // 3. Entry-Point Candidate Discovery
      const entryCandidates = this.entryPointDetector.detectCandidates({
        indexedFiles,
        frameworkProfile,
      });

      // 4. Structural Areas Discovery
      const structuralAreas = this.structuralAreaDetector.detectAreas(indexedFiles);

      // 5. Architecture Signals Detection
      const architectureSignals = this.signalDetector.detectSignals(
        structuralAreas,
        frameworkProfile,
      );

      // 6. Module Hubs Calculation
      const moduleHubs = ModuleHubCalculator.calculateHubs(importEdges);

      // 7. Application Kinds & Units Detection
      const { primaryKind, confidence, applicationKinds } = this.kindDetector.detectKinds({
        frameworkProfile,
        technologyProfile,
        structuralAreas,
        entryCandidates,
      });

      const applicationUnits = this.kindDetector.detectApplicationUnits(
        structuralAreas,
        entryCandidates,
        frameworkProfile,
      );

      const warnings: string[] = [];
      if (confidence === 'LOW') {
        warnings.push('Application architecture could not be determined with high confidence.');
      }
      if (entryCandidates.length === 0 && primaryKind !== 'LIBRARY') {
        warnings.push('No standard application entry points were identified.');
      }

      // 8. Persist Analysis Record
      await this.architectureRepository.upsertAnalysis(source.id, {
        indexRunId: latestIndexRun?.id ?? null,
        status: 'CURRENT',
        architectureVersion: ARCHITECTURE_VERSION,
        primaryKind,
        confidence,
        applicationKindsJson:
          applicationKinds as unknown as import('@prisma/client').Prisma.InputJsonValue,
        applicationUnitsJson:
          applicationUnits as unknown as import('@prisma/client').Prisma.InputJsonValue,
        entryCandidatesJson:
          entryCandidates as unknown as import('@prisma/client').Prisma.InputJsonValue,
        structuralAreasJson:
          structuralAreas as unknown as import('@prisma/client').Prisma.InputJsonValue,
        signalsJson:
          architectureSignals as unknown as import('@prisma/client').Prisma.InputJsonValue,
        moduleHubsJson: moduleHubs as unknown as import('@prisma/client').Prisma.InputJsonValue,
        warnings,
      });

      const durationMs = Math.round(performance.now() - startTime);

      getLogger().info('repository.architecture_analysis_completed', {
        projectId,
        sourceId: source.id,
        primaryKind,
        confidence,
        entryCandidatesCount: entryCandidates.length,
        structuralAreasCount: structuralAreas.length,
        signalsCount: architectureSignals.length,
        durationMs,
      });

      const result = await this.getArchitectureProfile(projectId);
      if (!result) {
        throw new Error('Failed to retrieve architecture profile after analysis.');
      }
      return result;
    } catch (error) {
      const durationMs = Math.round(performance.now() - startTime);
      getLogger().error('repository.architecture_analysis_failed', error, {
        projectId,
        sourceId: source.id,
        durationMs,
      });
      throw error;
    } finally {
      this.activeAnalyses.delete(projectId);
    }
  }
}
