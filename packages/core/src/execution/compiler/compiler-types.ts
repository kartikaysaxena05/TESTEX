/**
 * @file packages/core/src/execution/compiler/compiler-types.ts
 * Bounds, constants, regex patterns, and internal domain contracts for the Structured Test-to-Executable Plan Compiler.
 */

export const COMPILER_VERSION = '1.0.0';
export const PLAN_SCHEMA_VERSION = 1;

export const COMPILER_BOUNDS = {
  MAX_STEPS: 200,
  MAX_ASSERTIONS_PER_STEP: 20,
  MAX_PRECONDITIONS: 50,
  MAX_POSTCONDITIONS: 20,
  MAX_TARGET_HINT_LENGTH: 255,
  MAX_LITERAL_VALUE_LENGTH: 4096,
  MAX_DIAGNOSTICS: 200,
  MAX_PLAN_SUMMARY_LENGTH: 2000,
  DEFAULT_STEP_TIMEOUT_MS: 30000,
} as const;

/**
 * Prohibited action / malicious script patterns that must NEVER be compiled into executable browser instructions.
 */
export const PROHIBITED_CODE_PATTERNS: readonly RegExp[] = [
  /\beval\s*\(/i,
  /\bFunction\s*\(/i,
  /\brequire\s*\(\s*['"`](?:child_process|fs|net|http|tls|cluster|os|vm)['"`]\s*\)/i,
  /\b(?:exec|execSync|spawn|spawnSync|fork)\s*\(/i,
  /\bprocess\.(?:exit|env|mainModule|binding)/i,
  /<script\b[^>]*>[\s\S]*?<\/script>/i,
  /<iframe\b[^>]*>/i,
  /\bjavascript:\s*/i,
  /\b(?:powershell|cmd\.exe|bash|sh|zsh)\b/i,
  /\b(?:rm\s+-rf|del\s+\/[fq]|format\s+[a-z]:)/i,
  /\bDROP\s+TABLE\b/i,
  /\bSELECT\s+.*\s+FROM\s+.*\s+WHERE\b/i,
];

/**
 * Unsafe URL schemes prohibited from arbitrary test navigation.
 */
export const UNSAFE_URL_PROTOCOLS: readonly string[] = [
  'javascript:',
  'file:',
  'data:',
  'ftp:',
  'vbscript:',
  'about:blank',
];

/**
 * Sensitive or forbidden filesystem paths for upload actions.
 */
export const FORBIDDEN_FILE_PATH_PATTERNS: readonly RegExp[] = [
  /^\/etc\//i,
  /^\/root\//i,
  /^\/var\/run\//i,
  /^[A-Za-z]:\\Windows\\/i,
  /^[A-Za-z]:\\System32\\/i,
  /\.\.[/\\]/, // Directory traversal
  /[<>:"|?*]/, // Illegal Windows path characters
];

export interface CompilationContext {
  readonly projectId: string;
  readonly testCaseId: string;
  readonly testCaseKey: string;
  readonly testCaseTitle: string;
  readonly testCaseVersionNumber: number;
  readonly testCaseVersionId?: string | null;
  readonly environmentId?: string | null;
  readonly targetApplicationId?: string | null;
  readonly environmentBaseUrl?: string | null;
  readonly environmentVariables?: Record<string, string>;
  readonly environmentSecretRefs?: Record<string, string>;
  readonly previewOnly?: boolean;
}
