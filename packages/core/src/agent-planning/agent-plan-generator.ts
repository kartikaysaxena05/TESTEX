/**
 * @file packages/core/src/agent-planning/agent-plan-generator.ts
 * Deterministic multi-step plan generator for V10 Phase 152.
 *
 * Translates user task instructions and project context into structured,
 * dependency-ordered steps before any tool execution begins.
 * Zero tools are executed during plan generation.
 */

import { type PlannedStepDefinitionDto } from '@ai-quality/contracts';

export interface AgentPlanGenerationInput {
  instruction: string;
  taskTitle?: string;
  projectContext?: {
    hasRequirements?: boolean;
    hasTests?: boolean;
    hasFailures?: boolean;
    hasGitRepository?: boolean;
  };
  availableToolActions?: string[];
}

export interface GeneratedPlanStructure {
  summary: string;
  intent: string;
  steps: PlannedStepDefinitionDto[];
  requiresApproval: boolean;
}

export class AgentPlanGenerator {
  /**
   * Generates a structured multi-step plan from instruction and context.
   * Completely offline and deterministic (no external tool or AI calls required by default).
   */
  public static generatePlan(input: AgentPlanGenerationInput): GeneratedPlanStructure {
    const rawInstruction = input.instruction.trim();
    const lower = rawInstruction.toLowerCase();

    // Intent analysis
    let intent = 'DEVELOPMENT_TASK';
    let summary = `Execution plan for task: ${input.taskTitle || rawInstruction.slice(0, 80)}`;
    const steps: PlannedStepDefinitionDto[] = [];

    // Case 1: Defect Repair / Bug Fix Intent
    if (
      lower.includes('fix') ||
      lower.includes('repair') ||
      lower.includes('defect') ||
      lower.includes('bug') ||
      lower.includes('patch')
    ) {
      intent = 'DEFECT_REPAIR';
      summary = `Multi-step plan to localize, patch, and verify fix for: ${rawInstruction.slice(0, 80)}`;

      steps.push({
        stepId: 'step-understand-task',
        sequence: 1,
        title: 'Understand task and analyze defect',
        objective: 'Inspect defect report, failure context, and symptoms.',
        toolAction: 'failure_intelligence.analyze_root_cause',
        structuredInput: { query: rawInstruction },
        dependencies: [],
      });

      steps.push({
        stepId: 'step-inspect-repository',
        sequence: 2,
        title: 'Inspect repository & localize defect',
        objective: 'Search codebase for relevant source files and symbols.',
        toolAction: 'repository.search_files',
        structuredInput: { query: rawInstruction },
        dependencies: ['step-understand-task'],
      });

      steps.push({
        stepId: 'step-inspect-requirements',
        sequence: 3,
        title: 'Inspect requirements and acceptance criteria',
        objective: 'Retrieve relevant requirement specifications and constraints.',
        toolAction: 'quality_intelligence.get_quality_overview',
        structuredInput: {},
        dependencies: ['step-understand-task'],
      });

      steps.push({
        stepId: 'step-generate-patch',
        sequence: 4,
        title: 'Generate safe source-code patch proposal',
        objective: 'Create diff proposal without applying modifications silently.',
        toolAction: 'repair_patch.propose',
        structuredInput: { instruction: rawInstruction },
        dependencies: ['step-inspect-repository', 'step-inspect-requirements'],
      });

      steps.push({
        stepId: 'step-execute-tests',
        sequence: 5,
        title: 'Execute test suite for verification',
        objective: 'Run test suite to verify fix and prevent regression.',
        toolAction: 'terminal.run',
        structuredInput: { command: 'npm test' },
        dependencies: ['step-generate-patch'],
      });

      steps.push({
        stepId: 'step-review-git-diff',
        sequence: 6,
        title: 'Review Git diff and changes',
        objective: 'Audit git status and diff before final acceptance.',
        toolAction: 'git_review.get_diff',
        structuredInput: {},
        dependencies: ['step-execute-tests'],
      });

      return {
        summary,
        intent,
        steps,
        requiresApproval: true,
      };
    }

    // Case 2: Test Generation / Verification Intent
    if (
      lower.includes('test') ||
      lower.includes('verify') ||
      lower.includes('playwright') ||
      lower.includes('e2e') ||
      lower.includes('retest')
    ) {
      intent = 'TEST_VERIFICATION';
      summary = `Multi-step plan to inspect context, compile tests, and verify application: ${rawInstruction.slice(0, 80)}`;

      steps.push({
        stepId: 'step-understand-task',
        sequence: 1,
        title: 'Understand test scope and requirements',
        objective: 'Examine requirements and target test scenarios.',
        toolAction: 'quality_intelligence.get_quality_overview',
        structuredInput: { query: rawInstruction },
        dependencies: [],
      });

      steps.push({
        stepId: 'step-inspect-repository',
        sequence: 2,
        title: 'Inspect project structure & test suites',
        objective: 'Locate existing tests, page objects, and selectors.',
        toolAction: 'repository.list_directory',
        structuredInput: { path: '' },
        dependencies: ['step-understand-task'],
      });

      steps.push({
        stepId: 'step-execute-tests',
        sequence: 3,
        title: 'Execute Playwright / unit test suite',
        objective: 'Run targeted test scripts to validate behavior.',
        toolAction: 'playwright.execute_script',
        structuredInput: { spec: rawInstruction },
        dependencies: ['step-inspect-repository'],
      });

      steps.push({
        stepId: 'step-analyze-failures',
        sequence: 4,
        title: 'Analyze test run results and evidence',
        objective: 'Correlate failures, console logs, and screenshots.',
        toolAction: 'failure_intelligence.get_failure_clusters',
        structuredInput: {},
        dependencies: ['step-execute-tests'],
      });

      return {
        summary,
        intent,
        steps,
        requiresApproval: false,
      };
    }

    // Case 3: Inspection / Analysis / Git Review
    if (
      lower.includes('diff') ||
      lower.includes('git') ||
      lower.includes('review') ||
      lower.includes('status')
    ) {
      intent = 'REPOSITORY_REVIEW';
      summary = `Multi-step plan to inspect git status and changes: ${rawInstruction.slice(0, 80)}`;

      steps.push({
        stepId: 'step-inspect-repository',
        sequence: 1,
        title: 'Inspect repository status',
        objective: 'Check worktree status and modified files.',
        toolAction: 'git_review.get_status',
        structuredInput: {},
        dependencies: [],
      });

      steps.push({
        stepId: 'step-review-diff',
        sequence: 2,
        title: 'Inspect unified diff & analyze changes',
        objective: 'Analyze changes, check for dangerous files and redacted secrets.',
        toolAction: 'git_review.get_diff',
        structuredInput: {},
        dependencies: ['step-inspect-repository'],
      });

      return {
        summary,
        intent,
        steps,
        requiresApproval: false,
      };
    }

    // Default: General Development / Exploration Sequence
    summary = `Multi-step execution plan for: ${rawInstruction.slice(0, 80)}`;
    steps.push({
      stepId: 'step-understand-task',
      sequence: 1,
      title: 'Understand task and project context',
      objective: 'Analyze user task requirements and boundaries.',
      toolAction: 'repository.get_file_info',
      structuredInput: { path: 'package.json' },
      dependencies: [],
    });

    steps.push({
      stepId: 'step-inspect-repository',
      sequence: 2,
      title: 'Inspect repository and relevant files',
      objective: 'Search codebase for files related to user prompt.',
      toolAction: 'repository.search_files',
      structuredInput: { query: rawInstruction },
      dependencies: ['step-understand-task'],
    });

    steps.push({
      stepId: 'step-execute-validation',
      sequence: 3,
      title: 'Execute validation checks',
      objective: 'Verify repository status or run tests.',
      toolAction: 'terminal.run',
      structuredInput: { command: 'git status' },
      dependencies: ['step-inspect-repository'],
    });

    return {
      summary,
      intent,
      steps,
      requiresApproval: false,
    };
  }
}
