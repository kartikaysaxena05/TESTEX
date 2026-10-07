/**
 * @file packages/core/src/execution/compiler/test-plan-compiler.ts
 * Core compiler orchestrating deterministic translation of structured test cases into executable plans.
 */

import crypto from 'node:crypto';
import type {
  ExecutableTestPlanDto,
  ExecutablePlanStepDto,
  ExecutableAssertionDto,
  CompilationDiagnosticDto,
  TestCaseDetailDto,
  TestCaseVersionDto,
  PlanCompilationStatus,
} from '@ai-quality/contracts';
import {
  COMPILER_VERSION,
  PLAN_SCHEMA_VERSION,
  type CompilationContext,
} from './compiler-types.js';
import { StepActionParser } from './step-action-parser.js';
import { AssertionParser } from './assertion-parser.js';
import { PreconditionClassifier } from './precondition-classifier.js';

export interface CompilerInput {
  readonly testCase: TestCaseDetailDto | TestCaseVersionDto;
  readonly context: CompilationContext;
  readonly isRequirementStale?: boolean;
  readonly sourceRequirementIds?: readonly string[];
  readonly sourceRequirementKeys?: readonly string[];
}

export class TestPlanCompiler {
  private readonly stepParser: StepActionParser;
  private readonly assertionParser: AssertionParser;
  private readonly preconditionClassifier: PreconditionClassifier;

  constructor(
    stepParser = new StepActionParser(),
    assertionParser = new AssertionParser(),
    preconditionClassifier = new PreconditionClassifier(),
  ) {
    this.stepParser = stepParser;
    this.assertionParser = assertionParser;
    this.preconditionClassifier = preconditionClassifier;
  }

  /**
   * Compiles a structured test case into a deterministic ExecutableTestPlanDto.
   */
  public compile(input: CompilerInput): ExecutableTestPlanDto {
    const { testCase, context } = input;
    const diagnostics: CompilationDiagnosticDto[] = [];

    // 1. Gating & Eligibility Checks
    const isApproved = testCase.reviewStatus === 'APPROVED';
    const isPreview = Boolean(context.previewOnly);

    if (testCase.executionSuitability === 'MANUAL') {
      diagnostics.push({
        code: 'UNSUPPORTED_ACTION',
        severity: 'ERROR',
        message: 'Test case is marked as MANUAL suitability and cannot be autonomously executed.',
        reason: 'Execution suitability is MANUAL.',
        suggestedAction: 'Update test case execution suitability to AUTOMATED.',
      });
    }

    if (!isApproved) {
      if (isPreview) {
        diagnostics.push({
          code: 'UNAPPROVED_TEST',
          severity: 'WARNING',
          message: `Compiling preview of test case in status '${testCase.reviewStatus}'. Plan is not approved for execution.`,
          reason: `Review status is '${testCase.reviewStatus}'.`,
          suggestedAction: 'Submit and approve the test case before running in production.',
        });
      } else {
        diagnostics.push({
          code: 'UNAPPROVED_TEST',
          severity: 'ERROR',
          message: `Cannot compile executable plan for unapproved test case in status '${testCase.reviewStatus}'.`,
          reason: `Only APPROVED test cases can be compiled for autonomous execution.`,
          suggestedAction: 'Approve the test case version or pass previewOnly: true.',
        });
      }
    }

    if (input.isRequirementStale) {
      diagnostics.push({
        code: 'STALE_TEST',
        severity: 'WARNING',
        message: 'Source requirement has advanced to a newer version since this test was created.',
        reason: 'Source requirement version mismatch.',
        suggestedAction: 'Review requirement changes and regenerate or re-approve this test case.',
      });
    }

    const rawSteps = testCase.steps || [];
    if (rawSteps.length === 0) {
      diagnostics.push({
        code: 'INVALID_STEP_ORDER',
        severity: 'ERROR',
        message: 'Test case has no steps to compile.',
        reason: 'Step array is empty.',
        suggestedAction: 'Add at least one action step to the test case.',
      });
    }

    // Check step sequence duplicates/ordering
    const seenSequences = new Set<number>();
    for (const step of rawSteps) {
      const seq = step.stepNumber;
      if (seenSequences.has(seq)) {
        diagnostics.push({
          code: 'INVALID_STEP_ORDER',
          severity: 'ERROR',
          message: `Duplicate step sequence number detected: ${seq}`,
          reason: `Step sequence ${seq} appears multiple times.`,
          stepSequence: seq,
          suggestedAction: 'Ensure all steps have distinct ascending sequence numbers.',
        });
      }
      seenSequences.add(seq);
    }

    // 2. Classify Preconditions
    const preconditions = this.preconditionClassifier.classifyPreconditions(
      testCase.preconditions as any,
    );

    // 3. Compile Ordered Steps & Step-Level Assertions
    const compiledSteps: ExecutablePlanStepDto[] = [];
    const allAssertions: ExecutableAssertionDto[] = [];

    // Sort steps strictly by stepNumber ascending
    const sortedSteps = [...rawSteps].sort((a, b) => a.stepNumber - b.stepNumber);

    for (const rawStep of sortedSteps) {
      const stepParse = this.stepParser.parseStep(
        rawStep as any,
        context,
        (testCase as any).testData,
      );
      diagnostics.push(...stepParse.diagnostics);

      // Parse step-level expected results
      const stepAssertions: ExecutableAssertionDto[] = [];
      if (rawStep.expectedResult) {
        const assertionParse = this.assertionParser.parseExpectedResult(
          rawStep.expectedResult,
          rawStep.stepNumber,
        );
        diagnostics.push(...assertionParse.diagnostics);
        stepAssertions.push(...assertionParse.assertions);
        allAssertions.push(...assertionParse.assertions);
      }

      compiledSteps.push({
        ...stepParse.step,
        assertions: stepAssertions,
      });
    }

    // 4. Parse Overall Expected Result
    if (testCase.overallExpectedResult) {
      const overallAssertionParse = this.assertionParser.parseExpectedResult(
        testCase.overallExpectedResult,
        undefined,
      );
      diagnostics.push(...overallAssertionParse.diagnostics);
      allAssertions.push(...overallAssertionParse.assertions);
    }

    // 5. Compute Status & Executability
    const hasErrors = diagnostics.some(d => d.severity === 'ERROR');
    const hasWarnings = diagnostics.some(d => d.severity === 'WARNING');

    let status: PlanCompilationStatus = 'VALID';
    if (hasErrors) {
      status = 'INVALID';
    } else if (input.isRequirementStale) {
      status = 'STALE';
    } else if (hasWarnings || !isApproved) {
      status = 'REVIEW_REQUIRED';
    } else {
      status = 'VALID';
    }

    // Strict executability: Valid and approved without blocking errors
    const isExecutable = !hasErrors && isApproved && !input.isRequirementStale && !isPreview;

    // 6. Traceability Links
    const sourceRequirementIds =
      input.sourceRequirementIds && input.sourceRequirementIds.length > 0
        ? [...input.sourceRequirementIds]
        : testCase.sourceRequirementId
          ? [testCase.sourceRequirementId]
          : [];

    const sourceRequirementKeys =
      input.sourceRequirementKeys && input.sourceRequirementKeys.length > 0
        ? [...input.sourceRequirementKeys]
        : testCase.sourceRequirementKey
          ? [testCase.sourceRequirementKey]
          : [];

    // 7. Compute Deterministic Plan Fingerprint (Canonical SHA-256)
    const planFingerprint = this.computeCanonicalFingerprint({
      compilerVersion: COMPILER_VERSION,
      planSchemaVersion: PLAN_SCHEMA_VERSION,
      testCaseId: context.testCaseId,
      testCaseVersionNumber: context.testCaseVersionNumber,
      environmentId: context.environmentId ?? null,
      steps: compiledSteps.map(s => ({
        sequence: s.sequence,
        action: s.action,
        target: s.target,
        value: s.value,
        assertions: s.assertions.map(a => ({
          type: a.type,
          target: a.target,
          expectedValue: a.expectedValue,
          isNegated: a.isNegated,
        })),
      })),
      assertions: allAssertions.map(a => ({
        type: a.type,
        target: a.target,
        expectedValue: a.expectedValue,
        isNegated: a.isNegated,
      })),
      preconditions: preconditions.map(p => ({
        sequence: p.sequence,
        category: p.category,
        description: p.description,
      })),
      sourceRequirementIds,
    });

    const now = new Date().toISOString();

    return {
      id: crypto.randomUUID(),
      projectId: context.projectId,
      testCaseId: context.testCaseId,
      testCaseVersionId: context.testCaseVersionId ?? null,
      testCaseVersionNumber: context.testCaseVersionNumber,
      environmentId: context.environmentId ?? null,
      targetApplicationId: context.targetApplicationId ?? null,
      compilerVersion: COMPILER_VERSION,
      planSchemaVersion: PLAN_SCHEMA_VERSION,
      status,
      planFingerprint,
      sourceRequirementIds,
      sourceRequirementKeys,
      summary: `Compiled plan for ${testCase.title} (v${context.testCaseVersionNumber})`,
      preconditions: [...preconditions],
      steps: compiledSteps,
      assertions: allAssertions,
      postconditions: [],
      diagnostics,
      hasErrors,
      hasWarnings,
      isExecutable,
      compiledAt: now,
      createdAt: now,
      updatedAt: now,
    };
  }

  /**
   * Deterministically hashes the canonical plan representation.
   */
  private computeCanonicalFingerprint(canonicalPayload: Record<string, unknown>): string {
    const jsonString = JSON.stringify(canonicalPayload, Object.keys(canonicalPayload).sort());
    return crypto.createHash('sha256').update(jsonString, 'utf8').digest('hex');
  }
}
