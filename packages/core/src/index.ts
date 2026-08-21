/**
 * @file packages/core/src/index.ts
 * Application domain and service orchestration layer.
 *
 * CRITICAL ARCHITECTURAL RULE:
 * This package orchestrates privileged domain operations (repository intelligence,
 * requirement processing, test planning, failure triage) and sits strictly behind
 * the Electron main process / secure IPC boundary.
 *
 * It must NEVER import React or UI components.
 */

import { CONTRACT_VERSION, type PlatformMetadata } from '@ai-quality/contracts';

/**
 * Core application runtime status descriptor.
 */
export interface CoreRuntimeInfo {
  readonly name: string;
  readonly version: string;
  readonly contractVersion: string;
  readonly isInitialized: boolean;
}

/**
 * Inspect core subsystem runtime status without performing uninitialized domain operations.
 */
export function getCoreRuntimeInfo(): CoreRuntimeInfo {
  return {
    name: 'ai-quality-core',
    version: '0.1.0',
    contractVersion: CONTRACT_VERSION,
    isInitialized: true,
  };
}

/**
 * Core metadata builder conforming to shared contracts.
 */
export function createPlatformStatus(): PlatformMetadata {
  return {
    platformName: 'AI-Driven Software Quality Engineering Platform',
    phase: 'V3 - Phase 31: Requirement Identity, Keys & Lifecycle',
    status: 'initialized',
    timestamp: new Date().toISOString(),
  };
}

export * from './database/index.js';
export * from './projects/index.js';
export * from './sources/index.js';
export * from './git/index.js';
export * from './requirements/index.js';
export * from './ai/index.js';
export * from './test-cases/index.js';
export * from './test-validation/index.js';
export * from './traceability/index.js';
export * from './coverage/index.js';
export * from './test-review/index.js';
export * from './logging/index.js';
