/**
 * @file packages/core/src/traceability/traceability-types.ts
 * Domain types, bounds, and constants for requirement-to-test traceability.
 */

export const TRACEABILITY_BOUNDS = {
  DEFAULT_PAGE: 1,
  DEFAULT_PAGE_SIZE: 20,
  MAX_PAGE_SIZE: 100,
  MAX_SEARCH_LENGTH: 100,
} as const;

export interface TraceQueryFilter {
  readonly status?: string;
  readonly origin?: string;
  readonly isStale?: boolean;
  readonly search?: string;
  readonly page?: number;
  readonly pageSize?: number;
}
