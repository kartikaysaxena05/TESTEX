/**
 * @file apps/desktop/src/renderer/components/ScreenErrorBoundary.tsx
 * Route and screen-level React Error Boundary for isolated workspace error recovery.
 */

import React, { Component, type ErrorInfo, type ReactNode } from 'react';
import { Card } from '../ui/Card.js';
import { Button } from '../ui/Button.js';

interface Props {
  readonly children: ReactNode;
  readonly onNavigateOverview?: () => void;
}

interface State {
  readonly hasError: boolean;
  readonly error: Error | null;
}

export class ScreenErrorBoundary extends Component<Props, State> {
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
      const message = error.message || 'Screen render error occurred.';
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
      // Diagnostic reporting failure must not break screen fallback
    }
  }

  private handleTryAgain = (): void => {
    this.setState({ hasError: false, error: null });
  };

  private handleReturnToOverview = (): void => {
    this.setState({ hasError: false, error: null });
    if (this.props.onNavigateOverview) {
      this.props.onNavigateOverview();
    } else if (typeof window !== 'undefined') {
      window.location.hash = '#/overview';
    }
  };

  public override render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div
          data-testid="screen-error-boundary-fallback"
          style={{
            padding: '32px 16px',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            minHeight: '300px',
          }}
        >
          <Card style={{ maxWidth: '520px', width: '100%', padding: '24px' }}>
            <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-start' }}>
              <div
                style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '50%',
                  backgroundColor: 'rgba(239, 68, 68, 0.15)',
                  color: '#ef4444',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
              </div>

              <div style={{ flex: 1 }}>
                <h3
                  style={{
                    margin: '0 0 6px 0',
                    fontSize: '16px',
                    fontWeight: 600,
                    color: 'var(--text-primary, #f8fafc)',
                  }}
                >
                  Something went wrong
                </h3>
                <p
                  style={{
                    margin: '0 0 20px 0',
                    fontSize: '14px',
                    color: 'var(--text-secondary, #94a3b8)',
                    lineHeight: 1.5,
                  }}
                >
                  This screen could not be displayed. You can try reloading the view or return to
                  the project dashboard.
                </p>

                <div style={{ display: 'flex', gap: '12px' }}>
                  <Button variant="primary" size="sm" onClick={this.handleTryAgain}>
                    Try Again
                  </Button>
                  <Button variant="secondary" size="sm" onClick={this.handleReturnToOverview}>
                    Return to Overview
                  </Button>
                </div>
              </div>
            </div>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}
