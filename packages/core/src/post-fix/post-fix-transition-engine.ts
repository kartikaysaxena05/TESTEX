/**
 * @file packages/core/src/post-fix/post-fix-transition-engine.ts
 * Project-specific workflow transition resolver and safety validator for Post-Fix Jira updates.
 */

import type { PrismaClient } from '@prisma/client';
import type { IJiraClient, JiraTransitionDto } from '../jira/jira-types.js';
import type { PostFixSyncOutcome, PostFixJiraUpdateStatus } from '@ai-quality/contracts';

export interface TransitionExecutionResult {
  readonly transitionStatus: PostFixJiraUpdateStatus;
  readonly fromStatus?: string;
  readonly toStatus?: string;
  readonly transitionId?: string;
  readonly error?: string;
}

export class PostFixTransitionEngine {
  /**
   * Evaluates whether a transition is permitted for the given verification outcome.
   * STRICT SAFETY INVARIANT: Never transition to closed/resolved states for non-fixed outcomes!
   */
  public static isResolutionPermitted(outcome: PostFixSyncOutcome): boolean {
    return outcome === 'VERIFIED_FIXED';
  }

  /**
   * Resolves target candidate status names from project mappings and default conventions.
   */
  public static async resolveCandidateTargetStatuses(params: {
    readonly prisma: PrismaClient;
    readonly projectId: string;
    readonly outcome: PostFixSyncOutcome;
    readonly forceTransition?: boolean;
  }): Promise<readonly string[]> {
    const { prisma, projectId, outcome } = params;

    // Strict safety check: Never permit closing states on failure or uncertainty
    if (!this.isResolutionPermitted(outcome) && !params.forceTransition) {
      if (outcome === 'STILL_FAILING' || outcome === 'REGRESSION_DETECTED') {
        // Query custom mappings for REOPENED or OPEN
        const mappings = await prisma.workflowStatusMapping.findMany({
          where: {
            projectId,
            isEnabled: true,
            internalStatus: { in: ['OPEN', 'IN_PROGRESS'] },
          },
        });
        const mappedNames = mappings.map(m => m.externalStatusName);
        return [...mappedNames, 'Reopened', 'In Progress', 'Open', 'In Development', 'Failed QA'];
      }

      // BLOCKED, INCONCLUSIVE, ROLLED_BACK, CANCELLED: do not transition status
      return [];
    }

    // For VERIFIED_FIXED:
    const mappings = await prisma.workflowStatusMapping.findMany({
      where: {
        projectId,
        isEnabled: true,
        internalStatus: { in: ['RESOLVED', 'CLOSED'] },
      },
    });

    const mappedNames = mappings.map(m => m.externalStatusName);
    return [
      ...mappedNames,
      'Ready for QA',
      'Resolved',
      'Done',
      'Closed',
      'Fix Verified',
      'Verified',
      'QA Approved',
    ];
  }

  /**
   * Matches candidate target names against available Jira transitions and executes the transition.
   */
  public static async executeTransition(params: {
    readonly jiraClient: IJiraClient;
    readonly connectionOptions: any;
    readonly issueIdOrKey: string;
    readonly candidateTargetNames: readonly string[];
  }): Promise<TransitionExecutionResult> {
    const { jiraClient, connectionOptions, issueIdOrKey, candidateTargetNames } = params;

    if (!jiraClient.getTransitions || !jiraClient.transitionIssue) {
      return {
        transitionStatus: 'TRANSITION_UNAVAILABLE',
        error: 'Jira client does not support workflow transitions',
      };
    }

    if (candidateTargetNames.length === 0) {
      return {
        transitionStatus: 'SKIPPED',
      };
    }

    try {
      const availableTransitions = await jiraClient.getTransitions({
        ...connectionOptions,
        issueIdOrKey,
      });

      if (!availableTransitions || availableTransitions.length === 0) {
        return {
          transitionStatus: 'TRANSITION_UNAVAILABLE',
          error: 'No transitions available from current Jira issue status',
        };
      }

      // Find matching transition
      let matchedTransition: JiraTransitionDto | null = null;
      for (const candidate of candidateTargetNames) {
        const found = availableTransitions.find(
          t =>
            t.name.toLowerCase() === candidate.toLowerCase() ||
            t.to?.name?.toLowerCase() === candidate.toLowerCase(),
        );
        if (found) {
          matchedTransition = found;
          break;
        }
      }

      if (!matchedTransition) {
        return {
          transitionStatus: 'TRANSITION_UNAVAILABLE',
          error: `None of the candidate target statuses (${candidateTargetNames.join(', ')}) matched available transitions: ${availableTransitions.map(t => t.name).join(', ')}`,
        };
      }

      // Execute transition
      await jiraClient.transitionIssue({
        ...connectionOptions,
        issueIdOrKey,
        transitionId: matchedTransition.id,
      });

      return {
        transitionStatus: 'TRANSITIONED',
        toStatus: matchedTransition.to?.name ?? matchedTransition.name,
        transitionId: matchedTransition.id,
      };
    } catch (err: any) {
      return {
        transitionStatus: 'FAILED',
        error: err?.message || 'Failed to transition Jira issue workflow status',
      };
    }
  }
}
