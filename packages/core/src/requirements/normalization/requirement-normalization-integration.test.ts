/**
 * @file packages/core/src/requirements/normalization/requirement-normalization-integration.test.ts
 * Integration tests for structured requirement representation, normalization lifecycle,
 * human review, staleness detection, and provenance immutability.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { getPrismaClient } from '../../database/client.js';
import { ProjectRepository } from '../../projects/project-repository.js';
import { RequirementRepository } from '../requirement-repository.js';
import { RequirementService } from '../requirement-service.js';
import { RequirementProvenanceService } from '../provenance/requirement-provenance-service.js';
import { RequirementNormalizationService } from './requirement-normalization-service.js';
import { RequirementRepresentationRepository } from './requirement-representation-repository.js';
import { RequirementNotFoundError } from '../requirement-errors.js';

describe('Structured Requirement Representation & Normalization (V3 Phase 37) Integration', () => {
  let projectRepo: ProjectRepository;
  let requirementRepo: RequirementRepository;
  let requirementService: RequirementService;
  let provenanceService: RequirementProvenanceService;
  let normalizationService: RequirementNormalizationService;
  let representationRepo: RequirementRepresentationRepository;
  let testProjectId: string;
  let otherProjectId: string;

  before(async () => {
    projectRepo = new ProjectRepository();
    requirementRepo = new RequirementRepository();
    requirementService = new RequirementService(requirementRepo, undefined, projectRepo);
    provenanceService = new RequirementProvenanceService();
    representationRepo = new RequirementRepresentationRepository();
    normalizationService = new RequirementNormalizationService(
      projectRepo,
      requirementRepo,
      representationRepo,
    );

    const project = await projectRepo.createProject({
      name: `Normalization Test Project ${Date.now()}`,
      description: 'Testing Phase 37 structured requirement representation',
    });
    testProjectId = project.id;

    const otherProject = await projectRepo.createProject({
      name: `Other Project For Isolation ${Date.now()}`,
    });
    otherProjectId = otherProject.id;
  });

  after(async () => {
    const prisma = getPrismaClient();
    if (prisma) {
      if (testProjectId) {
        await prisma.project.deleteMany({
          where: { id: { in: [testProjectId, otherProjectId] } },
        });
      }
    }
  });

  it('normalizes manual requirement and preserves originalText, key, and provenance', async () => {
    const originalText = 'The system shall allow registered users to log in within 2 seconds.';
    const req = await requirementService.createRequirement({
      projectId: testProjectId,
      title: 'User Login Requirement',
      originalText,
    });

    const keyBefore = req.requirementKey;
    const provBefore = await provenanceService.getProvenance(testProjectId, req.id);

    // Normalize
    const rep = await normalizationService.normalizeRequirement({
      projectId: testProjectId,
      requirementId: req.id,
    });

    assert.equal(rep.requirementId, req.id);
    assert.equal(rep.requirementKey, keyBefore);
    assert.equal(rep.originalRequirementText, originalText);
    assert.equal(rep.actor, 'system');
    assert.equal(rep.modality, 'SHALL');
    assert.equal(rep.action, 'allow');
    assert.equal(rep.reviewStatus, 'GENERATED');
    assert.equal(rep.normalizationStatus, 'NORMALIZED');
    assert.equal(rep.normalizationMethod, 'DETERMINISTIC');
    assert.equal(rep.isStale, false);

    // Verify invariants
    const reqAfter = await requirementRepo.getRequirementById(testProjectId, req.id);
    assert.equal(reqAfter?.originalText, originalText);
    assert.equal(reqAfter?.requirementKey, keyBefore);

    const provAfter = await provenanceService.getProvenance(testProjectId, req.id);
    assert.equal(provAfter?.sourceText, provBefore?.sourceText);
    assert.equal(provAfter?.sourceKind, provBefore?.sourceKind);
  });

  it('normalizes bulk pasted requirement and preserves line provenance', async () => {
    const bulkResult = await requirementService.importBulkRequirements({
      projectId: testProjectId,
      sourceName: 'Security & Audit Paste',
      candidates: [
        {
          title: 'Encrypt Passwords',
          originalText: 'The application must encrypt all user passwords at rest.',
          detectedExternalKey: 'REQ-P10',
          lineStart: 1,
          lineEnd: 2,
        },
        {
          title: 'Audit Reports',
          originalText: 'The system shall generate daily audit reports at midnight.',
          detectedExternalKey: 'REQ-P11',
          lineStart: 3,
          lineEnd: 4,
        },
      ],
    });

    assert.equal(bulkResult.importedCount, 2);
    const pastedReq = bulkResult.requirements[0]!;

    const provBefore = await provenanceService.getProvenance(testProjectId, pastedReq.id);
    assert.equal(provBefore?.sourceKind, 'PASTED_TEXT');
    assert.ok(provBefore?.lineStart !== null);

    // Normalize pasted requirement
    const rep = await normalizationService.normalizeRequirement({
      projectId: testProjectId,
      requirementId: pastedReq.id,
    });

    assert.equal(rep.requirementId, pastedReq.id);
    assert.equal(rep.actor, 'application');
    assert.equal(rep.modality, 'MUST');
    assert.equal(rep.action, 'encrypt');

    // Verify provenance intact
    const provAfter = await provenanceService.getProvenance(testProjectId, pastedReq.id);
    assert.equal(provAfter?.sourceKind, 'PASTED_TEXT');
    assert.equal(provAfter?.lineStart, provBefore?.lineStart);
    assert.equal(provAfter?.lineEnd, provBefore?.lineEnd);
  });

  it('supports human review and updates structured fields without mutating originalText', async () => {
    const originalText = 'Invoices must be approved before payment.';
    const req = await requirementService.createRequirement({
      projectId: testProjectId,
      title: 'Invoice Approval',
      originalText,
    });

    // Initial normalize produces null actor due to passive phrasing
    const initialRep = await normalizationService.normalizeRequirement({
      projectId: testProjectId,
      requirementId: req.id,
    });
    assert.equal(initialRep.actor, null);
    assert.equal(initialRep.reviewStatus, 'GENERATED');

    // Human reviews and provides explicit actor
    const updatedRep = await normalizationService.updateRepresentation({
      projectId: testProjectId,
      requirementId: req.id,
      actor: 'finance manager',
      action: 'approve',
      object: 'invoices before payment',
      expectedOutcome: 'payment authorized',
    });

    assert.equal(updatedRep.actor, 'finance manager');
    assert.equal(updatedRep.action, 'approve');
    assert.equal(updatedRep.object, 'invoices before payment');
    assert.equal(updatedRep.expectedOutcome, 'payment authorized');
    assert.equal(updatedRep.reviewStatus, 'REVIEWED');
    assert.equal(updatedRep.normalizationStatus, 'REVIEWED');
    assert.equal(updatedRep.normalizationMethod, 'DETERMINISTIC_REVIEWED');

    // Verify original requirement text remains unchanged
    const reqAfter = await requirementRepo.getRequirementById(testProjectId, req.id);
    assert.equal(reqAfter?.originalText, originalText);
  });

  it('protects reviewed representations from silent overwrite unless forced/regenerated', async () => {
    const originalText = 'The system shall validate passwords.';
    const req = await requirementService.createRequirement({
      projectId: testProjectId,
      title: 'Password Validation',
      originalText,
    });

    await normalizationService.normalizeRequirement({
      projectId: testProjectId,
      requirementId: req.id,
    });

    await normalizationService.updateRepresentation({
      projectId: testProjectId,
      requirementId: req.id,
      actor: 'security auditor',
    });

    // Calling normalizeRequirement again without force should NOT overwrite the reviewed actor
    const repAfter = await normalizationService.normalizeRequirement({
      projectId: testProjectId,
      requirementId: req.id,
    });
    assert.equal(repAfter.actor, 'security auditor');
    assert.equal(repAfter.reviewStatus, 'REVIEWED');

    // Explicit regeneration forces deterministic re-computation
    const regenerated = await normalizationService.regenerateRepresentation({
      projectId: testProjectId,
      requirementId: req.id,
    });
    assert.equal(regenerated.actor, 'system');
    assert.equal(regenerated.reviewStatus, 'GENERATED');
  });

  it('detects staleness when requirement original text is modified after normalization', async () => {
    const originalText = 'The system shall lock accounts after 5 failed attempts.';
    const req = await requirementService.createRequirement({
      projectId: testProjectId,
      title: 'Account Lockout',
      originalText,
    });

    await normalizationService.normalizeRequirement({
      projectId: testProjectId,
      requirementId: req.id,
    });

    const repBefore = await normalizationService.getRepresentation({
      projectId: testProjectId,
      requirementId: req.id,
    });
    assert.equal(repBefore?.isStale, false);
    assert.equal(repBefore?.normalizationStatus, 'NORMALIZED');

    // Edit requirement text
    const updatedText = 'The system shall lock accounts after 3 failed attempts.';
    await requirementService.updateRequirement({
      projectId: testProjectId,
      requirementId: req.id,
      originalText: updatedText,
    });

    // Check representation is detected as STALE
    const repAfter = await normalizationService.getRepresentation({
      projectId: testProjectId,
      requirementId: req.id,
    });
    assert.equal(repAfter?.isStale, true);
    assert.equal(repAfter?.normalizationStatus, 'STALE');

    // Regenerate to clear staleness
    const refreshed = await normalizationService.regenerateRepresentation({
      projectId: testProjectId,
      requirementId: req.id,
    });
    assert.equal(refreshed.isStale, false);
    assert.equal(refreshed.normalizationStatus, 'NORMALIZED');
    assert.ok(refreshed.quantitativeValues.some(q => q.value === 3));
  });

  it('performs bounded batch normalization with per-item isolation', async () => {
    const req1 = await requirementService.createRequirement({
      projectId: testProjectId,
      title: 'Batch Req 1',
      originalText: 'The application shall log audit events.',
    });
    const req2 = await requirementService.createRequirement({
      projectId: testProjectId,
      title: 'Batch Req 2',
      originalText: 'The system must reject unauthenticated requests.',
    });

    const result = await normalizationService.batchNormalizeRequirements({
      projectId: testProjectId,
      requirementIds: [req1.id, req2.id, '00000000-0000-0000-0000-000000000000'],
    });

    assert.equal(result.normalizedCount, 2);
    assert.equal(result.failedCount, 1);
    assert.equal(result.results.length, 3);
    assert.equal(result.results[0]?.success, true);
    assert.equal(result.results[1]?.success, true);
    assert.equal(result.results[2]?.success, false);
  });

  it('enforces project isolation on normalization and retrieval', async () => {
    const reqInProjectA = await requirementService.createRequirement({
      projectId: testProjectId,
      title: 'Secret Project A Requirement',
      originalText: 'The service shall encrypt data with AES-256.',
    });

    // Attempt to normalize from Project B
    await assert.rejects(
      async () => {
        await normalizationService.normalizeRequirement({
          projectId: otherProjectId,
          requirementId: reqInProjectA.id,
        });
      },
      (err: unknown) => {
        assert.ok(err instanceof RequirementNotFoundError);
        return true;
      },
    );

    // Normalize in Project A
    await normalizationService.normalizeRequirement({
      projectId: testProjectId,
      requirementId: reqInProjectA.id,
    });

    // Attempt to retrieve representation from Project B
    const repFromB = await normalizationService.getRepresentation({
      projectId: otherProjectId,
      requirementId: reqInProjectA.id,
    });
    assert.equal(repFromB, null);
  });

  it('cascades representation deletion on requirement hard delete', async () => {
    const req = await requirementService.createRequirement({
      projectId: testProjectId,
      title: 'Requirement To Delete',
      originalText: 'The system shall delete temporary files.',
    });

    await normalizationService.normalizeRequirement({
      projectId: testProjectId,
      requirementId: req.id,
    });

    const rep = await representationRepo.findByRequirementId(testProjectId, req.id);
    assert.ok(rep);

    // Hard delete requirement
    await requirementService.deleteRequirement({
      projectId: testProjectId,
      requirementId: req.id,
    });

    const repAfter = await representationRepo.findByRequirementId(testProjectId, req.id);
    assert.equal(repAfter, null);
  });
});
