/**
 * @file packages/core/src/localization/signals/correlators.test.ts
 * Tests for evidence correlators: network endpoints, UI selectors, stack traces, and symbol graphs.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { NetworkRouteCorrelator } from './network-route-correlator.js';
import { UiComponentCorrelator } from './ui-component-correlator.js';
import { StackTraceCorrelator } from './stack-trace-correlator.js';
import { SourceMapResolver } from './source-map-resolver.js';
import { SymbolGraphExpander } from './symbol-graph-expander.js';
import type { LocalizationContext } from '../defect-localization-types.js';

function createMockContext(overrides: Partial<LocalizationContext> = {}): LocalizationContext {
  return {
    projectId: '11111111-1111-1111-1111-111111111111',
    failureCaseId: '22222222-2222-2222-2222-222222222222',
    repositoryId: '33333333-3333-3333-3333-333333333333',
    workspaceRoot: '/mock/workspace',
    branchName: 'main',
    headCommit: 'abcdef1234567890',
    failureTimeCommit: 'abcdef1234567890',
    revisionState: 'EXACT_REVISION',
    isDrifted: false,
    driftDetails: null,
    failureCase: {
      id: '22222222-2222-2222-2222-222222222222',
      title: 'Invalid password accepted',
      status: 'OPEN',
      errorMessage: 'Assertion failed: expected 401 Unauthorized but got 200 OK',
      testCaseId: '44444444-4444-4444-4444-444444444444',
      executionId: '55555555-5555-5555-5555-555555555555',
    },
    testCase: {
      id: '44444444-4444-4444-4444-444444444444',
      key: 'TC-AUTH-001',
      title: 'Login with invalid password should fail',
    },
    requirement: {
      id: '66666666-6666-6666-6666-666666666666',
      key: 'REQ-AUTH-001',
      title: 'User Authentication and Access Control',
    },
    failedStep: {
      stepIndex: 3,
      action: 'CLICK',
      target: 'button[data-testid="login-submit"]',
      errorMessage: 'Expected error message "Invalid credentials" not displayed',
    },
    networkEvidence: [
      {
        url: 'http://localhost:3000/api/auth/login',
        method: 'POST',
        statusCode: 200,
        requestBody: '{"username":"test@example.com","password":"wrong"}',
        responseBody: '{"token":"xyz"}',
      },
    ],
    consoleEvidence: [
      {
        level: 'ERROR',
        message:
          'Error: invalid authentication flow\n    at authenticateUser (/mock/workspace/src/auth/login-service.ts:42:15)',
        stack:
          'Error: invalid authentication flow\n    at authenticateUser (/mock/workspace/src/auth/login-service.ts:42:15)',
      },
    ],
    technicalLocalization: {
      id: '77777777-7777-7777-7777-777777777777',
      primaryLayer: 'BACKEND_APPLICATION',
      primaryTargetIdentifier: 'POST /api/auth/login',
      matchedFilePath: 'src/auth/login-service.ts',
      matchedSymbolName: 'authenticateUser',
      matchedLineNumber: 42,
      httpEndpoint: '/api/auth/login',
      domSelector: 'button[data-testid="login-submit"]',
      uiComponentName: 'LoginForm',
      routePath: '/api/auth/login',
      localizationRationale: 'Auth service bypassed password comparison',
    },
    rootCauseAnalysis: {
      id: '88888888-8888-8888-8888-888888888888',
      rootCauseStatus: 'IDENTIFIED',
      probableLayer: 'BACKEND_APPLICATION',
      probableCause: 'Password hash comparison always returned true',
      candidateFiles: ['src/auth/login-service.ts'],
    },
    quickFixAssessment: {
      id: '99999999-9999-9999-9999-999999999999',
      decision: 'ELIGIBLE',
      candidateFiles: ['src/auth/login-service.ts'],
    },
    repositoryFiles: [
      {
        id: 'rf-1',
        relativePath: 'src/api/auth-route.ts',
        name: 'auth-route.ts',
        classification: 'ROUTE',
        symbols: [
          {
            id: 'sym-1',
            name: 'postLoginHandler',
            kind: 'FUNCTION',
            startLine: 10,
            endLine: 30,
            isExported: true,
          },
        ],
        imports: [
          {
            specifier: '../auth/login-service.js',
            resolvedRelativePath: 'src/auth/login-service.ts',
            isExternal: false,
            lineNumber: 2,
          },
        ],
      },
      {
        id: 'rf-2',
        relativePath: 'src/auth/login-service.ts',
        name: 'login-service.ts',
        classification: 'SERVICE',
        symbols: [
          {
            id: 'sym-2',
            name: 'authenticateUser',
            kind: 'FUNCTION',
            startLine: 35,
            endLine: 80,
            isExported: true,
          },
        ],
        imports: [
          {
            specifier: './user-repository.js',
            resolvedRelativePath: 'src/auth/user-repository.ts',
            isExternal: false,
            lineNumber: 3,
          },
        ],
      },
      {
        id: 'rf-3',
        relativePath: 'src/auth/user-repository.ts',
        name: 'user-repository.ts',
        classification: 'REPOSITORY',
        symbols: [
          {
            id: 'sym-3',
            name: 'findUserByEmail',
            kind: 'FUNCTION',
            startLine: 12,
            endLine: 45,
            isExported: true,
          },
        ],
        imports: [],
      },
      {
        id: 'rf-4',
        relativePath: 'src/components/LoginForm.tsx',
        name: 'LoginForm.tsx',
        classification: 'COMPONENT',
        symbols: [
          {
            id: 'sym-4',
            name: 'LoginForm',
            kind: 'COMPONENT',
            startLine: 15,
            endLine: 95,
            isExported: true,
          },
          {
            id: 'sym-5',
            name: 'handleLoginSubmit',
            kind: 'FUNCTION',
            startLine: 25,
            endLine: 50,
            isExported: false,
          },
        ],
        imports: [],
      },
    ],
    ...overrides,
  };
}

describe('Signal Correlators (Phase 100)', () => {
  test('NetworkRouteCorrelator maps HTTP endpoint to route handler and service', () => {
    const correlator = new NetworkRouteCorrelator();
    const context = createMockContext();
    const result = correlator.correlate(context);

    assert.equal(result.matchedRoutePath, '/api/auth/login');
    assert.equal(result.matchedHandlerFile, 'src/api/auth-route.ts');
    assert.equal(result.matchedServiceFile, 'src/auth/login-service.ts');
    assert.ok(result.facts.length >= 2);

    const routeFact = result.facts.find(f => f.filePath === 'src/api/auth-route.ts');
    assert.ok(routeFact);
    assert.equal(routeFact.candidateType, 'ROUTE');
    assert.equal(routeFact.signal, 'NETWORK_ENDPOINT');
  });

  test('UiComponentCorrelator maps DOM selector to component and event handler', () => {
    const correlator = new UiComponentCorrelator();
    const context = createMockContext();
    const result = correlator.correlate(context);

    assert.equal(result.matchedComponentFile, 'src/components/LoginForm.tsx');
    assert.equal(result.matchedEventHandler, 'handleLoginSubmit');
    assert.ok(result.facts.length >= 1);

    const fact = result.facts[0]!;
    assert.equal(fact.filePath, 'src/components/LoginForm.tsx');
    assert.equal(fact.candidateType, 'COMPONENT');
    assert.equal(fact.signal, 'DOM_COMPONENT');
  });

  test('StackTraceCorrelator parses stack frames and resolves exact symbol line range', () => {
    const correlator = new StackTraceCorrelator();
    const context = createMockContext();
    const result = correlator.correlate(context);

    assert.equal(result.hasTrustedStack, true);
    assert.equal(result.topSourceFile, 'src/auth/login-service.ts');
    assert.equal(result.topLineNumber, 42);
    assert.equal(result.topSymbolName, 'authenticateUser');

    const fact = result.facts[0]!;
    assert.equal(fact.filePath, 'src/auth/login-service.ts');
    assert.equal(fact.symbolName, 'authenticateUser');
    assert.equal(fact.signal, 'STACK_TRACE');
    assert.equal(fact.strength, 'STRONG');
    assert.equal(fact.startLine, 35);
    assert.equal(fact.endLine, 80);
  });

  test('SourceMapResolver reports status truthfully', () => {
    const resolver = new SourceMapResolver();
    const context = createMockContext();
    const result = resolver.resolve(context);

    assert.equal(typeof result.sourceMapsAvailable, 'boolean');
    assert.ok(result.details.length > 0);
  });

  test('SymbolGraphExpander explores imported and caller dependencies bounded by depth', () => {
    const expander = new SymbolGraphExpander();
    const context = createMockContext();
    const initialCandidates = [{ filePath: 'src/auth/login-service.ts' }];
    const result = expander.expand(initialCandidates, context);

    assert.ok(result.nodesExplored >= 1);
    assert.ok(result.maxDepthReached <= 3);
    // login-service imports user-repository
    assert.ok(result.relatedFiles.includes('src/auth/user-repository.ts'));
    // auth-route imports login-service (caller)
    assert.ok(result.relatedFiles.includes('src/api/auth-route.ts'));

    const importedFact = result.facts.find(f => f.filePath === 'src/auth/user-repository.ts');
    assert.ok(importedFact);
    assert.equal(importedFact.signal, 'SYMBOL_GRAPH_IMPORT');
    assert.equal(importedFact.candidateType, 'REPOSITORY');
  });
});
