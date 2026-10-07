/**
 * @file packages/core/src/environments/environment-types.ts
 * Types, bounds, and constants for Target Application and Test Environment Configuration.
 */

export const VIEWPORT_BOUNDS = {
  MIN_WIDTH: 320,
  MAX_WIDTH: 3840,
  MIN_HEIGHT: 240,
  MAX_HEIGHT: 2160,
  DEFAULT_WIDTH: 1280,
  DEFAULT_HEIGHT: 720,
} as const;

export const REACHABILITY_BOUNDS = {
  MIN_TIMEOUT_MS: 1000,
  MAX_TIMEOUT_MS: 30000,
  DEFAULT_TIMEOUT_MS: 5000,
  MAX_REDIRECT_HOPS: 5,
  MAX_RESPONSE_BYTES: 64 * 1024, // 64 KB
} as const;

export const URL_BOUNDS = {
  MAX_LENGTH: 2048,
  ALLOWED_PROTOCOLS: ['http:', 'https:'] as const,
  DISALLOWED_PROTOCOLS: [
    'javascript:',
    'file:',
    'data:',
    'ftp:',
    'blob:',
    'ws:',
    'wss:',
    'about:',
    'vbscript:',
  ] as const,
} as const;

export const ALLOWED_BROWSER_PERMISSIONS = [
  'geolocation',
  'notifications',
  'camera',
  'microphone',
  'clipboard-read',
  'clipboard-write',
] as const;

export type AllowedBrowserPermission = (typeof ALLOWED_BROWSER_PERMISSIONS)[number];
