/**
 * @file apps/desktop/src/main/ipc/run-config-handlers.ts
 * IPC handlers for application run configuration and startup candidate discovery.
 */

import {
  projectIdSchema,
  selectRunConfigSchema,
  updateTargetUrlSchema,
  type RunConfigurationProfileDto,
  type ApplicationRunConfigurationDto,
} from '@ai-quality/contracts';
import { RunConfigService } from '@ai-quality/core';

export async function handleGetRunConfigurationProfile(
  rawProjectId: unknown,
  service: RunConfigService = new RunConfigService(),
): Promise<RunConfigurationProfileDto | null> {
  const projectId = projectIdSchema.parse(rawProjectId);
  return await service.getRunConfigurationProfile(projectId);
}

export async function handleDetectRunConfiguration(
  rawProjectId: unknown,
  service: RunConfigService = new RunConfigService(),
): Promise<RunConfigurationProfileDto> {
  const projectId = projectIdSchema.parse(rawProjectId);
  return await service.detectRunConfiguration(projectId);
}

export async function handleSelectRunConfiguration(
  rawInput: unknown,
  service: RunConfigService = new RunConfigService(),
): Promise<ApplicationRunConfigurationDto> {
  const input = selectRunConfigSchema.parse(rawInput);
  return await service.selectCandidate(input.projectId, input.candidateId);
}

export async function handleUpdateTargetUrl(
  rawInput: unknown,
  service: RunConfigService = new RunConfigService(),
): Promise<ApplicationRunConfigurationDto | null> {
  const input = updateTargetUrlSchema.parse(rawInput);
  return await service.updateTargetUrl(input.projectId, input.targetUrl ?? null);
}
