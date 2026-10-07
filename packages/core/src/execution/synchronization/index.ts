/**
 * @file packages/core/src/execution/synchronization/index.ts
 * Public exports and singleton factory for Phase 66 Synchronization Engine.
 */

export * from './synchronization-types.js';
export * from './synchronization-errors.js';
export * from './timeout-budget.js';
export * from './navigation-monitor.js';
export * from './element-readiness-evaluator.js';
export * from './network-observer.js';
export * from './loading-state-observer.js';
export * from './popup-observer.js';
export * from './synchronization-coordinator.js';

import { SynchronizationCoordinator } from './synchronization-coordinator.js';

let defaultCoordinator: SynchronizationCoordinator | null = null;

export function getSynchronizationCoordinator(): SynchronizationCoordinator {
  if (!defaultCoordinator) {
    defaultCoordinator = new SynchronizationCoordinator();
  }
  return defaultCoordinator;
}
