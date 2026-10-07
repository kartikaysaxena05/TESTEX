/**
 * @file apps/desktop/src/main/ipc/auth-profile-handlers.test.ts
 * Unit and security tests for Authentication Profile IPC Handlers (V5 Phase 62).
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { IpcMainInvokeEvent } from 'electron';
import type {
  CreateAuthProfileInputDto,
  GetAuthProfileInputDto,
  ListAuthProfilesInputDto,
  UpdateAuthProfileInputDto,
  DeleteAuthProfileInputDto,
  ValidateAuthProfileInputDto,
  AuthProfileDto,
  AuthValidationResultDto,
} from '@ai-quality/contracts';
import {
  handleCreateAuthProfile,
  handleGetAuthProfile,
  handleListAuthProfiles,
  handleUpdateAuthProfile,
  handleDeleteAuthProfile,
  handleValidateAuthProfile,
  setAuthProfileServiceForTest,
} from './auth-profile-handlers.js';
import { AuthProfileService, AuthProfileNotFoundError } from '@ai-quality/core';

describe('Auth Profile IPC Handlers Unit & Security Tests', () => {
  const validEvent = {
    senderFrame: {
      parent: null,
      url: 'app://renderer/index.html',
    },
  } as unknown as IpcMainInvokeEvent;

  const untrustedSubframeEvent = {
    senderFrame: {
      parent: {}, // Nested subframe is untrusted
      url: 'http://localhost:5173/subframe.html',
    },
  } as unknown as IpcMainInvokeEvent;

  const mockService = {
    createProfile: async (input: CreateAuthProfileInputDto): Promise<AuthProfileDto> => ({
      id: 'd9e79391-7667-4e3e-a107-5509930f30c1',
      projectId: input.projectId,
      name: input.name,
      strategy: input.strategy ?? 'NONE',
      status: 'CONFIGURED',
      successValidationType: 'NONE',
      hasCredential: false,
      hasStorageState: false,
      isReusable: false,
      metadataJson: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }),
    getProfile: async (input: GetAuthProfileInputDto): Promise<AuthProfileDto> => {
      if (input.profileId === '00000000-0000-0000-0000-000000000000') {
        throw new AuthProfileNotFoundError(input.profileId, input.projectId);
      }
      return {
        id: input.profileId,
        projectId: input.projectId,
        name: 'Mock Profile',
        strategy: 'FORM_LOGIN',
        status: 'VALID',
        successValidationType: 'NONE',
        hasCredential: true,
        hasStorageState: false,
        isReusable: false,
        metadataJson: {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    },
    listProfiles: async (
      _input: ListAuthProfilesInputDto,
    ): Promise<readonly AuthProfileDto[]> => [],
    updateProfile: async (input: UpdateAuthProfileInputDto): Promise<AuthProfileDto> => ({
      id: input.profileId,
      projectId: input.projectId,
      name: input.name ?? 'Updated',
      strategy: 'NONE',
      status: 'CONFIGURED',
      successValidationType: 'NONE',
      hasCredential: false,
      hasStorageState: false,
      isReusable: false,
      metadataJson: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }),
    deleteProfile: async (
      _input: DeleteAuthProfileInputDto,
    ): Promise<{ readonly deleted: true }> => ({
      deleted: true,
    }),
    validateProfile: async (
      input: ValidateAuthProfileInputDto,
    ): Promise<AuthValidationResultDto> => ({
      profileId: input.profileId,
      status: 'VALID',
      success: true,
      durationMs: 45,
      message: 'Validated',
      validatedAt: new Date().toISOString(),
    }),
  } as unknown as AuthProfileService;

  before(() => {
    setAuthProfileServiceForTest(mockService);
  });

  after(() => {
    setAuthProfileServiceForTest(null);
  });

  it('rejects invocations from untrusted senders with UNAUTHORIZED_SENDER', async () => {
    const res = await handleCreateAuthProfile(untrustedSubframeEvent, {
      projectId: 'd9e79391-7667-4e3e-a107-5509930f30c1',
      name: 'Untrusted Profile',
      strategy: 'NONE',
    });

    assert.equal(res.ok, false);
    if (!res.ok) {
      assert.equal(res.error.code, 'UNAUTHORIZED_SENDER');
    }
  });

  it('validates input schemas and rejects invalid payloads with VALIDATION_ERROR', async () => {
    const res = await handleCreateAuthProfile(validEvent, {
      projectId: 'not-a-valid-uuid',
      name: '',
    } as unknown as CreateAuthProfileInputDto);

    assert.equal(res.ok, false);
    if (!res.ok) {
      assert.equal(res.error.code, 'VALIDATION_ERROR');
    }
  });

  it('handles create authentication profile successfully', async () => {
    const res = await handleCreateAuthProfile(validEvent, {
      projectId: 'd9e79391-7667-4e3e-a107-5509930f30c1',
      name: 'Valid Profile',
      strategy: 'FORM_LOGIN',
    });

    assert.equal(res.ok, true);
    if (res.ok) {
      assert.equal(res.data.name, 'Valid Profile');
    }
  });

  it('handles get authentication profile and sanitizes errors', async () => {
    // 1. Success
    const res1 = await handleGetAuthProfile(validEvent, {
      projectId: 'd9e79391-7667-4e3e-a107-5509930f30c1',
      profileId: 'd9e79391-7667-4e3e-a107-5509930f30c2',
    });
    assert.equal(res1.ok, true);

    // 2. Not found error
    const res2 = await handleGetAuthProfile(validEvent, {
      projectId: 'd9e79391-7667-4e3e-a107-5509930f30c1',
      profileId: '00000000-0000-0000-0000-000000000000',
    });
    assert.equal(res2.ok, false);
    if (!res2.ok) {
      assert.equal(res2.error.code, 'AUTH_PROFILE_NOT_FOUND');
    }
  });

  it('handles list, update, and delete authentication profiles cleanly', async () => {
    // List
    const listRes = await handleListAuthProfiles(validEvent, {
      projectId: 'd9e79391-7667-4e3e-a107-5509930f30c1',
    });
    assert.equal(listRes.ok, true);

    // Update
    const updateRes = await handleUpdateAuthProfile(validEvent, {
      projectId: 'd9e79391-7667-4e3e-a107-5509930f30c1',
      profileId: 'd9e79391-7667-4e3e-a107-5509930f30c2',
      name: 'Updated Name',
    });
    assert.equal(updateRes.ok, true);

    // Delete
    const deleteRes = await handleDeleteAuthProfile(validEvent, {
      projectId: 'd9e79391-7667-4e3e-a107-5509930f30c1',
      profileId: 'd9e79391-7667-4e3e-a107-5509930f30c2',
    });
    assert.equal(deleteRes.ok, true);
  });

  it('handles validate authentication profile successfully', async () => {
    const res = await handleValidateAuthProfile(validEvent, {
      projectId: 'd9e79391-7667-4e3e-a107-5509930f30c1',
      profileId: 'd9e79391-7667-4e3e-a107-5509930f30c2',
    });

    assert.equal(res.ok, true);
    if (res.ok) {
      assert.equal(res.data.success, true);
      assert.equal(res.data.status, 'VALID');
    }
  });
});
