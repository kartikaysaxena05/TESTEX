/**
 * @file packages/core/src/sources/run-config/run-config-service.ts
 * Privileged orchestration service for application startup discovery and run configuration management.
 */

import type {
  RunConfigurationProfileDto,
  ApplicationRunConfigurationDto,
  StartupKind,
  RunConfigSafety,
  RunConfigSource,
  RunConfigStatus,
  ArchitectureConfidence,
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
import { ArchitectureService } from '../architecture/architecture-service.js';
import { StartupCandidateDetector } from './startup-candidate-detector.js';
import { RuntimeChecker } from './runtime-checker.js';
import { RunConfigRepository } from './run-config-repository.js';

export class RunConfigService {
  constructor(
    private readonly runConfigRepo: RunConfigRepository = new RunConfigRepository(),
    private readonly sourceRepo: SourceRepository = new SourceRepository(),
    private readonly projectRepo: ProjectRepository = new ProjectRepository(),
    private readonly frameworkService: FrameworkProfileService = new FrameworkProfileService(),
    private readonly architectureService: ArchitectureService = new ArchitectureService(),
    private readonly candidateDetector: StartupCandidateDetector = new StartupCandidateDetector(),
    private readonly runtimeChecker: RuntimeChecker = new RuntimeChecker(),
  ) {}

  /**
   * Retrieves current run configuration profile for a project.
   */
  async getRunConfigurationProfile(projectId: string): Promise<RunConfigurationProfileDto | null> {
    if (!projectId || typeof projectId !== 'string') {
      throw new ProjectValidationError('Project ID is required.');
    }

    const project = await this.projectRepo.getProjectById(projectId);
    if (!project) throw new ProjectNotFoundError();

    const source = await this.sourceRepo.getSourceByProjectId(projectId);
    if (!source) return null;

    const selectedRecord = await this.runConfigRepo.getSelectedConfiguration(source.id);
    const configs = await this.runConfigRepo.getConfigurationsForSource(source.id);

    // If no configs detected yet, run detection
    if (configs.length === 0) {
      return await this.detectRunConfiguration(projectId);
    }

    const [frameworkProfile, architectureProfile] = await Promise.all([
      this.frameworkService.getFrameworkProfile(projectId),
      this.architectureService.getArchitectureProfile(projectId),
    ]);

    const candidates = this.candidateDetector.detectCandidates({
      frameworkProfile,
      architectureProfile,
    });

    const relevantRuntimes = ['node', 'npm', 'pnpm', 'yarn', 'python3', 'python', 'go', 'cargo'];
    const runtimes = await this.runtimeChecker.checkCommonRuntimes(relevantRuntimes);

    const selectedConfiguration: ApplicationRunConfigurationDto | null = selectedRecord
      ? {
          id: selectedRecord.id,
          sourceId: selectedRecord.sourceId,
          applicationUnitRoot: selectedRecord.applicationUnitRoot,
          runtime: selectedRecord.runtime,
          packageManager: selectedRecord.packageManager,
          startupKind: selectedRecord.startupKind as StartupKind,
          executable: selectedRecord.executable,
          args: selectedRecord.args,
          workingDirectory: selectedRecord.workingDirectory,
          targetUrl: selectedRecord.targetUrl,
          environmentVariableNames: selectedRecord.environmentVariableNames,
          confidence: selectedRecord.confidence as ArchitectureConfidence,
          safety: selectedRecord.safety as RunConfigSafety,
          source: selectedRecord.source as RunConfigSource,
          status: selectedRecord.status as RunConfigStatus,
          isSelected: selectedRecord.isSelected,
          createdAt: selectedRecord.createdAt.toISOString(),
          updatedAt: selectedRecord.updatedAt.toISOString(),
        }
      : null;

    return {
      sourceId: source.id,
      selectedConfiguration,
      candidates,
      runtimes,
      targetUrl: selectedConfiguration?.targetUrl ?? null,
      targetUrlSource: selectedConfiguration?.targetUrl ? 'USER_CONFIGURED' : 'UNKNOWN',
      analyzedAt: new Date().toISOString(),
      warnings: [],
    };
  }

  /**
   * Detects startup candidates, checks runtime availability, and persists initial detected configuration.
   */
  async detectRunConfiguration(projectId: string): Promise<RunConfigurationProfileDto> {
    if (!projectId || typeof projectId !== 'string') {
      throw new ProjectValidationError('Project ID is required.');
    }

    const project = await this.projectRepo.getProjectById(projectId);
    if (!project) throw new ProjectNotFoundError();

    if (project.status === 'ARCHIVED') {
      throw new ProjectArchivedError('Cannot detect run configuration on an archived project.');
    }

    const source = await this.sourceRepo.getSourceByProjectId(projectId);
    if (!source) throw new SourceNotFoundError();

    const [frameworkProfile, architectureProfile] = await Promise.all([
      this.frameworkService.getFrameworkProfile(projectId),
      this.architectureService.getArchitectureProfile(projectId),
    ]);

    const candidates = this.candidateDetector.detectCandidates({
      frameworkProfile,
      architectureProfile,
    });

    const relevantRuntimes = ['node', 'npm', 'pnpm', 'yarn', 'python3', 'python', 'go', 'cargo'];
    const runtimes = await this.runtimeChecker.checkCommonRuntimes(relevantRuntimes);

    let selectedConfigRecord = await this.runConfigRepo.getSelectedConfiguration(source.id);

    // If no active selection and candidates exist, auto-select top candidate as default
    if (!selectedConfigRecord && candidates.length > 0) {
      const top = candidates[0]!;
      selectedConfigRecord = await this.runConfigRepo.upsertConfiguration(source.id, {
        applicationUnitRoot: top.applicationUnitRoot,
        runtime: top.runtime,
        packageManager: top.packageManager,
        startupKind: top.startupKind,
        executable: top.executable,
        args: [...top.args],
        workingDirectory: top.workingDirectory,
        targetUrl: null,
        environmentVariableNames: [],
        confidence: top.confidence,
        safety: top.safety,
        source: 'DETECTED',
        status: top.safety === 'SAFE_STRUCTURE' ? 'CONFIGURED' : 'NEEDS_REVIEW',
        isSelected: true,
        evidenceJson: top.evidence as unknown as import('@prisma/client').Prisma.InputJsonValue,
      });
    }

    const selectedConfiguration: ApplicationRunConfigurationDto | null = selectedConfigRecord
      ? {
          id: selectedConfigRecord.id,
          sourceId: selectedConfigRecord.sourceId,
          applicationUnitRoot: selectedConfigRecord.applicationUnitRoot,
          runtime: selectedConfigRecord.runtime,
          packageManager: selectedConfigRecord.packageManager,
          startupKind: selectedConfigRecord.startupKind as StartupKind,
          executable: selectedConfigRecord.executable,
          args: selectedConfigRecord.args,
          workingDirectory: selectedConfigRecord.workingDirectory,
          targetUrl: selectedConfigRecord.targetUrl,
          environmentVariableNames: selectedConfigRecord.environmentVariableNames,
          confidence: selectedConfigRecord.confidence as ArchitectureConfidence,
          safety: selectedConfigRecord.safety as RunConfigSafety,
          source: selectedConfigRecord.source as RunConfigSource,
          status: selectedConfigRecord.status as RunConfigStatus,
          isSelected: selectedConfigRecord.isSelected,
          createdAt: selectedConfigRecord.createdAt.toISOString(),
          updatedAt: selectedConfigRecord.updatedAt.toISOString(),
        }
      : null;

    getLogger().info('run_config.candidates_detected', {
      projectId,
      sourceId: source.id,
      candidatesCount: candidates.length,
      selectedExecutable: selectedConfiguration?.executable ?? null,
    });

    return {
      sourceId: source.id,
      selectedConfiguration,
      candidates,
      runtimes,
      targetUrl: selectedConfiguration?.targetUrl ?? null,
      targetUrlSource: selectedConfiguration?.targetUrl ? 'USER_CONFIGURED' : 'UNKNOWN',
      analyzedAt: new Date().toISOString(),
      warnings: [],
    };
  }

  /**
   * Selects a candidate as the active run configuration.
   */
  async selectCandidate(
    projectId: string,
    candidateId: string,
  ): Promise<ApplicationRunConfigurationDto> {
    const profile = await this.detectRunConfiguration(projectId);
    const candidate = profile.candidates.find(c => c.id === candidateId);
    if (!candidate) {
      throw new ProjectValidationError(
        `Candidate "${candidateId}" not found in detected startup candidates.`,
      );
    }

    const source = await this.sourceRepo.getSourceByProjectId(projectId);
    if (!source) throw new SourceNotFoundError();

    const saved = await this.runConfigRepo.upsertConfiguration(source.id, {
      applicationUnitRoot: candidate.applicationUnitRoot,
      runtime: candidate.runtime,
      packageManager: candidate.packageManager,
      startupKind: candidate.startupKind,
      executable: candidate.executable,
      args: [...candidate.args],
      workingDirectory: candidate.workingDirectory,
      targetUrl: profile.targetUrl,
      environmentVariableNames: [],
      confidence: candidate.confidence,
      safety: candidate.safety,
      source: 'USER_SELECTED',
      status: 'CONFIGURED',
      isSelected: true,
      evidenceJson: candidate.evidence as unknown as import('@prisma/client').Prisma.InputJsonValue,
    });

    getLogger().info('run_config.selected', {
      projectId,
      sourceId: source.id,
      configId: saved.id,
      executable: saved.executable,
    });

    return {
      id: saved.id,
      sourceId: saved.sourceId,
      applicationUnitRoot: saved.applicationUnitRoot,
      runtime: saved.runtime,
      packageManager: saved.packageManager,
      startupKind: saved.startupKind as StartupKind,
      executable: saved.executable,
      args: saved.args,
      workingDirectory: saved.workingDirectory,
      targetUrl: saved.targetUrl,
      environmentVariableNames: saved.environmentVariableNames,
      confidence: saved.confidence as ArchitectureConfidence,
      safety: saved.safety as RunConfigSafety,
      source: saved.source as RunConfigSource,
      status: saved.status as RunConfigStatus,
      isSelected: saved.isSelected,
      createdAt: saved.createdAt.toISOString(),
      updatedAt: saved.updatedAt.toISOString(),
    };
  }

  /**
   * Updates user-specified target URL (validating http/https).
   */
  async updateTargetUrl(
    projectId: string,
    targetUrl: string | null,
  ): Promise<ApplicationRunConfigurationDto | null> {
    if (targetUrl) {
      let parsed: URL;
      try {
        parsed = new URL(targetUrl);
      } catch {
        throw new ProjectValidationError('Target URL must be a valid URL format.');
      }

      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        throw new ProjectValidationError('Target URL scheme must be http: or https:.');
      }

      if (parsed.username || parsed.password) {
        throw new ProjectValidationError('Target URL must not contain embedded user credentials.');
      }
    }

    const source = await this.sourceRepo.getSourceByProjectId(projectId);
    if (!source) throw new SourceNotFoundError();

    let selected = await this.runConfigRepo.getSelectedConfiguration(source.id);
    if (!selected) {
      // Auto-detect first
      await this.detectRunConfiguration(projectId);
      selected = await this.runConfigRepo.getSelectedConfiguration(source.id);
    }

    if (!selected) return null;

    const updated = await this.runConfigRepo.updateTargetUrl(source.id, targetUrl);
    if (!updated) return null;

    getLogger().info('run_config.target_url_updated', {
      projectId,
      sourceId: source.id,
      targetUrl: updated.targetUrl,
    });

    return {
      id: updated.id,
      sourceId: updated.sourceId,
      applicationUnitRoot: updated.applicationUnitRoot,
      runtime: updated.runtime,
      packageManager: updated.packageManager,
      startupKind: updated.startupKind as StartupKind,
      executable: updated.executable,
      args: updated.args,
      workingDirectory: updated.workingDirectory,
      targetUrl: updated.targetUrl,
      environmentVariableNames: updated.environmentVariableNames,
      confidence: updated.confidence as ArchitectureConfidence,
      safety: updated.safety as RunConfigSafety,
      source: updated.source as RunConfigSource,
      status: updated.status as RunConfigStatus,
      isSelected: updated.isSelected,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    };
  }
}
