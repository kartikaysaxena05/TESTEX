/**
 * @file packages/core/src/workflow/workflow-status-mapping-engine.ts
 * Bidirectional status translation engine between internal bug lifecycle and external systems (Jira).
 */

import type {
  InternalBugStatus,
  WorkflowStatusMapping,
  DefaultStatusMappingDefinition,
} from './workflow-types.js';
import { DEFAULT_JIRA_STATUS_MAPPINGS } from './workflow-types.js';

export class WorkflowStatusMappingEngine {
  /**
   * Translates an external status (e.g. Jira status name) into an internal bug status.
   * If no explicit or default mapping exists, returns NULL.
   * NEVER guess an unknown status!
   */
  public static mapExternalToInternal(
    externalStatusName: string,
    mappings: readonly WorkflowStatusMapping[],
    allowDefaultFallback: boolean = true,
  ): InternalBugStatus | null {
    if (!externalStatusName || !externalStatusName.trim()) {
      return null;
    }

    const normalizedTarget = externalStatusName.trim().toLowerCase();

    // 1. Check project-configured custom mappings first
    for (const mapping of mappings) {
      if (!mapping.isEnabled) {
        continue;
      }
      if (mapping.direction !== 'BIDIRECTIONAL' && mapping.direction !== 'EXTERNAL_TO_INTERNAL') {
        continue;
      }
      if (mapping.externalStatusName.trim().toLowerCase() === normalizedTarget) {
        return mapping.internalStatus;
      }
    }

    // 2. Fall back to standard defaults if enabled
    if (allowDefaultFallback) {
      for (const def of DEFAULT_JIRA_STATUS_MAPPINGS) {
        if (def.direction !== 'BIDIRECTIONAL' && def.direction !== 'EXTERNAL_TO_INTERNAL') {
          continue;
        }
        if (def.externalStatusName.trim().toLowerCase() === normalizedTarget) {
          return def.internalStatus;
        }
      }
    }

    // 3. Unmapped - return null. Do NOT guess!
    return null;
  }

  /**
   * Translates an internal bug status into an external system's status name.
   * Returns NULL if no mapping exists for the given internal status.
   */
  public static mapInternalToExternal(
    internalStatus: InternalBugStatus,
    mappings: readonly WorkflowStatusMapping[],
    allowDefaultFallback: boolean = true,
  ): string | null {
    // 1. Check custom configured mappings
    for (const mapping of mappings) {
      if (!mapping.isEnabled) {
        continue;
      }
      if (mapping.direction !== 'BIDIRECTIONAL' && mapping.direction !== 'INTERNAL_TO_EXTERNAL') {
        continue;
      }
      if (mapping.internalStatus === internalStatus) {
        return mapping.externalStatusName;
      }
    }

    // 2. Fall back to defaults if allowed
    if (allowDefaultFallback) {
      for (const def of DEFAULT_JIRA_STATUS_MAPPINGS) {
        if (def.direction !== 'BIDIRECTIONAL' && def.direction !== 'INTERNAL_TO_EXTERNAL') {
          continue;
        }
        if (def.internalStatus === internalStatus) {
          return def.externalStatusName;
        }
      }
    }

    return null;
  }

  /**
   * Generates default mappings for a new project/connection.
   */
  public static getDefaultMappingDefinitions(): readonly DefaultStatusMappingDefinition[] {
    return DEFAULT_JIRA_STATUS_MAPPINGS;
  }
}
