/**
 * @file packages/core/src/workflow/workflow-conflict-detector.ts
 * 3-Way merge conflict detection and resolution policy engine for workflow sync.
 */

import type {
  InternalBugStatus,
  SyncConflictPolicy,
  ConflictResolutionResult,
} from './workflow-types.js';

export interface ConflictDetectionParams {
  readonly currentInternalStatus: InternalBugStatus;
  readonly currentExternalStatus: string;
  readonly mappedInternalFromExternal: InternalBugStatus | null;
  readonly lastSyncedInternalStatus: InternalBugStatus | null;
  readonly lastSyncedExternalStatus: string | null;
  readonly internalUpdatedAt?: Date | string | null;
  readonly externalUpdatedAt?: Date | string | null;
  readonly policy: SyncConflictPolicy;
}

export class WorkflowConflictDetector {
  /**
   * Evaluates current state against last-sync snapshot to detect conflicting changes
   * and apply the configured conflict policy.
   */
  public static evaluate(params: ConflictDetectionParams): ConflictResolutionResult {
    const {
      currentInternalStatus,
      currentExternalStatus,
      mappedInternalFromExternal,
      lastSyncedInternalStatus,
      lastSyncedExternalStatus,
      internalUpdatedAt,
      externalUpdatedAt,
      policy,
    } = params;

    // 1. If mapped external status matches current internal status, they are in agreement
    if (
      mappedInternalFromExternal !== null &&
      mappedInternalFromExternal === currentInternalStatus
    ) {
      return {
        hasConflict: false,
        resolvedWinner: null,
        reason: 'Internal and external statuses are already synchronized.',
      };
    }

    // 2. Determine which side changed relative to the last synchronized snapshot
    const hasSnapshot = lastSyncedInternalStatus !== null && lastSyncedExternalStatus !== null;

    let internalChanged = true;
    let externalChanged = true;

    if (hasSnapshot) {
      internalChanged = currentInternalStatus !== lastSyncedInternalStatus;
      externalChanged =
        currentExternalStatus.trim().toLowerCase() !==
        lastSyncedExternalStatus.trim().toLowerCase();
    }

    // 3. One-sided changes (clean updates, no conflict)
    if (internalChanged && !externalChanged) {
      return {
        hasConflict: false,
        resolvedWinner: 'INTERNAL',
        reason: 'Internal status changed while external status remained at last-synced value.',
      };
    }

    if (!internalChanged && externalChanged) {
      return {
        hasConflict: false,
        resolvedWinner: 'EXTERNAL',
        reason: 'External status changed while internal status remained at last-synced value.',
      };
    }

    // 4. Both sides changed independently (or initial divergent state) -> CONFLICT!
    switch (policy) {
      case 'INTERNAL_WINS':
        return {
          hasConflict: true,
          resolvedWinner: 'INTERNAL',
          reason:
            'Both sides changed independently. Resolved in favor of internal state per INTERNAL_WINS policy.',
        };

      case 'EXTERNAL_WINS':
        return {
          hasConflict: true,
          resolvedWinner: 'EXTERNAL',
          reason:
            'Both sides changed independently. Resolved in favor of external state per EXTERNAL_WINS policy.',
        };

      case 'LATEST_VALID_CHANGE': {
        const intTime = internalUpdatedAt ? new Date(internalUpdatedAt).getTime() : 0;
        const extTime = externalUpdatedAt ? new Date(externalUpdatedAt).getTime() : 0;

        if (intTime >= extTime) {
          return {
            hasConflict: true,
            resolvedWinner: 'INTERNAL',
            reason:
              'Both sides changed independently. Resolved in favor of internal change per LATEST_VALID_CHANGE.',
          };
        } else {
          return {
            hasConflict: true,
            resolvedWinner: 'EXTERNAL',
            reason:
              'Both sides changed independently. Resolved in favor of external change per LATEST_VALID_CHANGE.',
          };
        }
      }

      case 'MANUAL_REVIEW':
      default:
        return {
          hasConflict: true,
          resolvedWinner: null,
          reason: `Both internal (${currentInternalStatus}) and external (${currentExternalStatus}) statuses changed independently since last sync.`,
          suggestedAction:
            'Review both states and explicitly select the authoritative winner using the Resolve Conflict action.',
        };
    }
  }
}
