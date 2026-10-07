/**
 * @file apps/desktop/src/main/failures-evidence-ui.test.tsx
 * UI rendering tests for EvidenceInspectionPanel (V6 Phase 75).
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { EvidenceInspectionPanel } from '../renderer/features/failures/EvidenceInspectionPanel.js';

describe('Failure Evidence UI Component Tests (V6 Phase 75)', () => {
  beforeEach(() => {
    (globalThis as any).window = {
      desktop: {
        failures: {
          getEvidencePackage: async () => ({
            ok: true,
            data: {
              packageVersion: '1.0.0',
              failureCaseId: 'case-111',
              projectId: 'proj-111',
              executionId: 'exec-111',
              testRunId: 'run-111',
              testCaseId: 'tc-111',
              testCaseVersionNumber: 1,
              failureSignature: 'sig_abc1234567890abcdef',
              triggeringStatus: 'FAILED',
              failedStep: {
                stepIndex: 1,
                actionType: 'CLICK',
                targetSummary: 'button#submit',
                errorMessage: 'Element not found',
                attempt: 1,
                healingUsed: false,
              },
              expectedVsActual: {
                assertionType: 'ELEMENT_VISIBLE',
                operator: 'EQUALS',
                expectedValue: true,
                actualValue: false,
                isHard: true,
              },
              screenshots: [
                {
                  id: 'shot-1',
                  logicalName: 'failure_step_2.png',
                  artifactType: 'SCREENSHOT',
                  byteSize: 4096,
                  integrityStatus: 'VERIFIED',
                  attachedAt: new Date().toISOString(),
                },
              ],
              consoleMessages: [
                {
                  level: 'error',
                  message: 'Failed to load resource',
                  isRedacted: false,
                },
              ],
              consoleAvailability: 'CAPTURED_AVAILABLE',
              networkRecords: [],
              networkAvailability: 'CAPTURED_EMPTY',
              traceReference: null,
              traceAvailability: 'NOT_CAPTURED',
              domEvidence: {
                locator: 'button#submit',
                htmlFragment: '<button id="submit">Submit</button>',
              },
              domAvailability: 'CAPTURED_AVAILABLE',
              retryHistory: [],
              healingRecords: [],
              environment: {
                browserEngine: 'chromium',
                environmentName: 'Staging',
              },
              completeness: 'COMPLETE',
              integrityStatus: 'VERIFIED',
              integrityDetails: null,
              generatedAt: new Date().toISOString(),
            },
          }),
          verifyEvidenceIntegrity: async () => ({
            ok: true,
            data: {
              failureCaseId: 'case-111',
              projectId: 'proj-111',
              overallIntegrity: 'VERIFIED',
              itemsVerified: 1,
              itemsMissing: 0,
              itemsCorrupt: 0,
              itemsUnavailable: 0,
              verifiedAt: new Date().toISOString(),
              itemReports: [],
            },
          }),
          getEvidenceArtifactContent: async () => ({
            ok: true,
            data: {
              referenceId: 'shot-1',
              artifactType: 'SCREENSHOT',
              mimeType: 'image/png',
              byteSize: 4096,
              sha256: 'mocksha256',
              contentBase64: 'abcbase64',
              contentText: null,
              logicalName: 'failure_step_2.png',
            },
          }),
        },
      },
    };
  });

  it('renders EvidenceInspectionPanel in initial loading state', () => {
    const html = renderToString(
      <EvidenceInspectionPanel projectId="proj-111" failureCaseId="case-111" />,
    );

    assert.ok(html.includes('data-testid="evidence-panel-loading"'));
    assert.ok(html.includes('validating evidence'));
  });
});
