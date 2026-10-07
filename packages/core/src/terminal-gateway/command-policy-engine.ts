/**
 * @file packages/core/src/terminal-gateway/command-policy-engine.ts
 * Deterministic command validation and security classification for V10 Phase 151.
 *
 * Evaluates requested command strings against structured allowlists and denylists.
 * Categorizes commands into:
 * - SAFE: Read-only development commands (e.g., git status, npm test, pytest, node --check)
 * - REQUIRES_APPROVAL: Mutating development commands (e.g., npm install, git commit, build)
 * - BLOCKED: System modification, dangerous operations, privilege escalation, downloads, network shells
 */

import type { TerminalCommandPolicyClassification } from '@ai-quality/contracts';

export interface CommandEvaluationResult {
  readonly classification: TerminalCommandPolicyClassification;
  readonly binary: string;
  readonly args: readonly string[];
  readonly reason: string;
}

/**
 * Commands that are unconditionally BLOCKED.
 */
const BLOCKED_BINARIES = new Set([
  'rm',
  'rmdir',
  'dd',
  'mkfs',
  'fdisk',
  'parted',
  'chmod',
  'chown',
  'chgrp',
  'sudo',
  'su',
  'doas',
  'useradd',
  'usermod',
  'groupadd',
  'passwd',
  'curl',
  'wget',
  'nc',
  'netcat',
  'socat',
  'ncat',
  'ssh',
  'scp',
  'sftp',
  'ftp',
  'telnet',
  'bash',
  'sh',
  'zsh',
  'csh',
  'tcsh',
  'fish',
  'powershell',
  'pwsh',
  'cmd',
  'exec',
  'kill',
  'pkill',
  'killall',
  'shutdown',
  'reboot',
  'halt',
  'init',
  'systemctl',
  'service',
  'launchctl',
  'crontab',
  'at',
  'iptables',
  'ufw',
  'pfctl',
  'env',
  'export',
  'alias',
  'eval',
  'source',
  '.',
]);

/**
 * Shell operators and injection characters that are strictly BLOCKED.
 * Prevents chaining, piping, redirection, backgrounding, and subshell invocation.
 */
const FORBIDDEN_OPERATORS = [
  ';',
  '&&',
  '||',
  '|',
  '>',
  '<',
  '&',
  '`',
  '$(',
  '${',
  '\n',
  '\r',
  '\0',
];

/**
 * High-risk arguments across any command.
 */
const DANGEROUS_ARGUMENT_PATTERNS = [
  /--exec/i,
  /--eval/i,
  /--require/i,
  /--upload/i,
  /--output=/i,
  /\.\.\//, // Path traversal inside args
  /\/etc\//i,
  /\/var\//i,
  /\/usr\//i,
  /\/root/i,
  /~[\/\\]/, // Home directory traversal
  /id_rsa/i,
  /\.ssh/i,
  /\.aws/i,
  /\.gnupg/i,
  /\.bashrc/i,
  /\.zshrc/i,
  /\.profile/i,
  /\.env/i,
];

/**
 * Safe read-only development binaries.
 */
const SAFE_BINARIES = new Set([
  'git',
  'npm',
  'npx',
  'node',
  'pnpm',
  'yarn',
  'bun',
  'python',
  'python3',
  'pytest',
  'tsc',
  'eslint',
  'prettier',
]);

export class CommandPolicyEngine {
  /**
   * Parses and tokenizes a raw command string while respecting quotes.
   */
  public static tokenizeCommand(commandStr: string): { tokens: string[]; unclosedQuotes: boolean } {
    const tokens: string[] = [];
    let current = '';
    let inSingle = false;
    let inDouble = false;

    for (let i = 0; i < commandStr.length; i++) {
      const c = commandStr[i]!;

      if (c === "'" && !inDouble) {
        inSingle = !inSingle;
      } else if (c === '"' && !inSingle) {
        inDouble = !inDouble;
      } else if ((c === ' ' || c === '\t') && !inSingle && !inDouble) {
        if (current.length > 0) {
          tokens.push(current);
          current = '';
        }
      } else {
        current += c;
      }
    }

    if (current.length > 0) {
      tokens.push(current);
    }

    return { tokens, unclosedQuotes: inSingle || inDouble };
  }

  /**
   * Evaluates command and determines its classification (SAFE, REQUIRES_APPROVAL, BLOCKED).
   */
  public static evaluate(commandStr: string): CommandEvaluationResult {
    const trimmed = (commandStr ?? '').trim();
    if (!trimmed) {
      return {
        classification: 'BLOCKED',
        binary: '',
        args: [],
        reason: 'Empty command string provided.',
      };
    }

    // 1. Check for forbidden shell metacharacters / operators
    for (const op of FORBIDDEN_OPERATORS) {
      if (trimmed.includes(op)) {
        return {
          classification: 'BLOCKED',
          binary: '',
          args: [],
          reason: `Command contains forbidden shell operator or chaining character '${op}'. Direct pipeline or compound commands are not permitted.`,
        };
      }
    }

    // 2. Tokenize command safely
    const { tokens, unclosedQuotes } = this.tokenizeCommand(trimmed);
    if (unclosedQuotes) {
      return {
        classification: 'BLOCKED',
        binary: '',
        args: [],
        reason: 'Command string has unclosed quotes.',
      };
    }

    if (tokens.length === 0) {
      return {
        classification: 'BLOCKED',
        binary: '',
        args: [],
        reason: 'Command contains no executable tokens.',
      };
    }

    const rawBinary = tokens[0]!;
    // Clean binary path (e.g. "./node" or "/bin/git")
    const binaryName = rawBinary.split(/[\/\\]/).pop()?.toLowerCase() ?? rawBinary.toLowerCase();
    const args = tokens.slice(1);

    // 3. Check blocked binaries
    if (BLOCKED_BINARIES.has(binaryName)) {
      return {
        classification: 'BLOCKED',
        binary: binaryName,
        args,
        reason: `Executable '${binaryName}' is on the restricted system denylist.`,
      };
    }

    // 4. Verify dangerous argument patterns (credentials, root paths, ssh keys, .env)
    for (const arg of args) {
      for (const pattern of DANGEROUS_ARGUMENT_PATTERNS) {
        if (pattern.test(arg)) {
          return {
            classification: 'BLOCKED',
            binary: binaryName,
            args,
            reason: `Argument '${arg}' matches blocked security pattern '${pattern.source}'. Access to secrets or system resources is prohibited.`,
          };
        }
      }
    }

    // 5. Check if binary is in allowed developer tools
    if (!SAFE_BINARIES.has(binaryName)) {
      return {
        classification: 'BLOCKED',
        binary: binaryName,
        args,
        reason: `Executable '${binaryName}' is not in the allowed developer toolchain (git, npm, npx, node, pnpm, yarn, bun, python, pytest, tsc, eslint, prettier).`,
      };
    }

    // 6. Subcommand analysis for allowed tools
    return this.classifyAllowedBinary(binaryName, args);
  }

  /**
   * Refined classification between SAFE and REQUIRES_APPROVAL for allowed binaries.
   */
  private static classifyAllowedBinary(binary: string, args: readonly string[]): CommandEvaluationResult {
    const subCmd = (args[0] ?? '').toLowerCase();

    // --- Git ---
    if (binary === 'git') {
      const readOnlyGit = new Set([
        'status',
        'diff',
        'log',
        'branch',
        'rev-parse',
        'describe',
        'show',
        'tag',
        'ls-files',
        'config',
        'remote',
      ]);

      const mutatingGit = new Set([
        'add',
        'commit',
        'checkout',
        'switch',
        'merge',
        'rebase',
        'pull',
        'fetch',
        'stash',
        'cherry-pick',
      ]);

      const blockedGit = new Set([
        'push',
        'clean', // can destroy untracked files
        'reset', // dangerous hard reset
        'rm',
      ]);

      if (blockedGit.has(subCmd)) {
        return {
          classification: 'BLOCKED',
          binary,
          args,
          reason: `Git subcommand '${subCmd}' is blocked by policy to prevent accidental repository destruction or unreviewed push.`,
        };
      }

      if (readOnlyGit.has(subCmd)) {
        return {
          classification: 'SAFE',
          binary,
          args,
          reason: `Read-only Git operation '${subCmd}'.`,
        };
      }

      if (mutatingGit.has(subCmd)) {
        return {
          classification: 'REQUIRES_APPROVAL',
          binary,
          args,
          reason: `Mutating Git operation '${subCmd}' requires human approval.`,
        };
      }

      // Default for other git commands: require approval
      return {
        classification: 'REQUIRES_APPROVAL',
        binary,
        args,
        reason: `Git command '${subCmd || 'git'}' requires approval.`,
      };
    }

    // --- Node / Python Testing & Linting ---
    if (binary === 'npm' || binary === 'pnpm' || binary === 'yarn' || binary === 'bun') {
      const safePackageCmds = new Set(['test', 'run test', 'lint', 'run lint', 'typecheck', 'run typecheck', 'check']);
      if (safePackageCmds.has(subCmd) || (subCmd === 'run' && args[1] && safePackageCmds.has(`run ${args[1]}`))) {
        return {
          classification: 'SAFE',
          binary,
          args,
          reason: `Safe test/verification run via '${binary} ${subCmd}'.`,
        };
      }

      const mutatingPackageCmds = new Set(['install', 'i', 'add', 'remove', 'uninstall', 'update', 'build', 'run build']);
      if (mutatingPackageCmds.has(subCmd) || (subCmd === 'run' && args[1] && mutatingPackageCmds.has(`run ${args[1]}`))) {
        return {
          classification: 'REQUIRES_APPROVAL',
          binary,
          args,
          reason: `Package manager mutation '${binary} ${subCmd}' requires human approval.`,
        };
      }

      return {
        classification: 'REQUIRES_APPROVAL',
        binary,
        args,
        reason: `Command '${binary} ${subCmd}' requires human review.`,
      };
    }

    // --- Node ---
    if (binary === 'node') {
      const isVersionOrCheck = subCmd === '-v' || subCmd === '--version' || subCmd === '--check' || subCmd === '-c';
      if (isVersionOrCheck) {
        return {
          classification: 'SAFE',
          binary,
          args,
          reason: `Safe node inspection via '${binary} ${subCmd}'.`,
        };
      }

      const isTestRunner = subCmd === '--test';
      if (isTestRunner) {
        return {
          classification: 'SAFE',
          binary,
          args,
          reason: 'Node built-in test runner execution.',
        };
      }

      return {
        classification: 'REQUIRES_APPROVAL',
        binary,
        args,
        reason: `Node script execution '${binary} ${args.join(' ')}' requires human approval.`,
      };
    }

    // --- Pytest / Python ---
    if (binary === 'pytest') {
      return {
        classification: 'SAFE',
        binary,
        args,
        reason: 'Pytest test execution.',
      };
    }

    if (binary === 'python' || binary === 'python3') {
      if (subCmd === '-V' || subCmd === '--version') {
        return {
          classification: 'SAFE',
          binary,
          args,
          reason: `Safe python version inspection.`,
        };
      }

      if (subCmd === '-m' && (args[1] === 'pytest' || args[1] === 'unittest')) {
        return {
          classification: 'SAFE',
          binary,
          args,
          reason: `Safe test run via '${binary} -m ${args[1]}'.`,
        };
      }
      return {
        classification: 'REQUIRES_APPROVAL',
        binary,
        args,
        reason: `Python execution '${binary} ${args.join(' ')}' requires approval.`,
      };
    }

    // --- tsc, eslint, prettier ---
    if (binary === 'tsc' || binary === 'eslint' || binary === 'prettier') {
      const isFix = args.some((a) => a === '--fix' || a === '--write');
      if (isFix) {
        return {
          classification: 'REQUIRES_APPROVAL',
          binary,
          args,
          reason: `${binary} mutation with auto-fix/write requires approval.`,
        };
      }
      return {
        classification: 'SAFE',
        binary,
        args,
        reason: `Read-only static check with ${binary}.`,
      };
    }

    // Default fallback
    return {
      classification: 'REQUIRES_APPROVAL',
      binary,
      args,
      reason: `Command '${binary}' requires human review before execution.`,
    };
  }
}
