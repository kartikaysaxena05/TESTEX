/**
 * @file packages/core/src/execution/persistence/execution-persistence-types.ts
 * Types, bounds, and interfaces for execution persistence and step-level audit trail.
 */

import type {
  CreateExecutionInputDto,
  StartStepExecutionInputDto,
  CompleteStepExecutionInputDto,
  CompleteExecutionInputDto,
  GetExecutionInputDto,
  ListExecutionsInputDto,
  GetExecutionStepsInputDto,
  GetExecutionAuditTimelineInputDto,
  ReconcileOrphanedExecutionsInputDto,
  TestCaseExecutionDto,
  StepExecutionRecordDto,
  ExecutionAuditTimelineDto,
} from '@ai-quality/contracts';

export const EXECUTION_PERSISTENCE_BOUNDS = {
  MAX_PAGE_SIZE: 100,
  DEFAULT_PAGE_SIZE: 20,
  DEFAULT_STEPS_PAGE_SIZE: 50,
  MAX_SUMMARY_LENGTH: 2000,
  MAX_ERROR_MESSAGE_LENGTH: 2000,
  MAX_TARGET_SUMMARY_LENGTH: 500,
  MAX_ACTION_TYPE_LENGTH: 64,
  MAX_ERROR_CODE_LENGTH: 64,
} as const;

export interface IExecutionPersistenceService {
  createExecution(input: CreateExecutionInputDto): Promise<TestCaseExecutionDto>;
  startStep(input: StartStepExecutionInputDto): Promise<StepExecutionRecordDto>;
  completeStep(input: CompleteStepExecutionInputDto): Promise<StepExecutionRecordDto>;
  completeExecution(input: CompleteExecutionInputDto): Promise<TestCaseExecutionDto>;
  reconcileOrphanedExecutions(
    input?: ReconcileOrphanedExecutionsInputDto,
  ): Promise<{ readonly reconciledCount: number }>;
  getExecution(input: GetExecutionInputDto): Promise<TestCaseExecutionDto>;
  listExecutions(input: ListExecutionsInputDto): Promise<{
    readonly items: readonly TestCaseExecutionDto[];
    readonly total: number;
    readonly page: number;
    readonly pageSize: number;
    readonly totalPages: number;
  }>;
  getExecutionSteps(input: GetExecutionStepsInputDto): Promise<{
    readonly items: readonly StepExecutionRecordDto[];
    readonly total: number;
    readonly page: number;
    readonly pageSize: number;
  }>;
  getExecutionAuditTimeline(
    input: GetExecutionAuditTimelineInputDto,
  ): Promise<ExecutionAuditTimelineDto>;
}
