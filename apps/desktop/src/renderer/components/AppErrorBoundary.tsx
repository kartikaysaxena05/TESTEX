/**
 * @file apps/desktop/src/renderer/components/AppErrorBoundary.tsx
 * Resilient root React Error Boundary for the desktop application.
 */

import React, { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  readonly children: ReactNode;
  readonly fallback?: ReactNode;
}

interface State {
  readonly hasError: boolean;
  readonly error: Error | null;
}

export class AppErrorBoundary extends Component<Props, State> {
  public override state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error,
    };
  }

  public override componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    try {
      const message = error.message || 'React render error occurred.';
      const stack = error.stack;
      const componentStack = errorInfo.componentStack ?? undefined;
      const route = typeof window !== 'undefined' ? window.location.hash : undefined;

      window.desktop?.logging
        ?.reportRendererError({
          source: 'react-error-boundary',
          message: message.slice(0, 2000),
          stack: stack ? stack.slice(0, 8000) : undefined,
          componentStack: componentStack ? componentStack.slice(0, 8000) : undefined,
          route: route ? route.slice(0, 256) : undefined,
        })
        .catch(() => {});
    } catch {
      // Diagnostic failure must not break fallback UI
    }
  }

  private handleTryAgain = (): void => {
    this.setState({ hasError: false, error: null });
  };

  private handleReload = (): void => {
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  };

  public override render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div
          data-testid="app-error-boundary-fallback"
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '100vh',
            padding: '32px',
            backgroundColor: '#0f172a',
            color: '#f8fafc',
            fontFamily:
              'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            textAlign: 'center',
            boxSizing: 'border-box',
          }}
        >
          <div
            style={{
              maxWidth: '480px',
              padding: '24px',
              backgroundColor: '#1e293b',
              borderRadius: '8px',
              border: '1px solid #334155',
              boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
            }}
          >
            <div
              style={{
                width: '44px',
                height: '44px',
                borderRadius: '50%',
                backgroundColor: 'rgba(239, 68, 68, 0.2)',
                color: '#ef4444',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 16px auto',
              }}
            >
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            </div>

            <h2 style={{ margin: '0 0 8px 0', fontSize: '18px', fontWeight: 600 }}>
              An Application Error Occurred
            </h2>
            <p
              style={{ margin: '0 0 20px 0', fontSize: '14px', color: '#94a3b8', lineHeight: 1.5 }}
            >
              The application encountered an unexpected issue. You can try recovering the session or
              reloading the application.
            </p>

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
              <button
                type="button"
                onClick={this.handleTryAgain}
                style={{
                  padding: '8px 16px',
                  backgroundColor: '#2563eb',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '14px',
                  fontWeight: 500,
                  cursor: 'pointer',
                }}
              >
                Try Again
              </button>
              <button
                type="button"
                onClick={this.handleReload}
                style={{
                  padding: '8px 16px',
                  backgroundColor: '#334155',
                  color: '#f8fafc',
                  border: '1px solid #475569',
                  borderRadius: '6px',
                  fontSize: '14px',
                  fontWeight: 500,
                  cursor: 'pointer',
                }}
              >
                Reload Window
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
