/**
 * @file apps/desktop/src/renderer/index.ts
 * Unprivileged UI Renderer entry point placeholder.
 *
 * Architectural Boundary:
 * Unprivileged UI Layer.
 * Future phases will host the React application and communicate exclusively
 * through `window.desktop` typed bridge APIs.
 *
 * FORBIDDEN:
 * Direct access to Node.js APIs (`fs`, `child_process`, `path`), databases,
 * Git CLI, AI SDKs, or Playwright runners.
 */

import type { PlatformMetadata } from '@ai-quality/contracts';

export interface RendererState {
  readonly ready: boolean;
  readonly layer: string;
  readonly metadata?: PlatformMetadata;
}

export function getRendererPlaceholderState(): RendererState {
  return {
    ready: true,
    layer: 'unprivileged-ui-renderer',
  };
}
