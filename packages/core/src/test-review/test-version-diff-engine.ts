/**
 * @file packages/core/src/test-review/test-version-diff-engine.ts
 * Deterministic, offline version comparison engine for Phase 56 Test Review & Versioning.
 */

import type {
  TestCasePreconditionDto,
  TestCaseStepDto,
  TestCaseTestDataItemDto,
  TestCaseVersionDto,
  TestVersionDiffDto,
} from '@ai-quality/contracts';

export class TestVersionDiffEngine {
  /**
   * Compares two test case version snapshots and produces a structured, readable diff.
   */
  public static compare(
    fromVersion: TestCaseVersionDto,
    toVersion: TestCaseVersionDto,
  ): TestVersionDiffDto {
    const fieldChanges: { field: string; oldValue: unknown; newValue: unknown }[] = [];

    // Scalar fields
    if (fromVersion.title !== toVersion.title) {
      fieldChanges.push({ field: 'title', oldValue: fromVersion.title, newValue: toVersion.title });
    }
    if (fromVersion.objective !== toVersion.objective) {
      fieldChanges.push({
        field: 'objective',
        oldValue: fromVersion.objective,
        newValue: toVersion.objective,
      });
    }
    if (fromVersion.description !== toVersion.description) {
      fieldChanges.push({
        field: 'description',
        oldValue: fromVersion.description,
        newValue: toVersion.description,
      });
    }
    if (fromVersion.type !== toVersion.type) {
      fieldChanges.push({ field: 'type', oldValue: fromVersion.type, newValue: toVersion.type });
    }
    if (fromVersion.priority !== toVersion.priority) {
      fieldChanges.push({
        field: 'priority',
        oldValue: fromVersion.priority,
        newValue: toVersion.priority,
      });
    }
    if (fromVersion.executionSuitability !== toVersion.executionSuitability) {
      fieldChanges.push({
        field: 'executionSuitability',
        oldValue: fromVersion.executionSuitability,
        newValue: toVersion.executionSuitability,
      });
    }
    if (fromVersion.overallExpectedResult !== toVersion.overallExpectedResult) {
      fieldChanges.push({
        field: 'overallExpectedResult',
        oldValue: fromVersion.overallExpectedResult,
        newValue: toVersion.overallExpectedResult,
      });
    }

    // Preconditions diff (by sequenceOrder)
    const fromPrecondMap = new Map<number, TestCasePreconditionDto>(
      fromVersion.preconditions.map(p => [p.sequenceOrder, p]),
    );
    const toPrecondMap = new Map<number, TestCasePreconditionDto>(
      toVersion.preconditions.map(p => [p.sequenceOrder, p]),
    );

    const addedPreconditions: TestCasePreconditionDto[] = [];
    const removedPreconditions: TestCasePreconditionDto[] = [];
    const modifiedPreconditions: {
      sequenceOrder: number;
      old: TestCasePreconditionDto;
      current: TestCasePreconditionDto;
    }[] = [];

    for (const [seq, toP] of toPrecondMap.entries()) {
      const fromP = fromPrecondMap.get(seq);
      if (!fromP) {
        addedPreconditions.push(toP);
      } else if (
        fromP.description !== toP.description ||
        fromP.category !== toP.category ||
        fromP.isEnforced !== toP.isEnforced
      ) {
        modifiedPreconditions.push({ sequenceOrder: seq, old: fromP, current: toP });
      }
    }

    for (const [seq, fromP] of fromPrecondMap.entries()) {
      if (!toPrecondMap.has(seq)) {
        removedPreconditions.push(fromP);
      }
    }

    // Steps diff (by stepNumber)
    const fromStepMap = new Map<number, TestCaseStepDto>(
      fromVersion.steps.map(s => [s.stepNumber, s]),
    );
    const toStepMap = new Map<number, TestCaseStepDto>(toVersion.steps.map(s => [s.stepNumber, s]));

    const addedSteps: TestCaseStepDto[] = [];
    const removedSteps: TestCaseStepDto[] = [];
    const modifiedSteps: { stepNumber: number; old: TestCaseStepDto; current: TestCaseStepDto }[] =
      [];

    for (const [num, toS] of toStepMap.entries()) {
      const fromS = fromStepMap.get(num);
      if (!fromS) {
        addedSteps.push(toS);
      } else if (
        fromS.action !== toS.action ||
        fromS.expectedResult !== toS.expectedResult ||
        fromS.testDataSummary !== toS.testDataSummary ||
        fromS.stateChangeFrom !== toS.stateChangeFrom ||
        fromS.stateChangeTo !== toS.stateChangeTo ||
        fromS.isOptional !== toS.isOptional
      ) {
        modifiedSteps.push({ stepNumber: num, old: fromS, current: toS });
      }
    }

    for (const [num, fromS] of fromStepMap.entries()) {
      if (!toStepMap.has(num)) {
        removedSteps.push(fromS);
      }
    }

    // Test Data diff (by name)
    const fromDataMap = new Map<string, TestCaseTestDataItemDto>(
      fromVersion.testData.map(d => [d.name, d]),
    );
    const toDataMap = new Map<string, TestCaseTestDataItemDto>(
      toVersion.testData.map(d => [d.name, d]),
    );

    const addedTestData: TestCaseTestDataItemDto[] = [];
    const removedTestData: TestCaseTestDataItemDto[] = [];
    const modifiedTestData: {
      name: string;
      old: TestCaseTestDataItemDto;
      current: TestCaseTestDataItemDto;
    }[] = [];

    for (const [name, toD] of toDataMap.entries()) {
      const fromD = fromDataMap.get(name);
      if (!fromD) {
        addedTestData.push(toD);
      } else if (
        JSON.stringify(fromD.valueJson) !== JSON.stringify(toD.valueJson) ||
        fromD.constraint !== toD.constraint ||
        fromD.dataType !== toD.dataType ||
        fromD.isSensitive !== toD.isSensitive
      ) {
        modifiedTestData.push({ name, old: fromD, current: toD });
      }
    }

    for (const [name, fromD] of fromDataMap.entries()) {
      if (!toDataMap.has(name)) {
        removedTestData.push(fromD);
      }
    }

    return {
      fromVersionNumber: fromVersion.versionNumber,
      toVersionNumber: toVersion.versionNumber,
      fieldChanges,
      preconditionChanges: {
        added: addedPreconditions,
        removed: removedPreconditions,
        modified: modifiedPreconditions,
      },
      stepChanges: {
        added: addedSteps,
        removed: removedSteps,
        modified: modifiedSteps,
      },
      testDataChanges: {
        added: addedTestData,
        removed: removedTestData,
        modified: modifiedTestData,
      },
    };
  }
}
