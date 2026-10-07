/**
 * @file packages/core/src/patch/context/patch-context-builder.ts
 * Builds grounded, isolated, secret-redacted source and failure context for Phase 101 patch generation.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { PrismaClient } from '@prisma/client';
import { GitCommandRunner } from '../../git/git-command-runner.js';
import type { PatchCandidateSnippet, PatchContext } from '../patch-types.js';
import {
  PatchProposalCrossProjectError,
  PatchProposalHallucinatedEntityError,
  PatchProposalIneligibleError,
  PatchProposalLocalizationRequiredError,
  PatchProposalNotFoundError,
  PatchProposalPathTraversalError,
  PatchProposalRevisionDriftError,
} from '../patch-errors.js';

export interface PatchContextBuilderOptions {
  readonly prisma: PrismaClient;
  readonly gitRunner?: GitCommandRunner;
}

export class PatchContextBuilder {
  private readonly prisma: PrismaClient;
  private readonly gitRunner: GitCommandRunner;

  private static readonly SECRET_PATTERNS = [
    /(?:api[_-]?key|secret|token|password|auth|bearer)\s*[:=]\s*['"]?[a-zA-Z0-9_\-./+=]{8,}['"]?/gi,
    /ghp_[a-zA-Z0-9]{36}/g,
    /eyJ[a-zA-Z0-9_\-./+=]{10,}/g, // JWT
    /(postgres(?:ql)?:\/\/[^:]+:)[^@]+(@)/gi, // URL passwords
  ];

  constructor(options: PatchContextBuilderOptions) {
    this.prisma = options.prisma;
    this.gitRunner = options.gitRunner ?? new GitCommandRunner();
  }

  /**
   * Redacts sensitive keys, tokens, and passwords from string.
   */
  public static redactSecrets(text: string): string {
    if (!text) return text;
    let sanitized = text;
    for (const pattern of PatchContextBuilder.SECRET_PATTERNS) {
      sanitized = sanitized.replace(pattern, '[REDACTED_SECRET]');
    }
    return sanitized;
  }

  /**
   * Normalizes relative file paths with forward slashes and strips leading './' or '/'.
   */
  public static normalizePath(p: string): string {
    return p.trim().replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\//, '');
  }

  /**
   * Builds authoritative context for limited AI patch generation, enforcing Phase 99 & Phase 100 boundaries.
   */
  public async buildContext(
    projectId: string,
    failureCaseId: string,
    userGuidance?: string,
    options: {
      quickFixAssessmentId?: string;
      defectLocalizationId?: string;
      allowDrifted?: boolean;
    } = {},
  ): Promise<PatchContext> {
    // 1. Load Failure Case
    const failureCase = await this.prisma.failureCase.findUnique({
      where: { id: failureCaseId },
      include: {
        testCase: true,
      },
    });

    if (!failureCase) {
      throw new PatchProposalNotFoundError(`Failure case with ID ${failureCaseId} not found.`);
    }

    if (failureCase.projectId !== projectId) {
      throw new PatchProposalCrossProjectError(
        `Cross-project forbidden: Failure case ${failureCaseId} does not belong to project ${projectId}.`,
      );
    }

    // 2. Load and verify Phase 99 Repair Eligibility
    let quickFixAssessment;
    if (options.quickFixAssessmentId) {
      quickFixAssessment = await this.prisma.quickFixEligibilityAssessment.findUnique({
        where: { id: options.quickFixAssessmentId },
      });
    } else {
      quickFixAssessment = await this.prisma.quickFixEligibilityAssessment.findFirst({
        where: {
          projectId,
          failureCaseId,
          isAuthoritative: true,
        },
        orderBy: { assessmentCount: 'desc' },
      });
    }

    if (!quickFixAssessment) {
      throw new PatchProposalIneligibleError(
        'Defect has no Quick-Fix Eligibility assessment. Phase 99 evaluation is mandatory before patch generation.',
      );
    }

    if (quickFixAssessment.projectId !== projectId) {
      throw new PatchProposalCrossProjectError(
        `Cross-project forbidden: Quick-fix assessment ${quickFixAssessment.id} does not belong to project ${projectId}.`,
      );
    }

    if (quickFixAssessment.decision !== 'ELIGIBLE') {
      throw new PatchProposalIneligibleError(
        `Defect is ineligible for automated patch generation. Repair eligibility status is '${quickFixAssessment.decision}'. Only 'ELIGIBLE' defects may proceed.`,
      );
    }

    // 3. Load and verify Phase 100 Defect Localization
    let defectLocalization;
    if (options.defectLocalizationId) {
      defectLocalization = await this.prisma.repositoryDefectLocalization.findUnique({
        where: { id: options.defectLocalizationId },
      });
    } else {
      defectLocalization = await this.prisma.repositoryDefectLocalization.findFirst({
        where: {
          projectId,
          failureCaseId,
          isAuthoritative: true,
        },
        orderBy: { localizationVersion: 'desc' },
      });
    }

    if (!defectLocalization) {
      throw new PatchProposalLocalizationRequiredError(
        'Defect has no authoritative repository defect localization. Phase 100 localization is mandatory before patch generation.',
      );
    }

    if (defectLocalization.projectId !== projectId) {
      throw new PatchProposalCrossProjectError(
        `Cross-project forbidden: Defect localization ${defectLocalization.id} does not belong to project ${projectId}.`,
      );
    }

    if (!defectLocalization.candidateFiles || defectLocalization.candidateFiles.length === 0) {
      throw new PatchProposalLocalizationRequiredError(
        'Defect localization contains 0 candidate files. Patch generation requires at least one localized candidate file.',
      );
    }

    // 4. Resolve Project Repository / Workspace Root
    const repositoryId = defectLocalization.repositoryId;
    let projectSource = repositoryId
      ? await this.prisma.projectSource.findUnique({ where: { id: repositoryId } })
      : null;

    if (!projectSource) {
      projectSource = await this.prisma.projectSource.findFirst({
        where: { projectId },
        orderBy: { createdAt: 'asc' },
      });
    }

    if (!projectSource || !projectSource.rootPath) {
      throw new PatchProposalNotFoundError(
        `Repository source or root path not found for project ${projectId}.`,
      );
    }

    if (projectSource.projectId !== projectId) {
      throw new PatchProposalCrossProjectError(
        `Cross-project forbidden: Repository ${projectSource.id} does not belong to project ${projectId}.`,
      );
    }

    const workspaceRoot = projectSource.rootPath;

    const normalizedCandidateFiles = defectLocalization.candidateFiles.map(f =>
      PatchContextBuilder.normalizePath(f),
    );

    const rootResolved = path.resolve(workspaceRoot);

    // 5. Candidate File Path Traversal Security Checks
    for (const relativePath of normalizedCandidateFiles) {
      if (
        relativePath.includes('..') ||
        path.isAbsolute(relativePath) ||
        relativePath.startsWith('.git') ||
        relativePath.startsWith('node_modules') ||
        relativePath.startsWith('.env')
      ) {
        throw new PatchProposalPathTraversalError(
          `Path traversal detected in candidate file path: '${relativePath}'. Access denied outside workspace root.`,
        );
      }

      const absoluteFilePath = path.resolve(workspaceRoot, relativePath);
      if (
        !absoluteFilePath.startsWith(rootResolved + path.sep) &&
        absoluteFilePath !== rootResolved
      ) {
        throw new PatchProposalPathTraversalError(
          `Candidate file '${relativePath}' resolves outside workspace root.`,
        );
      }
    }

    // 6. Check Git revision state & drift
    let currentHeadCommit: string = defectLocalization.repositoryRevision;
    try {
      const head = await this.gitRunner.getHeadCommit(workspaceRoot);
      if (head) {
        currentHeadCommit = head;
      }
    } catch {
      // Git command fallback to stored revision
      currentHeadCommit = defectLocalization.repositoryRevision;
    }

    const isDrifted = Boolean(
      defectLocalization.isDrifted ||
      (currentHeadCommit &&
        defectLocalization.repositoryRevision &&
        currentHeadCommit !== defectLocalization.repositoryRevision),
    );

    if (isDrifted && !options.allowDrifted) {
      throw new PatchProposalRevisionDriftError(
        `Repository state has drifted: Localization revision is '${defectLocalization.repositoryRevision}', but current HEAD is '${currentHeadCommit}'. Patch generation blocked.`,
      );
    }

    // 7. Inspect candidate file contents and build snippets
    const snippets: PatchCandidateSnippet[] = [];

    for (const relativePath of normalizedCandidateFiles) {
      const absoluteFilePath = path.resolve(workspaceRoot, relativePath);

      // Check symlink escape and file existence
      if (!fs.existsSync(absoluteFilePath)) {
        throw new PatchProposalHallucinatedEntityError(
          `Candidate file '${relativePath}' does not exist on disk in repository workspace.`,
        );
      }

      try {
        const realPath = fs.realpathSync(absoluteFilePath);
        if (!realPath.startsWith(rootResolved + path.sep) && realPath !== rootResolved) {
          throw new PatchProposalPathTraversalError(
            `Symlink escape detected: Candidate file '${relativePath}' links outside workspace root.`,
          );
        }
      } catch {
        throw new PatchProposalHallucinatedEntityError(
          `Candidate file '${relativePath}' realpath resolution failed.`,
        );
      }

      // Read file content and compute hash
      const rawContent = fs.readFileSync(absoluteFilePath, 'utf-8');
      const sha256 = crypto.createHash('sha256').update(rawContent).digest('hex');
      const lines = rawContent.split(/\r?\n/);

      // Determine window around top candidate if available
      let startLine = 1;
      let endLine = Math.min(lines.length, 200);

      const rankedCandidates = (defectLocalization.rankedCandidatesJson as any[]) ?? [];
      const matchRanked = rankedCandidates.find(
        r => PatchContextBuilder.normalizePath(r.filePath) === relativePath,
      );

      if (matchRanked && typeof matchRanked.startLine === 'number' && matchRanked.startLine > 0) {
        startLine = Math.max(1, matchRanked.startLine - 20);
        endLine = Math.min(lines.length, (matchRanked.endLine ?? matchRanked.startLine) + 20);
      }

      const snippetLines = lines.slice(startLine - 1, endLine);
      const snippetContent = snippetLines.join('\n');

      snippets.push({
        filePath: relativePath,
        content: PatchContextBuilder.redactSecrets(snippetContent),
        sha256,
        totalLines: lines.length,
        startLine,
        endLine,
      });
    }

    // 7. Load Root Cause Analysis if available
    let rootCauseAnalysis = null;
    if (defectLocalization.rootCauseAnalysisId) {
      const rca = await this.prisma.failureRootCauseAnalysis.findUnique({
        where: { id: defectLocalization.rootCauseAnalysisId },
      });
      if (rca) {
        rootCauseAnalysis = {
          id: rca.id,
          probableLayer: rca.probableLayer,
          hypothesis: rca.probableCause,
          confidenceScore: 0.9,
        };
      }
    }

    // 8. Load requirement traceability links if present
    let requirementTraceability;
    if (failureCase.testCase) {
      const testCase = failureCase.testCase;
      let requirement = null;
      if (testCase.sourceRequirementId) {
        requirement = await this.prisma.requirement.findUnique({
          where: { id: testCase.sourceRequirementId },
        });
      }
      requirementTraceability = {
        requirementId: requirement?.id ?? null,
        requirementKey: requirement?.requirementKey ?? null,
        requirementTitle: requirement?.title ?? null,
        testCaseId: testCase.id,
        testCaseKey: testCase.testCaseKey,
        testCaseTitle: testCase.title,
      };
    }

    // 9. Redact and guard user guidance
    const sanitizedGuidance = userGuidance
      ? PatchContextBuilder.redactSecrets(userGuidance.trim().substring(0, 2000))
      : undefined;

    return {
      projectId,
      failureCaseId,
      repositoryId: projectSource.id,
      workspaceRoot,
      repositoryRevision: currentHeadCommit || defectLocalization.repositoryRevision,
      branchName: defectLocalization.branchName ?? null,
      isDrifted,
      driftDetails: isDrifted
        ? `Revision mismatch: localization was at ${defectLocalization.repositoryRevision}, current HEAD is ${currentHeadCommit}`
        : null,
      quickFixAssessment: {
        id: quickFixAssessment.id,
        eligibility: quickFixAssessment.decision,
        safetyPolicy: quickFixAssessment.policyVersion,
        riskLevel: (quickFixAssessment.riskFactorsJson as any)?.overallRisk ?? 'LOW',
        reasons: quickFixAssessment.matchedRules ?? [quickFixAssessment.primaryReason],
        suggestedActions: quickFixAssessment.safetyWarnings ?? [],
      },
      defectLocalization: {
        id: defectLocalization.id,
        candidateFiles: normalizedCandidateFiles,
        topCandidateFilePath: defectLocalization.topCandidateFilePath,
        topCandidateSymbolName: defectLocalization.topCandidateSymbolName,
        rankedCandidates: (defectLocalization.rankedCandidatesJson as any[]) ?? [],
        repositoryRevision: defectLocalization.repositoryRevision,
        isDrifted: defectLocalization.isDrifted,
      },
      rootCauseAnalysis,
      failureCase: {
        id: failureCase.id,
        title: PatchContextBuilder.redactSecrets(failureCase.title),
        errorMessage: failureCase.errorMessage
          ? PatchContextBuilder.redactSecrets(failureCase.errorMessage)
          : null,
        stackTrace: failureCase.failureSummary
          ? PatchContextBuilder.redactSecrets(failureCase.failureSummary)
          : null,
        failureSignature: failureCase.failureSignature,
        testCaseId: failureCase.testCaseId,
      },
      requirementTraceability,
      snippets,
      userGuidance: sanitizedGuidance,
    };
  }
}
