/**
 * @file packages/core/src/website-targets/url-safety.ts
 * URL validation, canonical normalization, and SSRF / cloud metadata safety evaluator.
 */

import type { EnvironmentType } from '@ai-quality/contracts';
import { UnsafeUrlTargetError } from './website-target-errors.js';

export interface NormalizedUrlResult {
  readonly normalizedUrl: string;
  readonly canonicalUrl: string;
  readonly protocol: string;
  readonly hostname: string;
  readonly port: number;
}

export class UrlSafetyEvaluator {
  public static readonly MAX_URL_LENGTH = 2048;

  private static readonly DISALLOWED_SCHEMES = [
    'javascript:',
    'file:',
    'data:',
    'ftp:',
    'chrome:',
    'electron:',
    'ws:',
    'wss:',
    'blob:',
    'about:',
  ];

  private static readonly BLOCKED_METADATA_HOSTNAMES = new Set<string>([
    '169.254.169.254',
    '169.254.169.123',
    '169.254.170.2',
    'metadata.google.internal',
    'metadata.google',
    'instance-data',
    'fd00:ec2::254',
  ]);

  /**
   * Validates and normalizes a candidate target URL against protocol allowlists,
   * credential restrictions, SSRF rules, and environment boundaries.
   */
  public static normalizeAndValidate(
    rawUrl: string,
    environmentType: EnvironmentType = 'LOCAL',
  ): NormalizedUrlResult {
    if (!rawUrl || typeof rawUrl !== 'string' || rawUrl.trim().length === 0) {
      throw new UnsafeUrlTargetError('Website URL cannot be empty.');
    }

    const trimmed = rawUrl.trim();

    if (trimmed.length > this.MAX_URL_LENGTH) {
      throw new UnsafeUrlTargetError(
        `Website URL exceeds maximum length limit of ${this.MAX_URL_LENGTH} characters.`,
      );
    }

    const lower = trimmed.toLowerCase();
    for (const scheme of this.DISALLOWED_SCHEMES) {
      if (lower.startsWith(scheme)) {
        throw new UnsafeUrlTargetError(
          `Protocol scheme '${scheme.replace(':', '')}' is strictly prohibited. Only HTTP and HTTPS targets are supported.`,
        );
      }
    }

    let parsed: URL;
    try {
      parsed = new URL(trimmed);
    } catch {
      throw new UnsafeUrlTargetError(
        'Malformed URL format. Must include a valid protocol (http:// or https://) and hostname.',
      );
    }

    // Protocol validation
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new UnsafeUrlTargetError(
        `Unsupported protocol '${parsed.protocol}'. Only http: and https: are allowed.`,
      );
    }

    // Credential rejection
    if (parsed.username || parsed.password) {
      throw new UnsafeUrlTargetError(
        'Embedded credentials in target URL (user:pass@host) are prohibited for security.',
      );
    }

    // Hostname validation
    const hostname = parsed.hostname.toLowerCase();
    if (!hostname || hostname.length === 0) {
      throw new UnsafeUrlTargetError('URL hostname is missing or invalid.');
    }

    // SSRF & Cloud Metadata Check (strictly prohibited across ALL environments)
    if (this.isCloudMetadataOrLinkLocal(hostname)) {
      throw new UnsafeUrlTargetError(
        `Target address '${hostname}' is a protected cloud metadata or link-local address and cannot be targeted.`,
      );
    }

    // Loopback / Localhost enforcement based on environment
    const isLoopback = this.isLoopbackHost(hostname);

    if (isLoopback && environmentType === 'PRODUCTION') {
      throw new UnsafeUrlTargetError(
        `Localhost / loopback target '${hostname}' cannot be configured as a PRODUCTION environment. Use LOCAL instead.`,
      );
    }

    // Port validation
    let port = parsed.port ? Number.parseInt(parsed.port, 10) : parsed.protocol === 'https:' ? 443 : 80;
    if (Number.isNaN(port) || port <= 0 || port > 65535) {
      throw new UnsafeUrlTargetError(`Port '${parsed.port}' is out of valid TCP range (1-65535).`);
    }

    // Path normalization: collapse duplicate slashes and strip trailing slashes
    let pathname = parsed.pathname.replace(/\/+/g, '/');
    while (pathname.length > 1 && pathname.endsWith('/')) {
      pathname = pathname.slice(0, -1);
    }
    if (pathname === '/') {
      pathname = '';
    }

    // Format normalized host representation
    const defaultPort = parsed.protocol === 'https:' ? 443 : 80;
    const hostWithPort =
      parsed.port && Number.parseInt(parsed.port, 10) !== defaultPort
        ? `${hostname}:${parsed.port}`
        : hostname;

    const normalizedUrl = `${parsed.protocol}//${hostWithPort}${pathname}${parsed.search}${parsed.hash}`;
    const canonicalUrl = `${parsed.protocol}//${hostWithPort}${pathname}`;

    return {
      normalizedUrl,
      canonicalUrl,
      protocol: parsed.protocol.replace(':', ''),
      hostname,
      port,
    };
  }

  /**
   * Checks whether the host is a known cloud metadata endpoint or link-local address.
   */
  public static isCloudMetadataOrLinkLocal(host: string): boolean {
    const cleanHost = host.replace(/^\[|\]$/g, '').toLowerCase();

    if (this.BLOCKED_METADATA_HOSTNAMES.has(cleanHost)) {
      return true;
    }

    // 169.254.0.0/16 range
    if (cleanHost.startsWith('169.254.')) {
      return true;
    }

    // fe80:: link-local IPv6
    if (cleanHost.startsWith('fe80:')) {
      return true;
    }

    // IPv4-mapped IPv6 for metadata (::ffff:169.254.169.254)
    if (cleanHost.includes('169.254.')) {
      return true;
    }

    return false;
  }

  /**
   * Checks whether the host is a localhost / loopback address.
   */
  public static isLoopbackHost(host: string): boolean {
    const cleanHost = host.replace(/^\[|\]$/g, '').toLowerCase();
    return (
      cleanHost === 'localhost' ||
      cleanHost.endsWith('.localhost') ||
      cleanHost === '127.0.0.1' ||
      cleanHost === '::1' ||
      cleanHost === '0.0.0.0' ||
      cleanHost.startsWith('127.')
    );
  }
}
