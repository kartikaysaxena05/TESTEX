# V10 Phase 149: Repair / Patch Tool (`repair_patch`)

## 1. Overview
V10 Phase 149 implements the controlled agent **Repair / Patch Tool** (`repair_patch`). It exposes the existing V7 source-code patch generation, diff containment, and human approval workflow to the V10 autonomous agent runtime without giving the AI agent direct, arbitrary write access to the user's codebase.

The agent can generate deterministic, syntactic diffs bounded strictly to candidate files, but **can never silently apply patches to arbitrary files or bypass the human approval gate**.

---

## 2. Architecture & Isolation Guarantees

```
Agent Tool Invocation (`repair_patch`)
                 │
                 ▼
┌────────────────────────────────────────────────────────┐
│  Multi-Tenant & Security Verification                  │
│  - User Ownership: userId → projectId → taskId         │
│  - Path Traversal Defense: .. / %2e%2e / null-bytes    │
│  - Path Containment: rejects absolute / UNC / drives   │
│  - Secret Defense: blocks .env, .git, id_rsa, *.pem    │
│  - Injection Neutralization: prompt sanitize           │
└────────────────────────┬───────────────────────────────┘
                         │
                         ▼
┌────────────────────────────────────────────────────────┐
│  Patch Limits & Syntax Verification (PATCH_BOUNDS)     │
│  - Max Files: <= 3                                     │
│  - Max Lines Added: <= 50                              │
│  - Max Lines Removed: <= 30                            │
│  - Max Changed Lines: <= 60                            │
│  - Max Diff Size: <= 64 KB                             │
│  - Unified Diff Syntactic Parsing                      │
└────────────────────────┬───────────────────────────────┘
                         │
                         ▼
┌────────────────────────────────────────────────────────┐
│  State Machine & Human Approval Gate                   │
│                                                        │
│   PROPOSED  ───►  WAITING_FOR_APPROVAL                 │
│                          │                             │
│             ┌────────────┴────────────┐                │
│             ▼                         ▼                │
│          APPROVED                  REJECTED / CANCEL   │
│             │                                          │
│             ▼                                          │
│          APPLIED                                       │
│  * Tool CANNOT apply in PROPOSED or WAITING status.    │
└────────────────────────┬───────────────────────────────┘
                         │
                         ▼
┌────────────────────────────────────────────────────────┐
│  Audit Trail & Step Tracking                           │
│  - DefectRepairAuditLog & AgentToolAuditLog            │
│  - Thread Task Execution Steps                         │
└────────────────────────────────────────────────────────┘
```

---

## 3. Key Components Implemented

### 3.1 Contracts (`packages/contracts`)
- **Desktop Channels**:
  - `REPAIR_PATCH_PROPOSE`
  - `REPAIR_PATCH_GET`
  - `REPAIR_PATCH_APPROVE`
  - `REPAIR_PATCH_REJECT`
  - `REPAIR_PATCH_CANCEL`
  - `REPAIR_PATCH_APPLY`
- **Schemas & DTOs**:
  - `repairPatchStatusSchema`: `'PROPOSED' | 'WAITING_FOR_APPROVAL' | 'APPROVED' | 'REJECTED' | 'CANCELLED' | 'APPLIED' | 'FAILED'`
  - `repairPatchToolInputSchema` & `RepairPatchToolInputDto`
  - `repairPatchToolOutputSchema` & `RepairPatchToolOutputDto`
  - `repairPatchProposeInputSchema`, `repairPatchGetInputSchema`, `repairPatchApproveInputSchema`, `repairPatchRejectInputSchema`, `repairPatchCancelInputSchema`, `repairPatchApplyInputSchema`
- **DesktopBridge API**:
  - Added typed `window.desktop.repairPatch` namespace with `propose`, `get`, `approve`, `reject`, `cancel`, and `apply`.

### 3.2 Core Service & Tool Registry (`packages/core`)
- **Errors** (`repair-patch-tool-errors.ts`):
  - `RepairPatchToolError`, `RepairPatchValidationError`, `RepairPatchPathTraversalError`, `RepairPatchAbsolutePathError`, `RepairPatchProtectedFileError`, `RepairPatchOversizedError`, `RepairPatchMalformedError`, `RepairPatchApprovalRequiredError`, `RepairPatchAlreadyDecidedError`, `RepairPatchNotFoundError`, `RepairPatchApplyFailedError`.
- **Domain Service** (`repair-patch-tool-service.ts`):
  - Connects to existing V7 `PatchProposalService`, `PatchApprovalService`, `PatchApplicator`, and `SandboxContainmentValidator`.
  - Enforces `PATCH_BOUNDS` and checks for high-risk diff patterns (`HIGH_RISK_DIFF_PATTERNS`).
  - Syntactic diff parsing via `PatchParser.parseUnifiedDiff`.
  - Sets initial state to `WAITING_FOR_APPROVAL`.
  - Ensures patch application strictly requires `APPROVED` state.
  - Neutralizes prompt injection payloads in user guidance/reasons.
  - Comprehensive audit logging into `defectRepairAuditLog` and `agentToolAuditLog`.
- **Tool Registration & Permissions**:
  - Registered as `repair_patch` under category `DEFECTS` with permission level `READ`.
  - Mapped in `AgentPermissionService` as `READ_ONLY`.

### 3.3 Desktop IPC & Renderer UI (`apps/desktop`)
- **IPC Handlers** (`repair-patch-handlers.ts`):
  - Top-level frame sender verification via `isTrustedIpcSender`.
  - Strict authentication and Zod boundary validation.
  - Registered in `register-ipc.ts` and unregister lifecycle.
- **Preload Bridge** (`preload/index.ts`):
  - Safe typed bridge exposure on `window.desktop.repairPatch`.
- **UI Component** (`renderer/features/repair/RepairPatchReviewCard.tsx`):
  - Codex-style unified diff inspection with line additions (`+` in green) and deletions (`-` in red).
  - Explicit action controls for human review: Approve, Reject (with reason input), Cancel, and Apply to Workspace.
  - Responsive status badges for each lifecycle state.

---

## 4. Test Certification & Verification

### 4.1 Certification Suites (40/40 Passing)
1. **Phase 147 Playwright Execution Tool**: 8/8 tests pass.
2. **Phase 148 Failure Intelligence Tool**: 13/13 tests pass.
3. **Phase 149 Repair / Patch Tool**: 19/19 tests pass (`v10-phase149-certification.test.ts`).
   - Valid patch proposal generation (`status: 'WAITING_FOR_APPROVAL'`)
   - Malformed patch rejection (invalid syntax/headers)
   - Cross-project access rejection (`AiCrossProjectAccessError`)
   - Cross-task access rejection
   - Path traversal sequence rejection (`..`, `%2e`, null bytes)
   - Absolute path rejection (`/`, `C:\`)
   - Protected/system/secret file rejection (`.env`, `.git`, `credentials.json`, `id_rsa`, `.pem`)
   - Oversized patch rejection exceeding `PATCH_BOUNDS`
   - Approval required invariant: cannot apply while in `PROPOSED` or `WAITING_FOR_APPROVAL`
   - Patch rejection transition to `REJECTED`
   - Patch cancellation transition to `CANCELLED`
   - Complete audit trail recording (`defectRepairAuditLog` + `agentToolAuditLog`)
   - Concurrent approval conflict handling and mutex locks
   - Duplicate approval rejection
   - Project isolation enforcement across operations
   - Agent permission registry mapping (`DEFECTS`, `READ_ONLY`)
   - Preservation of unrelated changes during workspace application
   - Prompt-injection payload neutralization
   - Patch application failure handling with workspace safety

### 4.2 Desktop IPC & UI Unit Tests
- `repair-patch-handlers.test.ts`: 9/9 tests pass (sender origin verification, session auth, validation error handling, cross-project protection, and approval gates).
- `repair-patch-ui.test.tsx`: 1/1 tests pass.
- `npm run desktop:smoke`: clean pass.
- `npm run typecheck`: 0 errors across all workspaces.
