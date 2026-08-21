import type { BrowserWindow, Session, WebPreferences } from 'electron';
import { APP_PROTOCOL_SCHEME, APP_RENDERER_HOST } from './protocol.js';
import { isValidDevelopmentUrl } from './paths.js';
import { getLogger } from '@ai-quality/core';

/**
 * Mandatory security options for all BrowserWindow instances.
 * Enforces strict isolation and sandbox rules.
 */
export function getSecureWebPreferences(preloadPath?: string): WebPreferences {
  return {
    preload: preloadPath,
    nodeIntegration: false,
    nodeIntegrationInWorker: false,
    nodeIntegrationInSubFrames: false,
    contextIsolation: true,
    sandbox: true,
    webSecurity: true,
    allowRunningInsecureContent: false,
    experimentalFeatures: false,
    webviewTag: false,
  };
}

/**
 * Validate navigation target URL against allowed application-owned sources.
 * In production: strictly permits app://renderer/*
 * In development: strictly permits loopback http://127.0.0.1:5173
 * Blocks all unexpected external navigations, file:// access, javascript: URLs, and arbitrary protocols.
 */
export function isAllowedNavigation(targetUrl: string, allowedUrl: string): boolean {
  if (!targetUrl || !allowedUrl) {
    return false;
  }

  try {
    const target = new URL(targetUrl);
    const allowed = new URL(allowedUrl);

    // Production Custom Protocol verification
    if (
      target.protocol === `${APP_PROTOCOL_SCHEME}:` &&
      target.host === APP_RENDERER_HOST &&
      allowed.protocol === `${APP_PROTOCOL_SCHEME}:` &&
      allowed.host === APP_RENDERER_HOST
    ) {
      return true;
    }

    // Development Vite Loopback Server verification
    if (
      target.protocol === 'http:' &&
      allowed.protocol === 'http:' &&
      isValidDevelopmentUrl(allowed.href) &&
      target.origin === allowed.origin
    ) {
      return true;
    }

    return false;
  } catch {
    return false;
  }
}

/**
 * Window open policy handler.
 * Denies all popup / new window creation requests from renderers.
 */
export function handleWindowOpen(): { action: 'deny' } {
  return { action: 'deny' };
}

/**
 * Apply runtime security guards to a BrowserWindow and its associated session.
 */
export function applySecurityPolicies(
  window: BrowserWindow,
  sessionInstance: Session,
  allowedUrl: string,
): void {
  const contents = window.webContents;

  // 1. Navigation Guard - Block unauthorized navigations
  contents.on('will-navigate', (event, navigationUrl) => {
    if (!isAllowedNavigation(navigationUrl, allowedUrl)) {
      event.preventDefault();
      getLogger().warn('security.blocked_navigation', { url: navigationUrl });
    }
  });

  // 2. Redirect Guard - Block unauthorized redirects
  contents.on('will-redirect', (event, navigationUrl) => {
    if (!isAllowedNavigation(navigationUrl, allowedUrl)) {
      event.preventDefault();
      getLogger().warn('security.blocked_redirect', { url: navigationUrl });
    }
  });

  // 3. New Window Policy - Deny all window.open / popup requests
  contents.setWindowOpenHandler(() => handleWindowOpen());

  // 4. Session Permission Policy - Deny all runtime permission requests
  sessionInstance.setPermissionRequestHandler((_webContents, permission, callback) => {
    getLogger().warn('security.denied_permission_request', { permission });
    callback(false);
  });

  // 5. Session Permission Check Policy - Deny active permission checks
  sessionInstance.setPermissionCheckHandler((_webContents, permission) => {
    getLogger().warn('security.denied_permission_check', { permission });
    return false;
  });
}
