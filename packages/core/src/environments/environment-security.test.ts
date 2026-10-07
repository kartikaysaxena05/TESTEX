/**
 * @file packages/core/src/environments/environment-security.test.ts
 * Security isolation and boundary tests for Target Applications and Environments.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { getPrismaClient } from '../database/index.js';
import { EnvironmentConfigurationService } from './environment-configuration-service.js';
import { EnvironmentProjectMismatchError } from './environment-errors.js';

describe('Environment Configuration Security & Isolation Tests', () => {
  const prisma = getPrismaClient()!;
  const envService = new EnvironmentConfigurationService(prisma);

  let projectAId: string;
  let projectBId: string;
  let envAId: string;

  before(async () => {
    const projA = await prisma.project.create({
      data: { name: 'Security Project Alpha', status: 'ACTIVE' },
    });
    projectAId = projA.id;

    const projB = await prisma.project.create({
      data: { name: 'Security Project Beta', status: 'ACTIVE' },
    });
    projectBId = projB.id;

    const envA = await envService.createEnvironment({
      projectId: projectAId,
      name: 'Alpha Target',
      type: 'DEVELOPMENT',
      baseUrl: 'http://localhost:4000',
    });
    envAId = envA.id;
  });

  after(async () => {
    await prisma.projectEnvironment.deleteMany({
      where: { projectId: { in: [projectAId, projectBId] } },
    });
    await prisma.targetApplication.deleteMany({
      where: { projectId: { in: [projectAId, projectBId] } },
    });
    await prisma.project.deleteMany({
      where: { id: { in: [projectAId, projectBId] } },
    });
  });

  describe('Cross-Project Access Protection', () => {
    it('should reject getEnvironment when project ID does not match ownership', async () => {
      await assert.rejects(
        () => envService.getEnvironment({ projectId: projectBId, environmentId: envAId }),
        (err: unknown) =>
          err instanceof EnvironmentProjectMismatchError &&
          err.code === 'ENVIRONMENT_PROJECT_MISMATCH',
      );
    });

    it('should reject updateEnvironment across project boundaries', async () => {
      await assert.rejects(
        () =>
          envService.updateEnvironment({
            projectId: projectBId,
            environmentId: envAId,
            name: 'Hijacked Env',
          }),
        (err: unknown) =>
          err instanceof EnvironmentProjectMismatchError &&
          err.code === 'ENVIRONMENT_PROJECT_MISMATCH',
      );
    });

    it('should reject deleteEnvironment across project boundaries', async () => {
      await assert.rejects(
        () =>
          envService.deleteEnvironment({
            projectId: projectBId,
            environmentId: envAId,
          }),
        (err: unknown) =>
          err instanceof EnvironmentProjectMismatchError &&
          err.code === 'ENVIRONMENT_PROJECT_MISMATCH',
      );
    });

    it('should reject setDefaultEnvironment across project boundaries', async () => {
      await assert.rejects(
        () =>
          envService.setDefaultEnvironment({
            projectId: projectBId,
            environmentId: envAId,
          }),
        (err: unknown) =>
          err instanceof EnvironmentProjectMismatchError &&
          err.code === 'ENVIRONMENT_PROJECT_MISMATCH',
      );
    });

    it('should reject resolveSnapshot across project boundaries', async () => {
      await assert.rejects(
        () =>
          envService.resolveSnapshot({
            projectId: projectBId,
            environmentId: envAId,
          }),
        (err: unknown) =>
          err instanceof EnvironmentProjectMismatchError &&
          err.code === 'ENVIRONMENT_PROJECT_MISMATCH',
      );
    });
  });

  describe('Production Safeguard Policy Verification', () => {
    it('should enforce production classification and policy retention', async () => {
      const prodEnv = await envService.createEnvironment({
        projectId: projectAId,
        name: 'Alpha Production',
        type: 'PRODUCTION',
        baseUrl: 'https://alpha-prod.example.com',
        isProduction: true,
        productionSafetyPolicy: 'MANUAL_APPROVAL_REQUIRED',
      });

      assert.equal(prodEnv.isProduction, true);
      assert.equal(prodEnv.productionSafetyPolicy, 'MANUAL_APPROVAL_REQUIRED');

      const snapshot = await envService.resolveSnapshot({
        projectId: projectAId,
        environmentId: prodEnv.id,
      });

      assert.equal(snapshot.isProduction, true);
      assert.equal(snapshot.productionSafetyPolicy, 'MANUAL_APPROVAL_REQUIRED');
    });
  });
});
