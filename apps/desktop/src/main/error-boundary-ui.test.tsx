/**
 * @file apps/desktop/src/main/error-boundary-ui.test.tsx
 * Unit tests for React Error Boundaries and renderer global error capture.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { AppErrorBoundary } from '../renderer/components/AppErrorBoundary.js';
import { ScreenErrorBoundary } from '../renderer/components/ScreenErrorBoundary.js';
import {
  setupRendererErrorCapture,
  cleanupRendererErrorCapture,
} from '../renderer/utils/setupRendererErrorCapture.js';
import type { RendererErrorReport, DesktopBridge } from '@ai-quality/contracts';

describe('React Error Boundaries & Renderer Diagnostics Tests', () => {
  let reportedErrors: RendererErrorReport[] = [];

  beforeEach(() => {
    reportedErrors = [];

    // Mock window.desktop bridge with logging capability
    const mockDesktop: Partial<DesktopBridge> = {
      logging: {
        reportRendererError: (report: RendererErrorReport) => {
          reportedErrors.push(report);
          return Promise.resolve({ ok: true, data: { recorded: true } });
        },
      },
    };

    (
      globalThis as unknown as {
        window: {
          desktop: typeof mockDesktop;
          location: { hash: string };
          addEventListener: typeof addEventListener;
          removeEventListener: typeof removeEventListener;
        };
      }
    ).window = {
      desktop: mockDesktop as DesktopBridge,
      location: { hash: '#/overview' },
      addEventListener: () => {},
      removeEventListener: () => {},
    };
  });

  afterEach(() => {
    cleanupRendererErrorCapture();
  });

  describe('AppErrorBoundary Component', () => {
    it('should render children normally when no error occurs', () => {
      const html = renderToString(
        <AppErrorBoundary>
          <div data-testid="healthy-child">Child Content</div>
        </AppErrorBoundary>,
      );

      assert.ok(html.includes('Child Content'));
      assert.strictEqual(html.includes('An Application Error Occurred'), false);
    });

    it('should catch error and render resilient fallback with raw stack trace hidden', () => {
      const boundary = new AppErrorBoundary({
        children: <div>Child</div>,
      });

      const testError = new Error('Secret internal failure details in stack: super_secret_pass');
      const nextState = AppErrorBoundary.getDerivedStateFromError(testError);
      boundary.state = nextState;

      const html = renderToString(boundary.render() as React.ReactElement);

      assert.ok(html.includes('An Application Error Occurred'));
      assert.ok(html.includes('Try Again'));
      assert.ok(html.includes('Reload Window'));

      // Raw stack trace and internal message must NOT be displayed to the user
      assert.strictEqual(html.includes('super_secret_pass'), false);
      assert.strictEqual(html.includes('Secret internal failure'), false);
    });

    it('should report captured error to window.desktop.logging exactly once', () => {
      const boundary = new AppErrorBoundary({
        children: <div>Child</div>,
      });

      const testError = new Error('Render crash');
      testError.stack = 'Error: Render crash\n    at Component (app.js:10)';

      boundary.componentDidCatch(testError, {
        componentStack: '    in CrashComponent\n    in App',
      });

      assert.strictEqual(reportedErrors.length, 1);
      assert.strictEqual(reportedErrors[0]?.source, 'react-error-boundary');
      assert.strictEqual(reportedErrors[0]?.message, 'Render crash');
      assert.ok(reportedErrors[0]?.stack?.includes('Component'));
      assert.ok(reportedErrors[0]?.componentStack?.includes('CrashComponent'));
    });

    it('should keep fallback functional even if logging bridge throws', () => {
      (
        globalThis as unknown as {
          window: { desktop: { logging: { reportRendererError: () => Promise<never> } } };
        }
      ).window = {
        desktop: {
          logging: {
            reportRendererError: () => Promise.reject(new Error('IPC Disconnected')),
          },
        },
      };

      const boundary = new AppErrorBoundary({
        children: <div>Child</div>,
      });

      assert.doesNotThrow(() => {
        boundary.componentDidCatch(new Error('Crash'), { componentStack: '' });
      });

      boundary.state = { hasError: true, error: new Error('Crash') };
      const html = renderToString(boundary.render() as React.ReactElement);
      assert.ok(html.includes('An Application Error Occurred'));
    });
  });

  describe('ScreenErrorBoundary Component', () => {
    it('should render screen fallback with return to overview action and hidden stack trace', () => {
      const boundary = new ScreenErrorBoundary({
        children: <div>Screen Content</div>,
      });

      const testError = new Error('Screen crash in Table component: internal_leak');
      boundary.state = ScreenErrorBoundary.getDerivedStateFromError(testError);

      const html = renderToString(boundary.render() as React.ReactElement);

      assert.ok(html.includes('Something went wrong'));
      assert.ok(html.includes('This screen could not be displayed.'));
      assert.ok(html.includes('Try Again'));
      assert.ok(html.includes('Return to Overview'));

      // Raw internal details must NOT be rendered in HTML
      assert.strictEqual(html.includes('internal_leak'), false);
      assert.strictEqual(html.includes('Screen crash in Table'), false);
    });

    it('should invoke reportRendererError with react-error-boundary source', () => {
      const boundary = new ScreenErrorBoundary({
        children: <div>Screen Content</div>,
      });

      boundary.componentDidCatch(new Error('Screen crash'), {
        componentStack: '    in ScreenView',
      });

      assert.strictEqual(reportedErrors.length, 1);
      assert.strictEqual(reportedErrors[0]?.source, 'react-error-boundary');
      assert.strictEqual(reportedErrors[0]?.message, 'Screen crash');
    });
  });

  describe('Global Error & Rejection Capture Listeners', () => {
    it('should set up and clean up global error capture listeners idempotently', () => {
      const cleanup = setupRendererErrorCapture();
      assert.strictEqual(typeof cleanup, 'function');

      // Second setup returns cleanup without throwing
      const cleanup2 = setupRendererErrorCapture();
      assert.strictEqual(typeof cleanup2, 'function');

      cleanup();
    });
  });
});
