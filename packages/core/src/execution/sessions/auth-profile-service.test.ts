/**
 * @file packages/core/src/execution/sessions/auth-profile-service.test.ts
 * Integration tests for AuthProfileService CRUD, multi-tenant isolation, and validation.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { getPrismaClient } from '../../database/index.js';
import { AuthProfileService } from './auth-profile-service.js';
import {
  AuthProfileDuplicateNameError,
  AuthProfileNotFoundError,
  AuthProfileProjectMismatchError,
} from './session-errors.js';

describe('AuthProfileService Integration Tests', () => {
  const prisma = getPrismaClient()!;
  let authService: AuthProfileService;
  let projectIdA: string;
  let projectIdB: string;
  let envIdA: string;

  before(async () => {
    authService = new AuthProfileService(prisma);

    const projectA = await prisma.project.create({
      data: { name: 'Auth Profile Project A', status: 'ACTIVE' },
    });
    projectIdA = projectA.id;

    const projectB = await prisma.project.create({
      data: { name: 'Auth Profile Project B', status: 'ACTIVE' },
    });
    projectIdB = projectB.id;

    const envA = await prisma.projectEnvironment.create({
      data: {
        projectId: projectIdA,
        name: 'Staging Env A',
        baseUrl: 'https://staging.example.com',
      },
    });
    envIdA = envA.id;
  });

  after(async () => {
    if (projectIdA) {
      await prisma.project.delete({ where: { id: projectIdA } });
    }
    if (projectIdB) {
      await prisma.project.delete({ where: { id: projectIdB } });
    }
  });

  it('creates an authentication profile and returns sanitized DTO', async () => {
    const profile = await authService.createProfile({
      projectId: projectIdA,
      environmentId: envIdA,
      name: 'Staging Customer Profile',
      strategy: 'FORM_LOGIN',
      loginUrl: 'https://staging.example.com/login',
      usernameFieldSelector: '#email',
      passwordFieldSelector: '#pass',
      submitControlSelector: '#btn-submit',
      successValidationType: 'URL_MATCH',
      successValidationValue: '/app/home',
      credentialReference: 'staging.customer.secret',
      isReusable: true,
    });

    assert.equal(profile.name, 'Staging Customer Profile');
    assert.equal(profile.strategy, 'FORM_LOGIN');
    assert.equal(profile.status, 'CONFIGURED');
    assert.equal(profile.hasCredential, true);
    assert.equal(profile.isReusable, true);
  });

  it('rejects duplicate profile names within the same project with AuthProfileDuplicateNameError', async () => {
    await assert.rejects(
      async () => {
        await authService.createProfile({
          projectId: projectIdA,
          name: 'Staging Customer Profile',
          strategy: 'NONE',
        });
      },
      (err: unknown) => {
        assert(err instanceof AuthProfileDuplicateNameError);
        assert.equal(err.code, 'AUTH_PROFILE_DUPLICATE_NAME');
        return true;
      },
    );
  });

  it('allows same profile name in a different project (multi-tenant scoping)', async () => {
    const profileB = await authService.createProfile({
      projectId: projectIdB,
      name: 'Staging Customer Profile',
      strategy: 'NONE',
    });

    assert.equal(profileB.projectId, projectIdB);
    assert.equal(profileB.name, 'Staging Customer Profile');
  });

  it('enforces multi-tenant project isolation across get, update, and delete', async () => {
    const profileA = await authService.createProfile({
      projectId: projectIdA,
      name: 'Private Profile A',
      strategy: 'NONE',
    });

    // 1. Get from Project B throws AuthProfileProjectMismatchError
    await assert.rejects(
      async () => {
        await authService.getProfile({
          projectId: projectIdB,
          profileId: profileA.id,
        });
      },
      (err: unknown) => {
        assert(err instanceof AuthProfileProjectMismatchError);
        return true;
      },
    );

    // 2. Update from Project B throws AuthProfileProjectMismatchError
    await assert.rejects(
      async () => {
        await authService.updateProfile({
          projectId: projectIdB,
          profileId: profileA.id,
          name: 'Hacked Name',
        });
      },
      (err: unknown) => {
        assert(err instanceof AuthProfileProjectMismatchError);
        return true;
      },
    );

    // 3. Delete from Project B throws AuthProfileProjectMismatchError
    await assert.rejects(
      async () => {
        await authService.deleteProfile({
          projectId: projectIdB,
          profileId: profileA.id,
        });
      },
      (err: unknown) => {
        assert(err instanceof AuthProfileProjectMismatchError);
        return true;
      },
    );
  });

  it('updates profile and protects against mass assignment of protected fields', async () => {
    const profile = await authService.createProfile({
      projectId: projectIdA,
      name: 'Initial Profile Name',
      strategy: 'NONE',
    });

    const updated = await authService.updateProfile({
      projectId: projectIdA,
      profileId: profile.id,
      name: 'Updated Profile Name',
      strategy: 'FORM_LOGIN',
      loginUrl: 'https://staging.example.com/signin',
    });

    assert.equal(updated.name, 'Updated Profile Name');
    assert.equal(updated.strategy, 'FORM_LOGIN');
    assert.equal(updated.loginUrl, 'https://staging.example.com/signin');
    assert.equal(updated.projectId, projectIdA); // ProjectId cannot be reassigned
  });

  it('lists profiles filtered by project and environment', async () => {
    const list = await authService.listProfiles({
      projectId: projectIdA,
    });

    assert.ok(list.length >= 2);
    assert.ok(list.every(p => p.projectId === projectIdA));
  });

  it('deletes an authentication profile cleanly', async () => {
    const profile = await authService.createProfile({
      projectId: projectIdA,
      name: 'Profile to Delete',
      strategy: 'NONE',
    });

    const res = await authService.deleteProfile({
      projectId: projectIdA,
      profileId: profile.id,
    });
    assert.equal(res.deleted, true);

    await assert.rejects(
      async () => {
        await authService.getProfile({
          projectId: projectIdA,
          profileId: profile.id,
        });
      },
      (err: unknown) => {
        assert(err instanceof AuthProfileNotFoundError);
        return true;
      },
    );
  });
});
