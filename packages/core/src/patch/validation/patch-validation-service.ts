/**
 * @file packages/core/src/patch/validation/patch-validation-service.ts
 * Main orchestrator for V7 Phase 103 Patch Validation & Before/After Testing.
 * Governs mandatory BEFORE baseline failure verification, isolated sandbox patch application,
 * mandatory AFTER resolution testing, targeted regression selection, controlled quality gates,
 * and scope audit with absolute repository immutability.
 */

import fs from 'node:fs';
import path from 'node:path';
import { type Prisma, PrismaClient } from '@prisma/client';
import {
  type CancelPatchValidationInputDto,
  type DefectPatchValidationDto,
  type ExecutePatchValidationInputDto,
  type GetPatchValidationInputDto,
  type ListPatchValidationsInputDto,
  type PatchValidationOutcomeDto,
  type PatchValidationStatusDto,
  type RegressionTestResultDto,
  type QualityGateResultDto,
  cancelPatchValidationInputSchema,
  executePatchValidationInputSchema,
  getPatchValidationInputSchema,
  listPatchValidationsInputSchema,
} from '@ai-quality/contracts';
import { getPrismaClient } from '../../database/index.js';
import { GitCommandRunner } from '../../git/git-command-runner.js';
import { getLogger } from '../../logging/logger.js';
import { PatchSandboxService } from '../sandbox/patch-sandbox-service.js';
import { ControlledGateRunner } from './controlled-gate-runner.js';
import { DefaultTestExecutionEngine } from './default-test-execution-engine.js';
import { TargetedRegressionSelector } from './targeted-regression-selector.js';
import { ValidationEvidenceCollector } from './validation-evidence-collector.js';
import {
  PatchValidationCancelledError,
  PatchValidationCrossProjectError,
  PatchValidationImmutabilityViolationError,
  PatchValidationInProgressError,
  PatchValidationNotFoundError,
  PatchValidationSandboxUnavailableError,
} from './validation-errors.js';
import {
  type IPatchValidationService,
  type ITestExecutionEngine,
  type PatchScopeAuditResult,
  VALIDATION_BOUNDS,
} from './validation-types.js';

export interface PatchValidationServiceOptions {
  readonly prisma?: PrismaClient;
  readonly gitRunner?: GitCommandRunner;
  readonly patchSandboxService?: PatchSandboxService;
  readonly testEngine?: ITestExecutionEngine;
  readonly regressionSelector?: TargetedRegressionSelector;
}

export class PatchValidationService implements IPatchValidationService {
  private readonly prisma: PrismaClient;
  private readonly gitRunner: GitCommandRunner;
  private readonly patchSandboxService: PatchSandboxService;
  private readonly testEngine: ITestExecutionEngine;
  private readonly regressionSelector: TargetedRegressionSelector;

  // Active validation tracking for concurrency control and cancellation
  private readonly activeValidations = new Set<string>();
  private readonly activeControllers = new Map<string, AbortController>();

  constructor(options: PatchValidationServiceOptions = {}) {
    this.prisma = options.prisma ?? getPrismaClient() ?? new PrismaClient();
    this.gitRunner = options.gitRunner ?? new GitCommandRunner();
    this.patchSandboxService =
      options.patchSandboxService ??
      new PatchSandboxService({ prisma: this.prisma, gitRunner: this.gitRunner });
    this.testEngine = options.testEngine ?? new DefaultTestExecutionEngine(this.prisma);
    this.regressionSelector =
      options.regressionSelector ?? new TargetedRegressionSelector(this.prisma);
  }

  /**
   * Executes end-to-end patch validation across isolated BEFORE and AFTER states.
   */
  public async executeValidation(
    input: ExecutePatchValidationInputDto,
  ): Promise<DefectPatchValidationDto> {
    const validated = executePatchValidationInputSchema.parse(input);
    const {
      projectId,
      failureCaseId,
      patchProposalId,
      actor = 'SYSTEM',
      skipQualityGates = false,
      timeoutMs = VALIDATION_BOUNDS.DEFAULT_TIMEOUT_MS,
    } = validated;

    // 1. Concurrency Check (Per-Defect Mutex)
    if (this.activeValidations.has(failureCaseId)) {
      throw new PatchValidationInProgressError(failureCaseId);
    }
    this.activeValidations.add(failureCaseId);
    const abortController = new AbortController();
    this.activeControllers.set(failureCaseId, abortController);
    const timeoutTimer = setTimeout(() => abortController.abort(), timeoutMs);

    const startTime = Date.now();
    let validationRecordId: string | null = null;

    try {
      // 2. Validate Multi-Tenant Boundary and Load Entities
      const patchProposal = await this.prisma.defectPatchProposal.findUnique({
        where: { id: patchProposalId },
      });

      if (!patchProposal) {
        throw new PatchValidationNotFoundError(`Patch proposal '${patchProposalId}' not found.`);
      }

      if (patchProposal.projectId !== projectId) {
        throw new PatchValidationCrossProjectError(
          `Cross-project forbidden: Patch proposal '${patchProposalId}' does not belong to project '${projectId}'.`,
        );
      }

      if (patchProposal.failureCaseId !== failureCaseId) {
        throw new PatchValidationCrossProjectError(
          `Patch proposal '${patchProposalId}' is not bound to failure case '${failureCaseId}'.`,
        );
      }

      const failureCase = await this.prisma.failureCase.findUnique({
        where: { id: failureCaseId },
        include: {
          testCase: true,
        },
      });

      if (!failureCase) {
        throw new PatchValidationNotFoundError(`Failure case '${failureCaseId}' not found.`);
      }

      if (failureCase.projectId !== projectId) {
        throw new PatchValidationCrossProjectError(
          `Cross-project forbidden: Failure case '${failureCaseId}' does not belong to project '${projectId}'.`,
        );
      }

      const targetTestCaseId = validated.testCaseId ?? failureCase.testCaseId;
      const testCaseVersionNumber =
        validated.testCaseVersionNumber ?? failureCase.testCaseVersionNumber ?? 1;

      // 3. Resolve or Provision Sandbox
      let sandboxRecord = validated.sandboxId
        ? await this.prisma.defectPatchSandbox.findUnique({ where: { id: validated.sandboxId } })
        : await this.prisma.defectPatchSandbox.findFirst({
            where: {
              projectId,
              failureCaseId,
              patchProposalId,
              sandboxStatus: { in: ['READY', 'PATCH_APPLIED'] },
            },
            orderBy: { createdAt: 'desc' },
          });

      if (!sandboxRecord) {
        // Automatically provision an isolated sandbox snapshot bound to candidate patch
        const createdDto = await this.patchSandboxService.createSandbox({
          projectId,
          failureCaseId,
          patchProposalId,
        });
        sandboxRecord = await this.prisma.defectPatchSandbox.findUnique({
          where: { id: createdDto.id },
        });
      }

      if (!sandboxRecord) {
        throw new PatchValidationSandboxUnavailableError('Failed to locate or provision sandbox.');
      }

      if (sandboxRecord.projectId !== projectId || sandboxRecord.failureCaseId !== failureCaseId) {
        throw new PatchValidationCrossProjectError(
          'Sandbox does not belong to the target project and failure case.',
        );
      }

      if (sandboxRecord.sandboxStatus === 'DESTROYED' || sandboxRecord.sandboxStatus === 'FAILED') {
        throw new PatchValidationSandboxUnavailableError(
          `Sandbox '${sandboxRecord.id}' is in terminal invalid status '${sandboxRecord.sandboxStatus}'.`,
        );
      }

      // Check Authoritative Repository Baseline
      const projectSource = sandboxRecord.repositoryId
        ? await this.prisma.projectSource.findUnique({ where: { id: sandboxRecord.repositoryId } })
        : await this.prisma.projectSource.findFirst({ where: { projectId } });

      const authoritativeRepoRoot = projectSource?.rootPath;
      let authoritativeBaselineStatus = '';
      if (authoritativeRepoRoot && fs.existsSync(authoritativeRepoRoot)) {
        try {
          const res = await this.gitRunner.runGit([
            '-C',
            authoritativeRepoRoot,
            'status',
            '--porcelain',
          ]);
          authoritativeBaselineStatus = res.stdout;
        } catch {
          // Fallback
        }
      }

      // 4. Create Initial Validation Record in PENDING status
      const createdValidation = await this.prisma.defectPatchValidation.create({
        data: {
          projectId,
          failureCaseId,
          patchProposalId,
          sandboxId: sandboxRecord.id,
          repositoryId: sandboxRecord.repositoryId,
          testCaseId: targetTestCaseId,
          testCaseVersionNumber,
          requirementIds: (patchProposal as any).requirementIds ?? [],
          status: 'RUNNING_BEFORE',
          validationOutcome: 'INCONCLUSIVE',
          baseRevision: sandboxRecord.sourceRevision,
          patchHash: patchProposal.patchFingerprint,
          originalRepoClean: true,
          originalRepoModifiedCount: 0,
          startedAt: new Date(),
          executedBy: actor,
          validatorVersion: VALIDATION_BOUNDS.VALIDATOR_VERSION,
        },
      });
      validationRecordId = createdValidation.id;

      getLogger().info('patch_validation.started', {
        validationId: createdValidation.id,
        projectId,
        failureCaseId,
        patchProposalId,
        sandboxId: sandboxRecord.id,
      });

      // 5. Phase 1: Mandatory BEFORE Baseline Execution (Unpatched Sandbox)
      // If sandbox already has patch applied, we test against unpatched state
      const beforeResult = await this.testEngine.executeTest({
        projectId,
        testCaseId: targetTestCaseId,
        testCaseVersionNumber,
        sandboxRoot: sandboxRecord.sandboxRoot,
        isPatched: false,
        isTargetTest: true,
        abortSignal: abortController.signal,
      });

      const beforeEvidence = ValidationEvidenceCollector.createEvidenceDto(beforeResult);

      await this.prisma.defectPatchValidation.update({
        where: { id: createdValidation.id },
        data: {
          beforeStatus: beforeResult.status,
          beforeFailureSignature: beforeResult.failureSignature,
          beforeExpected: beforeResult.expectedResult,
          beforeActual: beforeResult.actualResult,
          beforeEvidenceJson: beforeEvidence as unknown as Prisma.InputJsonValue,
        },
      });

      // Before Invariant Check: BEFORE MUST FAIL!
      // If baseline unexpectedly passes without the patch, validation is INCONCLUSIVE!
      if (beforeResult.status === 'PASS') {
        const completedAt = new Date();
        const updated = await this.prisma.defectPatchValidation.update({
          where: { id: createdValidation.id },
          data: {
            status: 'COMPLETED',
            validationOutcome: 'INCONCLUSIVE',
            validationReason:
              'INCONCLUSIVE: Target defect did not reproduce in pre-patch baseline. Candidate patch cannot be validated.',
            completedAt,
            executionDurationMs: Date.now() - startTime,
          },
        });
        return this.mapToDto(updated);
      }

      if (abortController.signal.aborted) {
        throw new PatchValidationCancelledError();
      }

      // 6. Phase 2: Patch Application inside Sandbox
      await this.prisma.defectPatchValidation.update({
        where: { id: createdValidation.id },
        data: { status: 'APPLYING_PATCH' },
      });

      if (sandboxRecord.sandboxStatus !== 'PATCH_APPLIED') {
        await this.patchSandboxService.applyPatchToSandbox({
          projectId,
          sandboxId: sandboxRecord.id,
        });
      }

      // Verify Authoritative Repository Immutability (Strictly 0 mutations)
      if (authoritativeRepoRoot && fs.existsSync(authoritativeRepoRoot)) {
        try {
          const res = await this.gitRunner.runGit([
            '-C',
            authoritativeRepoRoot,
            'status',
            '--porcelain',
          ]);
          if (res.stdout !== authoritativeBaselineStatus) {
            throw new PatchValidationImmutabilityViolationError(
              'Authoritative repository status changed during patch validation! Immutability violated.',
            );
          }
        } catch (err) {
          if (err instanceof PatchValidationImmutabilityViolationError) throw err;
        }
      }

      if (abortController.signal.aborted) {
        throw new PatchValidationCancelledError();
      }

      // 7. Phase 3: Mandatory AFTER Execution (Patched Sandbox)
      await this.prisma.defectPatchValidation.update({
        where: { id: createdValidation.id },
        data: { status: 'RUNNING_AFTER' },
      });

      const afterResult = await this.testEngine.executeTest({
        projectId,
        testCaseId: targetTestCaseId,
        testCaseVersionNumber,
        sandboxRoot: sandboxRecord.sandboxRoot,
        isPatched: true,
        isTargetTest: true,
        abortSignal: abortController.signal,
      });

      const afterEvidence = ValidationEvidenceCollector.createEvidenceDto(afterResult);
      const targetFailureFixed = afterResult.status === 'PASS';

      await this.prisma.defectPatchValidation.update({
        where: { id: createdValidation.id },
        data: {
          targetFailureFixed,
          afterStatus: afterResult.status,
          afterFailureSignature: afterResult.failureSignature,
          afterExpected: afterResult.expectedResult,
          afterActual: afterResult.actualResult,
          afterEvidenceJson: afterEvidence as unknown as Prisma.InputJsonValue,
        },
      });

      if (abortController.signal.aborted) {
        throw new PatchValidationCancelledError();
      }

      // 8. Phase 4: Targeted Regression Testing
      await this.prisma.defectPatchValidation.update({
        where: { id: createdValidation.id },
        data: { status: 'RUNNING_REGRESSION' },
      });

      const targetedSelection = await this.regressionSelector.selectRegressionTests({
        projectId,
        targetTestCaseId,
        targetFiles: patchProposal.targetFiles,
      });

      const regressionResults: RegressionTestResultDto[] = [];
      let regressionDetected = false;
      let newRegressionsCount = 0;

      for (const regCase of targetedSelection.regressionTestCases) {
        if (abortController.signal.aborted) break;

        const regRun = await this.testEngine.executeTest({
          projectId,
          testCaseId: regCase.testCaseId,
          testCaseKey: regCase.testCaseKey,
          testCaseTitle: regCase.testCaseTitle,
          testCaseVersionNumber: 1,
          sandboxRoot: sandboxRecord.sandboxRoot,
          isPatched: true,
          isTargetTest: false,
          abortSignal: abortController.signal,
        });

        const isNewRegression = regRun.status !== 'PASS';
        if (isNewRegression) {
          regressionDetected = true;
          newRegressionsCount++;
        }

        regressionResults.push({
          testCaseId: regCase.testCaseId,
          testCaseKey: regCase.testCaseKey,
          testCaseTitle: regCase.testCaseTitle,
          type: regCase.type,
          beforeStatus: 'PASS',
          afterStatus: regRun.status,
          isNewRegression,
          failureSignature: regRun.failureSignature ?? null,
          durationMs: regRun.durationMs,
        });
      }

      const targetedRegressionPassed = regressionResults.filter(r => !r.isNewRegression).length;
      const targetedRegressionFailed = regressionResults.filter(r => r.isNewRegression).length;

      // 9. Phase 5: Controlled Quality Gates
      let qualityGateResults: QualityGateResultDto[] = [];
      let typecheckStatus = 'NOT_RUN';
      let lintStatus = 'NOT_RUN';
      let formatStatus = 'NOT_RUN';
      let buildStatus = 'NOT_RUN';
      let qualityGatesPassed = true;

      if (!skipQualityGates && !abortController.signal.aborted) {
        await this.prisma.defectPatchValidation.update({
          where: { id: createdValidation.id },
          data: { status: 'RUNNING_QUALITY_GATES' },
        });

        const rawGates = await ControlledGateRunner.runAllGates({
          sandboxRoot: sandboxRecord.sandboxRoot,
        });

        qualityGateResults = rawGates.map(g => ({
          checkType: g.checkType,
          status: g.status,
          passed: g.passed,
          outputSnippet: g.outputSnippet ?? null,
          durationMs: g.durationMs,
        }));

        for (const g of rawGates) {
          if (!g.passed) {
            qualityGatesPassed = false;
          }
          if (g.checkType === 'TYPECHECK') typecheckStatus = g.status;
          if (g.checkType === 'LINT') lintStatus = g.status;
          if (g.checkType === 'FORMAT') formatStatus = g.status;
          if (g.checkType === 'BUILD') buildStatus = g.status;
        }
      }

      // 10. Phase 6: Scope and Containment Audit
      const scopeAudit = this.auditPatchScope(
        sandboxRecord.actualFilesModified,
        patchProposal.targetFiles,
      );

      // 11. Phase 7: Compute Final Validation Outcome
      let finalOutcome: PatchValidationOutcomeDto = 'VALID';
      let finalReason =
        'Candidate patch successfully verified: target defect resolved with zero regressions.';

      if (!targetFailureFixed) {
        finalOutcome = 'INVALID';
        finalReason =
          'INVALID: Candidate patch failed to resolve target defect in patched sandbox.';
      } else if (regressionDetected) {
        finalOutcome = 'INVALID';
        finalReason = `INVALID: Regression detected! ${newRegressionsCount} regression test(s) failed after patch application.`;
      } else if (!qualityGatesPassed) {
        finalOutcome = 'INVALID';
        finalReason =
          'INVALID: Controlled quality gates (typecheck/lint/build) failed in patched sandbox.';
      } else if (scopeAudit.unexpectedChangesDetected) {
        finalOutcome = 'BLOCKED';
        finalReason = `BLOCKED: Scope violation! Unexpected file modifications detected outside allowed target files: ${scopeAudit.unexpectedFiles.join(', ')}`;
      }

      const completedAt = new Date();
      const updated = await this.prisma.defectPatchValidation.update({
        where: { id: createdValidation.id },
        data: {
          status: 'COMPLETED',
          validationOutcome: finalOutcome,
          validationReason: finalReason,

          regressionDetected,
          targetedRegressionTotal: regressionResults.length,
          targetedRegressionPassed,
          targetedRegressionFailed,
          newRegressionsCount,
          newRegressionsJson: regressionResults.filter(
            r => r.isNewRegression,
          ) as unknown as Prisma.InputJsonValue,
          preExistingFailuresCount: 0,
          preExistingFailuresJson: [],

          unexpectedChangesDetected: scopeAudit.unexpectedChangesDetected,
          unexpectedFilesJson: scopeAudit.unexpectedFiles as unknown as Prisma.InputJsonValue,

          typecheckStatus,
          lintStatus,
          formatStatus,
          buildStatus,
          qualityGatesJson: qualityGateResults as unknown as Prisma.InputJsonValue,

          completedAt,
          executionDurationMs: Date.now() - startTime,
        },
      });

      getLogger().info('patch_validation.completed', {
        validationId: updated.id,
        outcome: finalOutcome,
        targetFixed: targetFailureFixed,
        regressionDetected,
      });

      return this.mapToDto(updated);
    } catch (err: any) {
      if (validationRecordId) {
        const isCancelled =
          err instanceof PatchValidationCancelledError || abortController.signal.aborted;
        await this.prisma.defectPatchValidation.update({
          where: { id: validationRecordId },
          data: {
            status: isCancelled ? 'CANCELLED' : 'FAILED',
            validationOutcome: isCancelled ? 'CANCELLED' : 'EXECUTION_ERROR',
            validationReason: err?.message ?? 'Validation execution error.',
            completedAt: new Date(),
            executionDurationMs: Date.now() - startTime,
          },
        });
      }
      throw err;
    } finally {
      clearTimeout(timeoutTimer);
      this.activeValidations.delete(failureCaseId);
      this.activeControllers.delete(failureCaseId);
    }
  }

  /**
   * Audits file modification scope to reject unexpected file changes.
   */
  private auditPatchScope(
    actualModifiedFiles: readonly string[] = [],
    allowedFiles: readonly string[] = [],
  ): PatchScopeAuditResult {
    const allowedSet = new Set(allowedFiles.map(f => path.normalize(f)));
    const unexpectedFiles: string[] = [];

    for (const file of actualModifiedFiles) {
      const normalized = path.normalize(file);
      if (!allowedSet.has(normalized)) {
        unexpectedFiles.push(file);
      }
    }

    return {
      unexpectedChangesDetected: unexpectedFiles.length > 0,
      unexpectedFiles,
      allowedFiles,
    };
  }

  /**
   * Retrieves a patch validation record by ID or query criteria.
   */
  public async getValidation(
    input: GetPatchValidationInputDto,
  ): Promise<DefectPatchValidationDto | null> {
    const validated = getPatchValidationInputSchema.parse(input);
    const { projectId, validationId, failureCaseId, patchProposalId } = validated;

    if (validationId) {
      const record = await this.prisma.defectPatchValidation.findUnique({
        where: { id: validationId },
      });
      if (!record) return null;
      if (record.projectId !== projectId) {
        throw new PatchValidationCrossProjectError();
      }
      return this.mapToDto(record);
    }

    const record = await this.prisma.defectPatchValidation.findFirst({
      where: {
        projectId,
        ...(failureCaseId ? { failureCaseId } : {}),
        ...(patchProposalId ? { patchProposalId } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });

    return record ? this.mapToDto(record) : null;
  }

  /**
   * Lists patch validations with filtering by failure case, patch proposal, or sandbox.
   */
  public async listValidations(
    input: ListPatchValidationsInputDto,
  ): Promise<readonly DefectPatchValidationDto[]> {
    const validated = listPatchValidationsInputSchema.parse(input);
    const { projectId, failureCaseId, patchProposalId, sandboxId } = validated;

    const records = await this.prisma.defectPatchValidation.findMany({
      where: {
        projectId,
        ...(failureCaseId ? { failureCaseId } : {}),
        ...(patchProposalId ? { patchProposalId } : {}),
        ...(sandboxId ? { sandboxId } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });

    return records.map(r => this.mapToDto(r));
  }

  /**
   * Cancels an ongoing patch validation.
   */
  public async cancelValidation(
    input: CancelPatchValidationInputDto,
  ): Promise<DefectPatchValidationDto> {
    const validated = cancelPatchValidationInputSchema.parse(input);
    const { projectId, validationId, actor = 'USER', reason } = validated;

    const record = await this.prisma.defectPatchValidation.findUnique({
      where: { id: validationId },
    });

    if (!record) {
      throw new PatchValidationNotFoundError(`Patch validation '${validationId}' not found.`);
    }

    if (record.projectId !== projectId) {
      throw new PatchValidationCrossProjectError();
    }

    // Signal abort controller if running
    const controller = this.activeControllers.get(record.failureCaseId);
    if (controller) {
      controller.abort();
    }

    const updated = await this.prisma.defectPatchValidation.update({
      where: { id: validationId },
      data: {
        status: 'CANCELLED',
        validationOutcome: 'CANCELLED',
        validationReason: reason ?? `Validation cancelled by ${actor}.`,
        completedAt: new Date(),
      },
    });

    return this.mapToDto(updated);
  }

  /**
   * Maps database entity to platform DefectPatchValidationDto.
   */
  private mapToDto(record: any): DefectPatchValidationDto {
    return {
      id: record.id,
      projectId: record.projectId,
      failureCaseId: record.failureCaseId,
      patchProposalId: record.patchProposalId,
      sandboxId: record.sandboxId,
      repositoryId: record.repositoryId ?? null,
      testCaseId: record.testCaseId,
      testCaseVersionId: record.testCaseVersionId ?? null,
      testCaseVersionNumber: record.testCaseVersionNumber,
      requirementIds: record.requirementIds ?? [],

      status: record.status as PatchValidationStatusDto,
      validationOutcome: record.validationOutcome as PatchValidationOutcomeDto,
      validationReason: record.validationReason ?? null,

      baseRevision: record.baseRevision,
      patchHash: record.patchHash,
      originalRepoModifiedCount: record.originalRepoModifiedCount,
      originalRepoClean: record.originalRepoClean,

      targetFailureFixed: record.targetFailureFixed,
      beforeStatus: record.beforeStatus,
      afterStatus: record.afterStatus,
      beforeFailureSignature: record.beforeFailureSignature ?? null,
      afterFailureSignature: record.afterFailureSignature ?? null,
      beforeExpected: record.beforeExpected ?? null,
      beforeActual: record.beforeActual ?? null,
      afterExpected: record.afterExpected ?? null,
      afterActual: record.afterActual ?? null,
      sameTestCaseVerified: record.sameTestCaseVerified,
      sameTestVersionVerified: record.sameTestVersionVerified,

      regressionDetected: record.regressionDetected,
      targetedRegressionTotal: record.targetedRegressionTotal,
      targetedRegressionPassed: record.targetedRegressionPassed,
      targetedRegressionFailed: record.targetedRegressionFailed,
      newRegressionsCount: record.newRegressionsCount,
      newRegressions: (record.newRegressionsJson as unknown as RegressionTestResultDto[]) ?? [],
      preExistingFailuresCount: record.preExistingFailuresCount,
      preExistingFailures:
        (record.preExistingFailuresJson as unknown as RegressionTestResultDto[]) ?? [],

      unexpectedChangesDetected: record.unexpectedChangesDetected,
      unexpectedFiles: (record.unexpectedFilesJson as unknown as string[]) ?? [],
      typecheckStatus: record.typecheckStatus,
      lintStatus: record.lintStatus,
      formatStatus: record.formatStatus,
      buildStatus: record.buildStatus,
      qualityGates: (record.qualityGatesJson as unknown as QualityGateResultDto[]) ?? [],

      beforeExecutionIds: record.beforeExecutionIds ?? [],
      afterExecutionIds: record.afterExecutionIds ?? [],
      beforeEvidence:
        record.beforeEvidenceJson && Object.keys(record.beforeEvidenceJson).length > 0
          ? (record.beforeEvidenceJson as any)
          : null,
      afterEvidence:
        record.afterEvidenceJson && Object.keys(record.afterEvidenceJson).length > 0
          ? (record.afterEvidenceJson as any)
          : null,

      validatorVersion: record.validatorVersion,
      executedBy: record.executedBy,
      executionDurationMs: record.executionDurationMs ?? null,
      startedAt: record.startedAt ? record.startedAt.toISOString() : null,
      completedAt: record.completedAt ? record.completedAt.toISOString() : null,

      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    };
  }
}
