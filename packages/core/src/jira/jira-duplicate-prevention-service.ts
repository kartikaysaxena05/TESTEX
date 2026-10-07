/**
 * @file packages/core/src/jira/jira-duplicate-prevention-service.ts
 * Core domain service for Jira duplicate prevention, cluster-aware deduplication, and existing-issue linking (V7 Phase 93).
 * Enforces deterministic rule precedence, race condition defense, partial failure recovery, and multi-tenant isolation.
 */

import type { PrismaClient, JiraIssueLink, JiraExternalIssue } from '@prisma/client';
import {
  type IJiraDuplicatePreventionService,
  type IJiraClient,
  type IJiraCredentialVault,
  type EvaluateDuplicateInputDto,
  type JiraDuplicateEvaluationDto,
  type LinkExistingIssueInputDto,
  type JiraIssueLinkDto,
  type GetIssueLinkInputDto,
  evaluateDuplicateInputSchema,
  linkExistingIssueInputSchema,
  getIssueLinkInputSchema,
} from './jira-types.js';
import { JiraClient } from './jira-client.js';
import { JiraCredentialVault } from './jira-credential-vault.js';
import {
  JiraConnectionNotFoundError,
  JiraCrossProjectError,
  JiraLinkNotFoundError,
  JiraConnectionFailedError,
} from './jira-errors.js';
import { ProjectNotFoundError } from '../projects/project-errors.js';

export class JiraDuplicatePreventionService implements IJiraDuplicatePreventionService {
  private readonly prisma: PrismaClient;
  private readonly jiraClient: IJiraClient;
  private readonly vault: IJiraCredentialVault;
  private readonly allowLocalhostForTesting: boolean;
  private readonly evaluationLocks: Map<string, Promise<void>> = new Map();

  constructor(options: {
    readonly prisma: PrismaClient;
    readonly jiraClient?: IJiraClient;
    readonly vault?: IJiraCredentialVault;
    readonly allowLocalhostForTesting?: boolean;
  }) {
    this.prisma = options.prisma;
    this.jiraClient = options.jiraClient ?? new JiraClient();
    this.vault = options.vault ?? new JiraCredentialVault();
    this.allowLocalhostForTesting = Boolean(options.allowLocalhostForTesting);
  }

  /**
   * Acquires a serialized in-memory lock for a given resource key (failure or cluster).
   */
  private async acquireLock(lockKey: string): Promise<() => void> {
    while (this.evaluationLocks.has(lockKey)) {
      await this.evaluationLocks.get(lockKey);
    }
    let resolveLock!: () => void;
    const lockPromise = new Promise<void>(resolve => {
      resolveLock = resolve;
    });
    this.evaluationLocks.set(lockKey, lockPromise);

    return () => {
      this.evaluationLocks.delete(lockKey);
      resolveLock();
    };
  }

  /**
   * Deterministically evaluates whether a Jira issue already exists for the given failure/report context
   * according to the strict 6-level precedence hierarchy.
   */
  public async evaluateBeforeCreate(
    rawInput: EvaluateDuplicateInputDto,
  ): Promise<JiraDuplicateEvaluationDto> {
    const input = evaluateDuplicateInputSchema.parse(rawInput);

    // 1. Concurrency serialization lock per project & failureCase
    const lockKey = `${input.projectId}:${input.failureCaseId}`;
    const releaseLock = await this.acquireLock(lockKey);

    try {
      // 2. Validate Project Existence
      const project = await this.prisma.project.findUnique({
        where: { id: input.projectId },
      });
      if (!project) {
        throw new ProjectNotFoundError(input.projectId);
      }

      // 3. Validate FailureCase and Project Isolation
      const failureCase = await this.prisma.failureCase.findUnique({
        where: { id: input.failureCaseId },
      });
      if (!failureCase || failureCase.projectId !== input.projectId) {
        throw new JiraCrossProjectError(input.failureCaseId, input.projectId);
      }

      // 4. Validate BugReport if provided
      let bugReport = null;
      if (input.bugReportId) {
        bugReport = await this.prisma.structuredBugReport.findUnique({
          where: { id: input.bugReportId },
        });
        if (!bugReport || bugReport.projectId !== input.projectId) {
          throw new JiraCrossProjectError(input.bugReportId, input.projectId);
        }
        if (bugReport.failureCaseId !== input.failureCaseId) {
          throw new JiraCrossProjectError(input.bugReportId, input.projectId);
        }
      }

      // 5. Load Connection (if configured)
      const connection = await this.prisma.jiraConnection.findUnique({
        where: { projectId: input.projectId },
      });

      // Audit duplicate check started
      if (connection) {
        await this.prisma.jiraConnectionAudit.create({
          data: {
            connectionId: connection.id,
            projectId: input.projectId,
            eventType: 'DUPLICATE_CHECK_STARTED',
            actor: 'SYSTEM',
            details: {
              failureCaseId: input.failureCaseId,
              bugReportId: input.bugReportId ?? null,
            },
          },
        });
      }

      // ========================================================================
      // PRECEDENCE LEVEL 1: Exact Existing Bug Report Link
      // ========================================================================
      if (input.bugReportId) {
        // Check active link first
        let activeReportLink = await this.prisma.jiraIssueLink.findFirst({
          where: {
            projectId: input.projectId,
            bugReportId: input.bugReportId,
            isActive: true,
          },
          orderBy: { createdAt: 'desc' },
        });

        if (activeReportLink) {
          if (
            activeReportLink.linkSource === 'EXACT_EXISTING_LINK' &&
            !activeReportLink.externalIssueId
          ) {
            await this.invalidateLinkRecord(
              activeReportLink.id,
              'Underlying external issue record was deleted.',
              connection?.id,
              input.projectId,
            );
            activeReportLink = null;
          } else if (activeReportLink.externalIssueId) {
            const ext = await this.prisma.jiraExternalIssue.findUnique({
              where: { id: activeReportLink.externalIssueId },
            });
            if (!ext) {
              await this.invalidateLinkRecord(
                activeReportLink.id,
                'Internal Jira external issue record was deleted.',
                connection?.id,
                input.projectId,
              );
              activeReportLink = null;
            }
          }
        }

        if (activeReportLink) {
          const validated = await this.validateExternalIssueIdentity(
            connection,
            activeReportLink.jiraIssueKey,
            activeReportLink.jiraIssueId,
          );
          if (validated.isDeleted) {
            await this.invalidateLinkRecord(
              activeReportLink.id,
              'External Jira issue was deleted (404).',
              connection?.id,
              input.projectId,
            );
          } else {
            if (validated.keyChanged && validated.currentKey) {
              await this.updateLinkIssueKey(activeReportLink.id, validated.currentKey, connection);
              activeReportLink.jiraIssueKey = validated.currentKey;
            }
            await this.recordDuplicateFoundAudit(
              connection,
              input.projectId,
              activeReportLink.jiraIssueKey,
              'EXACT_BUG_REPORT',
            );

            const extIssue = activeReportLink.externalIssueId
              ? await this.prisma.jiraExternalIssue.findUnique({
                  where: { id: activeReportLink.externalIssueId },
                })
              : await this.prisma.jiraExternalIssue.findFirst({
                  where: {
                    projectId: input.projectId,
                    jiraIssueKey: activeReportLink.jiraIssueKey,
                  },
                });

            return {
              decision: 'USE_EXISTING',
              ruleId: 'JIRA_RULE_1_EXACT_BUG_REPORT',
              reason: `Exact bug report is already linked to Jira issue ${activeReportLink.jiraIssueKey}.`,
              existingIssue: extIssue ? this.mapExternalIssueToDto(extIssue) : undefined,
              matchedLink: this.mapLinkToDto(activeReportLink),
              jiraIssueKey: activeReportLink.jiraIssueKey,
              jiraIssueId: activeReportLink.jiraIssueId,
              jiraIssueUrl: activeReportLink.jiraIssueUrl,
              candidateCount: 1,
              evaluatedAt: new Date().toISOString(),
            };
          }
        }

        // Check external issue created for this bug report
        const existingExternalIssue = await this.prisma.jiraExternalIssue.findFirst({
          where: {
            projectId: input.projectId,
            bugReportId: input.bugReportId,
            creationStatus: 'CREATED',
          },
          orderBy: { createdAt: 'desc' },
        });

        if (existingExternalIssue) {
          const validated = await this.validateExternalIssueIdentity(
            connection,
            existingExternalIssue.jiraIssueKey,
            existingExternalIssue.jiraIssueId,
          );
          if (!validated.isDeleted) {
            await this.recordDuplicateFoundAudit(
              connection,
              input.projectId,
              existingExternalIssue.jiraIssueKey,
              'EXACT_BUG_REPORT',
            );
            return {
              decision: 'USE_EXISTING',
              ruleId: 'JIRA_RULE_1_EXACT_BUG_REPORT',
              reason: `Jira issue ${existingExternalIssue.jiraIssueKey} was previously created for this exact bug report.`,
              existingIssue: this.mapExternalIssueToDto(existingExternalIssue),
              jiraIssueKey: existingExternalIssue.jiraIssueKey,
              jiraIssueId: existingExternalIssue.jiraIssueId,
              jiraIssueUrl: existingExternalIssue.jiraIssueUrl,
              candidateCount: 1,
              evaluatedAt: new Date().toISOString(),
            };
          }
        }
      }

      // ========================================================================
      // PRECEDENCE LEVEL 2: Exact Failure Link
      // ========================================================================
      let activeFailureLink = await this.prisma.jiraIssueLink.findFirst({
        where: {
          projectId: input.projectId,
          failureCaseId: input.failureCaseId,
          isActive: true,
        },
        orderBy: { createdAt: 'desc' },
      });

      if (activeFailureLink) {
        if (
          activeFailureLink.linkSource === 'EXACT_EXISTING_LINK' &&
          !activeFailureLink.externalIssueId
        ) {
          await this.invalidateLinkRecord(
            activeFailureLink.id,
            'Underlying external issue record was deleted.',
            connection?.id,
            input.projectId,
          );
          activeFailureLink = null;
        } else if (activeFailureLink.externalIssueId) {
          const ext = await this.prisma.jiraExternalIssue.findUnique({
            where: { id: activeFailureLink.externalIssueId },
          });
          if (!ext) {
            await this.invalidateLinkRecord(
              activeFailureLink.id,
              'Internal Jira external issue record was deleted.',
              connection?.id,
              input.projectId,
            );
            activeFailureLink = null;
          }
        }
      }

      if (activeFailureLink) {
        const validated = await this.validateExternalIssueIdentity(
          connection,
          activeFailureLink.jiraIssueKey,
          activeFailureLink.jiraIssueId,
        );
        if (validated.isDeleted) {
          await this.invalidateLinkRecord(
            activeFailureLink.id,
            'External Jira issue was deleted (404).',
            connection?.id,
            input.projectId,
          );
        } else {
          if (validated.keyChanged && validated.currentKey) {
            await this.updateLinkIssueKey(activeFailureLink.id, validated.currentKey, connection);
            activeFailureLink.jiraIssueKey = validated.currentKey;
          }
          await this.recordDuplicateFoundAudit(
            connection,
            input.projectId,
            activeFailureLink.jiraIssueKey,
            'EXACT_FAILURE',
          );

          const extIssue = activeFailureLink.externalIssueId
            ? await this.prisma.jiraExternalIssue.findUnique({
                where: { id: activeFailureLink.externalIssueId },
              })
            : await this.prisma.jiraExternalIssue.findFirst({
                where: {
                  projectId: input.projectId,
                  jiraIssueKey: activeFailureLink.jiraIssueKey,
                },
              });

          return {
            decision: 'USE_EXISTING',
            ruleId: 'JIRA_RULE_2_EXACT_FAILURE',
            reason: `Failure case is already linked to Jira issue ${activeFailureLink.jiraIssueKey}.`,
            existingIssue: extIssue ? this.mapExternalIssueToDto(extIssue) : undefined,
            matchedLink: this.mapLinkToDto(activeFailureLink),
            jiraIssueKey: activeFailureLink.jiraIssueKey,
            jiraIssueId: activeFailureLink.jiraIssueId,
            jiraIssueUrl: activeFailureLink.jiraIssueUrl,
            candidateCount: 1,
            evaluatedAt: new Date().toISOString(),
          };
        }
      }

      // Check external issue created for this failureCase
      const existingFailureExternalIssue = await this.prisma.jiraExternalIssue.findFirst({
        where: {
          projectId: input.projectId,
          failureCaseId: input.failureCaseId,
          creationStatus: 'CREATED',
        },
        orderBy: { createdAt: 'desc' },
      });

      if (existingFailureExternalIssue) {
        const validated = await this.validateExternalIssueIdentity(
          connection,
          existingFailureExternalIssue.jiraIssueKey,
          existingFailureExternalIssue.jiraIssueId,
        );
        if (!validated.isDeleted) {
          await this.recordDuplicateFoundAudit(
            connection,
            input.projectId,
            existingFailureExternalIssue.jiraIssueKey,
            'EXACT_FAILURE',
          );
          return {
            decision: 'USE_EXISTING',
            ruleId: 'JIRA_RULE_2_EXACT_FAILURE',
            reason: `Jira issue ${existingFailureExternalIssue.jiraIssueKey} was previously created for this failure case.`,
            existingIssue: this.mapExternalIssueToDto(existingFailureExternalIssue),
            jiraIssueKey: existingFailureExternalIssue.jiraIssueKey,
            jiraIssueId: existingFailureExternalIssue.jiraIssueId,
            jiraIssueUrl: existingFailureExternalIssue.jiraIssueUrl,
            candidateCount: 1,
            evaluatedAt: new Date().toISOString(),
          };
        }
      }

      // ========================================================================
      // PRECEDENCE LEVEL 3: Current Authoritative Defect Cluster Reuse
      // ========================================================================
      const membership = await this.prisma.defectClusterMembership.findFirst({
        where: {
          projectId: input.projectId,
          failureCaseId: input.failureCaseId,
          isActive: true,
        },
        include: {
          cluster: true,
        },
      });

      if (membership && membership.cluster) {
        const cluster = membership.cluster;

        // Verify cluster belongs to the same project
        if (cluster.projectId !== input.projectId) {
          throw new JiraCrossProjectError(cluster.id, input.projectId);
        }

        // Check for Defect Cluster Split ambiguity
        if (cluster.clusterStatus === 'SPLIT' || cluster.splitFromClusterId) {
          return {
            decision: 'INCONCLUSIVE',
            ruleId: 'JIRA_RULE_3_CLUSTER_SPLIT_AMBIGUOUS',
            reason: `Defect cluster '${cluster.clusterKey}' has undergone a split; manual issue verification is required to prevent incorrect duplicate reuse.`,
            defectClusterId: cluster.id,
            defectClusterKey: cluster.clusterKey,
            clusterMembershipAuthoritative: false,
            candidateCount: 0,
            evaluatedAt: new Date().toISOString(),
          };
        }

        // Only ACTIVE clusters are authoritative for automated deduplication
        if (cluster.clusterStatus === 'ACTIVE') {
          const clusterLockKey = `${input.projectId}:cluster:${cluster.id}`;
          const releaseClusterLock = await this.acquireLock(clusterLockKey);

          try {
            const clusterMembers = await this.prisma.defectClusterMembership.findMany({
              where: {
                clusterId: cluster.id,
                projectId: input.projectId,
                isActive: true,
              },
              select: { failureCaseId: true },
            });

            const memberFailureIds = clusterMembers.map(m => m.failureCaseId);
            if (!memberFailureIds.includes(cluster.representativeFailureId)) {
              memberFailureIds.push(cluster.representativeFailureId);
            }

            const [memberLinks, memberExternalIssues] = await Promise.all([
              this.prisma.jiraIssueLink.findMany({
                where: {
                  projectId: input.projectId,
                  failureCaseId: { in: memberFailureIds },
                  isActive: true,
                },
              }),
              this.prisma.jiraExternalIssue.findMany({
                where: {
                  projectId: input.projectId,
                  failureCaseId: { in: memberFailureIds },
                  creationStatus: 'CREATED',
                },
              }),
            ]);

            const distinctIssueMap = new Map<
              string,
              { key: string; url: string; linkId?: string; externalIssueId?: string }
            >();

            for (const link of memberLinks) {
              distinctIssueMap.set(link.jiraIssueId, {
                key: link.jiraIssueKey,
                url: link.jiraIssueUrl,
                linkId: link.id,
              });
            }

            for (const ext of memberExternalIssues) {
              if (!distinctIssueMap.has(ext.jiraIssueId)) {
                distinctIssueMap.set(ext.jiraIssueId, {
                  key: ext.jiraIssueKey,
                  url: ext.jiraIssueUrl,
                  externalIssueId: ext.id,
                });
              }
            }

            if (distinctIssueMap.size > 1) {
              const conflictingKeys = Array.from(distinctIssueMap.values()).map(i => i.key);
              if (connection) {
                await this.prisma.jiraConnectionAudit.create({
                  data: {
                    connectionId: connection.id,
                    projectId: input.projectId,
                    eventType: 'DEDUPLICATION_CONFLICT',
                    actor: 'SYSTEM',
                    details: {
                      clusterId: cluster.id,
                      clusterKey: cluster.clusterKey,
                      conflictingJiraKeys: conflictingKeys,
                      failureCaseId: input.failureCaseId,
                    },
                  },
                });
              }

              return {
                decision: 'INCONCLUSIVE',
                ruleId: 'JIRA_RULE_3_CLUSTER_MERGE_CONFLICT',
                reason: `Merged defect cluster '${cluster.clusterKey}' contains multiple conflicting Jira issues (${conflictingKeys.join(', ')}). Manual triage is required before linking.`,
                defectClusterId: cluster.id,
                defectClusterKey: cluster.clusterKey,
                clusterMembershipAuthoritative: true,
                candidateCount: distinctIssueMap.size,
                evaluatedAt: new Date().toISOString(),
              };
            }

            if (distinctIssueMap.size === 1) {
              const firstEntry = Array.from(distinctIssueMap.entries())[0];
              if (firstEntry) {
                const [issueId, issueData] = firstEntry;
                const validated = await this.validateExternalIssueIdentity(
                  connection,
                  issueData.key,
                  issueId,
                );

                if (validated.isDeleted) {
                  if (issueData.linkId) {
                    await this.invalidateLinkRecord(
                      issueData.linkId,
                      'External Jira issue was deleted (404).',
                      connection?.id,
                      input.projectId,
                    );
                  }
                } else {
                  const currentKey =
                    validated.keyChanged && validated.currentKey
                      ? validated.currentKey
                      : issueData.key;
                  if (validated.keyChanged && validated.currentKey && issueData.linkId) {
                    await this.updateLinkIssueKey(issueData.linkId, currentKey, connection);
                  }

                  await this.recordDuplicateFoundAudit(
                    connection,
                    input.projectId,
                    currentKey,
                    'DEFECT_CLUSTER',
                    cluster.clusterKey,
                  );

                  return {
                    decision: 'USE_EXISTING',
                    ruleId: 'JIRA_RULE_3_DEFECT_CLUSTER',
                    reason: `Failure belongs to authoritative defect cluster '${cluster.clusterKey}', which is already linked to Jira issue ${currentKey}.`,
                    defectClusterId: cluster.id,
                    defectClusterKey: cluster.clusterKey,
                    clusterMembershipAuthoritative: true,
                    jiraIssueId: issueId,
                    jiraIssueKey: currentKey,
                    jiraIssueUrl: issueData.url,
                    candidateCount: 1,
                    evaluatedAt: new Date().toISOString(),
                  };
                }
              }
            }
          } finally {
            releaseClusterLock();
          }
        }
      }

      // ========================================================================
      // PRECEDENCE LEVEL 4: External Jira Metadata Lookup (Labels / IDs)
      // ========================================================================
      if (
        connection &&
        connection.connectionStatus === 'CONNECTED' &&
        connection.encryptedCredentials
      ) {
        try {
          const projectConfig = await this.prisma.jiraProjectConfig.findUnique({
            where: { projectId: input.projectId },
          });

          if (projectConfig && projectConfig.configStatus === 'CONFIGURED') {
            const searchLabels = [
              `platform-failure-${input.failureCaseId.slice(0, 12)}`,
              ...(bugReport ? [`platform-report-${bugReport.reportNumber.toLowerCase()}`] : []),
              ...(membership?.clusterId
                ? [`platform-cluster-${membership.clusterId.slice(0, 12)}`]
                : []),
            ];

            const jql = `project = "${projectConfig.jiraProjectKey}" AND (${searchLabels.map(l => `labels = "${l}"`).join(' OR ')})`;

            const plainToken = await this.vault.decrypt(
              connection.encryptedCredentials,
              connection.id,
            );

            if (typeof this.jiraClient.searchIssues === 'function') {
              const searchRes = await this.jiraClient.searchIssues({
                baseUrl: connection.baseUrl,
                deploymentType: connection.deploymentType,
                authenticationType: connection.authenticationType,
                accountIdentifier: connection.accountIdentifier,
                apiToken: plainToken,
                jql,
                maxResults: 5,
                allowLocalhostForTesting: this.allowLocalhostForTesting,
              });

              if (searchRes.issues.length > 0) {
                const matched = searchRes.issues[0];
                if (matched) {
                  const normalizedBase = connection.baseUrl.replace(/\/+$/, '');
                  const jiraIssueUrl = `${normalizedBase}/browse/${matched.key}`;

                  await this.recordDuplicateFoundAudit(
                    connection,
                    input.projectId,
                    matched.key,
                    'EXTERNAL_METADATA',
                  );

                  return {
                    decision: 'USE_EXISTING',
                    ruleId: 'JIRA_RULE_4_EXTERNAL_METADATA_MATCH',
                    reason: `Discovered existing Jira issue ${matched.key} in remote project ${projectConfig.jiraProjectKey} with matching platform defect metadata.`,
                    jiraIssueId: matched.id,
                    jiraIssueKey: matched.key,
                    jiraIssueUrl,
                    candidateCount: searchRes.issues.length,
                    evaluatedAt: new Date().toISOString(),
                  };
                }
              }
            }
          }
        } catch {
          // If external lookup fails, proceed safely
        }
      }

      // ========================================================================
      // PRECEDENCE LEVEL 5: Strong Structured Evidence Match
      // ========================================================================
      if (failureCase.failureSignature && failureCase.failureSignature.trim().length > 0) {
        const identicalFailure = await this.prisma.failureCase.findFirst({
          where: {
            projectId: input.projectId,
            failureSignature: failureCase.failureSignature,
            id: { not: input.failureCaseId },
            jiraExternalIssues: {
              some: {
                creationStatus: 'CREATED',
              },
            },
          },
          include: {
            jiraExternalIssues: {
              where: { creationStatus: 'CREATED' },
              take: 1,
            },
          },
        });

        if (identicalFailure && identicalFailure.jiraExternalIssues.length > 0) {
          const matchedIssue = identicalFailure.jiraExternalIssues[0];
          if (matchedIssue) {
            await this.recordDuplicateFoundAudit(
              connection,
              input.projectId,
              matchedIssue.jiraIssueKey,
              'STRONG_EVIDENCE',
            );

            return {
              decision: 'USE_EXISTING',
              ruleId: 'JIRA_RULE_5_STRONG_EVIDENCE_MATCH',
              reason: `Failure matches identical deterministic signature as failure ${identicalFailure.id}, linked to Jira issue ${matchedIssue.jiraIssueKey}.`,
              existingIssue: this.mapExternalIssueToDto(matchedIssue),
              jiraIssueId: matchedIssue.jiraIssueId,
              jiraIssueKey: matchedIssue.jiraIssueKey,
              jiraIssueUrl: matchedIssue.jiraIssueUrl,
              candidateCount: 1,
              evaluatedAt: new Date().toISOString(),
            };
          }
        }
      }

      // ========================================================================
      // PRECEDENCE LEVEL 6: No Confirmed Duplicate -> Allow New Issue
      // ========================================================================
      if (connection) {
        await this.prisma.jiraConnectionAudit.create({
          data: {
            connectionId: connection.id,
            projectId: input.projectId,
            eventType: 'NEW_ISSUE_ALLOWED',
            actor: 'SYSTEM',
            details: {
              failureCaseId: input.failureCaseId,
              bugReportId: input.bugReportId ?? null,
              ruleId: 'JIRA_RULE_6_NO_DUPLICATE',
            },
          },
        });
      }

      return {
        decision: 'CREATE_NEW',
        ruleId: 'JIRA_RULE_6_NO_DUPLICATE',
        reason: 'No existing Jira issue or defect cluster match was found for this failure report.',
        candidateCount: 0,
        evaluatedAt: new Date().toISOString(),
      };
    } finally {
      releaseLock();
    }
  }

  /**
   * Authoritatively links an existing Jira issue to a failure case and bug report.
   * Enforces project isolation, supersedes previous active links, and creates an audit record.
   */
  public async linkExistingIssue(rawInput: LinkExistingIssueInputDto): Promise<JiraIssueLinkDto> {
    const input = linkExistingIssueInputSchema.parse(rawInput);

    const lockKey = `${input.projectId}:${input.failureCaseId}`;
    const releaseLock = await this.acquireLock(lockKey);

    try {
      // 1. Validate Project Existence
      const project = await this.prisma.project.findUnique({
        where: { id: input.projectId },
      });
      if (!project) {
        throw new ProjectNotFoundError(input.projectId);
      }

      // 2. Validate FailureCase and Project Isolation
      const failureCase = await this.prisma.failureCase.findUnique({
        where: { id: input.failureCaseId },
      });
      if (!failureCase || failureCase.projectId !== input.projectId) {
        throw new JiraCrossProjectError(input.failureCaseId, input.projectId);
      }

      // 3. Validate BugReport if provided
      let bugReport = null;
      if (input.bugReportId) {
        bugReport = await this.prisma.structuredBugReport.findUnique({
          where: { id: input.bugReportId },
        });
        if (!bugReport || bugReport.projectId !== input.projectId) {
          throw new JiraCrossProjectError(input.bugReportId, input.projectId);
        }
        if (bugReport.failureCaseId !== input.failureCaseId) {
          throw new JiraCrossProjectError(input.bugReportId, input.projectId);
        }
      }

      // 4. Validate Jira Connection
      const connection = await this.prisma.jiraConnection.findUnique({
        where: { projectId: input.projectId },
      });
      if (!connection) {
        throw new JiraConnectionNotFoundError(input.projectId);
      }

      // 5. Discover DefectCluster if present
      const membership = await this.prisma.defectClusterMembership.findFirst({
        where: {
          projectId: input.projectId,
          failureCaseId: input.failureCaseId,
          isActive: true,
        },
      });

      // 6. Resolve External Jira Issue details
      let jiraIssueId = '';
      let jiraProjectKey = '';
      let jiraIssueUrl = '';
      let externalIssueId: string | null = null;

      const existingExternalIssue = await this.prisma.jiraExternalIssue.findFirst({
        where: {
          projectId: input.projectId,
          jiraIssueKey: input.jiraIssueKey,
        },
      });

      if (existingExternalIssue) {
        jiraIssueId = existingExternalIssue.jiraIssueId;
        jiraProjectKey = existingExternalIssue.jiraProjectKey;
        jiraIssueUrl = existingExternalIssue.jiraIssueUrl;
        externalIssueId = existingExternalIssue.id;
      } else {
        const normalizedBase = connection.baseUrl.replace(/\/+$/, '');
        jiraIssueUrl = `${normalizedBase}/browse/${input.jiraIssueKey}`;
        jiraProjectKey = input.jiraIssueKey.split('-')[0] || '';
        jiraIssueId = input.jiraIssueKey;

        if (connection.connectionStatus === 'CONNECTED' && connection.encryptedCredentials) {
          try {
            const plainToken = await this.vault.decrypt(
              connection.encryptedCredentials,
              connection.id,
            );
            const remote = await this.jiraClient.getIssue({
              baseUrl: connection.baseUrl,
              deploymentType: connection.deploymentType,
              authenticationType: connection.authenticationType,
              accountIdentifier: connection.accountIdentifier,
              apiToken: plainToken,
              issueIdOrKey: input.jiraIssueKey,
              allowLocalhostForTesting: this.allowLocalhostForTesting,
            });
            jiraIssueId = remote.id;
          } catch {
            // keep derived
          }
        }
      }

      // 7. Supersede any existing active link for this failureCase
      const existingLink = await this.prisma.jiraIssueLink.findFirst({
        where: {
          projectId: input.projectId,
          failureCaseId: input.failureCaseId,
          isActive: true,
        },
      });

      // 8. Persist new JiraIssueLink
      const newLink = await this.prisma.jiraIssueLink.create({
        data: {
          projectId: input.projectId,
          failureCaseId: input.failureCaseId,
          bugReportId: input.bugReportId ?? null,
          defectClusterId: membership?.clusterId ?? null,
          externalIssueId,
          jiraConnectionId: connection.id,
          jiraProjectKey,
          jiraIssueId,
          jiraIssueKey: input.jiraIssueKey,
          jiraIssueUrl,
          linkReason: input.linkReason,
          linkSource: input.linkSource ?? 'USER_CONFIRMED_LINK',
          decision: 'USE_EXISTING',
          isActive: true,
          supersededById: null,
          metadataSnapshot: {
            linkedAt: new Date().toISOString(),
            previousLinkId: existingLink?.id ?? null,
          },
        },
      });

      if (existingLink) {
        await this.prisma.jiraIssueLink.update({
          where: { id: existingLink.id },
          data: {
            isActive: false,
            invalidationReason: `Superseded by link ${newLink.id}`,
            supersededById: newLink.id,
          },
        });
      }

      // 9. Audit Link Creation
      await this.prisma.jiraConnectionAudit.create({
        data: {
          connectionId: connection.id,
          projectId: input.projectId,
          eventType: 'EXISTING_ISSUE_LINKED',
          actor: 'USER',
          details: {
            linkId: newLink.id,
            jiraIssueKey: input.jiraIssueKey,
            jiraIssueId,
            failureCaseId: input.failureCaseId,
            bugReportId: input.bugReportId ?? null,
            defectClusterId: membership?.clusterId ?? null,
            linkSource: input.linkSource ?? 'USER_CONFIRMED_LINK',
            linkReason: input.linkReason,
          },
        },
      });

      return this.mapLinkToDto(newLink);
    } finally {
      releaseLock();
    }
  }

  /**
   * Retrieves an active Jira issue link for the specified failure or bug report context.
   */
  public async getIssueLink(rawInput: GetIssueLinkInputDto): Promise<JiraIssueLinkDto | null> {
    const input = getIssueLinkInputSchema.parse(rawInput);

    const project = await this.prisma.project.findUnique({
      where: { id: input.projectId },
    });
    if (!project) {
      throw new ProjectNotFoundError(input.projectId);
    }

    const whereClause: {
      projectId: string;
      failureCaseId: string;
      bugReportId?: string;
      isActive: boolean;
    } = {
      projectId: input.projectId,
      failureCaseId: input.failureCaseId,
      isActive: true,
    };

    if (input.bugReportId) {
      whereClause.bugReportId = input.bugReportId;
    }

    const link = await this.prisma.jiraIssueLink.findFirst({
      where: whereClause,
      orderBy: { createdAt: 'desc' },
    });

    return link ? this.mapLinkToDto(link) : null;
  }

  /**
   * Marks an existing link as inactive with an explicit invalidation reason.
   */
  public async invalidateLink(linkId: string, reason: string): Promise<JiraIssueLinkDto> {
    const link = await this.prisma.jiraIssueLink.findUnique({
      where: { id: linkId },
    });
    if (!link) {
      throw new JiraLinkNotFoundError(linkId);
    }

    const updated = await this.prisma.jiraIssueLink.update({
      where: { id: linkId },
      data: {
        isActive: false,
        invalidationReason: reason,
      },
    });

    await this.prisma.jiraConnectionAudit.create({
      data: {
        connectionId: link.jiraConnectionId,
        projectId: link.projectId,
        eventType: 'LINK_INVALIDATED',
        actor: 'SYSTEM',
        details: {
          linkId,
          jiraIssueKey: link.jiraIssueKey,
          reason,
        },
      },
    });

    return this.mapLinkToDto(updated);
  }

  /**
   * Validates external Jira issue existence and detects key renames or 404 deletions.
   */
  private async validateExternalIssueIdentity(
    connection: {
      id: string;
      baseUrl: string;
      deploymentType: any;
      authenticationType: any;
      accountIdentifier: string;
      encryptedCredentials?: string | null;
      connectionStatus: string;
    } | null,
    issueKey: string,
    storedIssueId: string,
  ): Promise<{ isDeleted: boolean; keyChanged: boolean; currentKey?: string }> {
    if (
      !connection ||
      connection.connectionStatus !== 'CONNECTED' ||
      !connection.encryptedCredentials
    ) {
      return { isDeleted: false, keyChanged: false };
    }

    try {
      const plainToken = await this.vault.decrypt(connection.encryptedCredentials, connection.id);
      const remote = await this.jiraClient.getIssue({
        baseUrl: connection.baseUrl,
        deploymentType: connection.deploymentType,
        authenticationType: connection.authenticationType,
        accountIdentifier: connection.accountIdentifier,
        apiToken: plainToken,
        issueIdOrKey: storedIssueId || issueKey,
        allowLocalhostForTesting: this.allowLocalhostForTesting,
      });

      if (remote.key && remote.key !== issueKey) {
        return { isDeleted: false, keyChanged: true, currentKey: remote.key };
      }
      return { isDeleted: false, keyChanged: false };
    } catch (err: unknown) {
      if (
        (err instanceof JiraConnectionFailedError && err.httpStatus === 404) ||
        (err instanceof Error && err.message.includes('404'))
      ) {
        return { isDeleted: true, keyChanged: false };
      }
      return { isDeleted: false, keyChanged: false };
    }
  }

  private async invalidateLinkRecord(
    linkId: string,
    reason: string,
    connectionId?: string,
    projectId?: string,
  ): Promise<void> {
    await this.prisma.jiraIssueLink.update({
      where: { id: linkId },
      data: {
        isActive: false,
        invalidationReason: reason,
      },
    });

    if (connectionId && projectId) {
      await this.prisma.jiraConnectionAudit.create({
        data: {
          connectionId,
          projectId,
          eventType: 'LINK_INVALIDATED',
          actor: 'SYSTEM',
          details: { linkId, reason },
        },
      });
      await this.prisma.jiraConnectionAudit.create({
        data: {
          connectionId,
          projectId,
          eventType: 'EXTERNAL_ISSUE_MISSING',
          actor: 'SYSTEM',
          details: { linkId, reason },
        },
      });
    }
  }

  private async updateLinkIssueKey(
    linkId: string,
    currentKey: string,
    connection: { baseUrl: string } | null,
  ): Promise<void> {
    const normalizedBase = connection?.baseUrl.replace(/\/+$/, '') ?? '';
    const newUrl = normalizedBase ? `${normalizedBase}/browse/${currentKey}` : undefined;

    await this.prisma.jiraIssueLink.update({
      where: { id: linkId },
      data: {
        jiraIssueKey: currentKey,
        ...(newUrl ? { jiraIssueUrl: newUrl } : {}),
      },
    });
  }

  private async recordDuplicateFoundAudit(
    connection: { id: string } | null,
    projectId: string,
    jiraIssueKey: string,
    matchLevel: string,
    clusterKey?: string,
  ): Promise<void> {
    if (!connection) return;
    await this.prisma.jiraConnectionAudit.create({
      data: {
        connectionId: connection.id,
        projectId,
        eventType: 'DUPLICATE_MATCH_FOUND',
        actor: 'SYSTEM',
        details: {
          jiraIssueKey,
          matchLevel,
          clusterKey: clusterKey ?? null,
        },
      },
    });
  }

  private mapLinkToDto(link: JiraIssueLink): JiraIssueLinkDto {
    return {
      id: link.id,
      projectId: link.projectId,
      failureCaseId: link.failureCaseId,
      bugReportId: link.bugReportId,
      defectClusterId: link.defectClusterId,
      externalIssueId: link.externalIssueId,
      jiraConnectionId: link.jiraConnectionId,
      jiraProjectKey: link.jiraProjectKey,
      jiraIssueId: link.jiraIssueId,
      jiraIssueKey: link.jiraIssueKey,
      jiraIssueUrl: link.jiraIssueUrl,
      linkReason: link.linkReason,
      linkSource: link.linkSource as any,
      ruleId: link.ruleId,
      decision: link.decision as any,
      isActive: link.isActive,
      invalidationReason: link.invalidationReason,
      supersededById: link.supersededById,
      metadataSnapshot: (link.metadataSnapshot as Record<string, unknown>) ?? null,
      createdAt: link.createdAt.toISOString(),
      updatedAt: link.updatedAt.toISOString(),
    };
  }

  private mapExternalIssueToDto(issue: JiraExternalIssue): any {
    return {
      id: issue.id,
      projectId: issue.projectId,
      failureCaseId: issue.failureCaseId,
      bugReportId: issue.bugReportId,
      connectionId: issue.connectionId,
      jiraProjectId: issue.jiraProjectId,
      jiraProjectKey: issue.jiraProjectKey,
      jiraIssueId: issue.jiraIssueId,
      jiraIssueKey: issue.jiraIssueKey,
      jiraIssueUrl: issue.jiraIssueUrl,
      issueType: issue.issueType,
      summary: issue.summary,
      priority: issue.priority,
      creationStatus: issue.creationStatus,
      requestFingerprint: issue.requestFingerprint,
      metadataSnapshot: (issue.metadataSnapshot as Record<string, unknown>) ?? null,
      createdBy: issue.createdBy,
      createdAt: issue.createdAt.toISOString(),
      updatedAt: issue.updatedAt.toISOString(),
    };
  }
}
