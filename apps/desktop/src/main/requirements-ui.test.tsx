/**
 * @file apps/desktop/src/main/requirements-ui.test.tsx
 * Unit tests for Requirement UI components and screens.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import type { RequirementDto } from '@ai-quality/contracts';
import { AddEditRequirementModal } from '../renderer/features/requirements/AddEditRequirementModal.js';
import { BulkAddRequirementsModal } from '../renderer/features/requirements/BulkAddRequirementsModal.js';
import { ViewRequirementModal } from '../renderer/features/requirements/ViewRequirementModal.js';
import { DeleteRequirementDialog } from '../renderer/features/requirements/DeleteRequirementDialog.js';
import { RequirementDocumentsList } from '../renderer/features/requirements/RequirementDocumentsList.js';
import { DocumentExtractionModal } from '../renderer/features/requirements/DocumentExtractionModal.js';
import { RequirementCandidatesModal } from '../renderer/features/requirements/RequirementCandidatesModal.js';
import { RequirementProvenanceView } from '../renderer/features/requirements/RequirementProvenanceView.js';
import { RequirementRepresentationView } from '../renderer/features/requirements/RequirementRepresentationView.js';
import { RequirementClassificationView } from '../renderer/features/requirements/RequirementClassificationView.js';
import { RequirementQualityView } from '../renderer/features/requirements/RequirementQualityView.js';
import { RequirementRelationshipsView } from '../renderer/features/requirements/RequirementRelationshipsView.js';
import { RequirementEvidenceView } from '../renderer/features/requirements/RequirementEvidenceView.js';
import { RequirementsScreen } from '../renderer/screens/RequirementsScreen.js';
import { ProjectProvider } from '../renderer/context/ProjectContext.js';

describe('Requirement Feature UI Component Unit Tests', () => {
  const dummyDateStr = new Date('2026-01-01T00:00:00.000Z').toISOString();

  const mockRequirement: RequirementDto = {
    id: 'req-1111-2222',
    projectId: 'proj-1111-2222',
    requirementSourceId: 'src-1111-2222',
    requirementSourceName: 'Manual Requirements',
    requirementKey: 'REQ-001',
    title: 'Multi-Factor User Authentication',
    originalText: 'The user shall authenticate using email, password, and a time-based OTP token.',
    type: 'SECURITY',
    priority: 'CRITICAL',
    status: 'ACTIVE',
    createdAt: dummyDateStr,
    updatedAt: dummyDateStr,
  };

  const mockDocument = {
    id: 'doc-1111-2222',
    projectId: 'proj-1111-2222',
    requirementSourceId: 'src-1111-2222',
    originalFileName: 'SRS_Specification.pdf',
    storageKey: 'doc-1111-2222.pdf',
    fileExtension: 'pdf',
    mimeType: 'application/pdf',
    fileSize: 1024 * 150,
    sha256: 'a'.repeat(64),
    createdAt: dummyDateStr,
    updatedAt: dummyDateStr,
  };

  it('should render RequirementProvenanceView in initial loading state', () => {
    const html = renderToString(<RequirementProvenanceView requirement={mockRequirement} />);

    assert.ok(html.includes('Loading source provenance evidence...'));
  });

  it('should render RequirementRepresentationView in initial loading state', () => {
    const html = renderToString(<RequirementRepresentationView requirement={mockRequirement} />);

    assert.ok(html.includes('Loading structured representation...'));
  });

  it('should render ViewRequirementModal with provenance and representation sections', () => {
    const html = renderToString(
      <ViewRequirementModal
        requirement={mockRequirement}
        onClose={() => {}}
        onEdit={() => {}}
        onArchiveToggle={() => {}}
        onDelete={() => {}}
      />,
    );

    assert.ok(html.includes('REQ-001'));
    assert.ok(html.includes('Multi-Factor User Authentication'));
    assert.ok(html.includes('Loading source provenance evidence...'));
    assert.ok(html.includes('Loading structured representation...'));
  });

  it('should render AddEditRequirementModal in create mode with default key', () => {
    const html = renderToString(
      <AddEditRequirementModal
        isOpen={true}
        defaultNextKey="REQ-005"
        onClose={() => {}}
        onSubmitCreate={async () => ({ ok: true })}
        onSubmitUpdate={async () => ({ ok: true })}
      />,
    );

    assert.ok(html.includes('Add Manual Requirement'));
    assert.ok(html.includes('REQ-005'));
    assert.ok(html.includes('Requirement Key *'));
    assert.ok(html.includes('Original Requirement Text *'));
    assert.ok(html.includes('Create Requirement'));
  });

  it('should render AddEditRequirementModal in edit mode with prepopulated data and disabled key', () => {
    const html = renderToString(
      <AddEditRequirementModal
        isOpen={true}
        editingRequirement={mockRequirement}
        onClose={() => {}}
        onSubmitCreate={async () => ({ ok: true })}
        onSubmitUpdate={async () => ({ ok: true })}
      />,
    );

    assert.ok(html.includes('Edit Requirement: REQ-001'));
    assert.ok(html.includes('Multi-Factor User Authentication'));
    assert.ok(html.includes('time-based OTP token'));
    assert.ok(html.includes('disabled'));
    assert.ok(html.includes('Save Changes'));
  });

  it('should render ViewRequirementModal with full requirement details and actions', () => {
    const html = renderToString(
      <ViewRequirementModal
        requirement={mockRequirement}
        onClose={() => {}}
        onEdit={() => {}}
        onArchiveToggle={() => {}}
        onDelete={() => {}}
      />,
    );

    assert.ok(html.includes('REQ-001'));
    assert.ok(html.includes('Multi-Factor User Authentication'));
    assert.ok(html.includes('Original Requirement Text'));
    assert.ok(html.includes('time-based OTP token'));
    assert.ok(html.includes('Manual Requirements'));
    assert.ok(html.includes('Status: ACTIVE'));
    assert.ok(html.includes('Priority: CRITICAL'));
    assert.ok(html.includes('Archive'));
    assert.ok(html.includes('Edit'));
    assert.ok(html.includes('Delete'));
  });

  it('should render DeleteRequirementDialog with confirmation warning', () => {
    const html = renderToString(
      <DeleteRequirementDialog
        isOpen={true}
        requirement={mockRequirement}
        onClose={() => {}}
        onConfirmDelete={async () => ({ ok: true })}
      />,
    );

    assert.ok(html.includes('Delete Requirement'));
    assert.ok(html.includes('REQ-001'));
    assert.ok(html.includes('Multi-Factor User Authentication'));
    assert.ok(html.includes('permanent and removes the requirement'));
    assert.ok(html.includes('Delete Permanently'));
  });

  it('should render BulkAddRequirementsModal in paste mode', () => {
    const html = renderToString(
      <BulkAddRequirementsModal
        isOpen={true}
        projectId="proj-1111-2222"
        onClose={() => {}}
        onImportSuccess={() => {}}
      />,
    );

    assert.ok(html.includes('Bulk Add Requirements'));
    assert.ok(html.includes('Supported Paste Formats:'));
    assert.ok(html.includes('Parse Requirements'));
    assert.ok(html.includes('Paste Requirements Text'));
  });

  it('should render RequirementDocumentsList with attach button and format banner', () => {
    const html = renderToString(
      <RequirementDocumentsList projectId="proj-1111-2222" isArchivedProject={false} />,
    );

    assert.ok(html.includes('Attached Requirement Documents'));
    assert.ok(html.includes('Attach Document'));
    assert.ok(html.includes('Supported document types:'));
    assert.ok(html.includes('.pdf'));
    assert.ok(html.includes('.docx'));
  });

  it('should render DocumentExtractionModal in not-extracted initial state', () => {
    const html = renderToString(
      <DocumentExtractionModal
        isOpen={true}
        projectId="proj-1111-2222"
        document={mockDocument}
        onClose={() => {}}
      />,
    );

    assert.ok(html.includes('Document Extraction: SRS_Specification.pdf'));
    assert.ok(html.includes('Not Extracted'));
    assert.ok(html.includes('Extract Document'));
  });

  it('should render RequirementCandidatesModal in initial state', () => {
    const html = renderToString(
      <RequirementCandidatesModal
        isOpen={true}
        projectId="proj-1111-2222"
        document={mockDocument}
        onClose={() => {}}
      />,
    );

    assert.ok(html.includes('Requirement Candidates: SRS_Specification.pdf'));
    assert.ok(html.includes('Total:'));
    assert.ok(html.includes('Pending:'));
    assert.ok(html.includes('Approved:'));
    assert.ok(html.includes('Detect Candidates'));
  });

  it('should render RequirementsScreen in no-project state', () => {
    const html = renderToString(
      <MemoryRouter>
        <ProjectProvider>
          <RequirementsScreen />
        </ProjectProvider>
      </MemoryRouter>,
    );

    assert.ok(html.includes('No Project Selected'));
    assert.ok(html.includes('select or create a project'));
  });

  it('should render RequirementClassificationView in initial loading state', () => {
    const html = renderToString(
      <RequirementClassificationView projectId="proj-1111-2222" requirementId="req-1111-2222" />,
    );

    assert.ok(html.includes('Loading requirement classification...'));
  });

  it('should render RequirementQualityView in initial loading state', () => {
    const html = renderToString(
      <RequirementQualityView projectId="proj-1111-2222" requirementId="req-1111-2222" />,
    );

    assert.ok(html.includes('Loading requirement quality analysis...'));
  });

  it('should render RequirementRelationshipsView in initial loading state', () => {
    const html = renderToString(
      <RequirementRelationshipsView projectId="proj-1111-2222" requirementId="req-1111-2222" />,
    );

    assert.ok(html.includes('Loading requirement relationships...'));
  });

  it('should render RequirementEvidenceView in initial loading state', () => {
    const html = renderToString(
      <RequirementEvidenceView projectId="proj-1111-2222" requirementId="req-1111-2222" />,
    );

    assert.ok(html.includes('Loading repository evidence...'));
  });
});
