/**
 * @file packages/core/src/retest/test-selection-engine.ts
 * Evaluates candidate test cases, assigns selection states, computes risk signals, and enforces full regression escalation.
 */

import type { PrismaClient } from '@prisma/client';
import type { ImpactCategory, ImpactConfidence, TestSelectionState } from '@ai-quality/contracts';
import {
  DATABASE_CHANGE_KEYWORDS,
  RETEST_BOUNDS,
  SECURITY_CRITICAL_KEYWORDS,
  type TestSelectionEvaluation,
} from './retest-types.js';
import type { DependencyChain } from './impact-graph-builder.js';

export interface SelectionEngineOptions {
  readonly forceFullRegression?: boolean;
  readonly conservativeSafetyPolicy?: boolean;
}

export class TestSelectionEngine {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Evaluates all project test cases against the change snapshot and dependency graph.
   */
  async evaluateTests(
    projectId: string,
    changeSnapshot: {
      sourceType: string;
      sourceEntityId?: string | null;
      changedFiles: readonly string[];
      changedRequirements: readonly string[];
      changedSymbolsJson: readonly unknown[];
      changedApisJson: readonly unknown[];
      changedConfiguration: Record<string, unknown>;
    },
    graphContext: {
      dependencyChainsByFile: Map<string, DependencyChain[]>;
      reqToFileMap: Map<string, Set<string>>;
      fileToReqMap: Map<string, Set<string>>;
      reqToTestsMap: Map<string, Set<string>>;
      testToReqsMap: Map<string, Set<string>>;
    },
    options: SelectionEngineOptions = {},
  ): Promise<{
    evaluations: TestSelectionEvaluation[];
    fullRegressionRequired: boolean;
    fullRegressionReason: string | null;
    counts: {
      total: number;
      mandatory: number;
      recommended: number;
      optional: number;
      unknown: number;
      excluded: number;
    };
  }> {
    const { forceFullRegression = false, conservativeSafetyPolicy = true } = options;

    // 1. Fetch all project test cases
    const testCases = await this.prisma.testCase.findMany({
      where: { projectId },
      include: {
        versions: {
          orderBy: { versionNumber: 'desc' },
          take: 1,
        },
        executableTestPlans: {
          take: 1,
          orderBy: { compiledAt: 'desc' },
        },
        testRuns: {
          take: 5,
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    const projectRequirements = await this.prisma.requirement.findMany({
      where: { projectId },
      select: { id: true, requirementKey: true },
    });
    const totalProjectRequirementsCount = projectRequirements.length;

    const changedReqIdSet = new Set<string>();
    for (const r of projectRequirements) {
      if (
        changeSnapshot.changedRequirements.includes(r.id) ||
        (r.requirementKey && changeSnapshot.changedRequirements.includes(r.requirementKey))
      ) {
        changedReqIdSet.add(r.id);
      }
    }

    // Determine security criticality of changed items
    const isSecurityCriticalChange =
      changeSnapshot.changedFiles.some(f =>
        SECURITY_CRITICAL_KEYWORDS.some(k => f.toLowerCase().includes(k)),
      ) ||
      changeSnapshot.changedRequirements.some(r =>
        SECURITY_CRITICAL_KEYWORDS.some(k => r.toLowerCase().includes(k)),
      );

    // Determine database schema change
    const isDatabaseChange =
      Boolean(changeSnapshot.changedConfiguration.databaseChanged) ||
      changeSnapshot.changedFiles.some(f =>
        DATABASE_CHANGE_KEYWORDS.some(k => f.toLowerCase().includes(k)),
      );

    // If APPROVED_PATCH, fetch the associated failure case to identify reverification test
    let patchReverificationTestCaseId: string | null = null;
    if (changeSnapshot.sourceType === 'APPROVED_PATCH' && changeSnapshot.sourceEntityId) {
      const approval = await this.prisma.defectPatchApproval.findUnique({
        where: { id: changeSnapshot.sourceEntityId },
        include: {
          failureCase: true,
        },
      });
      if (approval?.failureCase?.testCaseId) {
        patchReverificationTestCaseId = approval.failureCase.testCaseId;
      }
    }

    const evaluations: TestSelectionEvaluation[] = [];

    for (const tc of testCases) {
      const latestVersion = tc.versions[0];
      const latestPlan = tc.executableTestPlans[0];
      const hasHistoricalFailure = tc.testRuns.some(tr => tr.status === 'FAILED' || tr.healingUsed);
      const isDeprecated = tc.status === 'DEPRECATED';

      const riskSignals: string[] = [];
      const evidenceRefs: string[] = [];
      let selectionState: TestSelectionState = 'NOT_IMPACTED';
      let impactCategory: ImpactCategory = 'DIRECT';
      let confidence: ImpactConfidence = 'HIGH';
      let selectionReason =
        'No requirement trace, source dependency, API dependency, or historical execution relationship to the current change set.';
      let dependencyPath: string[] = [];
      let changedRequirement: string | null = null;
      let affectedCodeOrApi: string | null = null;

      if (hasHistoricalFailure) {
        riskSignals.push('HISTORICAL_FAILURE_PRONE');
      }

      // Rule 0: Deprecated Tests
      if (isDeprecated) {
        selectionState = 'EXCLUDED';
        selectionReason = 'Test case is marked as deprecated.';
        evaluations.push({
          testCaseId: tc.id,
          testCaseKey: tc.testCaseKey,
          testCaseTitle: tc.title,
          testCaseVersionId: latestVersion?.id ?? null,
          testCaseVersionNumber: latestVersion?.versionNumber,
          selectionState,
          impactCategory,
          confidence,
          selectionReason,
          dependencyPath,
          riskSignals,
          evidenceReferences: evidenceRefs,
          historicalFailureSignal: hasHistoricalFailure,
          isExecutable: Boolean(latestPlan?.isExecutable),
          changedRequirement,
          affectedCodeOrApi,
        });
        continue;
      }

      // Rule 1: Patch Reverification Test
      if (patchReverificationTestCaseId && tc.id === patchReverificationTestCaseId) {
        selectionState = 'MANDATORY';
        impactCategory = 'DIRECT';
        confidence = 'HIGH';
        selectionReason = 'Test that failed before patch and is being reverified.';
        riskSignals.push('PATCH_REVERIFICATION_TARGET');
        affectedCodeOrApi = changeSnapshot.changedFiles[0] ?? null;
      }

      // Rule 2: Direct Requirement Trace
      if (selectionState !== 'MANDATORY') {
        const linkedReqIds = graphContext.testToReqsMap.get(tc.id) ?? new Set<string>();

        // Check if any linked req is in changedRequirements
        for (const reqId of linkedReqIds) {
          if (changedReqIdSet.has(reqId) || changeSnapshot.changedRequirements.includes(reqId)) {
            selectionState = 'MANDATORY';
            impactCategory = 'DIRECT';
            confidence = 'HIGH';
            changedRequirement = reqId;
            selectionReason = `Directly traces to modified requirement ${reqId}.`;
            evidenceRefs.push(`Requirement:${reqId}`);
            break;
          }
        }

        // Check if any linked req maps to changedFiles
        if (selectionState !== 'MANDATORY') {
          for (const reqId of linkedReqIds) {
            const filesForReq = graphContext.reqToFileMap.get(reqId);
            if (!filesForReq) continue;
            for (const file of filesForReq) {
              if (changeSnapshot.changedFiles.includes(file)) {
                selectionState = 'MANDATORY';
                impactCategory = 'DIRECT';
                confidence = 'HIGH';
                changedRequirement = reqId;
                affectedCodeOrApi = file;
                selectionReason = `Traces to requirement ${reqId} which is implemented by modified file ${file}.`;
                evidenceRefs.push(`File:${file}`);
                break;
              }
            }
            if (selectionState === 'MANDATORY') break;
          }
        }
      }

      // Rule 3: Direct Code / File Matching
      if (selectionState !== 'MANDATORY') {
        for (const file of changeSnapshot.changedFiles) {
          const baseName =
            file
              .split('/')
              .pop()
              ?.replace(/\.[^.]+$/, '') ?? '';
          const tcTitleLower = tc.title.toLowerCase();
          const tcKeyLower = tc.testCaseKey.toLowerCase();

          if (
            baseName.length > 3 &&
            (tcTitleLower.includes(baseName.toLowerCase()) ||
              tcKeyLower.includes(baseName.toLowerCase()))
          ) {
            selectionState = 'MANDATORY';
            impactCategory = 'DIRECT';
            confidence = 'HIGH';
            affectedCodeOrApi = file;
            selectionReason = `Directly exercises modified component or module '${baseName}' (${file}).`;
            evidenceRefs.push(`File:${file}`);
            break;
          }
        }
      }

      // Rule 4: Indirect & Transitive Dependencies
      if (selectionState === 'NOT_IMPACTED') {
        for (const [changedFile, chains] of graphContext.dependencyChainsByFile.entries()) {
          for (const chain of chains) {
            // Does this test trace to a requirement mapped to the dependent file?
            const reqsForImporter = graphContext.fileToReqMap.get(chain.targetFile);
            if (reqsForImporter) {
              const testReqs = graphContext.testToReqsMap.get(tc.id);
              if (testReqs) {
                const overlap = Array.from(reqsForImporter).find(r => testReqs.has(r));
                if (overlap) {
                  selectionState = 'RECOMMENDED';
                  impactCategory = chain.depth === 1 ? 'INDIRECT' : 'TRANSITIVE';
                  confidence = chain.depth === 1 ? 'HIGH' : 'MEDIUM';
                  dependencyPath = [...chain.path];
                  affectedCodeOrApi = chain.targetFile;
                  changedRequirement = overlap;
                  selectionReason =
                    chain.depth === 1
                      ? `Exercises dependent module ${chain.targetFile} which directly imports modified file ${changedFile}.`
                      : `Exercises transitive dependency ${chain.targetFile} via dependency path ${chain.path.join(' -> ')}.`;
                  evidenceRefs.push(`Path:${chain.path.join('->')}`);
                  break;
                }
              }
            }
          }
          if (selectionState !== 'NOT_IMPACTED') break;
        }
      }

      // Rule 5: Security-Critical Expansion
      if (isSecurityCriticalChange) {
        riskSignals.push('SECURITY_CRITICAL_PATH');
        if (selectionState === 'RECOMMENDED') {
          selectionState = 'MANDATORY';
          selectionReason += ' [Elevated to MANDATORY due to security-critical path modification]';
        }
      }

      // Rule 6: Database & API Change Impact
      if (isDatabaseChange && selectionState === 'NOT_IMPACTED') {
        const isDbTest =
          tc.title.toLowerCase().includes('data') ||
          tc.title.toLowerCase().includes('user') ||
          tc.title.toLowerCase().includes('account') ||
          tc.title.toLowerCase().includes('profile');
        if (isDbTest) {
          selectionState = 'RECOMMENDED';
          impactCategory = 'INDIRECT';
          confidence = 'MEDIUM';
          riskSignals.push('DATABASE_SCHEMA_CHANGE');
          selectionReason =
            'Exercises database-backed entity affected by database schema/migration modifications.';
        }
      }

      // Rule 7: Unknown Handling
      if (selectionState === 'NOT_IMPACTED' && (!latestPlan || !latestPlan.isExecutable)) {
        if (conservativeSafetyPolicy && changeSnapshot.changedFiles.length > 0) {
          selectionState = 'RECOMMENDED';
          impactCategory = 'UNKNOWN';
          confidence = 'UNKNOWN';
          riskSignals.push('UNRESOLVED_METADATA');
          selectionReason =
            'Impact could not be conclusively determined due to missing execution plan; included under conservative safety policy.';
        }
      }

      evaluations.push({
        testCaseId: tc.id,
        testCaseKey: tc.testCaseKey,
        testCaseTitle: tc.title,
        testCaseVersionId: latestVersion?.id ?? null,
        testCaseVersionNumber: latestVersion?.versionNumber,
        selectionState,
        impactCategory,
        confidence,
        selectionReason,
        dependencyPath,
        riskSignals,
        evidenceReferences: evidenceRefs,
        historicalFailureSignal: hasHistoricalFailure,
        isExecutable: Boolean(latestPlan?.isExecutable),
        changedRequirement,
        affectedCodeOrApi,
      });
    }

    // Full Regression Escalation Logic
    let fullRegressionRequired = false;
    let fullRegressionReason: string | null = null;

    if (forceFullRegression) {
      fullRegressionRequired = true;
      fullRegressionReason = 'Explicitly forced by user or policy options.';
    } else if (
      changeSnapshot.changedFiles.some(
        f =>
          f === 'package.json' ||
          f === 'tsconfig.json' ||
          f.endsWith('/root.ts') ||
          f.endsWith('/index.ts'),
      )
    ) {
      fullRegressionRequired = true;
      fullRegressionReason =
        'Core shared framework or root package configuration changed; safe selective boundary cannot be established.';
    } else if (changeSnapshot.changedFiles.length > RETEST_BOUNDS.FULL_REGRESSION_FILE_THRESHOLD) {
      fullRegressionRequired = true;
      fullRegressionReason = `Changed files count (${changeSnapshot.changedFiles.length}) exceeds threshold of ${RETEST_BOUNDS.FULL_REGRESSION_FILE_THRESHOLD}.`;
    } else if (
      totalProjectRequirementsCount > 0 &&
      changedReqIdSet.size / totalProjectRequirementsCount > RETEST_BOUNDS.FULL_REGRESSION_REQ_RATIO
    ) {
      fullRegressionRequired = true;
      fullRegressionReason = `Changed requirements ratio (${changedReqIdSet.size}/${totalProjectRequirementsCount}) exceeds 50% of project scope.`;
    } else {
      const unknownCount = evaluations.filter(e => e.confidence === 'UNKNOWN').length;
      if (
        evaluations.length > 0 &&
        unknownCount / evaluations.length > RETEST_BOUNDS.FULL_REGRESSION_UNKNOWN_RATIO
      ) {
        fullRegressionRequired = true;
        fullRegressionReason = `Unknown impact ratio (${unknownCount}/${evaluations.length}) exceeds 75%; full regression recommended for safety.`;
      }
    }

    // If full regression is required, promote non-excluded tests
    if (fullRegressionRequired) {
      for (let i = 0; i < evaluations.length; i++) {
        const item = evaluations[i];
        if (!item || item.selectionState === 'EXCLUDED') continue;
        evaluations[i] = {
          ...item,
          selectionState: 'MANDATORY',
          selectionReason: `${item.selectionReason} [Elevated to MANDATORY: Full regression required: ${fullRegressionReason}]`,
        };
      }
    }

    const counts = {
      total: evaluations.length,
      mandatory: evaluations.filter(e => e.selectionState === 'MANDATORY').length,
      recommended: evaluations.filter(e => e.selectionState === 'RECOMMENDED').length,
      optional: evaluations.filter(e => e.selectionState === 'OPTIONAL').length,
      unknown: evaluations.filter(e => e.selectionState === 'UNKNOWN').length,
      excluded: evaluations.filter(e => e.selectionState === 'EXCLUDED').length,
    };

    return {
      evaluations,
      fullRegressionRequired,
      fullRegressionReason,
      counts,
    };
  }
}
