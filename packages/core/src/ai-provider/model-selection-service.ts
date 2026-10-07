/**
 * @file packages/core/src/ai-provider/model-selection-service.ts
 * Deterministic model selection and capability ranking engine for V9 Phase 129.
 * Evaluates candidate models against task capability requirements, context constraints,
 * user preferences, and verified probe confidences with database persistence.
 */

import type { PrismaClient } from '@prisma/client';
import type {
  AiModelDto,
  ModelCapabilityType,
  ModelCapabilitiesProfileDto,
  ModelCapabilitiesMap,
  ModelSelectionTask,
  ModelSelectionType,
  ModelSelectionConstraintsDto,
  ModelSelectionResultDto,
  SelectModelInputDto,
  GetModelSelectionInputDto,
  ResolveModelForTaskInputDto,
} from '@ai-quality/contracts';
import { getPrismaClient } from '../database/client.js';
import {
  AiNoCompatibleModelError,
  AiModelNotFoundError,
  AiCrossProjectAccessError,
  AiInvalidRequestError,
  AiSelectionInvalidError,
} from './ai-provider-errors.js';
import { CapabilityDetectionService } from './capability-detection-service.js';
import { getLogger, type ILogger } from '../logging/index.js';

export interface ModelSelectionServiceOptions {
  readonly prisma?: PrismaClient;
  readonly capabilityService?: CapabilityDetectionService;
  readonly logger?: ILogger;
}

interface RankedModelCandidate {
  readonly model: AiModelDto;
  readonly profile: ModelCapabilitiesProfileDto;
  readonly score: number;
  readonly reasons: readonly string[];
}

export class ModelSelectionService {
  private readonly prisma: PrismaClient;
  private readonly capabilityService: CapabilityDetectionService;
  private readonly logger: ILogger;

  // Task-to-Required-Capabilities mapping invariant
  private static readonly TASK_REQUIRED_CAPABILITIES: Record<
    ModelSelectionTask,
    readonly ModelCapabilityType[]
  > = {
    chat: ['CHAT', 'TEXT_GENERATION'],
    code: ['TEXT_GENERATION', 'CODE_GENERATION', 'CODE_ANALYSIS'],
    'structured-output': ['TEXT_GENERATION', 'STRUCTURED_OUTPUT', 'JSON_OUTPUT'],
    'tool-calling': ['TEXT_GENERATION', 'TOOL_CALLING'],
    vision: ['TEXT_GENERATION', 'VISION'],
    'long-context': ['TEXT_GENERATION', 'LONG_CONTEXT'],
    default: ['TEXT_GENERATION'],
  };

  // Task-to-SelectionType mapping
  private static readonly TASK_TO_SELECTION_TYPE: Record<
    ModelSelectionTask,
    ModelSelectionType
  > = {
    chat: 'CHAT',
    code: 'CODE',
    'structured-output': 'STRUCTURED_OUTPUT',
    'tool-calling': 'TOOL_CALLING',
    vision: 'VISION',
    'long-context': 'DEFAULT',
    default: 'DEFAULT',
  };

  constructor(options?: ModelSelectionServiceOptions) {
    this.prisma = options?.prisma ?? getPrismaClient()!;
    this.capabilityService =
      options?.capabilityService ?? new CapabilityDetectionService();
    this.logger = options?.logger ?? getLogger();
  }

  /**
   * Maps a high-level task to its corresponding selection type.
   */
  public getSelectionTypeForTask(task: ModelSelectionTask): ModelSelectionType {
    return ModelSelectionService.TASK_TO_SELECTION_TYPE[task] ?? 'DEFAULT';
  }

  /**
   * Resolves the required capability list for a task, merged with any explicit constraints.
   */
  public getRequiredCapabilitiesForTask(
    task: ModelSelectionTask,
    extraCapabilities?: readonly ModelCapabilityType[],
  ): readonly ModelCapabilityType[] {
    const base = ModelSelectionService.TASK_REQUIRED_CAPABILITIES[task] ?? ['TEXT_GENERATION'];
    if (!extraCapabilities || extraCapabilities.length === 0) {
      return base;
    }
    const set = new Set<ModelCapabilityType>([...base, ...extraCapabilities]);
    return Array.from(set);
  }

  /**
   * Core selection engine: selects the optimal model from a list of discovered candidate models.
   * Deterministic, explainable, and returns structured errors when no model satisfies constraints.
   */
  public selectBestModel(
    models: readonly AiModelDto[],
    task: ModelSelectionTask,
    constraints?: ModelSelectionConstraintsDto,
    persistentSelection?: {
      modelId: string;
      providerId: string;
      selectionType: string;
    } | null,
  ): ModelSelectionResultDto {
    if (!models || models.length === 0) {
      throw new AiNoCompatibleModelError(task, this.getRequiredCapabilitiesForTask(task, constraints?.requiredCapabilities), 'No candidate models available for selection.');
    }

    const requiredCaps = this.getRequiredCapabilitiesForTask(
      task,
      constraints?.requiredCapabilities,
    );

    const eligibleCandidates: RankedModelCandidate[] = [];
    const missingCapsCounter = new Map<ModelCapabilityType, number>();

    for (const model of models) {
      const profile = this.capabilityService.getCapabilityProfile(model);

      // Check context constraint
      if (
        constraints?.minimumContext &&
        typeof model.contextLength === 'number' &&
        model.contextLength < constraints.minimumContext
      ) {
        continue;
      }

      // Check required capabilities (every required capability must be explicitly SUPPORTED)
      let meetsAllCapabilities = true;
      for (const cap of requiredCaps) {
        const detail = profile.capabilities[cap];
        if (!detail || detail.status !== 'SUPPORTED') {
          meetsAllCapabilities = false;
          missingCapsCounter.set(cap, (missingCapsCounter.get(cap) ?? 0) + 1);
        }
      }

      if (!meetsAllCapabilities) {
        continue;
      }

      // Compute deterministic score
      let score = 100;
      const reasons: string[] = [`Matches required capabilities (${requiredCaps.join(', ')})`];

      // Persistent project selection bonus
      if (persistentSelection && persistentSelection.modelId === model.id) {
        score += 1000;
        reasons.push(`Active saved selection for ${persistentSelection.selectionType}`);
      }

      // Preferred model constraint bonus
      if (constraints?.preferredModel && constraints.preferredModel === model.id) {
        score += 750;
        reasons.push(`Explicitly requested preferred model '${model.id}'`);
      }

      // Preferred provider constraint bonus
      if (
        constraints?.preferredProvider &&
        constraints.preferredProvider.toUpperCase() === model.provider.toUpperCase()
      ) {
        score += 250;
        reasons.push(`Matches preferred provider '${model.provider}'`);
      }

      // Verified probe confidence bonuses
      let probeBonus = 0;
      for (const cap of requiredCaps) {
        const detail = profile.capabilities[cap];
        if (detail?.source === 'PROBE') {
          probeBonus += 50;
        }
      }
      if (probeBonus > 0) {
        score += probeBonus;
        reasons.push(`Verified capabilities via runtime probes (+${probeBonus} pts)`);
      }

      // Context window capacity bonus
      if (typeof model.contextLength === 'number' && model.contextLength > 0) {
        const contextBonus = Math.min(Math.floor(model.contextLength / 1000), 100);
        score += contextBonus;
        reasons.push(`Context capacity ${model.contextLength} tokens (+${contextBonus} pts)`);
      }

      // Parameter size heuristic tier bonus
      const paramSize = (model.parameters || '').toLowerCase();
      if (paramSize.includes('70b') || paramSize.includes('72b')) {
        score += 50;
      } else if (paramSize.includes('32b') || paramSize.includes('34b')) {
        score += 40;
      } else if (paramSize.includes('13b') || paramSize.includes('14b')) {
        score += 30;
      } else if (paramSize.includes('7b') || paramSize.includes('8b')) {
        score += 20;
      } else if (paramSize.includes('3b')) {
        score += 10;
      }

      eligibleCandidates.push({
        model,
        profile,
        score,
        reasons,
      });
    }

    if (eligibleCandidates.length === 0) {
      // Find which required capabilities were missing across candidate models
      const missingList: ModelCapabilityType[] = [];
      for (const cap of requiredCaps) {
        if ((missingCapsCounter.get(cap) ?? 0) > 0 || missingCapsCounter.size === 0) {
          missingList.push(cap);
        }
      }

      this.logger.warn('model_selection.no_compatible_model', {
        task,
        requiredCapabilities: requiredCaps,
        missingCapabilities: missingList,
        candidateCount: models.length,
      });

      throw new AiNoCompatibleModelError(task, missingList.length > 0 ? missingList : requiredCaps);
    }

    // Sort deterministically: highest score first; tie-break alphabetically by model ID
    eligibleCandidates.sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      return a.model.id.localeCompare(b.model.id);
    });

    const best = eligibleCandidates[0]!;
    const selectionType = this.getSelectionTypeForTask(task);
    const selectionReason = best.reasons.join('; ');

    return {
      selectedModel: best.model,
      provider: best.model.provider,
      task,
      selectionType,
      capabilities: best.profile.capabilities,
      selectionReason,
      isPersistent: Boolean(persistentSelection && persistentSelection.modelId === best.model.id),
      lastVerifiedAt: best.profile.verifiedAt,
    };
  }

  /**
   * Persists a user's model selection choice for a specific project and selection type.
   */
  public async selectModel(
    input: SelectModelInputDto,
    candidateModels: readonly AiModelDto[],
    userId: string,
  ): Promise<ModelSelectionResultDto> {
    if (!input.modelId || !input.modelId.trim()) {
      throw new AiSelectionInvalidError('Model ID is required.');
    }

    if (input.projectId) {
      await this.assertProjectAccess(input.projectId, userId);
    }

    const cleanModelId = input.modelId.trim();
    const foundModel = candidateModels.find(
      (m) =>
        m.id === cleanModelId ||
        m.name === cleanModelId ||
        m.id.endsWith(`:${cleanModelId}`),
    );

    if (!foundModel) {
      throw new AiModelNotFoundError(cleanModelId, input.providerId ?? 'OLLAMA');
    }

    const selectionType: ModelSelectionType = input.selectionType ?? 'DEFAULT';
    const profile = this.capabilityService.getCapabilityProfile(foundModel);

    // Persist to database
    const whereClause = input.projectId
      ? { projectId: input.projectId, selectionType }
      : { projectId: null, selectionType };

    // Find existing
    const existing = await this.prisma.aiModelSelection.findFirst({
      where: input.projectId
        ? { projectId: input.projectId, selectionType }
        : { projectId: null, userId, selectionType },
    });

    const now = new Date();
    if (existing) {
      await this.prisma.aiModelSelection.update({
        where: { id: existing.id },
        data: {
          providerId: foundModel.provider,
          modelId: foundModel.id,
          capabilitySnapshot: profile.capabilities as unknown as object,
          lastVerifiedAt: profile.verifiedAt ? new Date(profile.verifiedAt) : null,
          updatedAt: now,
        },
      });
    } else {
      await this.prisma.aiModelSelection.create({
        data: {
          projectId: input.projectId ?? null,
          userId,
          providerId: foundModel.provider,
          modelId: foundModel.id,
          selectionType,
          capabilitySnapshot: profile.capabilities as unknown as object,
          lastVerifiedAt: profile.verifiedAt ? new Date(profile.verifiedAt) : null,
          createdAt: now,
          updatedAt: now,
        },
      });
    }

    this.logger.info('ai_model_selection.saved', {
      userId,
      projectId: input.projectId,
      providerId: foundModel.provider,
      modelId: foundModel.id,
      selectionType,
    });

    return {
      selectedModel: foundModel,
      provider: foundModel.provider,
      task: 'default',
      selectionType,
      capabilities: profile.capabilities,
      selectionReason: `Explicitly saved user selection for ${selectionType}`,
      isPersistent: true,
      lastVerifiedAt: profile.verifiedAt,
    };
  }

  /**
   * Retrieves an active persistent model selection for a project.
   */
  public async getModelSelection(
    input: GetModelSelectionInputDto,
    candidateModels: readonly AiModelDto[],
    userId?: string,
  ): Promise<ModelSelectionResultDto | null> {
    if (input.projectId && userId) {
      await this.assertProjectAccess(input.projectId, userId);
    }

    const selectionType: ModelSelectionType = input.selectionType ?? 'DEFAULT';

    let record = null;
    if (input.projectId) {
      record = await this.prisma.aiModelSelection.findFirst({
        where: { projectId: input.projectId, selectionType },
      });
    }

    if (!record && userId) {
      record = await this.prisma.aiModelSelection.findFirst({
        where: { projectId: null, userId, selectionType },
      });
    }

    if (!record) {
      return null;
    }

    const foundModel = candidateModels.find(
      (m) => m.id === record.modelId || m.name === record.modelId,
    );

    if (!foundModel) {
      return null;
    }

    const profile = this.capabilityService.getCapabilityProfile(foundModel);

    return {
      selectedModel: foundModel,
      provider: record.providerId,
      task: 'default',
      selectionType,
      capabilities: (record.capabilitySnapshot as unknown as ModelCapabilitiesMap) ?? profile.capabilities,
      selectionReason: `Persisted selection for ${selectionType}`,
      isPersistent: true,
      lastVerifiedAt: record.lastVerifiedAt ? record.lastVerifiedAt.toISOString() : profile.verifiedAt,
    };
  }

  /**
   * Resolves the optimal model for a given task, respecting persistent project selections.
   */
  public async resolveModelForTask(
    input: ResolveModelForTaskInputDto,
    candidateModels: readonly AiModelDto[],
    userId?: string,
  ): Promise<ModelSelectionResultDto> {
    if (input.projectId && userId) {
      await this.assertProjectAccess(input.projectId, userId);
    }

    const selectionType = this.getSelectionTypeForTask(input.task);

    // Look for persistent task-specific selection or DEFAULT selection
    let persistentRecord = null;
    if (input.projectId) {
      persistentRecord = await this.prisma.aiModelSelection.findFirst({
        where: {
          projectId: input.projectId,
          selectionType: { in: [selectionType, 'DEFAULT'] },
        },
        orderBy: { updatedAt: 'desc' },
      });
    }

    if (!persistentRecord && userId) {
      persistentRecord = await this.prisma.aiModelSelection.findFirst({
        where: {
          projectId: null,
          userId,
          selectionType: { in: [selectionType, 'DEFAULT'] },
        },
        orderBy: { updatedAt: 'desc' },
      });
    }

    const persistentSelection = persistentRecord
      ? {
          modelId: persistentRecord.modelId,
          providerId: persistentRecord.providerId,
          selectionType: persistentRecord.selectionType,
        }
      : null;

    return this.selectBestModel(
      candidateModels,
      input.task,
      input.constraints,
      persistentSelection,
    );
  }

  /**
   * Enforces project tenant isolation: verifies project exists and belongs to the given user.
   */
  private async assertProjectAccess(projectId: string, userId: string): Promise<void> {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, userId: true },
    });

    if (!project) {
      throw new AiInvalidRequestError(`Project with ID '${projectId}' was not found.`);
    }

    if (project.userId && project.userId !== userId) {
      this.logger.warn('model_selection.cross_project_violation', {
        projectId,
        projectOwnerId: project.userId,
        requestUserId: userId,
      });
      throw new AiCrossProjectAccessError(
        `User '${userId}' does not have permission to access AI model selections for project '${projectId}'.`,
      );
    }
  }
}
