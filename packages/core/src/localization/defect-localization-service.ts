/**
 * @file packages/core/src/localization/defect-localization-service.ts
 * Authoritative orchestrator for V7 Phase 100 Repository-Aware Defect Localization.
 */

import fs from 'node:fs';
import path from 'node:path';
import { PrismaClient, type Prisma } from '@prisma/client';
import type {
  CandidateSourceContentDto,
  DefectCandidateTypeDto,
  GetDefectLocalizationInputDto,
  InspectCandidateSourceInputDto,
  ListDefectLocalizationsInputDto,
  LocalizeDefectInputDto,
  RepositoryDefectLocalizationDto,
  RepositoryRevisionStateDto,
} from '@ai-quality/contracts';
import { GitCommandRunner } from '../git/git-command-runner.js';
import { getLogger } from '../logging/logger.js';
import {
  DefectLocalizationConcurrentMutationError,
  DefectLocalizationCrossProjectError,
  DefectLocalizationNotFoundError,
  DefectLocalizationPathTraversalError,
  DefectLocalizationRepositoryNotFoundError,
  DefectLocalizationRevisionUnavailableError,
  DefectLocalizationSymlinkEscapeError,
  DefectLocalizationValidationError,
} from './defect-localization-errors.js';
import {
  DEFECT_LOCALIZATION_BOUNDS,
  type IDefectLocalizationService,
  type LocalizationContext,
  type RawCandidateFact,
} from './defect-localization-types.js';
import { CandidateRanker } from './ranking/candidate-ranker.js';
import { CandidateValidator } from './ranking/candidate-validator.js';
import { NetworkRouteCorrelator } from './signals/network-route-correlator.js';
import { SourceMapResolver } from './signals/source-map-resolver.js';
import { StackTraceCorrelator } from './signals/stack-trace-correlator.js';
import { SymbolGraphExpander } from './signals/symbol-graph-expander.js';
import { UiComponentCorrelator } from './signals/ui-component-correlator.js';

export class DefectLocalizationService implements IDefectLocalizationService {
  private static readonly activeLocalizations = new Set<string>();

  constructor(
    private readonly prisma: PrismaClient = new PrismaClient(),
    private readonly gitRunner: GitCommandRunner = new GitCommandRunner(),
    private readonly networkCorrelator: NetworkRouteCorrelator = new NetworkRouteCorrelator(),
    private readonly uiCorrelator: UiComponentCorrelator = new UiComponentCorrelator(),
    private readonly stackCorrelator: StackTraceCorrelator = new StackTraceCorrelator(),
    private readonly sourceMapResolver: SourceMapResolver = new SourceMapResolver(),
    private readonly symbolExpander: SymbolGraphExpander = new SymbolGraphExpander(),
    private readonly validator: CandidateValidator = new CandidateValidator(),
    private readonly ranker: CandidateRanker = new CandidateRanker(),
  ) {}

  /**
   * Authoritatively evaluates and persists repository defect localization for a failure case.
   */
  public async localizeDefect(
    input: LocalizeDefectInputDto,
  ): Promise<RepositoryDefectLocalizationDto> {
    const startTime = performance.now();

    if (!input.projectId || !input.failureCaseId) {
      throw new DefectLocalizationValidationError('projectId and failureCaseId are required.');
    }

    // Concurrency Mutex per Failure Case
    const mutexKey = `${input.projectId}:${input.failureCaseId}`;
    if (DefectLocalizationService.activeLocalizations.has(mutexKey)) {
      throw new DefectLocalizationConcurrentMutationError(
        `Localization is already running for failure case ${input.failureCaseId}.`,
      );
    }

    DefectLocalizationService.activeLocalizations.add(mutexKey);

    try {
      // 1. Check existing authoritative localization if forceRelocalize is false
      if (!input.forceRelocalize && this.prisma.repositoryDefectLocalization) {
        const existing = await this.prisma.repositoryDefectLocalization.findFirst({
          where: {
            projectId: input.projectId,
            failureCaseId: input.failureCaseId,
            isAuthoritative: true,
          },
          orderBy: { localizationVersion: 'desc' },
        });

        if (existing) {
          getLogger().info('defect_localization.cached_retrieved', {
            projectId: input.projectId,
            failureCaseId: input.failureCaseId,
            localizationId: existing.id,
          });
          return this.mapToDto(existing);
        }
      }

      // 2. Build complete localization context
      const context = await this.buildLocalizationContext(input.projectId, input.failureCaseId);

      // 3. Correlate Signals
      const allFacts: RawCandidateFact[] = [];

      // A. Network Route Correlation
      const networkResult = this.networkCorrelator.correlate(context);
      allFacts.push(...networkResult.facts);

      // B. UI Component Correlation
      const uiResult = this.uiCorrelator.correlate(context);
      allFacts.push(...uiResult.facts);

      // C. Stack Trace Correlation
      const stackResult = this.stackCorrelator.correlate(context);
      allFacts.push(...stackResult.facts);

      // D. Source Map Inspection
      const sourceMapResult = this.sourceMapResolver.resolve(context);
      allFacts.push(...sourceMapResult.facts);

      // E. V6 Technical Localization & Root Cause Analysis hints
      if (context.technicalLocalization?.matchedFilePath) {
        allFacts.push({
          filePath: context.technicalLocalization.matchedFilePath,
          symbolName: context.technicalLocalization.matchedSymbolName ?? null,
          candidateType: 'FUNCTION',
          startLine: context.technicalLocalization.matchedLineNumber ?? null,
          signal: 'ROOT_CAUSE_PROBABLE_LAYER',
          strength: 'STRONG',
          description: `V6 technical localization pinpointed layer '${context.technicalLocalization.primaryLayer}' in '${context.technicalLocalization.matchedFilePath}'.`,
          provenance: `FailureTechnicalLocalization ID: ${context.technicalLocalization.id}`,
        });
      }

      if (context.rootCauseAnalysis?.candidateFiles) {
        for (const file of context.rootCauseAnalysis.candidateFiles) {
          allFacts.push({
            filePath: file,
            candidateType: 'FILE',
            signal: 'ROOT_CAUSE_HYPOTHESIS',
            strength: 'MODERATE',
            description: `V6 Root Cause Analysis hypothesis identified probable defect in '${file}'.`,
            provenance: `FailureRootCauseAnalysis probable cause: ${context.rootCauseAnalysis.probableCause.slice(0, 100)}`,
          });
        }
      }

      // F. Requirement Traceability context
      if (context.requirement) {
        const reqTokens = context.requirement.title
          .toLowerCase()
          .split(/\s+/)
          .filter(t => t.length > 3);
        for (const rf of context.repositoryFiles) {
          const lower = rf.relativePath.toLowerCase();
          if (reqTokens.some(t => lower.includes(t))) {
            allFacts.push({
              filePath: rf.relativePath,
              candidateType: 'FUNCTION' as DefectCandidateTypeDto,
              signal: 'REQUIREMENT_TRACEABILITY',
              strength: 'WEAK',
              description: `Repository file matches requirement keyword '${context.requirement.key} - ${context.requirement.title}'.`,
              provenance: `Requirement: ${context.requirement.key}`,
            });
          }
        }
      }

      // 4. Symbol Graph Expansion (Imports & Callers)
      const graphResult = this.symbolExpander.expand(allFacts, context);
      allFacts.push(...graphResult.facts);

      // 5. Anti-Hallucination & Security Validation
      const validatedFacts = this.validator.validateCandidateFacts(allFacts, context);

      // 6. Deterministic Candidate Ranking
      const rankingResult = this.ranker.rank(validatedFacts, context);

      // 7. Supersession Management
      const previousAuthoritative = await this.prisma.repositoryDefectLocalization.findFirst({
        where: {
          projectId: input.projectId,
          failureCaseId: input.failureCaseId,
          isAuthoritative: true,
        },
        orderBy: { localizationVersion: 'desc' },
      });

      const nextVersion = previousAuthoritative ? previousAuthoritative.localizationVersion + 1 : 1;

      const durationMs = Math.round(performance.now() - startTime);

      // 8. Traceability Assembly
      const traceabilityPayload = {
        requirementId: context.requirement?.id ?? null,
        requirementKey: context.requirement?.key ?? null,
        requirementTitle: context.requirement?.title ?? null,
        testCaseId: context.testCase?.id ?? null,
        testCaseKey: context.testCase?.key ?? null,
        testCaseTitle: context.testCase?.title ?? null,
        executionId: context.failureCase.executionId ?? null,
        failedStepAction: context.failedStep?.action ?? null,
        failedStepTarget: context.failedStep?.target ?? null,
        assertionMessage: context.failureCase.errorMessage ?? null,
      };

      // 9. Persist in Database
      const created = await this.prisma.$transaction(async tx => {
        if (previousAuthoritative) {
          await tx.repositoryDefectLocalization.update({
            where: { id: previousAuthoritative.id },
            data: { isAuthoritative: false },
          });
        }

        return await tx.repositoryDefectLocalization.create({
          data: {
            projectId: input.projectId,
            failureCaseId: input.failureCaseId,
            repositoryId: context.repositoryId,
            rootCauseAnalysisId: context.rootCauseAnalysis?.id ?? null,
            quickFixAssessmentId: context.quickFixAssessment?.id ?? null,

            repositoryRevision: context.headCommit ?? 'HEAD',
            failureTimeRevision: context.failureTimeCommit,
            branchName: context.branchName,
            revisionState: context.revisionState as any,
            isDrifted: context.isDrifted,
            driftDetails: context.driftDetails,

            topCandidateFilePath: rankingResult.topCandidate?.filePath ?? null,
            topCandidateSymbolName: rankingResult.topCandidate?.symbolName ?? null,
            topCandidateScore: rankingResult.topCandidate?.score ?? null,
            topCandidateType: (rankingResult.topCandidate?.candidateType as any) ?? null,

            candidateFiles: [...rankingResult.candidateFiles],
            rankedCandidatesJson: rankingResult.rankedCandidates as any,
            supportingEvidenceJson: rankingResult.supportingEvidence as any,
            contradictingEvidenceJson: rankingResult.contradictingEvidence as any,
            traceabilityJson: traceabilityPayload as any,
            networkCorrelationJson: networkResult as any,
            uiCorrelationJson: uiResult as any,
            stackTraceJson: stackResult as any,
            sourceMapJson: sourceMapResult as any,
            symbolGraphJson: graphResult as any,

            isAuthoritative: true,
            localizationVersion: nextVersion,
            relocalizationReason: input.relocalizationReason ?? null,
            supersededById: previousAuthoritative?.id ?? null,
            durationMs,
            metadataJson: {
              actor: input.actor ?? 'SYSTEM',
              evaluatedAt: new Date().toISOString(),
              totalFactsGathered: allFacts.length,
              validatedFactsCount: validatedFacts.length,
            },
          },
        });
      });

      getLogger().info('defect_localization.completed', {
        projectId: input.projectId,
        failureCaseId: input.failureCaseId,
        localizationId: created.id,
        version: nextVersion,
        candidatesCount: rankingResult.rankedCandidates.length,
        durationMs,
      });

      return this.mapToDto(created);
    } finally {
      DefectLocalizationService.activeLocalizations.delete(mutexKey);
    }
  }

  /**
   * Retrieves an authoritative or specific defect localization.
   */
  public async getLocalization(
    input: GetDefectLocalizationInputDto,
  ): Promise<RepositoryDefectLocalizationDto | null> {
    if (!input.projectId || !input.failureCaseId) {
      throw new DefectLocalizationValidationError('projectId and failureCaseId are required.');
    }

    const whereClause: Prisma.RepositoryDefectLocalizationWhereInput = {
      projectId: input.projectId,
      failureCaseId: input.failureCaseId,
    };

    if (input.localizationId) {
      whereClause.id = input.localizationId;
    } else {
      whereClause.isAuthoritative = true;
    }

    const record = await this.prisma.repositoryDefectLocalization.findFirst({
      where: whereClause,
      orderBy: { localizationVersion: 'desc' },
    });

    if (!record) return null;
    return this.mapToDto(record);
  }

  /**
   * Lists all historical localizations for a failure case.
   */
  public async listLocalizations(
    input: ListDefectLocalizationsInputDto,
  ): Promise<readonly RepositoryDefectLocalizationDto[]> {
    if (!input.projectId || !input.failureCaseId) {
      throw new DefectLocalizationValidationError('projectId and failureCaseId are required.');
    }

    const records = await this.prisma.repositoryDefectLocalization.findMany({
      where: {
        projectId: input.projectId,
        failureCaseId: input.failureCaseId,
      },
      orderBy: { localizationVersion: 'desc' },
    });

    return records.map(r => this.mapToDto(r));
  }

  /**
   * Strictly read-only inspection of candidate source code constrained to authorized repository root.
   */
  public async inspectCandidateSource(
    input: InspectCandidateSourceInputDto,
  ): Promise<CandidateSourceContentDto> {
    if (!input.projectId || !input.failureCaseId || !input.filePath) {
      throw new DefectLocalizationValidationError(
        'projectId, failureCaseId, and filePath are required.',
      );
    }

    // 1. Path traversal check
    if (
      input.filePath.includes('..') ||
      input.filePath.startsWith('/') ||
      input.filePath.startsWith('\\') ||
      input.filePath.includes('/etc/') ||
      input.filePath.includes('.ssh')
    ) {
      throw new DefectLocalizationPathTraversalError(
        `Path traversal denied: '${input.filePath}' contains unauthorized escape characters.`,
      );
    }

    // 2. Validate failure case project ownership
    const failureCase = await this.prisma.failureCase.findUnique({
      where: { id: input.failureCaseId },
    });
    if (!failureCase) throw new DefectLocalizationNotFoundError('Failure case not found.');
    if (failureCase.projectId !== input.projectId) {
      throw new DefectLocalizationCrossProjectError(
        `Failure case ${input.failureCaseId} does not belong to project ${input.projectId}.`,
      );
    }

    // 3. Resolve Project Source
    const source = await this.prisma.projectSource.findUnique({
      where: { projectId: input.projectId },
    });
    if (!source || !fs.existsSync(source.rootPath)) {
      throw new DefectLocalizationRepositoryNotFoundError('Repository root path is not available.');
    }

    const canonicalRoot = path.resolve(source.rootPath);
    const targetPath = path.resolve(canonicalRoot, input.filePath);

    // Canonical containment check
    const relFromRoot = path.relative(canonicalRoot, targetPath);
    if (relFromRoot.startsWith('..') || path.isAbsolute(relFromRoot)) {
      throw new DefectLocalizationPathTraversalError(
        `File '${input.filePath}' resolves outside repository root.`,
      );
    }

    // Symlink escape check
    if (fs.existsSync(targetPath)) {
      try {
        const realTarget = fs.realpathSync(targetPath);
        const relReal = path.relative(canonicalRoot, realTarget);
        if (relReal.startsWith('..') || path.isAbsolute(relReal)) {
          throw new DefectLocalizationSymlinkEscapeError(
            `Symlink '${input.filePath}' resolves outside repository root.`,
          );
        }
      } catch {
        // ignore
      }
    } else {
      throw new DefectLocalizationNotFoundError(
        `File '${input.filePath}' does not exist in repository.`,
      );
    }

    // Read file text
    const stat = await fs.promises.stat(targetPath);
    const isTruncated = stat.size > DEFECT_LOCALIZATION_BOUNDS.MAX_INSPECT_BYTES;
    const rawContent = await fs.promises.readFile(targetPath, 'utf-8');

    // Redact secrets
    const sanitizedContent = this.validator.redactSecrets(rawContent);
    const lines = sanitizedContent.split('\n');
    const totalLines = lines.length;

    const startLine = Math.max(1, input.startLine ?? 1);
    const endLine = Math.min(totalLines, input.endLine ?? totalLines);

    const slicedLines = lines.slice(startLine - 1, endLine);
    const content = slicedLines.join('\n');

    return {
      filePath: input.filePath,
      content,
      totalLines,
      startLine,
      endLine,
      highlightStartLine: input.startLine ?? null,
      highlightEndLine: input.endLine ?? null,
      isTruncated,
      isReadOnly: true,
    };
  }

  /**
   * Gathers and correlates all context across DB and repository.
   */
  private async buildLocalizationContext(
    projectId: string,
    failureCaseId: string,
  ): Promise<LocalizationContext> {
    // 1. Failure Case
    const failureCase = await this.prisma.failureCase.findUnique({
      where: { id: failureCaseId },
      include: {
        testCase: true,
        testRun: true,
        execution: {
          include: {
            stepExecutions: {
              orderBy: { stepIndex: 'asc' },
            },
          },
        },
        evidenceReferences: true,
      },
    });

    if (!failureCase) {
      throw new DefectLocalizationNotFoundError(`Failure case ${failureCaseId} not found.`);
    }

    if (failureCase.projectId !== projectId) {
      throw new DefectLocalizationCrossProjectError(
        `Failure case ${failureCaseId} belongs to another project.`,
      );
    }

    // 2. Project Source & Git metadata
    const source = await this.prisma.projectSource.findUnique({
      where: { projectId },
      include: {
        gitMetadata: true,
        repositoryFiles: {
          include: {
            symbols: true,
            imports: true,
          },
        },
      },
    });

    let workspaceRoot: string | null = null;
    let branchName: string | null = null;
    let headCommit: string | null = null;
    let failureTimeCommit: string | null = null;
    let revisionState: RepositoryRevisionStateDto = 'UNKNOWN';
    let isDrifted = false;
    let driftDetails: string | null = null;

    if (source) {
      workspaceRoot = source.rootPath;
      branchName = source.gitMetadata?.currentBranch ?? null;
      headCommit = source.gitMetadata?.headCommit ?? null;

      // Extract failure-time commit if available from testRun metadata
      const runMeta = failureCase.testRun?.metadataJson as any;
      failureTimeCommit = runMeta?.commitSha ?? source.gitMetadata?.headCommit ?? null;

      // Check current git HEAD via runner if root exists
      if (fs.existsSync(source.rootPath)) {
        try {
          const currentSha = await this.gitRunner.getHeadCommit(source.rootPath);
          if (currentSha) {
            headCommit = currentSha;
          }
        } catch {
          // ignore git command failure
        }
      }

      // Check Revision Drift
      if (failureTimeCommit && headCommit) {
        if (failureTimeCommit === headCommit) {
          revisionState = 'EXACT_REVISION';
          isDrifted = false;
        } else {
          revisionState = 'DRIFTED_REVISION';
          isDrifted = true;
          driftDetails = `Failure occurred at commit ${failureTimeCommit.slice(0, 12)}, but repository currently points to ${headCommit.slice(0, 12)}.`;
        }
      } else if (headCommit) {
        revisionState = 'EQUIVALENT_REVISION';
      } else {
        revisionState = 'HISTORICAL_REVISION_UNAVAILABLE';
      }
    }

    // 3. Requirement Traceability
    let requirement: { id: string; key: string; title: string } | null = null;
    if (failureCase.testCaseId) {
      const trace = await this.prisma.requirementTestTrace.findFirst({
        where: {
          testCaseId: failureCase.testCaseId,
          projectId,
        },
        include: {
          requirement: true,
        },
      });
      if (trace?.requirement) {
        requirement = {
          id: trace.requirement.id,
          key: trace.requirement.requirementKey,
          title: trace.requirement.title,
        };
      }
    }

    // 4. Failed Step
    let failedStep: {
      stepIndex: number;
      action: string;
      target?: string | null;
      value?: string | null;
      errorMessage?: string | null;
    } | null = null;

    if (failureCase.execution?.stepExecutions) {
      const fStep = failureCase.execution.stepExecutions.find(s => s.status === 'FAILED');
      if (fStep) {
        const actionData = (fStep.actionDataJson as any) ?? {};
        failedStep = {
          stepIndex: fStep.stepIndex,
          action: fStep.actionType,
          target: fStep.targetSummary ?? actionData.target ?? null,
          value: actionData.value ?? null,
          errorMessage: fStep.errorMessage,
        };
      }
    }

    // 5. Network & Console Evidence from references and step execution
    const networkEvidence: {
      url: string;
      method: string;
      statusCode?: number | null;
      requestBody?: string | null;
      responseBody?: string | null;
    }[] = [];

    const consoleEvidence: {
      level: string;
      message: string;
      stack?: string | null;
    }[] = [];

    for (const ref of failureCase.evidenceReferences ?? []) {
      const meta = (ref.metadataJson as any) ?? {};
      if (ref.artifactType === 'NETWORK_REQUEST' || ref.artifactType === 'NETWORK_RESPONSE') {
        if (meta.url) {
          networkEvidence.push({
            url: meta.url,
            method: meta.method ?? 'GET',
            statusCode: meta.statusCode ?? null,
            requestBody: meta.requestBody ?? null,
            responseBody: meta.responseBody ?? null,
          });
        }
      } else if (ref.artifactType === 'ERROR_CONTEXT') {
        if (meta.message) {
          consoleEvidence.push({
            level: meta.level ?? 'ERROR',
            message: meta.message,
            stack: meta.stack ?? null,
          });
        }
      }
    }

    // 6. V6 Intelligence
    const technicalLocalization = await this.prisma.failureTechnicalLocalization.findFirst({
      where: { failureCaseId, isAuthoritative: true },
    });

    const rootCauseAnalysis = await this.prisma.failureRootCauseAnalysis.findFirst({
      where: { failureCaseId, isAuthoritative: true },
    });

    const quickFixAssessment = await this.prisma.quickFixEligibilityAssessment.findFirst({
      where: { failureCaseId, isAuthoritative: true },
    });

    // Extract candidate files from RCA repositoryReferences JSON
    let rcaCandidateFiles: string[] = [];
    if (rootCauseAnalysis?.repositoryReferences) {
      const refs = rootCauseAnalysis.repositoryReferences as any[];
      if (Array.isArray(refs)) {
        rcaCandidateFiles = refs.map(r => r.filePath ?? r.matchedFilePath).filter(Boolean);
      }
    }

    return {
      projectId,
      failureCaseId,
      repositoryId: source?.id ?? null,
      workspaceRoot,
      branchName,
      headCommit,
      failureTimeCommit,
      revisionState,
      isDrifted,
      driftDetails,
      failureCase: {
        id: failureCase.id,
        title: failureCase.title,
        status: failureCase.status,
        failureSignature: failureCase.failureSignature,
        errorMessage: failureCase.errorMessage,
        testCaseId: failureCase.testCaseId,
        testRunId: failureCase.testRunId,
        executionId: failureCase.executionId,
      },
      testCase: failureCase.testCase
        ? {
            id: failureCase.testCase.id,
            key: failureCase.testCase.testCaseKey,
            title: failureCase.testCase.title,
            priority: failureCase.testCase.priority,
          }
        : null,
      requirement,
      failedStep,
      networkEvidence,
      consoleEvidence,
      technicalLocalization: technicalLocalization
        ? {
            id: technicalLocalization.id,
            primaryLayer: technicalLocalization.primaryLayer,
            primaryTargetIdentifier: technicalLocalization.primaryTargetIdentifier,
            matchedFilePath: technicalLocalization.matchedFilePath,
            matchedSymbolName: technicalLocalization.matchedSymbolName,
            matchedLineNumber: technicalLocalization.matchedLineNumber,
            httpEndpoint: technicalLocalization.httpEndpoint,
            domSelector: technicalLocalization.domSelector,
            uiComponentName: technicalLocalization.uiComponentName,
            routePath: technicalLocalization.routePath,
            localizationRationale: technicalLocalization.localizationRationale,
          }
        : null,
      rootCauseAnalysis: rootCauseAnalysis
        ? {
            id: rootCauseAnalysis.id,
            rootCauseStatus: rootCauseAnalysis.rootCauseStatus,
            probableLayer: rootCauseAnalysis.probableLayer,
            probableCause: rootCauseAnalysis.probableCause,
            candidateFiles: rcaCandidateFiles,
          }
        : null,
      quickFixAssessment: quickFixAssessment
        ? {
            id: quickFixAssessment.id,
            decision: quickFixAssessment.decision,
            candidateFiles: quickFixAssessment.candidateFiles,
          }
        : null,
      repositoryFiles: source?.repositoryFiles ?? [],
    };
  }

  private mapToDto(
    record: Prisma.RepositoryDefectLocalizationGetPayload<{}>,
  ): RepositoryDefectLocalizationDto {
    return {
      id: record.id,
      projectId: record.projectId,
      failureCaseId: record.failureCaseId,
      repositoryId: record.repositoryId,
      rootCauseAnalysisId: record.rootCauseAnalysisId,
      quickFixAssessmentId: record.quickFixAssessmentId,
      repositoryRevision: record.repositoryRevision,
      failureTimeRevision: record.failureTimeRevision,
      branchName: record.branchName,
      revisionState: record.revisionState as any,
      isDrifted: record.isDrifted,
      driftDetails: record.driftDetails,
      topCandidateFilePath: record.topCandidateFilePath,
      topCandidateSymbolName: record.topCandidateSymbolName,
      topCandidateScore: record.topCandidateScore,
      topCandidateType: record.topCandidateType as any,
      candidateFiles: record.candidateFiles,
      rankedCandidates: (record.rankedCandidatesJson as any) ?? [],
      supportingEvidence: (record.supportingEvidenceJson as any) ?? [],
      contradictingEvidence: (record.contradictingEvidenceJson as any) ?? [],
      traceability: (record.traceabilityJson as any) ?? {},
      networkCorrelation: (record.networkCorrelationJson as any) ?? {},
      uiCorrelation: (record.uiCorrelationJson as any) ?? {},
      stackTrace: (record.stackTraceJson as any) ?? {
        hasTrustedStack: false,
        framesParsed: 0,
      },
      sourceMap: (record.sourceMapJson as any) ?? {
        sourceMapsAvailable: false,
        resolvedFilesCount: 0,
        details: '',
      },
      symbolGraph: (record.symbolGraphJson as any) ?? {
        nodesExplored: 0,
        maxDepthReached: 0,
        relatedFiles: [],
        relatedSymbols: [],
      },
      isAuthoritative: record.isAuthoritative,
      localizationVersion: record.localizationVersion,
      relocalizationReason: record.relocalizationReason,
      supersededById: record.supersededById,
      durationMs: record.durationMs,
      metadataJson: record.metadataJson,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    };
  }
}
