/**
 * @file packages/core/src/requirements/quality/requirement-quality-integration.test.ts
 * Integration tests for RequirementQualityService with PostgreSQL and Prisma.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { getPrismaClient } from '../../database/client.js';
import { ProjectService } from '../../projects/project-service.js';
import { RequirementService } from '../requirement-service.js';
import { RequirementNormalizationService } from '../normalization/requirement-normalization-service.js';
import { RequirementClassificationService } from '../classification/requirement-classification-service.js';
import { RequirementQualityService } from './requirement-quality-service.js';
import { RequirementSourceRepository } from '../requirement-source-repository.js';

describe('RequirementQualityService Integration Tests', () => {
  const prisma = getPrismaClient()!;
  const projectService = new ProjectService();
  const requirementService = new RequirementService();
  const normalizationService = new RequirementNormalizationService();
  const classificationService = new RequirementClassificationService();
  const qualityService = new RequirementQualityService();
  const sourceRepo = new RequirementSourceRepository();

  let projectId: string;
  let otherProjectId: string;

  before(async () => {
    const projectA = await projectService.createProject({
      name: 'Quality Test Project A',
      description: 'Testing quality analysis integration',
    });
    projectId = projectA.id;

    const projectB = await projectService.createProject({
      name: 'Quality Test Project B',
      description: 'Testing project isolation',
    });
    otherProjectId = projectB.id;
  });

  after(async () => {
    if (projectId) {
      await prisma.project.deleteMany({ where: { id: projectId } });
    }
    if (otherProjectId) {
      await prisma.project.deleteMany({ where: { id: otherProjectId } });
    }
  });

  it('should analyze a manual requirement and verify all invariants', async () => {
    const req = await requirementService.createRequirement({
      projectId,
      title: 'Password Rejection Rule',
      originalText: 'The system shall reject an invalid password.',
      type: 'SECURITY',
      priority: 'HIGH',
    });

    const analysis = await qualityService.analyzeQuality(projectId, req.id);

    assert.equal(analysis.projectId, projectId);
    assert.equal(analysis.requirementId, req.id);
    assert.equal(analysis.requirementKey, req.requirementKey);
    assert.equal(analysis.testabilityStatus, 'TESTABLE');
    assert.equal(analysis.qualityScore, 100);
    assert.equal(analysis.findingsCount, 0);
    assert.equal(analysis.isStale, false);
    assert.equal(analysis.analysisMethod, 'DETERMINISTIC');

    // Invariants: requirement fields unchanged
    const afterReq = await requirementService.getRequirement({
      projectId,
      requirementId: req.id,
    });
    assert.equal(afterReq?.originalText, req.originalText);
    assert.equal(afterReq?.requirementKey, req.requirementKey);
    assert.equal(afterReq?.type, 'SECURITY');
    assert.equal(afterReq?.priority, 'HIGH');
    assert.equal(afterReq?.status, req.status);
  });

  it('should analyze pasted requirement with provenance and structured representation', async () => {
    const source = await sourceRepo.createSource({
      projectId,
      sourceType: 'PASTED_TEXT',
      name: 'Performance Spec Paste',
    });

    const req = await requirementService.createRequirement({
      projectId,
      requirementSourceId: source.id,
      title: 'Fast Loading Search',
      originalText: 'The search page shall load quickly, etc.',
    });

    // Normalize & Classify
    await normalizationService.normalizeRequirement({ projectId, requirementId: req.id });
    await classificationService.classifyRequirement(projectId, req.id);

    // Analyze Quality
    const analysis = await qualityService.analyzeQuality(projectId, req.id);

    assert.equal(analysis.testabilityStatus, 'PARTIALLY_TESTABLE');
    assert.ok(analysis.findingsCount >= 2);
    assert.ok(analysis.findings.some(f => f.code === 'UNDEFINED_TIME_CONSTRAINT'));
    assert.ok(analysis.findings.some(f => f.code === 'OPEN_ENDED_LIST'));
    assert.ok(analysis.clarificationQuestions.length >= 2);
  });

  it('should support human review and dismissal of findings with custom rationale', async () => {
    const req = await requirementService.createRequirement({
      projectId,
      title: 'Ambiguous Query Tool',
      originalText: 'The user and/or manager shall approve orders.',
    });

    const analysis = await qualityService.analyzeQuality(projectId, req.id);
    assert.ok(analysis.findings.length > 0);
    const finding = analysis.findings[0]!;

    const reviewed = await qualityService.reviewQualityFinding({
      projectId,
      requirementId: req.id,
      findingId: finding.id,
      reviewStatus: 'DISMISSED',
      reviewRationale: 'Acceptable for current sprint scope',
      clarificationResponse: 'Both roles can approve independently',
    });

    assert.equal(reviewed.reviewStatus, 'DISMISSED');
    assert.equal(reviewed.reviewRationale, 'Acceptable for current sprint scope');
    assert.equal(reviewed.clarificationResponse, 'Both roles can approve independently');

    const updatedAnalysis = await qualityService.getQualityAnalysis(projectId, req.id);
    assert.equal(updatedAnalysis?.analysisMethod, 'DETERMINISTIC_REVIEWED');
    assert.equal(updatedAnalysis?.openFindingsCount, 0);
  });

  it('should retain dismissed and acknowledged findings across re-analysis', async () => {
    const req = await requirementService.createRequirement({
      projectId,
      title: 'Retention Test Req',
      originalText: 'The dashboard should quickly display data.',
    });

    const initial = await qualityService.analyzeQuality(projectId, req.id);
    const timingFinding = initial.findings.find(f => f.code === 'UNDEFINED_TIME_CONSTRAINT');
    assert.ok(timingFinding !== undefined);

    // Acknowledge timing finding
    await qualityService.reviewQualityFinding({
      projectId,
      requirementId: req.id,
      findingId: timingFinding.id,
      reviewStatus: 'ACKNOWLEDGED',
      reviewRationale: 'Will address in sprint 2',
    });

    // Re-analyze
    const reanalyzed = await qualityService.reanalyzeQuality(projectId, req.id);
    const retained = reanalyzed.findings.find(f => f.code === 'UNDEFINED_TIME_CONSTRAINT');

    assert.ok(retained !== undefined);
    assert.equal(retained?.reviewStatus, 'ACKNOWLEDGED');
    assert.equal(retained?.reviewRationale, 'Will address in sprint 2');
  });

  it('should detect staleness when original requirement text is modified', async () => {
    const req = await requirementService.createRequirement({
      projectId,
      title: 'Staleness Quality Req',
      originalText: 'The system shall process data quickly.',
    });

    const initial = await qualityService.analyzeQuality(projectId, req.id);
    assert.equal(initial.isStale, false);

    // Update text
    await requirementService.updateRequirement({
      projectId,
      requirementId: req.id,
      title: 'Staleness Quality Req',
      originalText: 'The system shall process data within 500 ms.',
    });

    const stale = await qualityService.getQualityAnalysis(projectId, req.id);
    assert.ok(stale !== null);
    assert.equal(stale?.isStale, true);

    // Re-analyze to clear staleness
    const refreshed = await qualityService.reanalyzeQuality(projectId, req.id);
    assert.equal(refreshed.isStale, false);
    assert.equal(refreshed.testabilityStatus, 'TESTABLE');
  });

  it('should batch analyze requirements with per-item isolation', async () => {
    const req1 = await requirementService.createRequirement({
      projectId,
      title: 'Batch Q1',
      originalText: 'The system shall reject bad tokens.',
    });

    const req2 = await requirementService.createRequirement({
      projectId,
      title: 'Batch Q2',
      originalText: 'The app should be fast and user-friendly.',
    });

    const batchRes = await qualityService.batchAnalyzeQuality(projectId, [
      req1.id,
      req2.id,
      '00000000-0000-0000-0000-000000000000',
    ]);

    assert.equal(batchRes.analyzedCount, 2);
    assert.equal(batchRes.failedCount, 1);
    assert.equal(batchRes.results.length, 3);
    assert.equal(batchRes.results[0]?.success, true);
    assert.equal(batchRes.results[1]?.success, true);
    assert.equal(batchRes.results[2]?.success, false);
  });

  it('should enforce strict project isolation on quality analysis and finding review', async () => {
    const req = await requirementService.createRequirement({
      projectId,
      title: 'Project Isolation Req',
      originalText: 'The system shall authenticate users.',
    });

    await qualityService.analyzeQuality(projectId, req.id);

    // Attempt cross-project get
    await assert.rejects(
      async () => {
        await qualityService.getQualityAnalysis(otherProjectId, req.id);
      },
      { name: 'RequirementNotFoundError' },
    );

    // Attempt cross-project analyze
    await assert.rejects(
      async () => {
        await qualityService.analyzeQuality(otherProjectId, req.id);
      },
      { name: 'RequirementNotFoundError' },
    );
  });

  it('should cascade delete quality analysis and findings when requirement is deleted', async () => {
    const req = await requirementService.createRequirement({
      projectId,
      title: 'To Be Deleted Quality',
      originalText: 'The system should quickly delete files.',
    });

    await qualityService.analyzeQuality(projectId, req.id);

    // Verify records exist in DB
    const beforeAnalysis = await prisma.requirementQualityAnalysis.findUnique({
      where: { requirementId: req.id },
    });
    assert.ok(beforeAnalysis !== null);

    // Delete requirement
    await requirementService.deleteRequirement({
      projectId,
      requirementId: req.id,
    });

    // Verify cascade deletion
    const afterAnalysis = await prisma.requirementQualityAnalysis.findUnique({
      where: { requirementId: req.id },
    });
    assert.equal(afterAnalysis, null);

    const findings = await prisma.requirementQualityFinding.findMany({
      where: { requirementId: req.id },
    });
    assert.equal(findings.length, 0);
  });
});
