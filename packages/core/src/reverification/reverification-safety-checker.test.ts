/**
 * @file packages/core/src/reverification/reverification-safety-checker.test.ts
 * Unit tests for target environment safety and production safeguards (V7 Phase 97).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ReverificationSafetyChecker } from './reverification-safety-checker.js';
import type { ProjectEnvironment } from '@prisma/client';

describe('ReverificationSafetyChecker (Phase 97)', () => {
  const checker = new ReverificationSafetyChecker();

  const devEnvironment: ProjectEnvironment = {
    id: '00000000-0000-0000-0000-000000000001',
    projectId: '00000000-0000-0000-0000-000000000002',
    targetApplicationId: null,
    name: 'Development Env',
    type: 'DEVELOPMENT',
    baseUrl: 'http://localhost:3000',
    apiUrl: null,
    isDefault: true,
    isEnabled: true,
    isProduction: false,
    productionSafetyPolicy: 'SAFE_MODE',
    browserEngine: 'chromium',
    headless: true,
    viewportWidth: 1280,
    viewportHeight: 720,
    locale: 'en-US',
    timezoneId: 'UTC',
    colorScheme: 'light',
    ignoreHttpsErrors: false,
    permissions: [],
    extraHeaders: null,
    variables: null,
    secretReferences: null,
    notes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const prodProhibitedEnv: ProjectEnvironment = {
    ...devEnvironment,
    id: '00000000-0000-0000-0000-000000000003',
    name: 'Production Prohibited',
    type: 'PRODUCTION',
    isProduction: true,
    productionSafetyPolicy: 'PROHIBITED',
  };

  const prodSafeModeEnv: ProjectEnvironment = {
    ...devEnvironment,
    id: '00000000-0000-0000-0000-000000000004',
    name: 'Production Safe Mode',
    type: 'PRODUCTION',
    isProduction: true,
    productionSafetyPolicy: 'SAFE_MODE',
  };

  it('blocks reverification if the target environment is disabled', () => {
    const disabledEnv: ProjectEnvironment = {
      ...devEnvironment,
      isEnabled: false,
    };
    const result = checker.evaluateSafety(disabledEnv, [
      { stepNumber: 1, action: 'NAVIGATE to /home' },
    ]);
    assert.equal(result.isSafe, false);
    assert.equal(result.safetyStatus, 'BLOCKED');
    assert.match(result.safetyReason!, /disabled/i);
  });

  it('strictly blocks all execution against production when policy is PROHIBITED', () => {
    const readOnlySteps = [
      { stepNumber: 1, action: 'NAVIGATE to /login' },
      { stepNumber: 2, action: 'ASSERT_VISIBLE #header' },
    ];
    const result = checker.evaluateSafety(prodProhibitedEnv, readOnlySteps);
    assert.equal(result.isSafe, false);
    assert.equal(result.safetyStatus, 'BLOCKED');
    assert.match(result.safetyReason!, /PROHIBITED/);
  });

  it('blocks execution in production when mutating keywords/actions are detected', () => {
    const paymentSteps = [
      { stepNumber: 1, action: 'NAVIGATE to /checkout' },
      {
        stepNumber: 2,
        action: 'CLICK #submit-payment',
        expectedResult: 'process credit_card charge',
      },
    ];
    const result = checker.evaluateSafety(prodSafeModeEnv, paymentSteps);
    assert.equal(result.isSafe, false);
    assert.equal(result.safetyStatus, 'BLOCKED');
    assert.ok(result.mutatingStepIndices.includes(2));
    assert.match(result.safetyReason!, /destructive \/ mutating actions/i);
  });

  it('blocks delete operations in production under SAFE_MODE', () => {
    const deleteSteps = [
      { stepNumber: 1, action: 'NAVIGATE to /settings' },
      { stepNumber: 2, action: 'CLICK #delete-account', expectedResult: 'data_destruction' },
    ];
    const result = checker.evaluateSafety(prodSafeModeEnv, deleteSteps);
    assert.equal(result.isSafe, false);
    assert.equal(result.safetyStatus, 'BLOCKED');
    assert.ok(result.detectedMutatingKeywords.includes('delete'));
  });

  it('permits read-only verification against production under SAFE_MODE', () => {
    const readOnlySteps = [
      { stepNumber: 1, action: 'NAVIGATE to /catalog' },
      {
        stepNumber: 2,
        action: 'ASSERT_VISIBLE #product-list',
        expectedResult: 'Catalog displays products',
      },
    ];
    const result = checker.evaluateSafety(prodSafeModeEnv, readOnlySteps);
    assert.equal(result.isSafe, true);
    assert.equal(result.safetyStatus, 'SAFE');
    assert.equal(result.mutatingStepIndices.length, 0);
  });

  it('permits mutating steps in development environment', () => {
    const mutatingSteps = [
      { stepNumber: 1, action: 'FILL #input-name with Test User' },
      { stepNumber: 2, action: 'CLICK #submit-button' },
    ];
    const result = checker.evaluateSafety(devEnvironment, mutatingSteps);
    assert.equal(result.isSafe, true);
    assert.equal(result.safetyStatus, 'SAFE');
  });
});
