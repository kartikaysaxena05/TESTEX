/**
 * @file packages/core/src/jira/jira-url-validator.ts
 * Strict Jira Base URL validation, normalization, and SSRF protection engine.
 */

import { JIRA_BOUNDS } from './jira-types.js';
import { JiraConfigurationInvalidError, JiraSecurityError } from './jira-errors.js';

const DISALLOWED_SCHEMES = [
  'file:',
  'javascript:',
  'data:',
  'vbscript:',
  'ftp:',
  'gopher:',
  'ldap:',
  'dict:',
  'mailto:',
  'ssh:',
  'telnet:',
];

const CLOUD_METADATA_HOSTS = [
  '169.254.169.254',
  'metadata.google.internal',
  '100.100.100.200', // Alibaba cloud metadata
  'instance-data',
];

export interface JiraUrlValidationOptions {
  readonly allowLocalhostForTesting?: boolean;
}

export class JiraUrlValidator {
  /**
   * Validates and normalizes a Jira base URL.
   * Enforces HTTPS, length limits, credential rejection, and strict SSRF defenses.
   */
  public static validateAndNormalizeBaseUrl(
    rawUrl: string,
    options?: JiraUrlValidationOptions,
  ): string {
    if (!rawUrl || typeof rawUrl !== 'string' || rawUrl.trim().length === 0) {
      throw new JiraConfigurationInvalidError('Jira base URL cannot be empty.');
    }

    const trimmed = rawUrl.trim();

    if (trimmed.length > JIRA_BOUNDS.MAX_BASE_URL_LENGTH) {
      throw new JiraConfigurationInvalidError(
        `Jira base URL exceeds maximum permitted length of ${JIRA_BOUNDS.MAX_BASE_URL_LENGTH} characters.`,
      );
    }

    // Check disallowed schemes before URL constructor
    const lower = trimmed.toLowerCase();
    for (const scheme of DISALLOWED_SCHEMES) {
      if (lower.startsWith(scheme)) {
        throw new JiraSecurityError(`Protocol scheme '${scheme}' is strictly prohibited for Jira.`);
      }
    }

    let parsed: URL;
    try {
      parsed = new URL(trimmed);
    } catch {
      throw new JiraConfigurationInvalidError(
        'Malformed Jira base URL. Must be a valid URL with hostname.',
      );
    }

    // Enforce protocol
    const allowHttp = options?.allowLocalhostForTesting === true;
    if (parsed.protocol === 'http:') {
      if (!allowHttp) {
        throw new JiraSecurityError(
          'Insecure HTTP protocol is prohibited. Jira integration requires HTTPS.',
        );
      }
    } else if (parsed.protocol !== 'https:') {
      throw new JiraSecurityError(
        `Unsupported protocol '${parsed.protocol}'. Jira integration requires HTTPS.`,
      );
    }

    // Reject embedded credentials
    if (parsed.username || parsed.password) {
      throw new JiraSecurityError(
        'Jira base URL must not contain embedded user or password credentials.',
      );
    }

    // Validate hostname
    const hostname = parsed.hostname.toLowerCase();
    if (!hostname || hostname.length === 0) {
      throw new JiraConfigurationInvalidError('Jira base URL hostname is missing or invalid.');
    }

    // SSRF Protections
    this.assertSsrfSafeHostname(hostname, options);

    // Validate port if explicitly supplied
    if (parsed.port) {
      const portNum = Number.parseInt(parsed.port, 10);
      if (Number.isNaN(portNum) || portNum <= 0 || portNum > 65535) {
        throw new JiraConfigurationInvalidError(`Port "${parsed.port}" is out of range (1-65535).`);
      }
    }

    // Normalize: strip trailing slashes from pathname
    let pathname = parsed.pathname;
    while (pathname.length > 1 && pathname.endsWith('/')) {
      pathname = pathname.slice(0, -1);
    }
    if (pathname === '/') {
      pathname = '';
    }

    return `${parsed.protocol}//${parsed.host}${pathname}`;
  }

  /**
   * Asserts that a hostname does not resolve to private networks, loopback, or metadata services.
   */
  public static assertSsrfSafeHostname(hostname: string, options?: JiraUrlValidationOptions): void {
    const lower = hostname.toLowerCase();
    const stripped = lower.replace(/^\[|\]$/g, '');

    // 1. Cloud Metadata protection (NEVER allowed, even in test mode)
    if (CLOUD_METADATA_HOSTS.includes(lower) || CLOUD_METADATA_HOSTS.includes(stripped)) {
      throw new JiraSecurityError(
        `Host '${hostname}' is a cloud metadata endpoint and is strictly blocked.`,
      );
    }

    // 2. Loopback validation
    const isLoopback =
      lower === 'localhost' ||
      lower === '127.0.0.1' ||
      lower.startsWith('127.') ||
      lower === '0.0.0.0' ||
      stripped === '::1' ||
      stripped === '0:0:0:0:0:0:0:1' ||
      stripped === '::' ||
      stripped.startsWith('::ffff:127.');

    if (isLoopback) {
      if (!options?.allowLocalhostForTesting) {
        throw new JiraSecurityError(
          `Localhost and loopback address '${hostname}' are prohibited for Jira connections.`,
        );
      }
      return; // Allowed in explicit test mode
    }

    // 3. Link-local and private IPv4 ranges (blocked unless explicit test mode)
    if (this.isPrivateOrLinkLocalIp(stripped)) {
      if (!options?.allowLocalhostForTesting) {
        throw new JiraSecurityError(
          `Private or internal network address '${hostname}' is prohibited for Jira connections.`,
        );
      }
    }

    // 4. IPv6 private/link-local/ULA
    if (lower.startsWith('[') || stripped.includes(':')) {
      const isLinkLocal = /^fe[89ab][0-9a-f]?::?/i.test(stripped) || stripped.startsWith('fe80:');
      const isUla =
        /^f[cd][0-9a-f]{0,2}::?/i.test(stripped) ||
        stripped.startsWith('fc') ||
        stripped.startsWith('fd');

      if (isLinkLocal || isUla) {
        throw new JiraSecurityError(
          `Internal or link-local IPv6 address '${hostname}' is prohibited for Jira connections.`,
        );
      }
    }
  }

  /**
   * Detects whether an IP or string matches private / link-local IPv4 ranges.
   */
  private static isPrivateOrLinkLocalIp(ip: string): boolean {
    // 10.0.0.0/8
    if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(ip)) return true;

    // 172.16.0.0/12 (172.16 - 172.31)
    const match172 = /^172\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/.exec(ip);
    if (match172) {
      const secondOctet = Number.parseInt(match172[1]!, 10);
      if (secondOctet >= 16 && secondOctet <= 31) return true;
    }

    // 192.168.0.0/16
    if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(ip)) return true;

    // 169.254.0.0/16 (Link-local)
    if (/^169\.254\.\d{1,3}\.\d{1,3}$/.test(ip)) return true;

    // 0.0.0.0/8
    if (/^0\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(ip)) return true;

    return false;
  }
}
