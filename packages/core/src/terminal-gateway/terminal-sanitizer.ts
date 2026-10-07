/**
 * @file packages/core/src/terminal-gateway/terminal-sanitizer.ts
 * Sanitization utility for environment variables, paths, and process output.
 *
 * Enforces:
 * 1. Strict environment allowlist. Never leaks secrets or host environment.
 * 2. Sensitive value masking & secret redaction in stdout/stderr.
 * 3. Bounded output buffer enforcement.
 */

import { SecretRedactor } from '../execution/sessions/secret-redactor.js';

/**
 * Explicit allowlist of environment variable keys permitted in agent terminal processes.
 */
const ALLOWED_ENV_KEYS = new Set([
  'PATH',
  'HOME',
  'TMPDIR',
  'TEMP',
  'TMP',
  'USER',
  'LOGNAME',
  'LANG',
  'LC_ALL',
  'LC_CTYPE',
  'NODE_ENV',
  'CI',
  'FORCE_COLOR',
  'NO_COLOR',
  'TERM',
  'SHELL',
]);

/**
 * Common patterns for tokens, keys, passwords, and secrets in output.
 */
const SECRET_REGEX_PATTERNS = [
  /(?:bearer\s+)([a-zA-Z0-9_\-\.]{16,})/gi,
  /(?:api[_-]?key[=:\s]+)([a-zA-Z0-9_\-]{16,})/gi,
  /(?:token[=:\s]+)([a-zA-Z0-9_\-]{16,})/gi,
  /(?:password[=:\s]+)([^\s"';]+)/gi,
  /(?:secret[=:\s]+)([a-zA-Z0-9_\-]{16,})/gi,
  /ghp_[a-zA-Z0-9]{36}/g, // GitHub Personal Access Token
  /gho_[a-zA-Z0-9]{36}/g, // GitHub OAuth
  /glpat-[a-zA-Z0-9_\-]{20,}/g, // GitLab Personal Access Token
  /xox[baprs]-[0-9a-zA-Z]{10,48}/g, // Slack token
  /AKIA[0-9A-Z]{16}/g, // AWS Access Key
  /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/g,
];

export class TerminalSanitizer {
  /**
   * Filters host environment against the strict allowlist and adds deterministic defaults.
   */
  public static filterEnvironment(
    hostEnv: NodeJS.ProcessEnv = process.env,
    projectPath?: string,
  ): NodeJS.ProcessEnv {
    const cleanEnv: NodeJS.ProcessEnv = {};

    for (const key of Object.keys(hostEnv)) {
      if (ALLOWED_ENV_KEYS.has(key)) {
        cleanEnv[key] = hostEnv[key];
      }
    }

    // Force non-interactive, predictable execution
    cleanEnv['LC_ALL'] = 'C';
    cleanEnv['CI'] = 'true';
    cleanEnv['GIT_TERMINAL_PROMPT'] = '0';
    cleanEnv['NPM_CONFIG_AUDIT'] = 'false';
    cleanEnv['NPM_CONFIG_FUND'] = 'false';
    cleanEnv['NPM_CONFIG_UPDATE_NOTIFIER'] = 'false';

    if (projectPath) {
      cleanEnv['INIT_CWD'] = projectPath;
    }

    return cleanEnv;
  }

  /**
   * Redacts known secrets and regex matches from output string.
   */
  public static sanitizeOutput(output: string): string {
    if (!output) return '';

    let sanitized = output;

    // 1. Redact via SecretRedactor
    sanitized = SecretRedactor.redactText(sanitized);

    // 2. Redact via regex patterns
    for (const pattern of SECRET_REGEX_PATTERNS) {
      sanitized = sanitized.replace(pattern, '[REDACTED_SECRET]');
    }

    return sanitized;
  }

  /**
   * Truncates output to maxOutputBytes while inserting a clear truncation notice if exceeded.
   */
  public static boundOutput(output: string, maxBytes: number): string {
    if (!output) return '';
    const byteLength = Buffer.byteLength(output, 'utf-8');
    if (byteLength <= maxBytes) {
      return output;
    }

    const notice = `\n... [TERMINAL OUTPUT TRUNCATED: Exceeded limit of ${maxBytes} bytes] ...\n`;
    const noticeBytes = Buffer.byteLength(notice, 'utf-8');
    const availableBytes = Math.max(0, maxBytes - noticeBytes);

    const buf = Buffer.from(output, 'utf-8');
    const sliced = buf.subarray(0, availableBytes).toString('utf-8');
    return sliced + notice;
  }
}
