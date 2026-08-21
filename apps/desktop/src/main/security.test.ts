import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getSecureWebPreferences, isAllowedNavigation, handleWindowOpen } from './security.js';

describe('Security Policies Unit Tests', () => {
  it('should enforce mandatory BrowserWindow security preferences', () => {
    const preferences = getSecureWebPreferences();

    assert.strictEqual(preferences.nodeIntegration, false, 'nodeIntegration must be false');
    assert.strictEqual(preferences.contextIsolation, true, 'contextIsolation must be true');
    assert.strictEqual(preferences.sandbox, true, 'sandbox must be true');
    assert.strictEqual(preferences.webSecurity, true, 'webSecurity must be true');
    assert.strictEqual(
      preferences.allowRunningInsecureContent,
      false,
      'allowRunningInsecureContent must be false',
    );
    assert.strictEqual(
      preferences.experimentalFeatures,
      false,
      'experimentalFeatures must be false',
    );
    assert.strictEqual(preferences.webviewTag, false, 'webviewTag must be false');
    assert.strictEqual(
      preferences.nodeIntegrationInWorker,
      false,
      'nodeIntegrationInWorker must be false',
    );
    assert.strictEqual(
      preferences.nodeIntegrationInSubFrames,
      false,
      'nodeIntegrationInSubFrames must be false',
    );
  });

  it('should permit allowed production app://renderer navigation', () => {
    const allowed = 'app://renderer/index.html';
    const target = 'app://renderer/index.html';

    assert.strictEqual(isAllowedNavigation(target, allowed), true);
  });

  it('should permit allowed development loopback navigation', () => {
    const allowed = 'http://127.0.0.1:5173/';
    const target = 'http://127.0.0.1:5173/page';

    assert.strictEqual(isAllowedNavigation(target, allowed), true);
  });

  it('should reject arbitrary file:// navigation in production', () => {
    const allowed = 'app://renderer/index.html';
    const maliciousTarget = 'file:///etc/passwd';

    assert.strictEqual(isAllowedNavigation(maliciousTarget, allowed), false);
  });

  it('should reject remote external URLs (https://google.com)', () => {
    const allowed = 'app://renderer/index.html';

    assert.strictEqual(isAllowedNavigation('https://google.com', allowed), false);
    assert.strictEqual(isAllowedNavigation('http://evil.com:5173', allowed), false);
  });

  it('should reject unsafe protocols (javascript:, data:)', () => {
    const allowed = 'app://renderer/index.html';

    assert.strictEqual(isAllowedNavigation('javascript:alert(1)', allowed), false);
    assert.strictEqual(isAllowedNavigation('data:text/html,<h1>hacked</h1>', allowed), false);
  });

  it('should deny all window-open / popup requests', () => {
    const decision = handleWindowOpen();
    assert.deepStrictEqual(decision, { action: 'deny' });
  });
});
