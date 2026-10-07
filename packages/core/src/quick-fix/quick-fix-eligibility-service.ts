/**
 * @file packages/core/src/quick-fix/quick-fix-eligibility-service.ts
 * Authoritative business service for AI Quick-Fix Eligibility & Safety Analysis (V7 Phase 99).
 */

import type {
  PrismaClient,
  QuickFixEligibilityAssessment as PrismaAssessment,
} from '@prisma/client';
import type {
  EvaluateQuickFixEligibilityInput,
  GetQuickFixAssessmentInput,
  ListQuickFixAssessmentsInput,
  QuickFixEligibilityAssessment,
  QuickFixFacts,
  QuickFixGitState,
  QuickFixRequiredTest,
  IQuickFixEligibilityService,
  QuickFixRiskLevel,
} from './quick-fix-types.js';
import { QuickFixNotFoundError, QuickFixCrossProjectError } from './quick-fix-errors.js';
import { getPrismaClient } from '../database/client.js';
import { DatabaseError } from '../database/errors.js';
import { GitCommandRunner } from '../git/git-command-runner.js';
import { ScopeAnalyzer } from './rules/scope-analyzer.js';
import { SafetyPolicyChecker } from './rules/safety-policy-checker.js';
import { BlastRadiusCalculator } from './rules/blast-radius-calculator.js';
import { QuickFixRulesEngine } from './rules/quick-fix-rules-engine.js';

export interface QuickFixEligibilityServiceOptions {
  readonly prisma?: PrismaClient;
  readonly gitRunner?: GitCommandRunner;
  readonly scopeAnalyzer?: ScopeAnalyzer;
  readonly safetyChecker?: SafetyPolicyChecker;
  readonly blastRadiusCalculator?: BlastRadiusCalculator;
  readonly rulesEngine?: QuickFixRulesEngine;
}

export class QuickFixEligibilityService implements IQuickFixEligibilityService {
  private readonly prisma: PrismaClient;
  private readonly gitRunner: GitCommandRunner;
  private readonly scopeAnalyzer: ScopeAnalyzer;
  private readonly safetyChecker: SafetyPolicyChecker;
  private readonly blastRadiusCalculator: BlastRadiusCalculator;
  private readonly rulesEngine: QuickFixRulesEngine;
  private readonly defectLocks: Map<string, Promise<void>> = new Map();

  constructor(options: QuickFixEligibilityServiceOptions = {}) {
    if (options.prisma) {
      this.prisma = options.prisma;
    } else {
      const client = getPrismaClient();
      if (!client) {
        throw new DatabaseError(
          'Database connection is not configured or unavailable.',
          'DATABASE_UNAVAILABLE',
        );
      }
      this.prisma = client;
    }

    this.gitRunner = options.gitRunner ?? new GitCommandRunner();
    this.scopeAnalyzer = options.scopeAnalyzer ?? new ScopeAnalyzer();
    this.safetyChecker = options.safetyChecker ?? new SafetyPolicyChecker();
    this.blastRadiusCalculator =
      options.blastRadiusCalculator ?? new BlastRadiusCalculator({ prisma: this.prisma });
    this.rulesEngine = options.rulesEngine ?? new QuickFixRulesEngine();
  }

  /**
   * Serialized concurrency lock per failure case.
   */
  private async acquireLock(failureCaseId: string): Promise<() => void> {
    while (this.defectLocks.has(failureCaseId)) {
      await this.defectLocks.get(failureCaseId);
    }
    let resolveLock!: () => void;
    const lockPromise = new Promise<void>(resolve => {
      resolveLock = resolve;
    });
    this.defectLocks.set(failureCaseId, lockPromise);

    return () => {
      this.defectLocks.delete(failureCaseId);
      resolveLock();
    };
  }

  /**
   * Evaluates AI Quick-Fix eligibility and safety for a failure case.
   */
  async evaluateEligibility(
    input: EvaluateQuickFixEligibilityInput,
  ): Promise<QuickFixEligibilityAssessment> {
    const { projectId, failureCaseId, sourceId, actor = 'SYSTEM' } = input;
    const releaseLock = await this.acquireLock(failureCaseId);

    try {
      // 1. Multi-tenant and existence verification
      const failureCase = await this.prisma.failureCase.findUnique({
        where: { id: failureCaseId },
        include: {
          testCase: true,
          reproductionAttempts: {
            orderBy: { createdAt: 'desc' },
            take: 5,
          },
          domainSeparations: {
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
          technicalLocalizations: {
            where: { isAuthoritative: true },
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
          rootCauseAnalyses: {
            where: { isAuthoritative: true },
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
          confidenceAssessments: {
            where: { isAuthoritative: true },
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
      });

      if (!failureCase) {
        throw new QuickFixNotFoundError(failureCaseId);
      }

      if (failureCase.projectId !== projectId) {
        throw new QuickFixCrossProjectError();
      }

      // 2. Resolve Project Source / Git Repository
      const source = await this.prisma.projectSource.findFirst({
        where: sourceId ? { id: sourceId, projectId } : { projectId },
      });

      // 3. Inspect Git working tree state safely
      let gitState: QuickFixGitState = {
        branch: undefined,
        commitSha: undefined,
        isClean: true,
        modifiedFiles: [],
        untrackedFiles: [],
      };

      if (source?.rootPath) {
        gitState = await this.inspectGitState(source.rootPath);
      }

      // 4. Extract scope: candidate files and symbols
      const latestLoc = failureCase.technicalLocalizations[0];
      const latestRca = failureCase.rootCauseAnalyses[0];
      const scope = this.scopeAnalyzer.analyzeScope({
        localization: latestLoc,
        rootCause: latestRca,
      });

      // Check if any candidate file is dirty in git
      const isDirtyWorktree =
        !gitState.isClean &&
        (scope.candidateFiles.some(
          cf =>
            gitState.modifiedFiles.some((mf: string) => mf.includes(cf) || cf.includes(mf)) ||
            gitState.untrackedFiles.some((uf: string) => uf.includes(cf) || cf.includes(uf)),
        ) ||
          gitState.modifiedFiles.length > 0);

      // 5. Evaluate safety policies
      const safetyResult = this.safetyChecker.evaluateSafetyPolicies(
        scope.candidateFiles,
        scope.candidateSymbols,
        latestRca?.probableCause ?? '',
        isDirtyWorktree,
      );

      // 6. Compute blast radius
      const blastRadius = await this.blastRadiusCalculator.computeBlastRadius(
        source?.id,
        scope.candidateFiles,
      );

      // 7. Check reproduction state
      const isReproduced = failureCase.reproductionAttempts.some(a => a.status === 'REPRODUCED');

      // 8. Check domain separation
      const failureDomain = failureCase.domainSeparations[0]?.domain ?? 'UNKNOWN';

      // 9. Check root cause confidence and references
      const confidenceAssessment = failureCase.confidenceAssessments[0];
      const rootCauseConfidence =
        confidenceAssessment?.overallConfidence ?? (latestRca ? 0.75 : 0.0);
      const rootCauseStatus = latestRca?.rootCauseStatus ?? 'INCONCLUSIVE';
      const repoRefs = Array.isArray(latestRca?.repositoryReferences)
        ? (latestRca.repositoryReferences as unknown[])
        : [];
      const repositoryReferenceCount = repoRefs.length;

      // 10. Compile required verification tests
      const associatedTests: QuickFixRequiredTest[] = [];
      if (failureCase.testCase) {
        associatedTests.push({
          testId: failureCase.testCase.id,
          testName: failureCase.testCase.title,
          testType: 'HISTORICAL',
          isRequired: true,
          reason: 'Original failing test case required for regression fix verification.',
        });
      }

      // 11. Compile QuickFixFacts
      const facts: QuickFixFacts = {
        failureCaseId,
        projectId,
        isReproduced,
        failureDomain,
        candidateFiles: scope.candidateFiles,
        candidateSymbols: scope.candidateSymbols,
        blastRadius,
        gitState,
        riskFactors: safetyResult.riskFactors,
        rootCauseConfidence,
        rootCauseStatus,
        repositoryReferenceCount,
        associatedTests,
      };

      // 12. Evaluate via deterministic Rules Engine
      const ruleResult = this.rulesEngine.evaluate(facts);

      // 13. Persist assessment with supersession
      const existingAssessments = await this.prisma.quickFixEligibilityAssessment.findMany({
        where: { failureCaseId, isAuthoritative: true },
        select: { id: true },
      });

      const assessmentCount =
        (await this.prisma.quickFixEligibilityAssessment.count({
          where: { failureCaseId },
        })) + 1;

      const created = await this.prisma.$transaction(async tx => {
        const newRecord = await tx.quickFixEligibilityAssessment.create({
          data: {
            projectId,
            failureCaseId,
            repositoryId: source?.id ?? null,
            rootCauseAnalysisId: latestRca?.id ?? null,
            decision: ruleResult.decision,
            primaryReason: ruleResult.primaryReason,
            policyVersion: '1.0.0',
            assessmentCount,
            isAuthoritative: true,
            candidateFiles: [...scope.candidateFiles],
            candidateSymbolsJson: JSON.parse(JSON.stringify(scope.candidateSymbols)),
            matchedRules: [...ruleResult.matchedRules],
            blockingRules: [...ruleResult.blockingRules],
            safetyWarnings: [...ruleResult.safetyWarnings],
            humanReviewReasons: [...ruleResult.humanReviewReasons],
            unknownFactors: [...ruleResult.unknownFactors],
            riskFactorsJson: JSON.parse(JSON.stringify(safetyResult.riskFactors)),
            blastRadiusJson: JSON.parse(JSON.stringify(blastRadius)),
            requiredTestsJson: JSON.parse(JSON.stringify(associatedTests)),
            gitStateJson: JSON.parse(JSON.stringify(gitState)),
            metadataJson: JSON.parse(
              JSON.stringify({
                riskLevel: ruleResult.riskLevel,
                confidenceScore: ruleResult.confidenceScore,
                evaluations: ruleResult.evaluations,
                evaluatedBy: actor,
              }),
            ),
          },
        });

        // Mark previous assessments as superseded
        if (existingAssessments.length > 0) {
          await tx.quickFixEligibilityAssessment.updateMany({
            where: {
              id: { in: existingAssessments.map(a => a.id) },
            },
            data: {
              isAuthoritative: false,
              supersededById: newRecord.id,
            },
          });
        }

        return newRecord;
      });

      return this.mapToDto(created);
    } finally {
      releaseLock();
    }
  }

  /**
   * Retrieves an assessment by ID or the latest authoritative assessment for a failure case.
   */
  async getAssessment(
    input: GetQuickFixAssessmentInput,
  ): Promise<QuickFixEligibilityAssessment | null> {
    const { projectId, failureCaseId, assessmentId } = input;

    let record: PrismaAssessment | null = null;
    if (assessmentId) {
      record = await this.prisma.quickFixEligibilityAssessment.findUnique({
        where: { id: assessmentId },
      });
      if (record && (record.projectId !== projectId || record.failureCaseId !== failureCaseId)) {
        throw new QuickFixCrossProjectError();
      }
    } else {
      record = await this.prisma.quickFixEligibilityAssessment.findFirst({
        where: {
          failureCaseId,
          projectId,
          isAuthoritative: true,
        },
        orderBy: { createdAt: 'desc' },
      });
    }

    if (!record) {
      return null;
    }

    return this.mapToDto(record);
  }

  /**
   * Lists all assessments for a failure case.
   */
  async listAssessments(
    input: ListQuickFixAssessmentsInput,
  ): Promise<readonly QuickFixEligibilityAssessment[]> {
    const { projectId, failureCaseId } = input;

    // Verify tenant
    const failureCase = await this.prisma.failureCase.findUnique({
      where: { id: failureCaseId },
      select: { projectId: true },
    });

    if (!failureCase) {
      throw new QuickFixNotFoundError(failureCaseId);
    }

    if (failureCase.projectId !== projectId) {
      throw new QuickFixCrossProjectError();
    }

    const records = await this.prisma.quickFixEligibilityAssessment.findMany({
      where: { failureCaseId, projectId },
      orderBy: { createdAt: 'desc' },
    });

    return records.map(r => this.mapToDto(r));
  }

  /**
   * Safely inspects the git state of a directory using GitCommandRunner.
   */
  private async inspectGitState(dirPath: string): Promise<QuickFixGitState> {
    try {
      const statusRes = await this.gitRunner.runGit(['-C', dirPath, 'status', '--porcelain']);
      const modifiedFiles: string[] = [];
      const untrackedFiles: string[] = [];

      if (statusRes.exitCode === 0 && statusRes.stdout.length > 0) {
        const lines = statusRes.stdout.split('\n').filter(l => l.trim().length > 0);
        for (const line of lines) {
          const status = line.slice(0, 2);
          const filePath = line.slice(3).trim();
          if (status.includes('?')) {
            untrackedFiles.push(filePath);
          } else {
            modifiedFiles.push(filePath);
          }
        }
      }

      let branch: string | undefined;
      const branchRes = await this.gitRunner.runGit([
        '-C',
        dirPath,
        'rev-parse',
        '--abbrev-ref',
        'HEAD',
      ]);
      if (branchRes.exitCode === 0 && branchRes.stdout.length > 0) {
        branch = branchRes.stdout.trim();
      }

      let commitSha: string | undefined;
      const commitRes = await this.gitRunner.runGit(['-C', dirPath, 'rev-parse', 'HEAD']);
      if (commitRes.exitCode === 0 && commitRes.stdout.length > 0) {
        commitSha = commitRes.stdout.trim();
      }

      return {
        branch,
        commitSha,
        isClean: modifiedFiles.length === 0 && untrackedFiles.length === 0,
        modifiedFiles,
        untrackedFiles,
      };
    } catch {
      return {
        branch: undefined,
        commitSha: undefined,
        isClean: true,
        modifiedFiles: [],
        untrackedFiles: [],
      };
    }
  }

  /**
   * Maps Prisma database record to QuickFixEligibilityAssessment DTO.
   */
  private mapToDto(record: PrismaAssessment): QuickFixEligibilityAssessment {
    const meta = (record.metadataJson ?? {}) as Record<string, unknown>;
    const gitState = (record.gitStateJson ?? {}) as QuickFixGitState;
    const riskFactors = (record.riskFactorsJson ?? {}) as any;
    const blastRadius = (record.blastRadiusJson ?? {}) as any;
    const candidateSymbols = Array.isArray(record.candidateSymbolsJson)
      ? (record.candidateSymbolsJson as any)
      : [];
    const requiredTests = Array.isArray(record.requiredTestsJson)
      ? (record.requiredTestsJson as any)
      : [];

    const riskLevel = (meta.riskLevel as QuickFixRiskLevel) ?? 'LOW';
    const confidenceScore = typeof meta.confidenceScore === 'number' ? meta.confidenceScore : 0.8;
    const evaluatedBy = typeof meta.evaluatedBy === 'string' ? meta.evaluatedBy : 'SYSTEM';

    const reasons = [
      ...record.humanReviewReasons,
      ...record.safetyWarnings,
      ...record.unknownFactors,
    ];

    return {
      id: record.id,
      failureCaseId: record.failureCaseId,
      projectId: record.projectId,
      sourceId: record.repositoryId,
      rootCauseAnalysisId: record.rootCauseAnalysisId,
      decision: record.decision,
      riskLevel,
      confidenceScore,
      summary: record.primaryReason,
      reasons: reasons.length > 0 ? reasons : [record.primaryReason],
      matchedRules: record.matchedRules,
      blockingRules: record.blockingRules,
      candidateFiles: record.candidateFiles,
      candidateSymbols,
      blastRadius: {
        totalDependentFiles: blastRadius.totalDependentFiles ?? 0,
        totalDependentSymbols: blastRadius.totalDependentSymbols ?? 0,
        affectedModules: blastRadius.affectedModules ?? [],
        affectedEndpoints: blastRadius.affectedEndpoints,
        dependencyGraphDepth: blastRadius.dependencyGraphDepth,
        highRiskDependents: blastRadius.highRiskDependents,
      },
      requiredTests,
      riskFactors: {
        isSecuritySensitive: Boolean(riskFactors.isSecuritySensitive),
        isAuthOrPermission: Boolean(riskFactors.isAuthOrPermission),
        isFinancialOrPayment: Boolean(riskFactors.isFinancialOrPayment),
        isDbMigrationOrSchema: Boolean(riskFactors.isDbMigrationOrSchema),
        isDependencyChange: Boolean(riskFactors.isDependencyChange),
        isProductionConfigOrCi: Boolean(riskFactors.isProductionConfigOrCi),
        isDataDestructive: Boolean(riskFactors.isDataDestructive),
        isPublicApiBreaking: Boolean(riskFactors.isPublicApiBreaking),
        isDirtyWorktree: Boolean(riskFactors.isDirtyWorktree),
        isLargeScope: Boolean(riskFactors.isLargeScope),
        details: riskFactors.details,
      },
      gitState: {
        branch: gitState.branch,
        commitSha: gitState.commitSha,
        isClean: Boolean(gitState.isClean),
        modifiedFiles: gitState.modifiedFiles ?? [],
        untrackedFiles: gitState.untrackedFiles ?? [],
      },
      gitBranch: gitState.branch ?? null,
      gitCommitSha: gitState.commitSha ?? null,
      gitClean: Boolean(gitState.isClean),
      isSuperseded: !record.isAuthoritative,
      supersededById: record.supersededById,
      evaluatedBy,
      evaluatedAt: record.createdAt.toISOString(),
      metadataJson: record.metadataJson,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    };
  }
}
