/**
 * @file packages/core/src/failures/clustering/clustering-errors.ts
 * Domain errors for V6 Phase 85 Duplicate Failure Detection & Defect Clustering.
 */

import type { DesktopErrorCode } from '@ai-quality/contracts';

export class DefectClusterError extends Error {
  public readonly code: DesktopErrorCode;

  constructor(message: string, code: DesktopErrorCode = 'INTERNAL_ERROR') {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
  }
}

export class DefectClusterNotFoundError extends DefectClusterError {
  constructor(
    message = 'Defect cluster record not found.',
    public readonly clusterId?: string,
  ) {
    super(message, 'DEFECT_CLUSTER_NOT_FOUND');
  }
}

export class DefectClusterCrossProjectError extends DefectClusterError {
  constructor(message = 'Cross-project access violation in defect cluster operation.') {
    super(message, 'DEFECT_CLUSTER_CROSS_PROJECT');
  }
}

export class DefectClusterInvalidOperationError extends DefectClusterError {
  constructor(message = 'Invalid operation on defect cluster.') {
    super(message, 'DEFECT_CLUSTER_INVALID_OPERATION');
  }
}

export class DefectClusterConcurrentMutationError extends DefectClusterError {
  constructor(message = 'Concurrent modification detected during defect cluster operation.') {
    super(message, 'DEFECT_CLUSTER_CONCURRENT_MUTATION');
  }
}

export class DefectClusterInsufficientEvidenceError extends DefectClusterError {
  constructor(message = 'Insufficient evidence to perform duplicate failure detection.') {
    super(message, 'DEFECT_CLUSTER_INSUFFICIENT_EVIDENCE');
  }
}

export class DefectClusterAlreadyMemberError extends DefectClusterError {
  constructor(
    message = 'Failure case is already an active member of this cluster.',
    public readonly failureCaseId?: string,
    public readonly clusterId?: string,
  ) {
    super(message, 'DEFECT_CLUSTER_ALREADY_MEMBER');
  }
}

export class DefectClusterEmptySplitError extends DefectClusterError {
  constructor(message = 'Cannot split cluster: no members specified or all members selected.') {
    super(message, 'DEFECT_CLUSTER_EMPTY_SPLIT');
  }
}
