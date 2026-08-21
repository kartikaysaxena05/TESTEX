/**
 * @file packages/core/src/requirements/relationships/requirement-relationship-analyzer.ts
 * Pure, deterministic requirement relationship analyzer and cycle detector.
 * Zero external AI/LLM, embeddings, or database dependencies.
 */

import type { RequirementRelationshipType, DependencyCycleDto } from '@ai-quality/contracts';
import {
  SYMMETRIC_RELATIONSHIPS,
  type RelationshipInputRequirement,
  type ProposedRelationshipDraft,
  type RelationshipAnalysisResult,
} from './relationship-types.js';

export class RequirementRelationshipAnalyzer {
  /**
   * Deterministically analyzes a collection of requirements and proposes relationships.
   */
  static analyzeRelationships(
    requirements: readonly RelationshipInputRequirement[],
    targetRequirementId?: string,
  ): RelationshipAnalysisResult {
    const keyToReqMap = new Map<string, RelationshipInputRequirement>();
    const externalKeyToReqMap = new Map<string, RelationshipInputRequirement>();

    for (const req of requirements) {
      keyToReqMap.set(req.requirementKey.toUpperCase(), req);
      if (req.externalKey && req.externalKey.trim().length > 0) {
        externalKeyToReqMap.set(req.externalKey.trim().toUpperCase(), req);
      }
    }

    const proposedList: ProposedRelationshipDraft[] = [];
    const unresolvedSet = new Set<string>();
    const seenEdges = new Set<string>();

    const targetReqs = targetRequirementId
      ? requirements.filter(r => r.id === targetRequirementId)
      : requirements;

    for (const source of targetReqs) {
      // 1. Explicit Reference Matching
      this.detectExplicitReferences(
        source,
        keyToReqMap,
        externalKeyToReqMap,
        proposedList,
        unresolvedSet,
        seenEdges,
      );

      // 2. Source Hierarchy Detection (Parent/Child)
      this.detectSourceHierarchy(source, externalKeyToReqMap, proposedList, seenEdges);
    }

    // Sort deterministically
    proposedList.sort((a, b) => {
      if (a.sourceRequirementId !== b.sourceRequirementId) {
        return a.sourceRequirementId.localeCompare(b.sourceRequirementId);
      }
      if (a.targetRequirementId !== b.targetRequirementId) {
        return a.targetRequirementId.localeCompare(b.targetRequirementId);
      }
      return a.relationshipType.localeCompare(b.relationshipType);
    });

    const sortedUnresolved = Array.from(unresolvedSet).sort();

    return {
      proposedRelationships: proposedList,
      unresolvedReferences: sortedUnresolved,
    };
  }

  /**
   * Detects explicit requirement references inside text.
   */
  private static detectExplicitReferences(
    source: RelationshipInputRequirement,
    keyToReqMap: Map<string, RelationshipInputRequirement>,
    externalKeyToReqMap: Map<string, RelationshipInputRequirement>,
    proposals: ProposedRelationshipDraft[],
    unresolvedSet: Set<string>,
    seenEdges: Set<string>,
  ): void {
    const text = source.originalText;

    // Trigger patterns with relational meaning
    const relationalTriggers: {
      regex: RegExp;
      type: RequirementRelationshipType;
      reason: 'EXPLICIT_REQUIREMENT_REFERENCE' | 'CONSTRAINING_RULE' | 'REFINEMENT_RULE';
    }[] = [
      {
        regex:
          /\b(?:depends\s+on|requires|required\s+by|after\s+(?:completion\s+of)?|subject\s+to|following|prerequisite\s+(?:is|to))\s+([A-Za-z0-9_.-]+)/gi,
        type: 'DEPENDS_ON',
        reason: 'EXPLICIT_REQUIREMENT_REFERENCE',
      },
      {
        regex: /\b(?:refines|extends|specializes|subsumes)\s+([A-Za-z0-9_.-]+)/gi,
        type: 'REFINES',
        reason: 'REFINEMENT_RULE',
      },
      {
        regex: /\b(?:constrains|limits|restricts|bounds)\s+([A-Za-z0-9_.-]+)/gi,
        type: 'CONSTRAINS',
        reason: 'CONSTRAINING_RULE',
      },
      {
        regex:
          /\b(?:conflicts\s+with|incompatible\s+with|mutually\s+exclusive\s+with)\s+([A-Za-z0-9_.-]+)/gi,
        type: 'CONFLICTS_WITH',
        reason: 'EXPLICIT_REQUIREMENT_REFERENCE',
      },
      {
        regex: /\b(?:see|refer\s+to|related\s+to|per)\s+([A-Za-z0-9_.-]+)/gi,
        type: 'RELATED_TO',
        reason: 'EXPLICIT_REQUIREMENT_REFERENCE',
      },
    ];

    const handledTokens = new Set<string>();

    for (const trigger of relationalTriggers) {
      let match: RegExpExecArray | null;
      while ((match = trigger.regex.exec(text)) !== null) {
        const token = match[1]?.trim().replace(/[.,;:]$/, '');
        if (!token || token.length < 2) continue;

        const target =
          keyToReqMap.get(token.toUpperCase()) ?? externalKeyToReqMap.get(token.toUpperCase());

        if (target) {
          if (target.id === source.id) {
            // Reject self-relationship
            continue;
          }

          handledTokens.add(token.toUpperCase());
          this.addProposal(
            source,
            target,
            trigger.type,
            'EXPLICIT_REFERENCE',
            [trigger.reason],
            `Matched pattern: "${match[0]}"`,
            proposals,
            seenEdges,
          );
        } else if (this.isLikelyRequirementKey(token)) {
          unresolvedSet.add(token);
        }
      }
    }

    // General identifier scanner for untriggered explicit mentions (e.g. "REQ-002" in text)
    const genericIdRegex = /\b(?:REQ-\d+|[A-Z]{2,6}-\d+(?:\.\d+)*)\b/gi;
    let genericMatch: RegExpExecArray | null;
    while ((genericMatch = genericIdRegex.exec(text)) !== null) {
      const token = genericMatch[0].trim().toUpperCase();
      if (handledTokens.has(token)) continue;

      const target = keyToReqMap.get(token) ?? externalKeyToReqMap.get(token);
      if (target) {
        if (target.id === source.id) continue;

        this.addProposal(
          source,
          target,
          'RELATED_TO',
          'EXPLICIT_REFERENCE',
          ['EXPLICIT_REQUIREMENT_REFERENCE'],
          `Referenced requirement key "${token}" in text`,
          proposals,
          seenEdges,
        );
        handledTokens.add(token);
      } else {
        unresolvedSet.add(token);
      }
    }
  }

  /**
   * Infers parent/child relationship from hierarchical external keys (e.g. FR-10 -> FR-10.1).
   */
  private static detectSourceHierarchy(
    child: RelationshipInputRequirement,
    externalKeyToReqMap: Map<string, RelationshipInputRequirement>,
    proposals: ProposedRelationshipDraft[],
    seenEdges: Set<string>,
  ): void {
    if (!child.externalKey) return;

    const trimmed = child.externalKey.trim();
    // Check for hierarchical dotted notation, e.g. "FR-10.1" or "SEC-1.2.3" or "3.4"
    const lastDotIndex = trimmed.lastIndexOf('.');
    if (lastDotIndex <= 0) return;

    const parentKey = trimmed.substring(0, lastDotIndex).toUpperCase();
    const parent = externalKeyToReqMap.get(parentKey);

    if (parent && parent.id !== child.id) {
      this.addProposal(
        parent,
        child,
        'PARENT_OF',
        'SOURCE_HIERARCHY',
        ['SOURCE_HIERARCHY_NUMERATION'],
        `Source hierarchy numeration: ${parent.externalKey} -> ${child.externalKey}`,
        proposals,
        seenEdges,
      );
    }
  }

  /**
   * Adds a proposal ensuring deduplication and symmetric normalization.
   */
  private static addProposal(
    source: RelationshipInputRequirement,
    target: RelationshipInputRequirement,
    type: RequirementRelationshipType,
    method: 'EXPLICIT_REFERENCE' | 'SOURCE_HIERARCHY' | 'DETERMINISTIC_RULE',
    reasonCodes: readonly (
      | 'EXPLICIT_REQUIREMENT_REFERENCE'
      | 'EXTERNAL_SOURCE_ID_REFERENCE'
      | 'SOURCE_HIERARCHY_NUMERATION'
      | 'CONFIRMED_DUPLICATE'
      | 'CONSTRAINING_RULE'
      | 'REFINEMENT_RULE'
      | 'MANUALLY_SPECIFIED'
    )[],
    evidence: string | null,
    proposals: ProposedRelationshipDraft[],
    seenEdges: Set<string>,
  ): void {
    // For symmetric types, ensure canonical order
    let finalSourceId = source.id;
    let finalTargetId = target.id;
    let finalSourceSha = source.sha256;
    let finalTargetSha = target.sha256;

    if (SYMMETRIC_RELATIONSHIPS.has(type) && finalSourceId > finalTargetId) {
      finalSourceId = target.id;
      finalTargetId = source.id;
      finalSourceSha = target.sha256;
      finalTargetSha = source.sha256;
    }

    const edgeKey = `${finalSourceId}:${finalTargetId}:${type}`;
    if (seenEdges.has(edgeKey)) return;
    seenEdges.add(edgeKey);

    proposals.push({
      sourceRequirementId: finalSourceId,
      targetRequirementId: finalTargetId,
      relationshipType: type,
      detectionMethod: method,
      status: 'PROPOSED',
      reasonCodes,
      evidence,
      sourceRequirementTextSha256: finalSourceSha,
      targetRequirementTextSha256: finalTargetSha,
    });
  }

  /**
   * Checks whether a string looks like a standard requirement key.
   */
  private static isLikelyRequirementKey(token: string): boolean {
    return /^(?:REQ|FR|NFR|BR|SEC|PERF|AUTH|SYS|UC|SPEC)[-_]?\d+(?:\.\d+)*$/i.test(token);
  }

  /**
   * Detects directed dependency cycles among directional relationship edges.
   */
  static detectCycles(
    edges: readonly {
      sourceRequirementId: string;
      targetRequirementId: string;
      relationshipType: RequirementRelationshipType;
    }[],
    keyLookup: Map<string, string>,
  ): readonly DependencyCycleDto[] {
    // Only directional dependency-like edges participate in cycle detection
    const directionalTypes = new Set<RequirementRelationshipType>([
      'DEPENDS_ON',
      'PARENT_OF',
      'REFINES',
      'CONSTRAINS',
    ]);

    const adj = new Map<string, string[]>();
    for (const edge of edges) {
      if (!directionalTypes.has(edge.relationshipType)) continue;

      const list = adj.get(edge.sourceRequirementId) ?? [];
      list.push(edge.targetRequirementId);
      adj.set(edge.sourceRequirementId, list);
    }

    const visited = new Set<string>();
    const recStack = new Set<string>();
    const path: string[] = [];
    const detectedCycles: DependencyCycleDto[] = [];
    const seenCycleSignatures = new Set<string>();

    const dfs = (node: string) => {
      visited.add(node);
      recStack.add(node);
      path.push(node);

      const neighbors = adj.get(node) ?? [];
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          dfs(neighbor);
        } else if (recStack.has(neighbor)) {
          // Cycle found from neighbor to current node
          const cycleStartIndex = path.indexOf(neighbor);
          if (cycleStartIndex !== -1) {
            const cycleNodeIds = path.slice(cycleStartIndex);
            // Append the closing node to show complete loop
            const cycleWithClosing = [...cycleNodeIds, neighbor];
            const cycleKeys = cycleWithClosing.map(id => keyLookup.get(id) ?? id);

            // Canonical cycle signature for deduplication
            const normalizedNodes = [...cycleNodeIds].sort();
            const signature = normalizedNodes.join('->');

            if (!seenCycleSignatures.has(signature)) {
              seenCycleSignatures.add(signature);
              detectedCycles.push({
                requirementIds: cycleWithClosing,
                requirementKeys: cycleKeys,
                pathDescription: cycleKeys.join(' → '),
              });
            }
          }
        }
      }

      path.pop();
      recStack.delete(node);
    };

    for (const node of adj.keys()) {
      if (!visited.has(node)) {
        dfs(node);
      }
    }

    return detectedCycles;
  }
}
