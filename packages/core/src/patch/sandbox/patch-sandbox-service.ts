/**
 * @file packages/core/src/patch/sandbox/patch-sandbox-service.ts
 * Main orchestrator for V7 Phase 102 Secure Patch Sandbox & Change Isolation.
 * Manages isolated snapshot provisioning, security containment, patch application,
 * change-set capture, immutability verification, and lifecycle management.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { type Prisma, PrismaClient } from '@prisma/client';
import {
  type ApplyPatchToSandboxInputDto,
  type CreatePatchSandboxInputDto,
  type DefectPatchSandboxDto,
  type DestroyPatchSandboxInputDto,
  type GetPatchSandboxInputDto,
  type ListPatchSandboxesInputDto,
  type PatchSandboxSecurityChecksDto,
  type StructuredEditOperationDto,
  applyPatchToSandboxInputSchema,
  createPatchSandboxInputSchema,
  destroyPatchSandboxInputSchema,
  getPatchSandboxInputSchema,
  listPatchSandboxesInputSchema,
} from '@ai-quality/contracts';
import { getPrismaClient } from '../../database/index.js';
import { GitCommandRunner } from '../../git/git-command-runner.js';
import { getLogger } from '../../logging/logger.js';
import { SandboxContainmentValidator } from './sandbox-containment-validator.js';
import { SandboxPatchApplicator } from './sandbox-patch-applicator.js';
import {
  PatchSandboxCleanupFailedError,
  PatchSandboxConcurrentMutationError,
  PatchSandboxCreationFailedError,
  PatchSandboxCrossProjectError,
  PatchSandboxImmutabilityViolationError,
  PatchSandboxNotFoundError,
  PatchSandboxRevisionMismatchError,
  PatchSandboxValidationError,
} from './sandbox-errors.js';
import type { AuthoritativeBaselineSnapshot, IPatchSandboxService } from './sandbox-types.js';
import { z } from 'zod';

function parseInput<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new PatchSandboxValidationError(result.error.issues[0]?.message ?? 'Validation failed.');
  }
  return result.data;
}

export interface PatchSandboxServiceOptions {
  readonly prisma?: PrismaClient;
  readonly gitRunner?: GitCommandRunner;
  readonly sandboxStorageBaseDir?: string;
}

export class PatchSandboxService implements IPatchSandboxService {
  private readonly prisma: PrismaClient;
  private readonly gitRunner: GitCommandRunner;
  private readonly sandboxStorageBaseDir: string;
  private readonly activeMutexes = new Set<string>();

  constructor(options: PatchSandboxServiceOptions = {}) {
    this.prisma = options.prisma ?? getPrismaClient() ?? new PrismaClient();
    this.gitRunner = options.gitRunner ?? new GitCommandRunner();
    this.sandboxStorageBaseDir = path.resolve(
      options.sandboxStorageBaseDir ??
        process.env.SANDBOX_STORAGE_DIR ??
        path.join(os.tmpdir(), 'ai-quality-sandboxes'),
    );

    // Ensure base sandbox storage directory exists
    try {
      fs.mkdirSync(this.sandboxStorageBaseDir, { recursive: true });
    } catch {
      // Ignored if exists
    }
  }

  /**
   * Serializes operations on a failure case to prevent race conditions.
   */
  private async withMutex<T>(key: string, action: () => Promise<T>): Promise<T> {
    if (this.activeMutexes.has(key)) {
      throw new PatchSandboxConcurrentMutationError(
        `Concurrent sandbox operation detected on failure case '${key}'. Operation rejected.`,
      );
    }
    this.activeMutexes.add(key);
    try {
      return await action();
    } finally {
      this.activeMutexes.delete(key);
    }
  }

  /**
   * Resolves the canonical directory for a sandbox under project scoping.
   */
  private getSandboxPath(projectId: string, sandboxId: string): string {
    return path.join(this.sandboxStorageBaseDir, projectId, sandboxId);
  }

  /**
   * Sanitizes filesystem paths so raw server directory hierarchies are never leaked to renderer.
   */
  static maskSandboxLocation(sandboxId: string): string {
    return `[SANDBOX_ISOLATED_DIR]/sandbox-${sandboxId.slice(0, 8)}`;
  }

  /**
   * Creates an isolated sandbox snapshot bound to the exact source revision of the candidate patch.
   */
  async createSandbox(input: CreatePatchSandboxInputDto): Promise<DefectPatchSandboxDto> {
    const validated = parseInput(createPatchSandboxInputSchema, input);
    const { projectId, failureCaseId, patchProposalId } = validated;

    return this.withMutex(failureCaseId, async () => {
      // 1. Load candidate patch proposal
      const patchProposal = await this.prisma.defectPatchProposal.findUnique({
        where: { id: patchProposalId },
      });

      if (!patchProposal) {
        throw new PatchSandboxNotFoundError(`Patch proposal '${patchProposalId}' not found.`);
      }

      if (patchProposal.projectId !== projectId) {
        throw new PatchSandboxCrossProjectError(
          `Cross-project forbidden: Patch proposal '${patchProposalId}' does not belong to project '${projectId}'.`,
        );
      }

      if (patchProposal.failureCaseId !== failureCaseId) {
        throw new PatchSandboxCrossProjectError(
          `Patch proposal '${patchProposalId}' is not bound to failure case '${failureCaseId}'.`,
        );
      }

      if (patchProposal.status === 'WITHDRAWN' || patchProposal.status === 'REJECTED') {
        throw new PatchSandboxCreationFailedError(
          `Candidate patch proposal '${patchProposalId}' has status '${patchProposal.status}'. It cannot proceed to sandbox.`,
        );
      }

      if (patchProposal.status !== 'PROPOSED') {
        throw new PatchSandboxValidationError(
          `Candidate patch proposal '${patchProposalId}' has status '${patchProposal.status}'. Only 'PROPOSED' patches may be sandboxed.`,
        );
      }

      // 2. Validate failureCase if model is available
      if (this.prisma.failureCase) {
        const failureCase = await this.prisma.failureCase.findUnique({
          where: { id: failureCaseId },
        });

        if (failureCase && failureCase.projectId !== projectId) {
          throw new PatchSandboxCrossProjectError(
            `Cross-project forbidden: Failure case '${failureCaseId}' does not belong to project '${projectId}'.`,
          );
        }
      }

      // 3. Resolve project source repository
      let repository: { id: string; rootPath: string | null } | null = null;
      if (this.prisma.projectSource) {
        repository = patchProposal.repositoryId
          ? await this.prisma.projectSource.findUnique({
              where: { id: patchProposal.repositoryId },
            })
          : await this.prisma.projectSource.findFirst({ where: { projectId } });
      }

      let workspaceRoot: string | null = null;
      let effectiveRepoId = patchProposal.repositoryId ?? repository?.id ?? null;
      if (repository?.rootPath && fs.existsSync(repository.rootPath)) {
        workspaceRoot = path.resolve(repository.rootPath);
      } else if ((patchProposal as any).failureCase?.defectLocalizations?.[0]?.source?.rootPath) {
        const candidateSource = (patchProposal as any).failureCase.defectLocalizations[0].source;
        if (candidateSource.rootPath && fs.existsSync(candidateSource.rootPath)) {
          workspaceRoot = path.resolve(candidateSource.rootPath);
          if (!effectiveRepoId && candidateSource.id) {
            effectiveRepoId = candidateSource.id;
          }
        }
      }

      if (!workspaceRoot) {
        throw new PatchSandboxNotFoundError(
          `Authoritative repository source not found or inaccessible for project '${projectId}'.`,
        );
      }

      // 4. Source Revision Pinning (Section 8)
      let currentHeadCommit = patchProposal.repositoryRevision;
      try {
        const head = await this.gitRunner.getHeadCommit(workspaceRoot);
        if (head) {
          currentHeadCommit = head;
        }
      } catch {
        // Fallback to stored revision
      }

      const isRevisionDrifted =
        Boolean(patchProposal.isDrifted) ||
        (currentHeadCommit &&
          patchProposal.repositoryRevision &&
          currentHeadCommit !== patchProposal.repositoryRevision);

      if (isRevisionDrifted) {
        throw new PatchSandboxRevisionMismatchError(
          `REVISION_MISMATCH / BLOCKED: Candidate patch was generated against revision '${patchProposal.repositoryRevision}', but authoritative repository is at '${currentHeadCommit}'. Sandbox creation blocked.`,
        );
      }

      // 5. Capture Authoritative Baseline (Section 9)
      const baseline = await this.captureAuthoritativeBaseline(
        effectiveRepoId!,
        workspaceRoot,
        patchProposal.targetFiles,
      );

      // 6. Generate Sandbox ID and Path
      const sandboxId = crypto.randomUUID();
      const sandboxRoot = this.getSandboxPath(projectId, sandboxId);

      try {
        // Ensure clean target directory
        if (fs.existsSync(sandboxRoot)) {
          fs.rmSync(sandboxRoot, { recursive: true, force: true });
        }
        fs.mkdirSync(sandboxRoot, { recursive: true });

        // Copy files from authoritative repository using separate inodes (no hardlinks)
        fs.cpSync(workspaceRoot, sandboxRoot, {
          recursive: true,
          dereference: false,
          filter: src => {
            const rel = path.relative(workspaceRoot, src).replace(/\\/g, '/');
            return !rel.startsWith('.git') && !rel.startsWith('node_modules');
          },
        });

        // Initialize isolated Git repository inside the sandbox for clean diff calculation
        await this.gitRunner.runGit(['-C', sandboxRoot, 'init', '-q']);
        await this.gitRunner.runGit([
          '-C',
          sandboxRoot,
          'config',
          'user.email',
          'sandbox@ai-quality.local',
        ]);
        await this.gitRunner.runGit([
          '-C',
          sandboxRoot,
          'config',
          'user.name',
          'AI Quality Sandbox',
        ]);
        await this.gitRunner.runGit(['-C', sandboxRoot, 'add', '-A']);
        await this.gitRunner.runGit([
          '-C',
          sandboxRoot,
          'commit',
          '-m',
          `baseline ${patchProposal.repositoryRevision}`,
          '--no-gpg-sign',
          '-q',
        ]);
      } catch (err: unknown) {
        if (fs.existsSync(sandboxRoot)) {
          try {
            fs.rmSync(sandboxRoot, { recursive: true, force: true });
          } catch {
            // Ignore cleanup error on failed creation
          }
        }
        throw new PatchSandboxCreationFailedError(
          `Failed to provision isolated sandbox snapshot: ${err instanceof Error ? err.message : String(err)}`,
        );
      }

      // 7. Persist DefectPatchSandbox record in Prisma
      const record = await this.prisma.defectPatchSandbox.create({
        data: {
          id: sandboxId,
          projectId,
          failureCaseId,
          repositoryId: effectiveRepoId!,
          patchProposalId,
          sandboxStatus: 'READY',
          sourceRevision: patchProposal.repositoryRevision,
          sandboxRevision: patchProposal.repositoryRevision,
          branchName: patchProposal.branchName ?? null,
          sandboxRoot,
          isolationStrategy: 'SNAPSHOT_COPY_ISOLATION',
          isolationVersion: 1,

          originalRepoHeadCommit: baseline.headCommit,
          originalRepoClean: baseline.isClean,
          originalRepoIntegrityVerified: true,
          originalRepoModifiedCount: 0,

          claimedFilesCount: patchProposal.filesChangedCount,
          claimedLinesAdded: patchProposal.linesAddedCount,
          claimedLinesRemoved: patchProposal.linesRemovedCount,

          fileHashesBeforeJson: baseline.targetFileHashes,
          securityChecksJson: {},
        },
      });

      getLogger().info('patch_sandbox.created', {
        projectId,
        failureCaseId,
        patchProposalId,
        sandboxId,
        sourceRevision: patchProposal.repositoryRevision,
      });

      return this.mapToDto(record);
    });
  }

  /**
   * Applies candidate patch inside the sandbox with containment, conflict, and immutability validation.
   */
  async applyPatchToSandbox(input: ApplyPatchToSandboxInputDto): Promise<DefectPatchSandboxDto> {
    return this.applyPatch(input);
  }

  async applyPatch(input: ApplyPatchToSandboxInputDto): Promise<DefectPatchSandboxDto> {
    const validated = parseInput(applyPatchToSandboxInputSchema, input);
    const { projectId, sandboxId } = validated;

    const sandbox = await this.prisma.defectPatchSandbox.findUnique({
      where: { id: sandboxId },
    });

    if (!sandbox) {
      throw new PatchSandboxNotFoundError(`Sandbox '${sandboxId}' not found.`);
    }

    if (sandbox.projectId !== projectId) {
      throw new PatchSandboxCrossProjectError(
        `Cross-project forbidden: Sandbox '${sandboxId}' does not belong to project '${projectId}'.`,
      );
    }

    return this.withMutex(sandbox.failureCaseId, async () => {
      // Idempotency: if already applied, return current record safely
      if (sandbox.sandboxStatus === 'PATCH_APPLIED') {
        return this.mapToDto(sandbox);
      }

      if (sandbox.sandboxStatus !== 'READY') {
        throw new PatchSandboxValidationError(
          `Sandbox '${sandboxId}' is in status '${sandbox.sandboxStatus}'. Patches may only be applied when status is 'READY'.`,
        );
      }

      // Load patch proposal
      const patchProposal = await this.prisma.defectPatchProposal.findUnique({
        where: { id: sandbox.patchProposalId },
      });

      if (!patchProposal) {
        throw new PatchSandboxNotFoundError(
          `Patch proposal '${sandbox.patchProposalId}' not found for sandbox '${sandboxId}'.`,
        );
      }

      // 1. Run Containment and Security Boundary Checks (Sections 11, 12, 14, 18, 19)
      const validationResult = SandboxContainmentValidator.performAllChecks(
        sandbox.sandboxRoot,
        patchProposal.targetFiles,
        patchProposal.targetFiles,
      );

      // 2. Mark PATCH_APPLYING
      await this.prisma.defectPatchSandbox.update({
        where: { id: sandboxId },
        data: { sandboxStatus: 'PATCH_APPLYING' },
      });

      // 3. Resolve Authoritative Baseline again to verify no drift occurred
      let workspaceRoot: string | null = null;
      if (this.prisma.projectSource) {
        const repository = await this.prisma.projectSource.findUnique({
          where: { id: sandbox.repositoryId },
        });
        if (repository?.rootPath) {
          workspaceRoot = path.resolve(repository.rootPath);
        }
      }
      if (
        !workspaceRoot &&
        (patchProposal as any).failureCase?.defectLocalizations?.[0]?.source?.rootPath
      ) {
        workspaceRoot = path.resolve(
          (patchProposal as any).failureCase.defectLocalizations[0].source.rootPath,
        );
      }
      if (!workspaceRoot) {
        throw new PatchSandboxNotFoundError('Authoritative repository not found.');
      }

      const baselineBeforeApply = await this.captureAuthoritativeBaseline(
        sandbox.repositoryId,
        workspaceRoot,
        patchProposal.targetFiles,
      );

      // 4. Apply structured edits inside the sandbox using SandboxPatchApplicator
      let changeSet;
      try {
        const structuredEdits =
          (patchProposal.structuredEditsJson as unknown as StructuredEditOperationDto[]) ?? [];
        changeSet = SandboxPatchApplicator.applyPatchToSandbox({
          sandboxId,
          sandboxRoot: sandbox.sandboxRoot,
          structuredEdits,
          targetFiles: patchProposal.targetFiles,
          claimedFilesCount:
            patchProposal.filesChangedCount ?? (patchProposal as any).filesChanged ?? 1,
          claimedLinesAdded:
            patchProposal.linesAddedCount ?? (patchProposal as any).linesAdded ?? 0,
          claimedLinesRemoved:
            patchProposal.linesRemovedCount ?? (patchProposal as any).linesRemoved ?? 0,
        });
      } catch (err: unknown) {
        await this.prisma.defectPatchSandbox.update({
          where: { id: sandboxId },
          data: {
            sandboxStatus: 'PATCH_REJECTED',
            failureReason: err instanceof Error ? err.message : String(err),
          },
        });
        throw err;
      }

      // 5. Verify Authoritative Repository Immutability (Sections 4, 9, 59)
      const baselineAfterApply = await this.captureAuthoritativeBaseline(
        sandbox.repositoryId,
        workspaceRoot,
        patchProposal.targetFiles,
      );

      if (
        baselineAfterApply.headCommit !== baselineBeforeApply.headCommit ||
        baselineAfterApply.statusPorcelain !== baselineBeforeApply.statusPorcelain
      ) {
        // Authoritative repository was modified! Release blocker!
        await this.prisma.defectPatchSandbox.update({
          where: { id: sandboxId },
          data: {
            sandboxStatus: 'FAILED',
            failureReason:
              'CRITICAL SECURITY VIOLATION: Authoritative repository was mutated during sandbox patch application.',
          },
        });
        throw new PatchSandboxImmutabilityViolationError(
          'CRITICAL: Authoritative repository state was modified during sandbox patch application. Sandbox failed.',
        );
      }

      // Verify file hashes on authoritative repository remain 100% unchanged
      for (const [file, originalHash] of Object.entries(baselineBeforeApply.targetFileHashes)) {
        const afterHash = baselineAfterApply.targetFileHashes[file];
        if (afterHash !== originalHash) {
          throw new PatchSandboxImmutabilityViolationError(
            `CRITICAL: Authoritative file '${file}' hash changed from ${originalHash} to ${afterHash}. Immutability violated.`,
          );
        }
      }

      // 6. Commit patch in sandbox Git for clean sandboxRevision
      let sandboxCommitSha: string | null = null;
      try {
        await this.gitRunner.runGit(['-C', sandbox.sandboxRoot, 'add', '-A']);
        const commitResult = await this.gitRunner.runGit([
          '-C',
          sandbox.sandboxRoot,
          'commit',
          '-m',
          `applied candidate patch v${patchProposal.proposalVersion}`,
          '--no-gpg-sign',
          '-q',
        ]);
        if (commitResult.exitCode === 0) {
          sandboxCommitSha = await this.gitRunner.getHeadCommit(sandbox.sandboxRoot);
        }
      } catch {
        // Fallback
      }

      // 7. Persist PATCH_APPLIED outcome
      const updated = await this.prisma.defectPatchSandbox.update({
        where: { id: sandboxId },
        data: {
          sandboxStatus: 'PATCH_APPLIED',
          patchApplied: true,
          patchAppliedAt: new Date(),
          appliedPatchProposalVersion: patchProposal.proposalVersion,
          sandboxRevision: sandboxCommitSha ?? sandbox.sourceRevision,

          actualFilesModified: [...changeSet.filesModified],
          actualFilesCreated: [...changeSet.filesCreated],
          actualFilesDeleted: [...changeSet.filesDeleted],
          actualFilesRenamed: [...changeSet.filesRenamed],
          actualLinesAdded: changeSet.linesAdded,
          actualLinesRemoved: changeSet.linesRemoved,
          actualTotalChangedLines: changeSet.totalChangedLines,

          actualUnifiedDiff: changeSet.actualUnifiedDiff,
          changeSetHash: changeSet.changeSetHash,
          claimedVsActualDiffMatch: changeSet.claimedVsActualDiffMatch,

          fileHashesBeforeJson: changeSet.fileHashesBefore,
          fileHashesAfterJson: changeSet.fileHashesAfter,
          securityChecksJson: validationResult.securityChecks as unknown as Prisma.InputJsonValue,

          originalRepoIntegrityVerified: true,
          originalRepoModifiedCount: 0,
        },
      });

      getLogger().info('patch_sandbox.patch_applied', {
        projectId,
        sandboxId,
        filesModified: changeSet.filesModified.length,
        linesAdded: changeSet.linesAdded,
        linesRemoved: changeSet.linesRemoved,
      });

      return this.mapToDto(updated);
    });
  }

  /**
   * Destroys an isolated sandbox, ensuring safe directory removal without traversing outside.
   */
  async destroySandbox(input: DestroyPatchSandboxInputDto): Promise<DefectPatchSandboxDto> {
    const validated = parseInput(destroyPatchSandboxInputSchema, input);
    const { projectId, sandboxId } = validated;

    const sandbox = await this.prisma.defectPatchSandbox.findUnique({
      where: { id: sandboxId },
    });

    if (!sandbox) {
      throw new PatchSandboxNotFoundError(`Sandbox '${sandboxId}' not found.`);
    }

    if (sandbox.projectId !== projectId) {
      throw new PatchSandboxCrossProjectError(
        `Cross-project forbidden: Sandbox '${sandboxId}' does not belong to project '${projectId}'.`,
      );
    }

    return this.withMutex(sandbox.failureCaseId, async () => {
      // Security check: verify sandboxRoot is strictly inside the sandbox base dir (Section 38)
      const canonicalBase = path.resolve(this.sandboxStorageBaseDir);
      const expectedProjectDir = path.resolve(canonicalBase, projectId);
      const canonicalSandboxRoot = path.resolve(sandbox.sandboxRoot);

      if (
        !canonicalSandboxRoot.startsWith(expectedProjectDir + path.sep) ||
        canonicalSandboxRoot === expectedProjectDir ||
        canonicalSandboxRoot === canonicalBase
      ) {
        throw new PatchSandboxCleanupFailedError(
          `Security violation: Sandbox root '${sandbox.sandboxRoot}' is not strictly inside project sandbox directory. Deletion blocked.`,
        );
      }

      await this.prisma.defectPatchSandbox.update({
        where: { id: sandboxId },
        data: { sandboxStatus: 'DESTROYING' },
      });

      try {
        if (fs.existsSync(canonicalSandboxRoot)) {
          fs.rmSync(canonicalSandboxRoot, { recursive: true, force: true });
        }
      } catch (err: unknown) {
        await this.prisma.defectPatchSandbox.update({
          where: { id: sandboxId },
          data: {
            sandboxStatus: 'FAILED',
            failureReason: `Filesystem cleanup failed: ${err instanceof Error ? err.message : String(err)}`,
          },
        });
        throw new PatchSandboxCleanupFailedError(
          `Failed to clean up sandbox directory: ${err instanceof Error ? err.message : String(err)}`,
        );
      }

      const updated = await this.prisma.defectPatchSandbox.update({
        where: { id: sandboxId },
        data: {
          sandboxStatus: 'DESTROYED',
          destroyedAt: new Date(),
        },
      });

      getLogger().info('patch_sandbox.destroyed', {
        projectId,
        sandboxId,
        actor: validated.actor,
      });

      return this.mapToDto(updated);
    });
  }

  /**
   * Retrieves a sandbox by ID or by failure case.
   */
  async getSandbox(input: GetPatchSandboxInputDto): Promise<DefectPatchSandboxDto | null> {
    const validated = parseInput(getPatchSandboxInputSchema, input);

    let record;
    if (validated.sandboxId) {
      record = await this.prisma.defectPatchSandbox.findUnique({
        where: { id: validated.sandboxId },
      });
    } else if (validated.patchProposalId) {
      record = await this.prisma.defectPatchSandbox.findFirst({
        where: {
          projectId: validated.projectId,
          patchProposalId: validated.patchProposalId,
        },
        orderBy: { createdAt: 'desc' },
      });
    } else if (validated.failureCaseId) {
      record = await this.prisma.defectPatchSandbox.findFirst({
        where: {
          projectId: validated.projectId,
          failureCaseId: validated.failureCaseId,
        },
        orderBy: { createdAt: 'desc' },
      });
    } else {
      throw new PatchSandboxValidationError(
        'Either sandboxId, patchProposalId, or failureCaseId must be provided.',
      );
    }

    if (!record) {
      return null;
    }

    if (record.projectId !== validated.projectId) {
      throw new PatchSandboxCrossProjectError(
        `Cross-project forbidden: Sandbox '${record.id}' does not belong to project '${validated.projectId}'.`,
      );
    }

    return this.mapToDto(record);
  }

  /**
   * Lists sandboxes for a project/failureCase/patchProposal.
   */
  async listSandboxes(
    input: ListPatchSandboxesInputDto,
  ): Promise<readonly DefectPatchSandboxDto[]> {
    const validated = parseInput(listPatchSandboxesInputSchema, input);

    const records = await this.prisma.defectPatchSandbox.findMany({
      where: {
        projectId: validated.projectId,
        ...(validated.failureCaseId ? { failureCaseId: validated.failureCaseId } : {}),
        ...(validated.patchProposalId ? { patchProposalId: validated.patchProposalId } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });

    return records.map(r => this.mapToDto(r));
  }

  /**
   * Captures authoritative repository baseline facts without mutating anything.
   */
  private async captureAuthoritativeBaseline(
    repositoryId: string,
    workspaceRoot: string,
    targetFiles: readonly string[],
  ): Promise<AuthoritativeBaselineSnapshot> {
    let headCommit = '0000000000000000000000000000000000000000';
    let branchName: string | null = null;
    let isClean = true;
    let statusPorcelain = '';

    try {
      const head = await this.gitRunner.getHeadCommit(workspaceRoot);
      if (head) headCommit = head;

      branchName = await this.gitRunner.getCurrentBranch(workspaceRoot);

      const statusResult = await this.gitRunner.runGit([
        '-C',
        workspaceRoot,
        'status',
        '--porcelain',
      ]);
      if (statusResult.exitCode === 0) {
        statusPorcelain = statusResult.stdout;
        isClean = statusPorcelain.length === 0;
      }
    } catch {
      // Non-git or git command failure fallback
    }

    const targetFileHashes: Record<string, string> = {};
    for (const file of targetFiles) {
      const fullPath = path.resolve(workspaceRoot, file);
      if (fs.existsSync(fullPath)) {
        try {
          const content = fs.readFileSync(fullPath, 'utf8');
          targetFileHashes[file] = crypto
            .createHash('sha256')
            .update(content, 'utf8')
            .digest('hex');
        } catch {
          // Unreadable file fallback
        }
      }
    }

    return {
      repositoryId,
      workspaceRoot,
      headCommit,
      branchName,
      isClean,
      statusPorcelain,
      targetFileHashes,
      capturedAt: new Date(),
    };
  }

  /**
   * Maps Prisma database entity to sanitized, renderer-safe DTO.
   */
  private mapToDto(
    record: Prisma.DefectPatchSandboxGetPayload<Record<string, never>>,
  ): DefectPatchSandboxDto {
    return {
      id: record.id,
      projectId: record.projectId,
      failureCaseId: record.failureCaseId,
      repositoryId: record.repositoryId,
      patchProposalId: record.patchProposalId,

      sandboxStatus: record.sandboxStatus,

      sourceRevision: record.sourceRevision,
      sandboxRevision: record.sandboxRevision,
      branchName: record.branchName,

      // Strictly sanitized location - no raw filesystem hierarchy leaked
      sanitizedSandboxLocation: PatchSandboxService.maskSandboxLocation(record.id),
      isolationStrategy: record.isolationStrategy,
      isolationVersion: record.isolationVersion,

      originalRepoHeadCommit: record.originalRepoHeadCommit,
      originalRepoClean: record.originalRepoClean,
      originalRepoIntegrityVerified: record.originalRepoIntegrityVerified,
      originalRepoModifiedCount: record.originalRepoModifiedCount,

      appliedPatchProposalVersion: record.appliedPatchProposalVersion,
      patchApplied: record.patchApplied,
      patchAppliedAt: record.patchAppliedAt ? record.patchAppliedAt.toISOString() : null,

      claimedFilesCount: record.claimedFilesCount,
      claimedLinesAdded: record.claimedLinesAdded,
      claimedLinesRemoved: record.claimedLinesRemoved,

      actualFilesModified: record.actualFilesModified,
      actualFilesCreated: record.actualFilesCreated,
      actualFilesDeleted: record.actualFilesDeleted,
      actualFilesRenamed: record.actualFilesRenamed,
      actualLinesAdded: record.actualLinesAdded,
      actualLinesRemoved: record.actualLinesRemoved,
      actualTotalChangedLines: record.actualTotalChangedLines,

      actualUnifiedDiff: record.actualUnifiedDiff,
      changeSetHash: record.changeSetHash,
      claimedVsActualDiffMatch: record.claimedVsActualDiffMatch,

      fileHashesBefore: (record.fileHashesBeforeJson as Record<string, string>) ?? {},
      fileHashesAfter: (record.fileHashesAfterJson as Record<string, string>) ?? {},
      securityChecks:
        (record.securityChecksJson as unknown as PatchSandboxSecurityChecksDto) ?? undefined,

      failureReason: record.failureReason,
      expiresAt: record.expiresAt ? record.expiresAt.toISOString() : null,
      destroyedAt: record.destroyedAt ? record.destroyedAt.toISOString() : null,

      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    };
  }
}
