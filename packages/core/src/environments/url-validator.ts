/**
 * @file packages/core/src/environments/url-validator.ts
 * Validation, normalization, and route resolution engine for target application URLs.
 */

import { URL_BOUNDS } from './environment-types.js';
import { InvalidBaseUrlError, UnsupportedProtocolError } from './environment-errors.js';

export class UrlValidator {
  /**
   * Validates and normalizes a target application base URL.
   * Enforces strict scheme allowlisting, credential rejection, length bounds, and localhost support.
   */
  public static validateAndNormalizeBaseUrl(rawUrl: string): string {
    if (typeof rawUrl !== 'string' || rawUrl.trim().length === 0) {
      throw new InvalidBaseUrlError('Base URL cannot be empty.');
    }

    const trimmed = rawUrl.trim();

    if (trimmed.length > URL_BOUNDS.MAX_LENGTH) {
      throw new InvalidBaseUrlError(
        `Base URL exceeds maximum permitted length of ${URL_BOUNDS.MAX_LENGTH} characters.`,
      );
    }

    // Check for obvious dangerous protocol prefixes before URL parsing
    const lower = trimmed.toLowerCase();
    for (const disallowed of URL_BOUNDS.DISALLOWED_PROTOCOLS) {
      if (lower.startsWith(disallowed)) {
        throw new UnsupportedProtocolError(disallowed);
      }
    }

    let parsed: URL;
    try {
      parsed = new URL(trimmed);
    } catch {
      throw new InvalidBaseUrlError(
        'Malformed URL format. Must include a valid protocol (http: or https:) and hostname.',
      );
    }

    // Validate protocol
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new UnsupportedProtocolError(parsed.protocol);
    }

    // Reject embedded user/password credentials
    if (parsed.username || parsed.password) {
      throw new InvalidBaseUrlError(
        'Base URL must not contain embedded user or password credentials (e.g. user:pass@host).',
      );
    }

    // Validate hostname
    if (!parsed.hostname || parsed.hostname.length === 0) {
      throw new InvalidBaseUrlError('Base URL hostname is missing or invalid.');
    }

    // Validate port if provided
    if (parsed.port) {
      const portNum = Number.parseInt(parsed.port, 10);
      if (Number.isNaN(portNum) || portNum <= 0 || portNum > 65535) {
        throw new InvalidBaseUrlError(`Port "${parsed.port}" is out of range (1-65535).`);
      }
    }

    // Normalization:
    // Strip trailing slashes from path to standardize base URL structure
    let pathname = parsed.pathname;
    while (pathname.length > 1 && pathname.endsWith('/')) {
      pathname = pathname.slice(0, -1);
    }
    if (pathname === '/') {
      pathname = '';
    }

    let normalized = `${parsed.protocol}//${parsed.host}${pathname}`;
    if (parsed.search) {
      normalized += parsed.search;
    }
    if (parsed.hash) {
      normalized += parsed.hash;
    }

    return normalized;
  }

  /**
   * Safely resolves a relative route or path against a validated base URL.
   * Handles paths, query strings, and fragments deterministically without naive string concatenation.
   */
  public static resolveTargetUrl(baseUrl: string, relativePath?: string | null): string {
    const normalizedBase = this.validateAndNormalizeBaseUrl(baseUrl);

    if (!relativePath || relativePath.trim().length === 0) {
      return normalizedBase;
    }

    const route = relativePath.trim();

    // Check for dangerous protocol breakout in route
    const lowerRoute = route.toLowerCase();
    for (const disallowed of URL_BOUNDS.DISALLOWED_PROTOCOLS) {
      if (lowerRoute.startsWith(disallowed)) {
        throw new UnsupportedProtocolError(disallowed);
      }
    }

    // If relativePath is already an absolute HTTP/HTTPS URL, validate and return it
    if (route.startsWith('http://') || route.startsWith('https://')) {
      return this.validateAndNormalizeBaseUrl(route);
    }

    const baseParsed = new URL(normalizedBase);
    const basePath = baseParsed.pathname.replace(/\/+$/, '');

    // Parse route components (path, search, hash)
    let routePath = route;
    let routeSearch = '';
    let routeHash = '';

    const hashIdx = routePath.indexOf('#');
    if (hashIdx !== -1) {
      routeHash = routePath.slice(hashIdx);
      routePath = routePath.slice(0, hashIdx);
    }

    const queryIdx = routePath.indexOf('?');
    if (queryIdx !== -1) {
      routeSearch = routePath.slice(queryIdx);
      routePath = routePath.slice(0, queryIdx);
    }

    // Join path with base path
    let combinedPath: string;
    if (!routePath || routePath === '/') {
      combinedPath = basePath || '/';
    } else {
      const cleanRoutePath = routePath.startsWith('/') ? routePath : `/${routePath}`;
      combinedPath = basePath ? `${basePath}${cleanRoutePath}` : cleanRoutePath;
    }

    // Merge search parameters if both base and route specify queries
    const searchParams = new URLSearchParams(baseParsed.search);
    if (routeSearch) {
      const routeParams = new URLSearchParams(routeSearch);
      for (const [key, value] of routeParams.entries()) {
        searchParams.set(key, value);
      }
    }
    const finalSearch = searchParams.toString() ? `?${searchParams.toString()}` : '';
    const finalHash = routeHash || baseParsed.hash || '';

    return `${baseParsed.protocol}//${baseParsed.host}${combinedPath}${finalSearch}${finalHash}`;
  }
}
