/**
 * @file packages/core/src/environments/environment-configuration-service.test.ts
 * Integration tests for EnvironmentConfigurationService and TargetApplicationService.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { getPrismaClient } from '../database/index.js';
import { EnvironmentConfigurationService } from './environment-configuration-service.js';
import { TargetApplicationService } from './target-application-service.js';
import { EnvironmentDisabledError, InvalidBaseUrlError } from './environment-errors.js';

describe('EnvironmentConfigurationService Integration Tests', () => {
  const prisma = getPrismaClient()!;
  const envService = new EnvironmentConfigurationService(prisma);
  const targetAppService = new TargetApplicationService(prisma);

  let projectId: string;

  before(async () => {
    const proj = await prisma.project.create({
      data: { name: 'Phase 59 Test Project', status: 'ACTIVE' },
    });
    projectId = proj.id;
  });

  after(async () => {
    await prisma.projectEnvironment.deleteMany({ where: { projectId } });
    await prisma.targetApplication.deleteMany({ where: { projectId } });
    await prisma.project.delete({ where: { id: projectId } });
  });

  describe('Target Application Management', () => {
    it('should lazily initialize a target application for a project', async () => {
      const targetApp = await targetAppService.getTargetApplication(projectId);
      assert.ok(targetApp);
      assert.equal(targetApp.projectId, projectId);
      assert.equal(targetApp.name, 'Phase 59 Test Project');
    });

    it('should update target application metadata', async () => {
      const updated = await targetAppService.updateTargetApplication({
        projectId,
        name: 'Updated Web Platform',
        description: 'Primary customer-facing portal',
      });

      assert.equal(updated.name, 'Updated Web Platform');
      assert.equal(updated.description, 'Primary customer-facing portal');
    });
  });

  describe('Environment CRUD & Default Transaction Invariant', () => {
    let env1Id: string;
    let env2Id: string;

    it('should create first environment and atomically mark it as default', async () => {
      const created = await envService.createEnvironment({
        projectId,
        name: 'Local Dev',
        type: 'LOCAL',
        baseUrl: 'http://localhost:3000/',
        browserEngine: 'chromium',
        headless: true,
        viewportWidth: 1280,
        viewportHeight: 720,
      });

      assert.ok(created.id);
      assert.equal(created.name, 'Local Dev');
      assert.equal(created.type, 'LOCAL');
      assert.equal(created.baseUrl, 'http://localhost:3000'); // Trailing slash stripped
      assert.equal(created.isDefault, true);
      assert.equal(created.isEnabled, true);
      assert.equal(created.isProduction, false);

      env1Id = created.id;
    });

    it('should create second environment as non-default by default', async () => {
      const created = await envService.createEnvironment({
        projectId,
        name: 'Staging Environment',
        type: 'STAGING',
        baseUrl: 'https://staging.example.com',
        browserEngine: 'firefox',
        isDefault: false,
      });

      assert.equal(created.isDefault, false);
      assert.equal(created.browserEngine, 'firefox');
      env2Id = created.id;

      // Verify first environment is still default
      const env1 = await envService.getEnvironment({ projectId, environmentId: env1Id });
      assert.equal(env1?.isDefault, true);
    });

    it('should atomically switch default environment using transaction', async () => {
      const updated = await envService.setDefaultEnvironment({
        projectId,
        environmentId: env2Id,
      });

      assert.equal(updated.isDefault, true);

      // Verify previous default was atomically reset to false
      const env1 = await envService.getEnvironment({ projectId, environmentId: env1Id });
      assert.equal(env1?.isDefault, false);
    });

    it('should filter disabled environments when includeDisabled is false', async () => {
      // Disable env1
      await envService.updateEnvironment({
        projectId,
        environmentId: env1Id,
        isEnabled: false,
      });

      const enabledOnly = await envService.listEnvironments({
        projectId,
        includeDisabled: false,
      });
      assert.equal(enabledOnly.length, 1);
      assert.equal(enabledOnly[0]?.id, env2Id);

      const allEnvs = await envService.listEnvironments({
        projectId,
        includeDisabled: true,
      });
      assert.equal(allEnvs.length, 2);
    });
  });

  describe('Execution Snapshot Resolution & SHA-256 Hashing', () => {
    let activeEnvId: string;

    before(async () => {
      const env = await envService.createEnvironment({
        projectId,
        name: 'QA Execution Target',
        type: 'QA',
        baseUrl: 'https://qa.example.com',
        browserEngine: 'chromium',
        headless: true,
        viewportWidth: 1920,
        viewportHeight: 1080,
        locale: 'en-US',
        timezoneId: 'America/New_York',
        colorScheme: 'dark',
        ignoreHttpsErrors: true,
        permissions: ['geolocation'],
        extraHeaders: { 'X-Custom-Auth': 'token123' },
        variables: { API_VERSION: 'v2' },
        secretReferences: [
          {
            key: 'AUTH_SECRET',
            secretRef: 'QA_OAUTH_TOKEN',
            description: 'OAuth bearer token',
          },
        ],
        isDefault: true,
      });
      activeEnvId = env.id;
    });

    it('should resolve an immutable execution snapshot with deterministic hash', async () => {
      const snapshot = await envService.resolveSnapshot({
        projectId,
        environmentId: activeEnvId,
      });

      assert.equal(snapshot.environmentId, activeEnvId);
      assert.equal(snapshot.projectId, projectId);
      assert.equal(snapshot.environmentType, 'QA');
      assert.equal(snapshot.baseUrl, 'https://qa.example.com');
      assert.equal(snapshot.browserEngine, 'chromium');
      assert.equal(snapshot.viewportWidth, 1920);
      assert.equal(snapshot.viewportHeight, 1080);
      assert.equal(snapshot.locale, 'en-US');
      assert.equal(snapshot.timezoneId, 'America/New_York');
      assert.equal(snapshot.colorScheme, 'dark');
      assert.equal(snapshot.ignoreHttpsErrors, true);
      assert.deepEqual(snapshot.permissions, ['geolocation']);
      assert.equal(snapshot.variables?.API_VERSION, 'v2');
      assert.equal(snapshot.secretReferences?.length, 1);
      assert.ok(snapshot.configurationHash);
      assert.equal(snapshot.configurationHash.length, 64); // SHA-256 hex string
    });

    it('should resolve default environment when no environmentId is provided', async () => {
      const snapshot = await envService.resolveSnapshot({ projectId });
      assert.equal(snapshot.environmentId, activeEnvId);
      assert.equal(snapshot.baseUrl, 'https://qa.example.com');
    });

    it('should reject snapshot resolution for disabled environments', async () => {
      await envService.updateEnvironment({
        projectId,
        environmentId: activeEnvId,
        isEnabled: false,
      });

      await assert.rejects(
        () => envService.resolveSnapshot({ projectId, environmentId: activeEnvId }),
        (err: unknown) => err instanceof EnvironmentDisabledError,
      );

      // Re-enable for subsequent tests
      await envService.updateEnvironment({
        projectId,
        environmentId: activeEnvId,
        isEnabled: true,
      });
    });

    it('should reject snapshot resolution if baseUrl is missing', async () => {
      const noUrlEnv = await envService.createEnvironment({
        projectId,
        name: 'No URL Env',
        type: 'CUSTOM',
        baseUrl: null,
      });

      await assert.rejects(
        () => envService.resolveSnapshot({ projectId, environmentId: noUrlEnv.id }),
        (err: unknown) => err instanceof InvalidBaseUrlError,
      );
    });
  });
});
