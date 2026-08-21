import electron from 'electron';
import type { AppInfo } from '@ai-quality/contracts';

/**
 * Construct sanitized non-sensitive application metadata.
 */
export function getAppInfo(): AppInfo {
  const app = electron?.app;
  return {
    name: app?.getName() || 'AI-Driven Software Quality Engineering Platform',
    version: app?.getVersion() || '0.1.0',
    platform: process.platform,
    arch: process.arch,
  };
}
