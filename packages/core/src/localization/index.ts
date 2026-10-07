/**
 * @file packages/core/src/localization/index.ts
 * Public exports for V7 Phase 100 Repository-Aware Defect Localization.
 */

export * from './defect-localization-types.js';
export * from './defect-localization-errors.js';
export * from './signals/network-route-correlator.js';
export * from './signals/ui-component-correlator.js';
export * from './signals/stack-trace-correlator.js';
export * from './signals/source-map-resolver.js';
export * from './signals/symbol-graph-expander.js';
export * from './ranking/candidate-validator.js';
export * from './ranking/candidate-ranker.js';
export * from './defect-localization-service.js';
