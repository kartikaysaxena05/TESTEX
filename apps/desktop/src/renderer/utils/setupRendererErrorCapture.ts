/**
 * @file apps/desktop/src/renderer/utils/setupRendererErrorCapture.ts
 * Global window error and unhandled promise rejection capture for React renderer.
 */

let isCaptureSetup = false;
let errorHandler: ((event: ErrorEvent) => void) | null = null;
let rejectionHandler: ((event: PromiseRejectionEvent) => void) | null = null;

export function setupRendererErrorCapture(): () => void {
  if (isCaptureSetup) {
    return cleanupRendererErrorCapture;
  }

  errorHandler = (event: ErrorEvent): void => {
    try {
      const message = event.message || 'Unknown window error.';
      const stack = event.error instanceof Error ? event.error.stack : undefined;
      const route = typeof window !== 'undefined' ? window.location.hash : undefined;

      window.desktop?.logging
        ?.reportRendererError({
          source: 'window-error',
          message: message.slice(0, 2000),
          stack: stack ? stack.slice(0, 8000) : undefined,
          route: route ? route.slice(0, 256) : undefined,
        })
        .catch(() => {});
    } catch {
      // Diagnostic reporting failure must never cause secondary errors
    }
  };

  rejectionHandler = (event: PromiseRejectionEvent): void => {
    try {
      let message = 'Unhandled promise rejection.';
      let stack: string | undefined;

      if (event.reason instanceof Error) {
        message = event.reason.message || message;
        stack = event.reason.stack;
      } else if (typeof event.reason === 'string') {
        message = event.reason;
      } else if (typeof event.reason === 'object' && event.reason !== null) {
        try {
          message = JSON.stringify(event.reason);
        } catch {
          message = String(event.reason);
        }
      } else if (event.reason !== undefined) {
        message = String(event.reason);
      }

      const route = typeof window !== 'undefined' ? window.location.hash : undefined;

      window.desktop?.logging
        ?.reportRendererError({
          source: 'unhandled-rejection',
          message: message.slice(0, 2000),
          stack: stack ? stack.slice(0, 8000) : undefined,
          route: route ? route.slice(0, 256) : undefined,
        })
        .catch(() => {});
    } catch {
      // Diagnostic reporting failure must never cause secondary errors
    }
  };

  window.addEventListener('error', errorHandler);
  window.addEventListener('unhandledrejection', rejectionHandler);
  isCaptureSetup = true;

  return cleanupRendererErrorCapture;
}

export function cleanupRendererErrorCapture(): void {
  if (!isCaptureSetup) return;

  if (errorHandler) {
    window.removeEventListener('error', errorHandler);
    errorHandler = null;
  }

  if (rejectionHandler) {
    window.removeEventListener('unhandledrejection', rejectionHandler);
    rejectionHandler = null;
  }

  isCaptureSetup = false;
}
