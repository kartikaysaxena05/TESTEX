/**
 * @file packages/core/src/sources/structure/structure-errors.ts
 * Domain errors for structure discovery operations.
 */

export class StructureTraversalError extends Error {
  readonly code = 'INTERNAL_ERROR';

  constructor(
    message: string,
    readonly originalError?: unknown,
  ) {
    super(message);
    this.name = 'StructureTraversalError';
  }
}
