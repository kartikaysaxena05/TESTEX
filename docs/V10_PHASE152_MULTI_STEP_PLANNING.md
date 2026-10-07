# V10 Phase 152: Multi-Step Planning Architecture & Security Guide

## 1. Overview & Objective
V10 Phase 152 establishes the privileged planning engine for the Codex-style autonomous testing and development agent.
Before any autonomous tool execution begins (Phase 153+), user tasks and thread instructions must be converted into a structured, ordered, dependency-validated execution plan (`AgentPlan` and `AgentPlanStep`).

Crucially, **zero tools are executed during plan generation, validation, or editing**.

---

## 2. Plan & Step Models

### 2.1 AgentPlan
- **Database Table:** `agent_plans`
- **Fields:**
  - `id`: UUID (Primary Key)
  - `projectId`: UUID (Foreign Key to `projects.id`)
  - `threadId`: UUID (Foreign Key to `agent_threads.id`)
  - `taskId`: UUID (Foreign Key to `agent_thread_tasks.id`)
  - `version`: Integer (starts at 1, incremented upon re-planning)
  - `isActive`: Boolean (`true` for active plan; only one active plan per task)
  - `status`: Enum (`DRAFT`, `READY`, `EXECUTING`, `COMPLETED`, `FAILED`, `CANCELLED`)
  - `summary`: Text summary of execution objective
  - `intent`: Classified intent (e.g., `DEFECT_REPAIR`, `TEST_VERIFICATION`, `REPOSITORY_REVIEW`)
  - `totalSteps`: Integer
  - `completedSteps`: Integer
  - `requiresApproval`: Boolean
  - `metadata`: JSONB
  - `createdAt`, `updatedAt`: Timestamps

### 2.2 AgentPlanStep
- **Database Table:** `agent_plan_steps`
- **Fields:**
  - `id`: UUID (Primary Key)
  - `planId`: UUID (Foreign Key to `agent_plans.id`)
  - `sequence`: Integer (1-based order)
  - `title`: VarChar(255)
  - `objective`: Text
  - `toolAction`: VarChar(128) (e.g. `repository.search_files`, `repair_patch.propose`, `terminal.run`)
  - `structuredInput`: JSONB
  - `dependencies`: JSONB array of prior step IDs / keys
  - `status`: Enum (`PENDING`, `READY`, `RUNNING`, `COMPLETED`, `FAILED`, `SKIPPED`, `CANCELLED`)
  - `resultReference`: Text (optional)
  - `errorInfo`: Text (optional)
  - `startedAt`, `completedAt`: Timestamps
  - `createdAt`, `updatedAt`: Timestamps

---

## 3. Dependency Graph Validation (`PlanGraphValidator`)

- **Kahn's Algorithm (Topological Sort):** Builds an in-degree adjacency list and validates acyclicity in $O(V + E)$ time.
- **Cycle Detection:** Identifies cycles and circular self-dependencies, rejecting them with `AgentPlanCircularDependencyError`.
- **Reference Integrity:** Validates that every dependency refers to an existing step in the plan.
- **Uniqueness:** Rejects duplicate step IDs and duplicate sequences with `AgentPlanStepDuplicateError`.

---

## 4. Controlled Plan Editing & Revalidation

- **Add Step:** Appends or inserts a step and validates the resulting dependency graph.
- **Remove Step:** Ensures no remaining step depends on the removed step before deletion, then renumbers steps contiguously.
- **Reorder Steps:** Updates sequence numbers while guaranteeing the dependency topology remains sound.
- **Modify Step:** Updates title, objective, toolAction, or inputs while revalidating dependencies.
- **Step Status Transitions:** Enforces that a step cannot transition to `READY` or `RUNNING` unless all prerequisites are `COMPLETED`.

---

## 5. Security & Isolation Controls

1. **Multi-Tenant Hierarchy:** Enforces `userId -> projectId -> threadId -> taskId -> planId`.
2. **Untrusted IPC Defense:** Every IPC invocation verifies sender frame origin (`isTrustedIpcSender`) and requires session authentication.
3. **Zero Tool Execution:** Plan generation does not invoke the Tool Registry or spawn processes.
4. **Active Plan Enforcement:** Only one active plan version exists per task. Re-planning sets `isActive = false` on older plans and generates a new version number.

---

## 6. IPC Interface & Desktop Bridge

| Channel | Method | Description |
| :--- | :--- | :--- |
| `desktop:planner:create-plan` | `window.desktop.planner.createPlan` | Creates a new plan version for a task |
| `desktop:planner:get-plan` | `window.desktop.planner.getPlan` | Retrieves plan by planId |
| `desktop:planner:list-plans` | `window.desktop.planner.listPlans` | Lists all plan versions for a task |
| `desktop:planner:get-active-plan` | `window.desktop.planner.getActivePlan` | Fetches currently active plan |
| `desktop:planner:add-step` | `window.desktop.planner.addStep` | Adds a step to an existing plan |
| `desktop:planner:remove-step` | `window.desktop.planner.removeStep` | Removes a step |
| `desktop:planner:reorder-steps` | `window.desktop.planner.reorderSteps` | Reorders steps |
| `desktop:planner:modify-step` | `window.desktop.planner.modifyStep` | Modifies step attributes |
| `desktop:planner:set-step-status` | `window.desktop.planner.setStepStatus` | Updates step status with prerequisite checks |
| `desktop:planner:set-plan-status` | `window.desktop.planner.setPlanStatus` | Updates plan status |
