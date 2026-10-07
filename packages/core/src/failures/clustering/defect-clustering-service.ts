/**
 * @file packages/core/src/failures/clustering/defect-clustering-service.ts
 * Central Defect Clustering & Duplicate Failure Detection Service for V6 Phase 85.
 *
 * Implements:
 * - Mutex-serialized mutations per project
 * - Deterministic pairwise comparison with strong/weak/contradictory signals
 * - Transitivity safety protection against giant false clusters
 * - Deterministic representative failure selection
 * - Safe cluster merge & split with preserved audit lineage
 * - Zero mutation on passive read
 */

import type { PrismaClient } from '@prisma/client';
import {
  compareDuplicatesInputSchema,
  clusterDefectsInputSchema,
  getClusterInputSchema,
  listClustersInputSchema,
  getFailureMembershipInputSchema,
  mergeClustersInputSchema,
  splitClusterInputSchema,
  overrideMembershipInputSchema,
  listClusterHistoryInputSchema,
  type CompareDuplicatesInputDto,
  type ClusterDefectsInputDto,
  type GetClusterInputDto,
  type ListClustersInputDto,
  type GetFailureMembershipInputDto,
  type MergeClustersInputDto,
  type SplitClusterInputDto,
  type OverrideMembershipInputDto,
  type ListClusterHistoryInputDto,
  type DefectClusterDto,
  type DefectClusterMembershipDto,
  type DefectClusterHistoryDto,
  type DuplicateComparisonResultDto,
} from '@ai-quality/contracts';
import { type IDefectClusteringService, type FailureComparisonFacts } from './clustering-types.js';
import {
  DefectClusterNotFoundError,
  DefectClusterCrossProjectError,
  DefectClusterInvalidOperationError,
  DefectClusterEmptySplitError,
} from './clustering-errors.js';
import { FailureDuplicateComparator } from './failure-duplicate-comparator.js';
import { RepresentativeFailureSelector } from './representative-failure-selector.js';
import { CandidateRetrievalEngine } from './candidate-retrieval-engine.js';
import { generateClusterFingerprint } from './clustering-fingerprint.js';

export class DefectClusteringService implements IDefectClusteringService {
  private readonly comparator: FailureDuplicateComparator;
  private readonly selector: RepresentativeFailureSelector;
  private readonly candidateEngine: CandidateRetrievalEngine;
  private readonly projectLocks = new Map<string, Promise<void>>();

  constructor(private readonly prisma: PrismaClient) {
    this.comparator = new FailureDuplicateComparator();
    this.selector = new RepresentativeFailureSelector();
    this.candidateEngine = new CandidateRetrievalEngine(this.prisma);
  }

  /**
   * Serializes operations per project key to prevent concurrent mutation races.
   */
  private async withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const currentLock = this.projectLocks.get(key) ?? Promise.resolve();
    let releaseLock: () => void;
    const nextLock = new Promise<void>(resolve => {
      releaseLock = resolve;
    });

    this.projectLocks.set(key, nextLock);

    try {
      await currentLock;
      return await fn();
    } finally {
      releaseLock!();
      if (this.projectLocks.get(key) === nextLock) {
        this.projectLocks.delete(key);
      }
    }
  }

  /**
   * Compares two project-scoped failures and returns detailed similarity signals and explanation.
   */
  public async compareDuplicates(
    input: CompareDuplicatesInputDto,
  ): Promise<DuplicateComparisonResultDto> {
    const validated = compareDuplicatesInputSchema.parse(input);

    const factsA = await this.candidateEngine.loadFailureFacts(
      validated.projectId,
      validated.failureCaseIdA,
    );
    if (!factsA) {
      throw new DefectClusterCrossProjectError(
        `FailureCase ${validated.failureCaseIdA} not found or does not belong to project ${validated.projectId}.`,
      );
    }

    const factsB = await this.candidateEngine.loadFailureFacts(
      validated.projectId,
      validated.failureCaseIdB,
    );
    if (!factsB) {
      throw new DefectClusterCrossProjectError(
        `FailureCase ${validated.failureCaseIdB} not found or does not belong to project ${validated.projectId}.`,
      );
    }

    const result = this.comparator.compare(factsA, factsB);

    return {
      failureCaseIdA: validated.failureCaseIdA,
      failureCaseIdB: validated.failureCaseIdB,
      relationshipType: result.relationshipType,
      relationshipStrength: result.relationshipStrength,
      similarityScore: result.similarityScore,
      matchedSignals: [...result.matchedSignals],
      contradictorySignals: [...result.contradictorySignals],
      explanation: result.explanation,
      evaluatedAt: new Date().toISOString(),
    };
  }

  /**
   * Runs duplicate detection and clustering across candidate failures in a project.
   */
  public async clusterDefects(input: ClusterDefectsInputDto): Promise<readonly DefectClusterDto[]> {
    const validated = clusterDefectsInputSchema.parse(input);
    const lockKey = `project:${validated.projectId}`;

    return this.withLock(lockKey, async () => {
      // Validate cross-project boundaries for requested failure IDs
      if (validated.failureCaseIds && validated.failureCaseIds.length > 0) {
        for (const fcId of validated.failureCaseIds) {
          const fc = await this.prisma.failureCase.findUnique({
            where: { id: fcId },
          });
          if (fc && fc.projectId !== validated.projectId) {
            throw new DefectClusterCrossProjectError(
              `FailureCase ${fcId} belongs to project ${fc.projectId}, not target project ${validated.projectId}.`,
            );
          }
        }
      }

      // 1. Retrieve candidate failure cases
      const candidates = await this.candidateEngine.retrieveCandidates(
        validated.projectId,
        validated.failureCaseIds,
      );

      if (candidates.length === 0) {
        return this.listClusters({ projectId: validated.projectId });
      }

      // 2. Fetch existing active clusters and their active memberships
      const existingClusters = await this.prisma.defectCluster.findMany({
        where: { projectId: validated.projectId, clusterStatus: 'ACTIVE' },
        include: {
          memberships: {
            where: { isActive: true },
            include: {
              failureCase: true,
            },
          },
        },
      });

      // Map to track active cluster assignments
      const activeMemberships = await this.prisma.defectClusterMembership.findMany({
        where: { projectId: validated.projectId, isActive: true },
      });
      const assignedFailureIds = new Set(activeMemberships.map(m => m.failureCaseId));

      // Separate candidates into already-assigned vs unassigned
      const unassignedCandidates = candidates.filter(c => !assignedFailureIds.has(c.failureCaseId));

      // 3. For each unassigned candidate, try to find a matching active cluster with Transitivity Safety
      for (const candidate of unassignedCandidates) {
        if (assignedFailureIds.has(candidate.failureCaseId)) continue;
        let joinedCluster = false;

        for (const cluster of existingClusters) {
          // Load facts for cluster representative
          const repFacts = await this.candidateEngine.loadFailureFacts(
            validated.projectId,
            cluster.representativeFailureId,
          );
          if (!repFacts) continue;

          // Compare candidate with representative
          const repComparison = this.comparator.compare(candidate, repFacts);
          const isDuplicate =
            repComparison.relationshipType === 'EXACT_DUPLICATE' ||
            repComparison.relationshipType === 'PROBABLE_DUPLICATE';

          if (isDuplicate) {
            // TRANSITIVITY SAFETY CHECK:
            // Candidate must NOT have critical contradictions with ANY existing active member in this cluster
            let transitivitySafe = true;
            for (const existingMem of cluster.memberships) {
              if (existingMem.failureCaseId === cluster.representativeFailureId) continue;
              const memFacts = await this.candidateEngine.loadFailureFacts(
                validated.projectId,
                existingMem.failureCaseId,
              );
              if (!memFacts) continue;

              const memComparison = this.comparator.compare(candidate, memFacts);
              if (
                memComparison.relationshipType === 'DISTINCT_FAILURE' ||
                memComparison.contradictorySignals.some(c => c.severity === 'CRITICAL')
              ) {
                transitivitySafe = false;
                break;
              }
            }

            if (transitivitySafe) {
              // Add candidate to existing cluster
              await this.prisma.$transaction(async tx => {
                await tx.defectClusterMembership.create({
                  data: {
                    clusterId: cluster.id,
                    failureCaseId: candidate.failureCaseId,
                    projectId: validated.projectId,
                    relationshipType: repComparison.relationshipType,
                    relationshipStrength: repComparison.relationshipStrength,
                    similarityScore: repComparison.similarityScore,
                    matchedSignals: repComparison.matchedSignals as any,
                    contradictorySignals: repComparison.contradictorySignals as any,
                    explanation: repComparison.explanation,
                    isRepresentative: false,
                    isManualOverride: false,
                    isActive: true,
                  },
                });

                // Update member count
                const newCount = cluster.memberships.length + 1;
                await tx.defectCluster.update({
                  where: { id: cluster.id },
                  data: {
                    memberCount: newCount,
                    lastSeenAt: new Date(),
                  },
                });

                // Record history
                await tx.defectClusterHistory.create({
                  data: {
                    clusterId: cluster.id,
                    projectId: validated.projectId,
                    eventType: 'MEMBER_ADDED',
                    failureCaseId: candidate.failureCaseId,
                    reason: `Candidate joined cluster: ${repComparison.explanation}`,
                    actor: 'SYSTEM',
                  },
                });
              });

              cluster.memberships.push({
                failureCaseId: candidate.failureCaseId,
                isActive: true,
              } as any);
              assignedFailureIds.add(candidate.failureCaseId);
              joinedCluster = true;
              break;
            }
          }
        }

        // 4. If candidate did not join an existing cluster, try to form a new cluster with other unassigned candidates
        if (!joinedCluster) {
          const clusterGroup: FailureComparisonFacts[] = [candidate];
          assignedFailureIds.add(candidate.failureCaseId);

          for (const otherCandidate of unassignedCandidates) {
            if (assignedFailureIds.has(otherCandidate.failureCaseId)) continue;

            const comparison = this.comparator.compare(candidate, otherCandidate);
            if (
              comparison.relationshipType === 'EXACT_DUPLICATE' ||
              comparison.relationshipType === 'PROBABLE_DUPLICATE'
            ) {
              // Mutual transitivity check across existing members in new clusterGroup
              let allMutualSafe = true;
              for (const member of clusterGroup) {
                const check = this.comparator.compare(otherCandidate, member);
                if (
                  check.relationshipType === 'DISTINCT_FAILURE' ||
                  check.contradictorySignals.some(c => c.severity === 'CRITICAL')
                ) {
                  allMutualSafe = false;
                  break;
                }
              }

              if (allMutualSafe) {
                clusterGroup.push(otherCandidate);
                assignedFailureIds.add(otherCandidate.failureCaseId);
              }
            }
          }

          // Create new cluster for clusterGroup
          const newCluster = await this.createNewCluster(validated.projectId, clusterGroup);
          existingClusters.push(newCluster as any);
        }
      }

      return this.listClusters({ projectId: validated.projectId });
    });
  }

  /**
   * Helper to create a new cluster with deterministic representative and audit history.
   */
  private async createNewCluster(
    projectId: string,
    members: readonly FailureComparisonFacts[],
  ): Promise<any> {
    const representative = this.selector.selectRepresentative(members);

    // Allocate next clusterKey sequentially
    const currentCount = await this.prisma.defectCluster.count({
      where: { projectId },
    });
    const clusterKey = `CLU-${String(currentCount + 1).padStart(4, '0')}`;

    // Collect aggregates
    const routesSet = new Set<string>();
    const reqsSet = new Set<string>();
    const buildsSet = new Set<string>();
    let highestSeverity: any = null;
    let highestPriority: any = null;

    for (const m of members) {
      if (m.failingHttpEndpoint) routesSet.add(m.failingHttpEndpoint);
      if (m.requirementId) reqsSet.add(m.requirementId);
      if (m.appBuildVersion) buildsSet.add(m.appBuildVersion);
      if (m.severity) highestSeverity = m.severity;
      if (m.priority) highestPriority = m.priority;
    }

    const firstSeenAt = new Date(Math.min(...members.map(m => new Date(m.createdAt).getTime())));
    const lastSeenAt = new Date(Math.max(...members.map(m => new Date(m.createdAt).getTime())));

    const fingerprint = generateClusterFingerprint({
      projectId,
      clusterKey,
      representativeFailureId: representative.failureCaseId,
      activeMemberFailureIds: members.map(m => m.failureCaseId),
      probableLayer: representative.probableLayer,
      probableComponent: representative.probableComponent,
      severitySummary: highestSeverity,
      prioritySummary: highestPriority,
      affectedRequirements: Array.from(reqsSet),
      affectedRoutes: Array.from(routesSet),
      affectedBuilds: Array.from(buildsSet),
      version: 1,
    });

    const title =
      representative.failureSummary ||
      representative.errorMessage ||
      representative.title ||
      `Defect Cluster ${clusterKey}`;

    return await this.prisma.$transaction(async tx => {
      const cluster = await tx.defectCluster.create({
        data: {
          projectId,
          clusterKey,
          title: title.slice(0, 255),
          clusterStatus: 'ACTIVE',
          representativeFailureId: representative.failureCaseId,
          memberCount: members.length,
          relationshipStrength: members.length > 1 ? 'STRONG' : 'EXACT',
          classificationSummary: representative.failureDomain || 'APPLICATION_DEFECT_CANDIDATE',
          probableLayer: representative.probableLayer,
          rootCauseSummary: representative.probableCause,
          severitySummary: highestSeverity as any,
          prioritySummary: highestPriority as any,
          affectedRequirements: Array.from(reqsSet),
          affectedRoutes: Array.from(routesSet),
          affectedBuilds: Array.from(buildsSet),
          firstSeenAt,
          lastSeenAt,
          clusterFingerprint: fingerprint,
          version: 1,
        },
      });

      // Create memberships for all members
      for (const m of members) {
        const isRep = m.failureCaseId === representative.failureCaseId;
        const comp = isRep ? null : this.comparator.compare(m, representative);

        await tx.defectClusterMembership.create({
          data: {
            clusterId: cluster.id,
            failureCaseId: m.failureCaseId,
            projectId,
            relationshipType: isRep ? 'EXACT_DUPLICATE' : comp!.relationshipType,
            relationshipStrength: isRep ? 'EXACT' : comp!.relationshipStrength,
            similarityScore: isRep ? 1.0 : comp!.similarityScore,
            matchedSignals: (isRep ? [] : comp!.matchedSignals) as any,
            contradictorySignals: (isRep ? [] : comp!.contradictorySignals) as any,
            explanation: isRep
              ? 'Designated representative failure for cluster.'
              : comp!.explanation,
            isRepresentative: isRep,
            isManualOverride: false,
            isActive: true,
          },
        });
      }

      // Record audit history
      await tx.defectClusterHistory.create({
        data: {
          clusterId: cluster.id,
          projectId,
          eventType: 'CREATED',
          failureCaseId: representative.failureCaseId,
          reason: `Initial cluster formation with ${members.length} member(s).`,
          actor: 'SYSTEM',
        },
      });

      return {
        ...cluster,
        memberships: members.map(m => ({ failureCaseId: m.failureCaseId, isActive: true })),
      };
    });
  }

  /**
   * Retrieves a single defect cluster by ID with active memberships.
   */
  public async getCluster(input: GetClusterInputDto): Promise<DefectClusterDto | null> {
    const validated = getClusterInputSchema.parse(input);

    const cluster = await this.prisma.defectCluster.findFirst({
      where: { id: validated.clusterId, projectId: validated.projectId },
      include: {
        memberships: {
          where: { isActive: true },
          include: {
            failureCase: true,
          },
        },
      },
    });

    if (!cluster) {
      const anyCluster = await this.prisma.defectCluster.findUnique({
        where: { id: validated.clusterId },
      });
      if (anyCluster && anyCluster.projectId !== validated.projectId) {
        throw new DefectClusterCrossProjectError(
          `Cluster ${validated.clusterId} belongs to project ${anyCluster.projectId}, not target project ${validated.projectId}.`,
        );
      }
      return null;
    }
    return this.mapClusterToDto(cluster);
  }

  /**
   * Lists all defect clusters for a project.
   */
  public async listClusters(input: ListClustersInputDto): Promise<readonly DefectClusterDto[]> {
    const validated = listClustersInputSchema.parse(input);

    const clusters = await this.prisma.defectCluster.findMany({
      where: {
        projectId: validated.projectId,
        ...(validated.status ? { clusterStatus: validated.status } : {}),
      },
      include: {
        memberships: {
          where: { isActive: true },
          include: {
            failureCase: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return clusters.map(c => this.mapClusterToDto(c));
  }

  /**
   * Retrieves the active cluster membership for a given failure case.
   */
  public async getFailureMembership(
    input: GetFailureMembershipInputDto,
  ): Promise<DefectClusterMembershipDto | null> {
    const validated = getFailureMembershipInputSchema.parse(input);

    const failureCase = await this.prisma.failureCase.findUnique({
      where: { id: validated.failureCaseId },
    });
    if (failureCase && failureCase.projectId !== validated.projectId) {
      throw new DefectClusterCrossProjectError(
        `FailureCase ${validated.failureCaseId} belongs to project ${failureCase.projectId}, not target project ${validated.projectId}.`,
      );
    }

    const membership = await this.prisma.defectClusterMembership.findFirst({
      where: {
        projectId: validated.projectId,
        failureCaseId: validated.failureCaseId,
        isActive: true,
      },
      include: {
        failureCase: true,
      },
    });

    if (!membership) return null;
    return this.mapMembershipToDto(membership);
  }

  /**
   * Merges a source cluster into a target cluster with full audit history preservation.
   */
  public async mergeClusters(input: MergeClustersInputDto): Promise<DefectClusterDto> {
    const validated = mergeClustersInputSchema.parse(input);
    const lockKey = `project:${validated.projectId}`;

    return this.withLock(lockKey, async () => {
      if (validated.sourceClusterId === validated.targetClusterId) {
        throw new DefectClusterInvalidOperationError('Cannot merge a cluster into itself.');
      }

      const sourceCluster = await this.prisma.defectCluster.findFirst({
        where: { id: validated.sourceClusterId, projectId: validated.projectId },
        include: { memberships: { where: { isActive: true } } },
      });
      if (!sourceCluster) {
        throw new DefectClusterNotFoundError(
          `Source cluster ${validated.sourceClusterId} not found in project.`,
          validated.sourceClusterId,
        );
      }

      const targetCluster = await this.prisma.defectCluster.findFirst({
        where: { id: validated.targetClusterId, projectId: validated.projectId },
        include: { memberships: { where: { isActive: true } } },
      });
      if (!targetCluster) {
        throw new DefectClusterNotFoundError(
          `Target cluster ${validated.targetClusterId} not found in project.`,
          validated.targetClusterId,
        );
      }

      await this.prisma.$transaction(async tx => {
        // 1. Move active memberships from source to target
        await tx.defectClusterMembership.updateMany({
          where: { clusterId: sourceCluster.id, isActive: true },
          data: {
            clusterId: targetCluster.id,
            isRepresentative: false, // target representative remains authoritative unless re-evaluated
          },
        });

        // 2. Mark source cluster as MERGED
        await tx.defectCluster.update({
          where: { id: sourceCluster.id },
          data: {
            clusterStatus: 'MERGED',
            mergedIntoClusterId: targetCluster.id,
            memberCount: 0,
          },
        });

        // 3. Update target cluster count
        const totalActive = sourceCluster.memberships.length + targetCluster.memberships.length;
        await tx.defectCluster.update({
          where: { id: targetCluster.id },
          data: {
            memberCount: totalActive,
            lastSeenAt: new Date(),
          },
        });

        // 4. Record history for both
        await tx.defectClusterHistory.create({
          data: {
            clusterId: sourceCluster.id,
            projectId: validated.projectId,
            eventType: 'MERGED',
            reason: `Merged into ${targetCluster.clusterKey}: ${validated.reason}`,
            actor: 'OPERATOR',
          },
        });

        await tx.defectClusterHistory.create({
          data: {
            clusterId: targetCluster.id,
            projectId: validated.projectId,
            eventType: 'MERGED',
            reason: `Absorbed ${sourceCluster.clusterKey} (${sourceCluster.memberships.length} members): ${validated.reason}`,
            actor: 'OPERATOR',
          },
        });
      });

      const updated = await this.getCluster({
        projectId: validated.projectId,
        clusterId: targetCluster.id,
      });
      return updated!;
    });
  }

  /**
   * Splits specified members from an existing cluster into a new cluster with audit trail.
   */
  public async splitCluster(
    input: SplitClusterInputDto,
  ): Promise<{ remainingCluster: DefectClusterDto; newCluster: DefectClusterDto }> {
    const validated = splitClusterInputSchema.parse(input);
    const lockKey = `project:${validated.projectId}`;

    return this.withLock(lockKey, async () => {
      const parentCluster = await this.prisma.defectCluster.findFirst({
        where: { id: validated.clusterId, projectId: validated.projectId },
        include: { memberships: { where: { isActive: true } } },
      });
      if (!parentCluster) {
        throw new DefectClusterNotFoundError(
          `Cluster ${validated.clusterId} not found in project.`,
          validated.clusterId,
        );
      }

      const activeMemberIds = parentCluster.memberships.map(m => m.failureCaseId);
      const extractIds = new Set(validated.failureCaseIdsToExtract);

      if (extractIds.size === 0 || extractIds.size >= activeMemberIds.length) {
        throw new DefectClusterEmptySplitError(
          'Split must extract a non-empty proper subset of members, leaving at least 1 remaining member.',
        );
      }

      // Verify all extracted IDs are active members
      for (const id of extractIds) {
        if (!activeMemberIds.includes(id)) {
          throw new DefectClusterInvalidOperationError(
            `FailureCase ${id} is not an active member of cluster ${parentCluster.clusterKey}.`,
          );
        }
      }

      // Load facts for extracted members
      const extractedFacts: FailureComparisonFacts[] = [];
      for (const id of extractIds) {
        const f = await this.candidateEngine.loadFailureFacts(validated.projectId, id);
        if (f) extractedFacts.push(f);
      }

      // 1. Deactivate memberships in parent cluster
      await this.prisma.defectClusterMembership.updateMany({
        where: {
          clusterId: parentCluster.id,
          failureCaseId: { in: Array.from(extractIds) },
          isActive: true,
        },
        data: {
          isActive: false,
          removedAt: new Date(),
        },
      });

      // 2. Select new representative for parent if old representative was extracted
      const remainingMemberIds = activeMemberIds.filter(id => !extractIds.has(id));
      const remainingFacts: FailureComparisonFacts[] = [];
      for (const id of remainingMemberIds) {
        const f = await this.candidateEngine.loadFailureFacts(validated.projectId, id);
        if (f) remainingFacts.push(f);
      }

      const newParentRepresentative = this.selector.selectRepresentative(remainingFacts);
      await this.prisma.defectCluster.update({
        where: { id: parentCluster.id },
        data: {
          representativeFailureId: newParentRepresentative.failureCaseId,
          memberCount: remainingFacts.length,
        },
      });

      // Update isRepresentative flags in parent memberships
      await this.prisma.defectClusterMembership.updateMany({
        where: { clusterId: parentCluster.id, isActive: true },
        data: { isRepresentative: false },
      });
      await this.prisma.defectClusterMembership.updateMany({
        where: {
          clusterId: parentCluster.id,
          failureCaseId: newParentRepresentative.failureCaseId,
          isActive: true,
        },
        data: { isRepresentative: true },
      });

      // 3. Create new cluster for extracted members
      const newClusterRep = this.selector.selectRepresentative(extractedFacts);
      const totalClusters = await this.prisma.defectCluster.count({
        where: { projectId: validated.projectId },
      });
      const newClusterKey = `CLU-${String(totalClusters + 1).padStart(4, '0')}`;

      const newCluster = await this.prisma.defectCluster.create({
        data: {
          projectId: validated.projectId,
          clusterKey: newClusterKey,
          title: `Split from ${parentCluster.clusterKey}: ${newClusterRep.title}`.slice(0, 255),
          clusterStatus: 'ACTIVE',
          representativeFailureId: newClusterRep.failureCaseId,
          memberCount: extractedFacts.length,
          relationshipStrength: 'STRONG',
          splitFromClusterId: parentCluster.id,
          clusterFingerprint: generateClusterFingerprint({
            projectId: validated.projectId,
            clusterKey: newClusterKey,
            representativeFailureId: newClusterRep.failureCaseId,
            activeMemberFailureIds: extractedFacts.map(f => f.failureCaseId),
            version: 1,
          }),
        },
      });

      // Add memberships to new cluster
      for (const m of extractedFacts) {
        const isRep = m.failureCaseId === newClusterRep.failureCaseId;
        const comp = isRep ? null : this.comparator.compare(m, newClusterRep);

        await this.prisma.defectClusterMembership.create({
          data: {
            clusterId: newCluster.id,
            failureCaseId: m.failureCaseId,
            projectId: validated.projectId,
            relationshipType: isRep ? 'EXACT_DUPLICATE' : comp!.relationshipType,
            relationshipStrength: isRep ? 'EXACT' : comp!.relationshipStrength,
            similarityScore: isRep ? 1.0 : comp!.similarityScore,
            matchedSignals: (isRep ? [] : comp!.matchedSignals) as any,
            contradictorySignals: (isRep ? [] : comp!.contradictorySignals) as any,
            explanation: isRep ? 'Representative for split cluster.' : comp!.explanation,
            isRepresentative: isRep,
            isManualOverride: true,
            manualOverrideReason: validated.reason,
            isActive: true,
          },
        });
      }

      // Record audit history
      await this.prisma.defectClusterHistory.create({
        data: {
          clusterId: parentCluster.id,
          projectId: validated.projectId,
          eventType: 'SPLIT',
          reason: `Split ${extractedFacts.length} member(s) into ${newClusterKey}: ${validated.reason}`,
          actor: 'OPERATOR',
        },
      });

      await this.prisma.defectClusterHistory.create({
        data: {
          clusterId: newCluster.id,
          projectId: validated.projectId,
          eventType: 'SPLIT',
          reason: `Created via split from ${parentCluster.clusterKey}: ${validated.reason}`,
          actor: 'OPERATOR',
        },
      });

      const updatedParent = await this.getCluster({
        projectId: validated.projectId,
        clusterId: parentCluster.id,
      });
      const createdNew = await this.getCluster({
        projectId: validated.projectId,
        clusterId: newCluster.id,
      });

      return {
        remainingCluster: updatedParent!,
        newCluster: createdNew!,
      };
    });
  }

  /**
   * Manual override of failure case cluster membership.
   */
  public async overrideMembership(
    input: OverrideMembershipInputDto,
  ): Promise<DefectClusterMembershipDto | null> {
    const validated = overrideMembershipInputSchema.parse(input);
    const lockKey = `project:${validated.projectId}`;

    return this.withLock(lockKey, async () => {
      // Validate cross-project boundaries
      const failureCase = await this.prisma.failureCase.findUnique({
        where: { id: validated.failureCaseId },
      });
      if (failureCase && failureCase.projectId !== validated.projectId) {
        throw new DefectClusterCrossProjectError(
          `FailureCase ${validated.failureCaseId} belongs to project ${failureCase.projectId}, not target project ${validated.projectId}.`,
        );
      }

      // Find current active membership
      const currentMembership = await this.prisma.defectClusterMembership.findFirst({
        where: {
          projectId: validated.projectId,
          failureCaseId: validated.failureCaseId,
          isActive: true,
        },
      });

      if (validated.action === 'DETACH') {
        if (!currentMembership) return null;

        await this.prisma.$transaction(async tx => {
          await tx.defectClusterMembership.update({
            where: { id: currentMembership.id },
            data: {
              isActive: false,
              removedAt: new Date(),
              isManualOverride: true,
              manualOverrideReason: validated.reason,
            },
          });

          // Decrement cluster member count
          await tx.defectCluster.update({
            where: { id: currentMembership.clusterId },
            data: {
              memberCount: { decrement: 1 },
            },
          });

          await tx.defectClusterHistory.create({
            data: {
              clusterId: currentMembership.clusterId,
              projectId: validated.projectId,
              eventType: 'MANUAL_OVERRIDE',
              failureCaseId: validated.failureCaseId,
              reason: `Failure detached by operator: ${validated.reason}`,
              actor: 'OPERATOR',
            },
          });
        });

        return null;
      }

      // action === 'MOVE'
      if (!validated.targetClusterId) {
        throw new DefectClusterInvalidOperationError(
          'Target cluster ID is required for MOVE action.',
        );
      }

      const targetCluster = await this.prisma.defectCluster.findFirst({
        where: { id: validated.targetClusterId, projectId: validated.projectId },
      });
      if (!targetCluster) {
        throw new DefectClusterNotFoundError(
          `Target cluster ${validated.targetClusterId} not found in project.`,
          validated.targetClusterId,
        );
      }

      // Load facts to compute relationship with target representative
      const failureFacts = await this.candidateEngine.loadFailureFacts(
        validated.projectId,
        validated.failureCaseId,
      );
      const repFacts = await this.candidateEngine.loadFailureFacts(
        validated.projectId,
        targetCluster.representativeFailureId,
      );

      const comparison =
        failureFacts && repFacts
          ? this.comparator.compare(failureFacts, repFacts)
          : {
              relationshipType: 'PROBABLE_DUPLICATE' as const,
              relationshipStrength: 'STRONG' as const,
              similarityScore: 0.85,
              matchedSignals: [],
              contradictorySignals: [],
              explanation: 'Assigned via operator override.',
            };

      return this.prisma.$transaction(async tx => {
        // Deactivate previous membership if any
        if (currentMembership) {
          await tx.defectClusterMembership.update({
            where: { id: currentMembership.id },
            data: {
              isActive: false,
              removedAt: new Date(),
            },
          });
          await tx.defectCluster.update({
            where: { id: currentMembership.clusterId },
            data: { memberCount: { decrement: 1 } },
          });
        }

        // Create new membership in target cluster
        const newMembership = await tx.defectClusterMembership.create({
          data: {
            clusterId: targetCluster.id,
            failureCaseId: validated.failureCaseId,
            projectId: validated.projectId,
            relationshipType: comparison.relationshipType,
            relationshipStrength: comparison.relationshipStrength,
            similarityScore: comparison.similarityScore,
            matchedSignals: comparison.matchedSignals as any,
            contradictorySignals: comparison.contradictorySignals as any,
            explanation: `Manual override: ${validated.reason}`,
            isRepresentative: false,
            isManualOverride: true,
            manualOverrideReason: validated.reason,
            isActive: true,
          },
          include: { failureCase: true },
        });

        // Increment target cluster count
        await tx.defectCluster.update({
          where: { id: targetCluster.id },
          data: {
            memberCount: { increment: 1 },
            lastSeenAt: new Date(),
          },
        });

        // Record history
        await tx.defectClusterHistory.create({
          data: {
            clusterId: targetCluster.id,
            projectId: validated.projectId,
            eventType: 'MANUAL_OVERRIDE',
            failureCaseId: validated.failureCaseId,
            reason: `Failure moved into cluster by operator: ${validated.reason}`,
            actor: 'OPERATOR',
          },
        });

        return this.mapMembershipToDto(newMembership);
      });
    });
  }

  /**
   * Retrieves complete audit history for a defect cluster.
   */
  public async listClusterHistory(
    input: ListClusterHistoryInputDto,
  ): Promise<readonly DefectClusterHistoryDto[]> {
    const validated = listClusterHistoryInputSchema.parse(input);

    const histories = await this.prisma.defectClusterHistory.findMany({
      where: { clusterId: validated.clusterId, projectId: validated.projectId },
      orderBy: { createdAt: 'asc' },
    });

    return histories.map(h => ({
      id: h.id,
      clusterId: h.clusterId,
      projectId: h.projectId,
      eventType: h.eventType as any,
      failureCaseId: h.failureCaseId ?? undefined,
      previousState: (h.previousState as Record<string, unknown>) ?? undefined,
      newState: (h.newState as Record<string, unknown>) ?? undefined,
      reason: h.reason,
      actor: h.actor,
      createdAt: h.createdAt.toISOString(),
    }));
  }

  private mapClusterToDto(c: any): DefectClusterDto {
    return {
      id: c.id,
      projectId: c.projectId,
      clusterKey: c.clusterKey,
      title: c.title,
      clusterStatus: c.clusterStatus,
      representativeFailureId: c.representativeFailureId,
      memberCount: c.memberCount,
      relationshipStrength: c.relationshipStrength,
      classificationSummary: c.classificationSummary ?? undefined,
      probableLayer: c.probableLayer ?? undefined,
      rootCauseSummary: c.rootCauseSummary ?? undefined,
      severitySummary: c.severitySummary ?? undefined,
      prioritySummary: c.prioritySummary ?? undefined,
      affectedRequirements: Array.isArray(c.affectedRequirements)
        ? c.affectedRequirements.map(String)
        : [],
      affectedRoutes: Array.isArray(c.affectedRoutes) ? c.affectedRoutes.map(String) : [],
      affectedBuilds: Array.isArray(c.affectedBuilds) ? c.affectedBuilds.map(String) : [],
      firstSeenAt: c.firstSeenAt.toISOString(),
      lastSeenAt: c.lastSeenAt.toISOString(),
      clusterFingerprint: c.clusterFingerprint,
      version: c.version,
      mergedIntoClusterId: c.mergedIntoClusterId ?? undefined,
      splitFromClusterId: c.splitFromClusterId ?? undefined,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
      memberships: c.memberships
        ? c.memberships.map((m: any) => this.mapMembershipToDto(m))
        : undefined,
    };
  }

  private mapMembershipToDto(m: any): DefectClusterMembershipDto {
    return {
      id: m.id,
      clusterId: m.clusterId,
      failureCaseId: m.failureCaseId,
      projectId: m.projectId,
      relationshipType: m.relationshipType,
      relationshipStrength: m.relationshipStrength,
      similarityScore: m.similarityScore,
      matchedSignals: Array.isArray(m.matchedSignals) ? m.matchedSignals : [],
      contradictorySignals: Array.isArray(m.contradictorySignals) ? m.contradictorySignals : [],
      explanation: m.explanation,
      isRepresentative: m.isRepresentative,
      isManualOverride: m.isManualOverride,
      manualOverrideReason: m.manualOverrideReason ?? undefined,
      isActive: m.isActive,
      addedAt: m.addedAt.toISOString(),
      removedAt: m.removedAt ? m.removedAt.toISOString() : undefined,
      version: m.version,
      createdAt: m.createdAt.toISOString(),
      updatedAt: m.updatedAt.toISOString(),
      failureCase: m.failureCase
        ? {
            id: m.failureCase.id,
            title: m.failureCase.title,
            failureSummary: m.failureCase.failureSummary ?? undefined,
            errorCode: m.failureCase.errorCode ?? undefined,
            errorMessage: m.failureCase.errorMessage ?? undefined,
            failureSignature: m.failureCase.failureSignature ?? undefined,
            evidenceCompleteness: m.failureCase.evidenceCompleteness ?? undefined,
            createdAt: m.failureCase.createdAt.toISOString(),
          }
        : undefined,
    };
  }
}
