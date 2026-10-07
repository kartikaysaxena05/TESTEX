/**
 * @file packages/core/src/agent-approval/approval-policy-engine.ts
 * Deterministic approval-policy layer for V10 Phase 155: Human Approval Gates.
 *
 * Guarantees:
 * 1. The agent NEVER decides by itself whether an operation requires approval.
 * 2. Deterministic evaluation: ALLOW | REQUIRE_APPROVAL | DENY.
 * 3. Sensitive operations require explicit human approval:
 *    - modifying source code (FILE_WRITE, HIGH)
 *    - deleting files (FILE_DELETE, CRITICAL)
 *    - executing destructive commands (TERMINAL_COMMAND, HIGH/CRITICAL)
 *    - changing dependencies (TERMINAL_COMMAND, MEDIUM/HIGH)
 *    - applying repair patches (CODE_PATCH, HIGH)
 *    - changing configuration (FILE_WRITE, HIGH)
 *    - Git commits (GIT_CHANGE, MEDIUM)
 *    - Git pushes (GIT_CHANGE, HIGH)
 *    - release actions (RELEASE_ACTION, CRITICAL)
 * 4. Read-only operations normally ALLOW without approval.
 * 5. Denied operations fail closed with DENY.
 * 6. Generates deterministic SHA-256 action hashes to prevent tampering or replay.
 */

import crypto from 'node:crypto';
import type {
  ApprovalType,
  ApprovalRiskLevel,
  ApprovalPolicyDecision,
} from '@ai-quality/contracts';

export interface EvaluateApprovalPolicyInput {
  readonly toolName: string;
  readonly requestedAction: string;
  readonly input: Record<string, unknown>;
  readonly declaredLevel?: string;
  readonly explicitRiskLevel?: ApprovalRiskLevel;
  readonly affectedFiles?: readonly string[];
  readonly affectedTools?: readonly string[];
}

export interface ApprovalPolicyResult {
  readonly decision: ApprovalPolicyDecision;
  readonly approvalType: ApprovalType;
  readonly riskLevel: ApprovalRiskLevel;
  readonly title: string;
  readonly description: string;
  readonly affectedFiles: readonly string[];
  readonly affectedTools: readonly string[];
  readonly actionHash: string;
  readonly reason: string;
  readonly isDestructive: boolean;
}

export interface CustomPolicyRule {
  readonly toolPattern: RegExp | string;
  readonly decision: ApprovalPolicyDecision;
  readonly approvalType?: ApprovalType;
  readonly riskLevel?: ApprovalRiskLevel;
  readonly reason?: string;
}

function sortObjectKeys(obj: unknown): unknown {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map(sortObjectKeys);
  }
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(obj as Record<string, unknown>).sort()) {
    sorted[key] = sortObjectKeys((obj as Record<string, unknown>)[key]);
  }
  return sorted;
}

export function computeActionHash(
  toolName: string,
  requestedAction: string,
  input: Record<string, unknown>,
): string {
  const canonical = JSON.stringify({
    tool: toolName.trim().toLowerCase(),
    action: requestedAction.trim(),
    input: sortObjectKeys(input),
  });
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

export class ApprovalPolicyEngine {
  private readonly customRules: CustomPolicyRule[] = [];

  // Patterns for explicitly blocked / prohibited operations (DENY)
  private readonly blockedCommandPatterns: readonly RegExp[] = [
    /\brm\s+(-rf?|-fr?)\s+(\/|\*|\/\*|\.\.\/)($|\s|\b)/i,
    /\bmkfs\b/i,
    /\bdd\s+if=/i,
    /\bchmod\s+(-R\s+)?777\s+\//i,
    /\bcurl\b.*\|\s*(ba)?sh\b/i,
    /\bwget\b.*\|\s*(ba)?sh\b/i,
    /\b(shutdown|reboot|init\s+0)\b/i,
    /\bdrop\s+database\b/i,
  ];

  // Destructive terminal commands requiring CRITICAL approval
  private readonly destructiveTerminalPatterns: readonly RegExp[] = [
    /\brm\s+(-rf?|-fr?)\b/i,
    /\brmdir\b/i,
    /\bkill\s+-9\b/i,
    /\bpkill\b/i,
    /\bkillall\b/i,
    /\bsudo\b/i,
    /\bformat\b/i,
    /\btruncate\b/i,
    /\bdrop\s+table\b/i,
  ];

  // Dependency modification commands
  private readonly dependencyCommandPatterns: readonly RegExp[] = [
    /\bnpm\s+(i|install|add|uninstall|remove|update)\b/i,
    /\byarn\s+(add|remove|upgrade)\b/i,
    /\bpnpm\s+(add|remove|update)\b/i,
    /\bpip\s+(install|uninstall)\b/i,
    /\bgem\s+(install|uninstall)\b/i,
    /\bcargo\s+(add|remove)\b/i,
  ];

  // Git mutations
  private readonly gitPushPatterns: readonly RegExp[] = [/\bgit\s+push\b/i];
  private readonly gitCommitPatterns: readonly RegExp[] = [
    /\bgit\s+commit\b/i,
    /\bgit\s+merge\b/i,
    /\bgit\s+rebase\b/i,
    /\bgit\s+reset\s+--hard\b/i,
  ];

  public registerCustomRule(rule: CustomPolicyRule): void {
    this.customRules.push(rule);
  }

  public evaluate(input: EvaluateApprovalPolicyInput): ApprovalPolicyResult {
    const toolName = input.toolName.trim();
    const requestedAction = input.requestedAction.trim();
    const payload = input.input ?? {};
    const actionHash = computeActionHash(toolName, requestedAction, payload);

    // 1. Check custom rules first
    for (const rule of this.customRules) {
      const match =
        typeof rule.toolPattern === 'string'
          ? rule.toolPattern === toolName || toolName.startsWith(rule.toolPattern)
          : rule.toolPattern.test(toolName);

      if (match) {
        return {
          decision: rule.decision,
          approvalType: rule.approvalType ?? 'CUSTOM',
          riskLevel: rule.riskLevel ?? 'MEDIUM',
          title: requestedAction,
          description: `Custom policy match: ${rule.reason ?? 'Rule matched'}`,
          affectedFiles: input.affectedFiles ?? this.extractAffectedFiles(payload),
          affectedTools: input.affectedTools ?? [toolName],
          actionHash,
          reason: rule.reason ?? 'Matched custom approval policy rule',
          isDestructive: rule.riskLevel === 'HIGH' || rule.riskLevel === 'CRITICAL',
        };
      }
    }

    // 2. Terminal command inspection
    if (
      toolName.startsWith('terminal.') ||
      toolName === 'terminal.run' ||
      toolName === 'command.run'
    ) {
      const commandStr = String(payload.command ?? requestedAction ?? '');

      // Check blocked commands (DENY)
      for (const pattern of this.blockedCommandPatterns) {
        if (pattern.test(commandStr)) {
          return {
            decision: 'DENY',
            approvalType: 'TERMINAL_COMMAND',
            riskLevel: 'CRITICAL',
            title: requestedAction || 'Blocked Terminal Command',
            description: `Command contains prohibited destructive operation: ${commandStr}`,
            affectedFiles: input.affectedFiles ?? [],
            affectedTools: [toolName],
            actionHash,
            reason: `Operation is strictly prohibited by security policy: ${commandStr}`,
            isDestructive: true,
          };
        }
      }

      // Check Git push
      for (const pattern of this.gitPushPatterns) {
        if (pattern.test(commandStr)) {
          return {
            decision: 'REQUIRE_APPROVAL',
            approvalType: 'GIT_CHANGE',
            riskLevel: 'HIGH',
            title: `Git Push: ${commandStr}`,
            description: 'Operation will push commits to a remote Git repository.',
            affectedFiles: input.affectedFiles ?? [],
            affectedTools: [toolName],
            actionHash,
            reason: 'Git push modifies remote repository state and requires human authorization.',
            isDestructive: false,
          };
        }
      }

      // Check Git commit / destructive git operations
      for (const pattern of this.gitCommitPatterns) {
        if (pattern.test(commandStr)) {
          return {
            decision: 'REQUIRE_APPROVAL',
            approvalType: 'GIT_CHANGE',
            riskLevel: commandStr.includes('--hard') ? 'HIGH' : 'MEDIUM',
            title: `Git Operation: ${commandStr}`,
            description: 'Operation modifies Git commit history or working tree state.',
            affectedFiles: input.affectedFiles ?? [],
            affectedTools: [toolName],
            actionHash,
            reason:
              'Git commit/reset alters repository revision history and requires human approval.',
            isDestructive: commandStr.includes('--hard'),
          };
        }
      }

      // Check dependency commands
      for (const pattern of this.dependencyCommandPatterns) {
        if (pattern.test(commandStr)) {
          return {
            decision: 'REQUIRE_APPROVAL',
            approvalType: 'TERMINAL_COMMAND',
            riskLevel: 'MEDIUM',
            title: `Dependency Modification: ${commandStr}`,
            description: 'Operation changes project dependencies or lockfiles.',
            affectedFiles: [
              'package.json',
              'package-lock.json',
              'yarn.lock',
              'pnpm-lock.yaml',
              'requirements.txt',
            ],
            affectedTools: [toolName],
            actionHash,
            reason: 'Modifying project dependencies requires human authorization.',
            isDestructive: false,
          };
        }
      }

      // Check destructive terminal commands
      for (const pattern of this.destructiveTerminalPatterns) {
        if (pattern.test(commandStr)) {
          return {
            decision: 'REQUIRE_APPROVAL',
            approvalType: 'TERMINAL_COMMAND',
            riskLevel: 'CRITICAL',
            title: `Destructive Command: ${commandStr}`,
            description: 'Command may delete files or terminate running system processes.',
            affectedFiles: input.affectedFiles ?? this.extractAffectedFiles(payload),
            affectedTools: [toolName],
            actionHash,
            reason: 'Destructive command execution requires explicit human authorization.',
            isDestructive: true,
          };
        }
      }

      // Any other non-read terminal execution
      return {
        decision: 'REQUIRE_APPROVAL',
        approvalType: 'TERMINAL_COMMAND',
        riskLevel: 'HIGH',
        title: `Terminal Execution: ${commandStr}`,
        description: `Agent requested execution of shell command: ${commandStr}`,
        affectedFiles: input.affectedFiles ?? [],
        affectedTools: [toolName],
        actionHash,
        reason: 'Terminal command execution requires human approval.',
        isDestructive: false,
      };
    }

    // 3. File deletion (FILE_DELETE, CRITICAL)
    if (
      toolName === 'file.delete' ||
      toolName === 'file.remove' ||
      toolName === 'files.delete' ||
      requestedAction.toLowerCase().includes('delete file') ||
      requestedAction.toLowerCase().includes('remove file')
    ) {
      const affectedFiles = input.affectedFiles ?? this.extractAffectedFiles(payload);
      return {
        decision: 'REQUIRE_APPROVAL',
        approvalType: 'FILE_DELETE',
        riskLevel: 'CRITICAL',
        title: `Delete File(s): ${affectedFiles.join(', ') || requestedAction}`,
        description: 'Operation will permanently delete one or more files from disk.',
        affectedFiles,
        affectedTools: [toolName],
        actionHash,
        reason: 'Permanent file deletion requires explicit critical human approval.',
        isDestructive: true,
      };
    }

    // 4. File modification & writing (FILE_WRITE, HIGH)
    if (
      toolName === 'file.write' ||
      toolName === 'file.modify' ||
      toolName === 'file.create' ||
      toolName === 'file.patch' ||
      toolName === 'code.modify' ||
      toolName.startsWith('file.write') ||
      toolName.startsWith('file.modify')
    ) {
      const affectedFiles = input.affectedFiles ?? this.extractAffectedFiles(payload);
      const isConfig = affectedFiles.some(
        f =>
          /\.(env|config\.[a-z]+|json|yaml|yml)$/i.test(f) ||
          f.includes('.env') ||
          f.includes('package.json'),
      );
      return {
        decision: 'REQUIRE_APPROVAL',
        approvalType: 'FILE_WRITE',
        riskLevel: isConfig ? 'HIGH' : (input.explicitRiskLevel ?? 'HIGH'),
        title: `Modify File(s): ${affectedFiles.join(', ') || requestedAction}`,
        description: isConfig
          ? 'Operation modifies project configuration or environment files.'
          : 'Operation modifies source code in the repository.',
        affectedFiles,
        affectedTools: [toolName],
        actionHash,
        reason: isConfig
          ? 'Configuration change requires human authorization.'
          : 'Source code modification requires human approval.',
        isDestructive: false,
      };
    }

    // 5. Applying repair patches (CODE_PATCH, HIGH)
    if (
      toolName === 'repair.applyPatch' ||
      toolName === 'repair.apply' ||
      toolName === 'patch.apply' ||
      toolName === 'repair_patch'
    ) {
      const affectedFiles = input.affectedFiles ?? this.extractAffectedFiles(payload);
      return {
        decision: 'REQUIRE_APPROVAL',
        approvalType: 'CODE_PATCH',
        riskLevel: 'HIGH',
        title: `Apply Code Patch: ${requestedAction}`,
        description: 'Operation applies an AI-generated repair patch to the codebase.',
        affectedFiles,
        affectedTools: [toolName],
        actionHash,
        reason:
          'Applying automated repair patches requires mandatory human verification and approval.',
        isDestructive: false,
      };
    }

    // 6. Release actions (RELEASE_ACTION, CRITICAL)
    if (
      toolName.startsWith('release.') ||
      toolName === 'release.publish' ||
      requestedAction.toLowerCase().includes('release') ||
      requestedAction.toLowerCase().includes('publish')
    ) {
      return {
        decision: 'REQUIRE_APPROVAL',
        approvalType: 'RELEASE_ACTION',
        riskLevel: 'CRITICAL',
        title: `Release Action: ${requestedAction}`,
        description: 'Operation initiates a production or release-stage action.',
        affectedFiles: input.affectedFiles ?? [],
        affectedTools: [toolName],
        actionHash,
        reason: 'Production and release actions require critical human authorization.',
        isDestructive: false,
      };
    }

    // 7. Git modifications via dedicated git tools
    if (toolName.startsWith('git.')) {
      if (toolName === 'git.push') {
        return {
          decision: 'REQUIRE_APPROVAL',
          approvalType: 'GIT_CHANGE',
          riskLevel: 'HIGH',
          title: `Git Push: ${requestedAction}`,
          description: 'Pushes revisions to remote Git branches.',
          affectedFiles: input.affectedFiles ?? [],
          affectedTools: [toolName],
          actionHash,
          reason: 'Pushing to remote Git repositories requires human approval.',
          isDestructive: false,
        };
      }
      if (toolName === 'git.commit' || toolName === 'git.merge' || toolName === 'git.checkout') {
        return {
          decision: 'REQUIRE_APPROVAL',
          approvalType: 'GIT_CHANGE',
          riskLevel: 'MEDIUM',
          title: `Git Modification: ${requestedAction}`,
          description: 'Creates commits or changes Git tree state.',
          affectedFiles: input.affectedFiles ?? [],
          affectedTools: [toolName],
          actionHash,
          reason: 'Git repository mutation requires human authorization.',
          isDestructive: false,
        };
      }
      // Read-only git operations: git.status, git.log, git.diff
      return {
        decision: 'ALLOW',
        approvalType: 'GIT_CHANGE',
        riskLevel: 'LOW',
        title: requestedAction,
        description: 'Read-only Git inspection.',
        affectedFiles: [],
        affectedTools: [toolName],
        actionHash,
        reason: 'Read-only Git operation is permitted.',
        isDestructive: false,
      };
    }

    // 8. Explicit High/Critical Risk override
    if (input.explicitRiskLevel === 'HIGH' || input.explicitRiskLevel === 'CRITICAL') {
      return {
        decision: 'REQUIRE_APPROVAL',
        approvalType: 'CUSTOM',
        riskLevel: input.explicitRiskLevel,
        title: requestedAction,
        description: `Operation was explicitly designated as ${input.explicitRiskLevel} risk.`,
        affectedFiles: input.affectedFiles ?? this.extractAffectedFiles(payload),
        affectedTools: [toolName],
        actionHash,
        reason: `Operation with ${input.explicitRiskLevel} risk level requires human approval.`,
        isDestructive: input.explicitRiskLevel === 'CRITICAL',
      };
    }

    // 9. Read-only tools (ALLOW)
    if (
      toolName.startsWith('repository.') ||
      toolName.startsWith('requirements.') ||
      toolName.startsWith('tests.') ||
      toolName.startsWith('traceability.') ||
      toolName.startsWith('failure_intelligence.') ||
      toolName.includes('.read') ||
      toolName.includes('.search') ||
      toolName.includes('.list') ||
      toolName.includes('.get')
    ) {
      return {
        decision: 'ALLOW',
        approvalType: 'TEST_EXECUTION',
        riskLevel: 'LOW',
        title: requestedAction,
        description: 'Read-only repository or diagnostic inspection.',
        affectedFiles: input.affectedFiles ?? this.extractAffectedFiles(payload),
        affectedTools: [toolName],
        actionHash,
        reason: 'Read-only operations do not require human approval.',
        isDestructive: false,
      };
    }

    // 10. Test execution tools (EXECUTE / ALLOW or medium risk)
    if (toolName.startsWith('test.') || toolName.startsWith('playwright.')) {
      return {
        decision: 'ALLOW',
        approvalType: 'TEST_EXECUTION',
        riskLevel: 'LOW',
        title: requestedAction,
        description: 'Automated test suite or browser execution.',
        affectedFiles: input.affectedFiles ?? [],
        affectedTools: [toolName],
        actionHash,
        reason: 'Standard test execution is permitted within sandbox.',
        isDestructive: false,
      };
    }

    // 11. Declared approval required from tool definition
    if (
      input.declaredLevel === 'APPROVAL_REQUIRED' ||
      input.declaredLevel === 'WRITE' ||
      input.declaredLevel === 'ADMIN'
    ) {
      return {
        decision: 'REQUIRE_APPROVAL',
        approvalType: 'CUSTOM',
        riskLevel: 'HIGH',
        title: requestedAction,
        description: `Tool '${toolName}' declared approval requirement.`,
        affectedFiles: input.affectedFiles ?? this.extractAffectedFiles(payload),
        affectedTools: [toolName],
        actionHash,
        reason: `Tool '${toolName}' demands human authorization.`,
        isDestructive: false,
      };
    }

    // 12. Default-allow for other read levels, otherwise DENY unknown tools
    if (
      input.declaredLevel === 'READ' ||
      input.declaredLevel === 'READ_ONLY' ||
      input.declaredLevel === 'EXECUTE'
    ) {
      return {
        decision: 'ALLOW',
        approvalType: 'CUSTOM',
        riskLevel: 'LOW',
        title: requestedAction,
        description: 'Permitted execution.',
        affectedFiles: input.affectedFiles ?? [],
        affectedTools: [toolName],
        actionHash,
        reason: 'Permitted by declared execution level.',
        isDestructive: false,
      };
    }

    // Default: DENY unknown unvetted tools
    return {
      decision: 'DENY',
      approvalType: 'CUSTOM',
      riskLevel: 'CRITICAL',
      title: requestedAction || 'Unknown Tool Invocation',
      description: `Tool '${toolName}' is not permitted under default-deny policy.`,
      affectedFiles: [],
      affectedTools: [toolName],
      actionHash,
      reason: `Tool '${toolName}' is unmapped and denied by default security policy.`,
      isDestructive: true,
    };
  }

  private extractAffectedFiles(payload: Record<string, unknown>): readonly string[] {
    const files: string[] = [];
    if (typeof payload.filePath === 'string') files.push(payload.filePath);
    if (typeof payload.targetFile === 'string') files.push(payload.targetFile);
    if (typeof payload.path === 'string') files.push(payload.path);
    if (Array.isArray(payload.targetFiles)) {
      for (const f of payload.targetFiles) {
        if (typeof f === 'string') files.push(f);
      }
    }
    if (Array.isArray(payload.files)) {
      for (const f of payload.files) {
        if (typeof f === 'string') files.push(f);
      }
    }
    return Array.from(new Set(files));
  }
}
