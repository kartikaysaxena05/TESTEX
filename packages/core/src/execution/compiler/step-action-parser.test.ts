/**
 * @file packages/core/src/execution/compiler/step-action-parser.test.ts
 * Unit tests for StepActionParser: action taxonomy, target descriptors, value references, and security restrictions.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { StepActionParser } from './step-action-parser.js';
import type { TestCaseStepDto, TestCaseTestDataItemDto } from '@ai-quality/contracts';
import type { CompilationContext } from './compiler-types.js';

const mockContext: CompilationContext = {
  projectId: 'a0000000-0000-0000-0000-000000000001',
  testCaseId: 'b0000000-0000-0000-0000-000000000001',
  testCaseKey: 'TC-001',
  testCaseTitle: 'User Login Test',
  testCaseVersionNumber: 1,
  environmentBaseUrl: 'https://staging.example.com',
};

describe('StepActionParser', () => {
  const parser = new StepActionParser();

  it('parses NAVIGATE action with relative application route', () => {
    const step: TestCaseStepDto = {
      id: '11111111-1111-1111-1111-111111111111',
      testCaseId: mockContext.testCaseId,
      stepNumber: 1,
      action: 'Navigate to /login',
      isOptional: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const result = parser.parseStep(step, mockContext);
    assert.equal(result.step.action, 'NAVIGATE');
    assert.equal(result.step.sequence, 1);
    assert.ok(result.step.target);
    assert.equal(result.step.target.kind, 'ROUTE');
    assert.equal(result.step.target.route, '/login');
    assert.equal(result.diagnostics.length, 0);
  });

  it('parses NAVIGATE action from natural phrasing like "Open the dashboard page"', () => {
    const step: TestCaseStepDto = {
      id: '11111111-1111-1111-1111-111111111111',
      testCaseId: mockContext.testCaseId,
      stepNumber: 1,
      action: 'Open the dashboard page',
      isOptional: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const result = parser.parseStep(step, mockContext);
    assert.equal(result.step.action, 'NAVIGATE');
    assert.equal(result.step.target?.route, '/dashboard');
    assert.equal(result.diagnostics.length, 0);
  });

  it('flags UNSAFE_URL error when navigating to data: or ftp: protocol', () => {
    const step: TestCaseStepDto = {
      id: '11111111-1111-1111-1111-111111111111',
      testCaseId: mockContext.testCaseId,
      stepNumber: 1,
      action: 'Navigate to data:text/html,<h1>test</h1>',
      isOptional: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const result = parser.parseStep(step, mockContext);
    assert.equal(result.step.action, 'NAVIGATE');
    const unsafeDiag = result.diagnostics.find(d => d.code === 'UNSAFE_URL');
    assert.ok(unsafeDiag);
    assert.equal(unsafeDiag?.severity, 'ERROR');
  });

  it('flags UNSAFE_URL error when navigating to file: protocol', () => {
    const step: TestCaseStepDto = {
      id: '11111111-1111-1111-1111-111111111111',
      testCaseId: mockContext.testCaseId,
      stepNumber: 1,
      action: 'Navigate to file:///etc/passwd',
      isOptional: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const result = parser.parseStep(step, mockContext);
    const unsafeDiag = result.diagnostics.find(d => d.code === 'UNSAFE_URL');
    assert.ok(unsafeDiag);
    assert.equal(unsafeDiag?.severity, 'ERROR');
  });

  it('parses FILL action with variable reference and semantic textbox target', () => {
    const step: TestCaseStepDto = {
      id: '11111111-1111-1111-1111-111111111111',
      testCaseId: mockContext.testCaseId,
      stepNumber: 2,
      action: "Enter user's email",
      testDataSummary: '{{user.email}}',
      isOptional: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const result = parser.parseStep(step, mockContext);
    assert.equal(result.step.action, 'FILL');
    assert.equal(result.step.target?.kind, 'FIELD');
    assert.equal(result.step.target?.role, 'textbox');
    assert.equal(result.step.value?.kind, 'VARIABLE');
    assert.equal(result.step.value?.variableName, 'user.email');
    assert.equal(result.diagnostics.length, 0);
  });

  it('parses FILL password into a SECRET_REFERENCE without storing plaintext', () => {
    const step: TestCaseStepDto = {
      id: '11111111-1111-1111-1111-111111111111',
      testCaseId: mockContext.testCaseId,
      stepNumber: 3,
      action: 'Enter password into Password field',
      testDataSummary: 'PlainTextSuperSecret123',
      isOptional: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const result = parser.parseStep(step, mockContext);
    assert.equal(result.step.action, 'FILL');
    assert.equal(result.step.value?.kind, 'SECRET_REFERENCE');
    assert.equal(result.step.value?.secretRef, 'auth.primary.password');
    assert.equal(result.step.value?.keyName, 'password');
    // Ensure plaintext was NOT assigned to literal value
    assert.equal(result.step.value?.value, undefined);
  });

  it('parses FILL action with isSensitive test data item into SECRET_REFERENCE', () => {
    const testData: TestCaseTestDataItemDto[] = [
      {
        id: '22222222-2222-2222-2222-222222222222',
        testCaseId: mockContext.testCaseId,
        sequenceOrder: 1,
        name: 'apiKey',
        dataType: 'STRING',
        origin: 'ENVIRONMENT',
        isSensitive: true,
        confidence: 'HIGH',
        sourceEvidenceRefs: [],
        reviewRequired: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];

    const step: TestCaseStepDto = {
      id: '11111111-1111-1111-1111-111111111111',
      testCaseId: mockContext.testCaseId,
      stepNumber: 2,
      action: 'Enter apiKey into API Key field',
      testDataSummary: 'secret-key-12345',
      isOptional: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const result = parser.parseStep(step, mockContext, testData);
    assert.equal(result.step.action, 'FILL');
    assert.equal(result.step.value?.kind, 'SECRET_REFERENCE');
    assert.equal(result.step.value?.secretRef, 'secret.apiKey');
  });

  it('parses CLICK action with button target descriptor', () => {
    const step: TestCaseStepDto = {
      id: '11111111-1111-1111-1111-111111111111',
      testCaseId: mockContext.testCaseId,
      stepNumber: 4,
      action: 'Click Login button',
      isOptional: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const result = parser.parseStep(step, mockContext);
    assert.equal(result.step.action, 'CLICK');
    assert.equal(result.step.target?.kind, 'CONTROL');
    assert.equal(result.step.target?.role, 'button');
    assert.equal(result.step.target?.name, 'Login');
    assert.equal(result.diagnostics.length, 0);
  });

  it('parses SELECT action with combobox target and selected option', () => {
    const step: TestCaseStepDto = {
      id: '11111111-1111-1111-1111-111111111111',
      testCaseId: mockContext.testCaseId,
      stepNumber: 5,
      action: "Select 'United States' from Country dropdown",
      isOptional: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const result = parser.parseStep(step, mockContext);
    assert.equal(result.step.action, 'SELECT');
    assert.equal(result.step.target?.kind, 'CONTROL');
    assert.equal(result.step.target?.role, 'combobox');
    assert.equal(result.step.target?.name, 'Country');
    assert.equal(result.step.value?.kind, 'LITERAL');
    assert.equal(result.step.value?.value, 'United States');
  });

  it('parses CHECK and UNCHECK actions with checkbox role', () => {
    const checkStep: TestCaseStepDto = {
      id: '11111111-1111-1111-1111-111111111111',
      testCaseId: mockContext.testCaseId,
      stepNumber: 6,
      action: 'Check the Terms and Conditions checkbox',
      isOptional: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const checkRes = parser.parseStep(checkStep, mockContext);
    assert.equal(checkRes.step.action, 'CHECK');
    assert.equal(checkRes.step.target?.role, 'checkbox');
    assert.equal(checkRes.step.target?.name, 'Terms and Conditions');

    const uncheckStep: TestCaseStepDto = {
      id: '11111111-1111-1111-1111-111111111112',
      testCaseId: mockContext.testCaseId,
      stepNumber: 7,
      action: 'Uncheck Newsletter subscription',
      isOptional: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const uncheckRes = parser.parseStep(uncheckStep, mockContext);
    assert.equal(uncheckRes.step.action, 'UNCHECK');
    assert.equal(uncheckRes.step.target?.role, 'checkbox');
  });

  it('parses PRESS key action', () => {
    const step: TestCaseStepDto = {
      id: '11111111-1111-1111-1111-111111111111',
      testCaseId: mockContext.testCaseId,
      stepNumber: 8,
      action: 'Press Enter',
      isOptional: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const result = parser.parseStep(step, mockContext);
    assert.equal(result.step.action, 'PRESS');
    assert.equal(result.step.value?.value, 'Enter');
  });

  it('parses UPLOAD action and flags UNSAFE_PATH for directory traversal', () => {
    const safeUploadStep: TestCaseStepDto = {
      id: '11111111-1111-1111-1111-111111111111',
      testCaseId: mockContext.testCaseId,
      stepNumber: 9,
      action: 'Upload avatar.png',
      isOptional: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const safeRes = parser.parseStep(safeUploadStep, mockContext);
    assert.equal(safeRes.step.action, 'UPLOAD');
    assert.equal(safeRes.step.target?.kind, 'DOCUMENT_UPLOAD');
    assert.equal(safeRes.step.value?.value, 'avatar.png');
    assert.equal(safeRes.diagnostics.length, 0);

    const unsafeUploadStep: TestCaseStepDto = {
      id: '11111111-1111-1111-1111-111111111112',
      testCaseId: mockContext.testCaseId,
      stepNumber: 10,
      action: 'Upload file ../../../etc/shadow',
      isOptional: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const unsafeRes = parser.parseStep(unsafeUploadStep, mockContext);
    assert.equal(unsafeRes.step.action, 'UPLOAD');
    const unsafePathDiag = unsafeRes.diagnostics.find(d => d.code === 'UNSAFE_PATH');
    assert.ok(unsafePathDiag);
    assert.equal(unsafePathDiag?.severity, 'ERROR');
  });

  it('flags PROHIBITED_ACTION error on arbitrary JavaScript execution or shell injection attempts', () => {
    const maliciousStep: TestCaseStepDto = {
      id: '11111111-1111-1111-1111-111111111111',
      testCaseId: mockContext.testCaseId,
      stepNumber: 11,
      action: 'Execute require("child_process").execSync("rm -rf /")',
      isOptional: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const result = parser.parseStep(maliciousStep, mockContext);
    const prohibitedDiag = result.diagnostics.find(d => d.code === 'PROHIBITED_ACTION');
    assert.ok(prohibitedDiag);
    assert.equal(prohibitedDiag?.severity, 'ERROR');
  });
});
