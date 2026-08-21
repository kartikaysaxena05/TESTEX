/**
 * @file packages/core/src/requirements/impact/requirement-impact-analyzer.ts
 * Pure, deterministic Requirement Change Impact candidate analyzer and graph traversal.
 * Zero external AI/LLM, embeddings, or network dependencies.
 */

import type { RequirementRelationship, RequirementRepositoryEvidence } from '@prisma/client';
import {
  MAX_IMPACT_CANDIDATES,
  DEFAULT_IMPACT_DEPTH,
  type ImpactCandidateDraft,
} from './impact-types.js';

export interface ImpactAnalysisInput {
  readonly projectId: string;
  readonly requirementId: string;
  readonly requirementVersionId: string;
  readonly allRelationships: readonly RequirementRelationship[];
  readonly allEvidence: readonly RequirementRepositoryEvidence[];
  readonly maxDepth?: number;
}

export class RequirementImpactAnalyzer {
  /**
   * Deterministically analyzes the relationship graph and repository evidence
   * to generate impact candidate records for a newly created requirement version.
   */
  static analyzeImpact(input: ImpactAnalysisInput): ImpactCandidateDraft[] {
    const {
      projectId,
      requirementId,
      requirementVersionId,
      allRelationships,
      allEvidence,
      maxDepth = DEFAULT_IMPACT_DEPTH,
    } = input;

    const candidates: ImpactCandidateDraft[] = [];
    const candidateKeys = new Set<string>();

    const addCandidate = (draft: ImpactCandidateDraft) => {
      const key = `${draft.impactType}:${draft.targetRequirementId ?? 'none'}:${draft.repositoryEvidenceId ?? 'none'}`;
      if (!candidateKeys.has(key) && candidates.length < MAX_IMPACT_CANDIDATES) {
        candidateKeys.add(key);
        candidates.push(draft);
      }
    };

    // Filter out REJECTED relationships entirely
    const activeRelationships = allRelationships.filter(r => r.status !== 'REJECTED');

    // 1. Traverse Dependency and Structural Relationships (Depth 1 to maxDepth)
    const visitedRequirements = new Set<string>([requirementId]);
    let currentLevelRequirementIds = [requirementId];
    let currentDepth = 1;

    while (currentLevelRequirementIds.length > 0 && currentDepth <= maxDepth) {
      const nextLevelRequirementIds: string[] = [];

      for (const currentReqId of currentLevelRequirementIds) {
        for (const rel of activeRelationships) {
          // Check Reverse Dependencies (Requirements that depend on currentReqId)
          let dependentReqId: string | null = null;
          let reasonCode = 'DIRECT_DEPENDENCY';

          if (rel.sourceRequirementId === currentReqId && rel.relationshipType === 'REQUIRED_BY') {
            dependentReqId = rel.targetRequirementId;
          } else if (
            rel.targetRequirementId === currentReqId &&
            rel.relationshipType === 'DEPENDS_ON'
          ) {
            dependentReqId = rel.sourceRequirementId;
          }

          if (dependentReqId && dependentReqId !== requirementId) {
            if (currentDepth > 1) {
              reasonCode = `TRANSITIVE_DEPENDENCY_DEPTH_${currentDepth}`;
            }

            addCandidate({
              projectId,
              requirementId,
              requirementVersionId,
              impactType: 'DEPENDENT_REQUIREMENT',
              targetRequirementId: dependentReqId,
              reasonCode,
              depth: currentDepth,
              status: 'OPEN',
            });

            if (!visitedRequirements.has(dependentReqId)) {
              visitedRequirements.add(dependentReqId);
              nextLevelRequirementIds.push(dependentReqId);
            }
          }

          // At Depth 1, also check Hierarchy, Constraints, Conflicts, and Related links
          if (currentDepth === 1) {
            // Hierarchy: PARENT / CHILD
            if (rel.sourceRequirementId === currentReqId && rel.relationshipType === 'PARENT_OF') {
              addCandidate({
                projectId,
                requirementId,
                requirementVersionId,
                impactType: 'CHILD_REQUIREMENT',
                targetRequirementId: rel.targetRequirementId,
                reasonCode: 'PARENT_CHILD_RELATIONSHIP',
                depth: 1,
                status: 'OPEN',
              });
            } else if (
              rel.targetRequirementId === currentReqId &&
              rel.relationshipType === 'CHILD_OF'
            ) {
              addCandidate({
                projectId,
                requirementId,
                requirementVersionId,
                impactType: 'CHILD_REQUIREMENT',
                targetRequirementId: rel.sourceRequirementId,
                reasonCode: 'PARENT_CHILD_RELATIONSHIP',
                depth: 1,
                status: 'OPEN',
              });
            } else if (
              rel.sourceRequirementId === currentReqId &&
              rel.relationshipType === 'CHILD_OF'
            ) {
              addCandidate({
                projectId,
                requirementId,
                requirementVersionId,
                impactType: 'PARENT_REQUIREMENT',
                targetRequirementId: rel.targetRequirementId,
                reasonCode: 'PARENT_CHILD_RELATIONSHIP',
                depth: 1,
                status: 'OPEN',
              });
            } else if (
              rel.targetRequirementId === currentReqId &&
              rel.relationshipType === 'PARENT_OF'
            ) {
              addCandidate({
                projectId,
                requirementId,
                requirementVersionId,
                impactType: 'PARENT_REQUIREMENT',
                targetRequirementId: rel.sourceRequirementId,
                reasonCode: 'PARENT_CHILD_RELATIONSHIP',
                depth: 1,
                status: 'OPEN',
              });
            }

            // Constraints
            if (rel.sourceRequirementId === currentReqId && rel.relationshipType === 'CONSTRAINS') {
              addCandidate({
                projectId,
                requirementId,
                requirementVersionId,
                impactType: 'CONSTRAINED_REQUIREMENT',
                targetRequirementId: rel.targetRequirementId,
                reasonCode: 'CONSTRAINT_RELATIONSHIP',
                depth: 1,
                status: 'OPEN',
              });
            } else if (
              rel.targetRequirementId === currentReqId &&
              rel.relationshipType === 'CONSTRAINED_BY'
            ) {
              addCandidate({
                projectId,
                requirementId,
                requirementVersionId,
                impactType: 'CONSTRAINED_REQUIREMENT',
                targetRequirementId: rel.sourceRequirementId,
                reasonCode: 'CONSTRAINT_RELATIONSHIP',
                depth: 1,
                status: 'OPEN',
              });
            }

            // Conflicts
            if (
              (rel.sourceRequirementId === currentReqId ||
                rel.targetRequirementId === currentReqId) &&
              rel.relationshipType === 'CONFLICTS_WITH'
            ) {
              const otherId =
                rel.sourceRequirementId === currentReqId
                  ? rel.targetRequirementId
                  : rel.sourceRequirementId;
              addCandidate({
                projectId,
                requirementId,
                requirementVersionId,
                impactType: 'CONFLICT_REVIEW',
                targetRequirementId: otherId,
                reasonCode: 'CONFLICT_RELATIONSHIP',
                depth: 1,
                status: 'OPEN',
              });
            }

            // Related / Overlaps / Refines
            if (
              (rel.sourceRequirementId === currentReqId ||
                rel.targetRequirementId === currentReqId) &&
              (rel.relationshipType === 'RELATED_TO' ||
                rel.relationshipType === 'OVERLAPS_WITH' ||
                rel.relationshipType === 'DUPLICATES' ||
                rel.relationshipType === 'REFINES' ||
                rel.relationshipType === 'REFINED_BY')
            ) {
              const otherId =
                rel.sourceRequirementId === currentReqId
                  ? rel.targetRequirementId
                  : rel.sourceRequirementId;
              addCandidate({
                projectId,
                requirementId,
                requirementVersionId,
                impactType: 'RELATED_REQUIREMENT',
                targetRequirementId: otherId,
                reasonCode: 'RELATED_RELATIONSHIP',
                depth: 1,
                status: 'OPEN',
              });
            }
          }
        }
      }

      currentLevelRequirementIds = nextLevelRequirementIds;
      currentDepth++;
    }

    // 2. Repository Evidence Impact (Linked confirmed/candidate code evidence)
    for (const ev of allEvidence) {
      if (ev.status === 'REJECTED') continue;

      const reasonCode =
        ev.status === 'CONFIRMED'
          ? 'CONFIRMED_REPOSITORY_EVIDENCE'
          : 'CANDIDATE_REPOSITORY_EVIDENCE';

      addCandidate({
        projectId,
        requirementId,
        requirementVersionId,
        impactType: 'REPOSITORY_EVIDENCE',
        repositoryEvidenceId: ev.id,
        projectSourceId: ev.projectSourceId,
        indexedFileId: ev.indexedFileId,
        symbolId: ev.symbolId,
        reasonCode,
        depth: 1,
        status: 'OPEN',
      });
    }

    // Deterministic sorting
    candidates.sort((a, b) => {
      if (a.depth !== b.depth) return a.depth - b.depth;
      if (a.impactType !== b.impactType) return a.impactType.localeCompare(b.impactType);
      if (a.targetRequirementId !== b.targetRequirementId) {
        return (a.targetRequirementId ?? '').localeCompare(b.targetRequirementId ?? '');
      }
      return (a.repositoryEvidenceId ?? '').localeCompare(b.repositoryEvidenceId ?? '');
    });

    return candidates;
  }
}
