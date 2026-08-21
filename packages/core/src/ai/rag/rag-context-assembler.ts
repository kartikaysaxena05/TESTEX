/**
 * @file packages/core/src/ai/rag/rag-context-assembler.ts
 * Gathers multi-source candidate context items from authoritative V3 Requirement Intelligence,
 * V2 Repository Intelligence, and Phase 45 Vector Retrieval.
 */

import type { PrismaClient } from '@prisma/client';
import type {
  RagContextItemDto,
  RagRetrievalLimitsDto,
  RequirementContextPurpose,
  RagAuthorityTier,
} from '@ai-quality/contracts';
import { getPrismaClient, DatabaseError } from '../../database/index.js';
import { RagProjectMismatchError, RagRequirementNotFoundError } from './rag-errors.js';
import { RAG_AUTHORITY_TIERS, RAG_REASON_CODES, DEFAULT_RAG_LIMITS } from './rag-types.js';
import { RequirementQueryBuilder } from './requirement-query-builder.js';
import { VectorSearchService } from '../vector-search-service.js';

export interface AssembleContextInput {
  readonly projectId: string;
  readonly requirementId: string;
  readonly purpose?: RequirementContextPurpose;
  readonly limits?: RagRetrievalLimitsDto;
}

export interface RawAssembledContext {
  readonly primaryRequirement: {
    readonly id: string;
    readonly requirementKey: string;
    readonly title: string;
    readonly originalText: string;
    readonly type: string;
    readonly priority: string;
    readonly status: string;
    readonly versionNumber: number;
    readonly updatedAt: Date;
  };
  readonly items: readonly RagContextItemDto[];
  readonly sourcesConsulted: readonly string[];
  readonly warnings: readonly string[];
  readonly vectorSearchDurationMs?: number;
}

export class RagContextAssembler {
  private readonly customPrisma?: PrismaClient;
  private readonly vectorSearchService?: VectorSearchService;

  constructor(options?: { prisma?: PrismaClient; vectorSearchService?: VectorSearchService }) {
    this.customPrisma = options?.prisma;
    this.vectorSearchService = options?.vectorSearchService;
  }

  private getPrisma(): PrismaClient {
    const client = this.customPrisma ?? getPrismaClient();
    if (!client) {
      throw new DatabaseError(
        'Database client unavailable during RAG context assembly.',
        'DATABASE_UNAVAILABLE',
      );
    }
    return client;
  }

  /**
   * Assembles candidate context items from all authoritative project sources.
   */
  public async assembleContext(
    input: AssembleContextInput,
    signal?: AbortSignal,
  ): Promise<RawAssembledContext> {
    const prisma = this.getPrisma();
    const effectiveLimits: Required<RagRetrievalLimitsDto> = {
      ...DEFAULT_RAG_LIMITS,
      ...input.limits,
    };

    const sourcesConsulted: string[] = [];
    const warnings: string[] = [];

    // 1. Fetch Authoritative Primary Requirement with V3 Relations
    sourcesConsulted.push('REQUIREMENT');
    const req = await prisma.requirement.findUnique({
      where: { id: input.requirementId },
      include: {
        provenance: {
          include: {
            document: true,
          },
        },
        representation: true,
        metadata: true,
        qualityAnalysis: true,
        qualityFindings: {
          where: { reviewStatus: 'OPEN' },
          take: 10,
        },
        outgoingRelationships: {
          include: {
            targetRequirement: true,
          },
        },
        incomingRelationships: {
          include: {
            sourceRequirement: true,
          },
        },
        repositoryEvidence: true,
        versions: {
          orderBy: { versionNumber: 'desc' },
          take: 1,
        },
      },
    });

    if (!req) {
      throw new RagRequirementNotFoundError(input.requirementId);
    }

    // Strict Project Authorization & Boundary Enforcement
    if (req.projectId !== input.projectId) {
      throw new RagProjectMismatchError(
        `Requirement "${input.requirementId}" does not belong to project "${input.projectId}".`,
      );
    }

    const currentVersionNumber = req.versions[0]?.versionNumber ?? 1;

    const rawItems: RagContextItemDto[] = [];

    // --------------------------------------------------------------------------
    // Tier 1: Primary Requirement State (Direct Authoritative Grounding)
    // --------------------------------------------------------------------------
    const primaryContextText = [
      `REQUIREMENT: ${req.requirementKey}`,
      `TITLE: ${req.title}`,
      `STATUS: ${req.status}`,
      `TYPE: ${req.type}`,
      `PRIORITY: ${req.priority}`,
      `CONTENT:`,
      req.originalText,
    ].join('\n');

    rawItems.push({
      id: `primary-${req.id}`,
      sourceType: 'REQUIREMENT',
      sourceId: req.id,
      authorityTier: RAG_AUTHORITY_TIERS.PRIMARY_REQUIREMENT,
      title: req.title,
      text: primaryContextText,
      relevance: {
        rank: 1,
        similarityScore: 1.0,
        distance: 0.0,
        reasonCodes: [RAG_REASON_CODES.PRIMARY_REQUIREMENT],
      },
      provenance: {
        projectId: req.projectId,
        requirementId: req.id,
        requirementKey: req.requirementKey,
        versionNumber: currentVersionNumber,
      },
      state: {
        stale: false,
        confirmed: true,
        isUntrustedContext: true,
      },
      metadata: {
        type: req.type,
        priority: req.priority,
        status: req.status,
      },
    });

    // --------------------------------------------------------------------------
    // Tier 2: Source Provenance Context
    // --------------------------------------------------------------------------
    if (req.provenance) {
      sourcesConsulted.push('REQUIREMENT_PROVENANCE');
      const prov = req.provenance;
      const provParts: string[] = [
        `SOURCE KIND: ${prov.sourceKind}`,
        `LOCATION: ${prov.locationKind}`,
      ];

      if (prov.document?.originalFileName) {
        provParts.push(`DOCUMENT FILE: ${prov.document.originalFileName}`);
      }
      if (prov.sectionPath) {
        provParts.push(`SECTION: ${prov.sectionPath}`);
      }
      if (prov.lineStart !== null && prov.lineEnd !== null) {
        provParts.push(`LINES: ${prov.lineStart}-${prov.lineEnd}`);
      }
      if (prov.sourceText) {
        provParts.push(`ORIGINAL EXCERPT:\n${prov.sourceText}`);
      }

      rawItems.push({
        id: `prov-${prov.id}`,
        sourceType: 'REQUIREMENT_SOURCE',
        sourceId: prov.id,
        authorityTier: RAG_AUTHORITY_TIERS.SOURCE_PROVENANCE,
        title: prov.document?.originalFileName ?? `Provenance (${prov.sourceKind})`,
        text: provParts.join('\n'),
        relevance: {
          rank: 2,
          reasonCodes: [RAG_REASON_CODES.DIRECT_SOURCE_PROVENANCE],
        },
        provenance: {
          projectId: req.projectId,
          requirementId: req.id,
          requirementKey: req.requirementKey,
          versionNumber: currentVersionNumber,
          documentId: prov.documentId ?? undefined,
          documentFileName: prov.document?.originalFileName ?? undefined,
          sectionId: prov.sectionId ?? undefined,
          blockId: prov.sourceBlockId ?? undefined,
        },
        state: {
          stale: false,
          confirmed: true,
          isUntrustedContext: true,
        },
      });
    }

    // --------------------------------------------------------------------------
    // Tier 3: Structured Representation & Normalization Form
    // --------------------------------------------------------------------------
    if (req.representation) {
      sourcesConsulted.push('STRUCTURED_REQUIREMENT');
      const rep = req.representation;
      const repParts: string[] = [];

      if (rep.normalizedText) {
        repParts.push(`NORMALIZED FORM:\n${rep.normalizedText}`);
      }
      if (rep.actor) {
        repParts.push(`ACTOR: ${rep.actor}`);
      }
      if (rep.modality) {
        repParts.push(`MODALITY: ${rep.modality}`);
      }
      if (rep.action) {
        repParts.push(`ACTION: ${rep.action}`);
      }
      if (rep.object) {
        repParts.push(`OBJECT: ${rep.object}`);
      }
      if (rep.expectedOutcome) {
        repParts.push(`EXPECTED OUTCOME: ${rep.expectedOutcome}`);
      }
      if (rep.negated) {
        repParts.push(`NEGATION: TRUE`);
      }

      const isStale = rep.normalizationStatus === 'STALE';

      rawItems.push({
        id: `rep-${rep.id}`,
        sourceType: 'STRUCTURED_REQUIREMENT',
        sourceId: rep.id,
        authorityTier: RAG_AUTHORITY_TIERS.STRUCTURED_INTELLIGENCE,
        title: 'Structured Requirement Representation',
        text: repParts.join('\n'),
        relevance: {
          rank: 3,
          reasonCodes: [RAG_REASON_CODES.STRUCTURED_REPRESENTATION],
        },
        provenance: {
          projectId: req.projectId,
          requirementId: req.id,
          requirementKey: req.requirementKey,
          versionNumber: currentVersionNumber,
        },
        state: {
          stale: isStale,
          confirmed: rep.reviewStatus === 'REVIEWED',
          isUntrustedContext: true,
        },
      });
    }

    // --------------------------------------------------------------------------
    // Tier 3: Classification & Domain Metadata
    // --------------------------------------------------------------------------
    if (req.metadata) {
      sourcesConsulted.push('REQUIREMENT_METADATA');
      const meta = req.metadata;
      const metaParts: string[] = [`CATEGORY: ${meta.category}`];

      if (meta.subCategory) {
        metaParts.push(`SUB-CATEGORY: ${meta.subCategory}`);
      }
      if (meta.domain) {
        metaParts.push(`DOMAIN: ${meta.domain}`);
      }
      if (meta.module) {
        metaParts.push(`MODULE: ${meta.module}`);
      }
      if (meta.businessCapability) {
        metaParts.push(`CAPABILITY: ${meta.businessCapability}`);
      }
      if (meta.riskLevel && meta.riskLevel !== 'UNSPECIFIED') {
        metaParts.push(`RISK LEVEL: ${meta.riskLevel}`);
      }
      if (meta.complianceRelevant && meta.complianceStandards) {
        const standards = Array.isArray(meta.complianceStandards)
          ? (meta.complianceStandards as string[]).join(', ')
          : JSON.stringify(meta.complianceStandards);
        metaParts.push(`COMPLIANCE STANDARDS: ${standards}`);
      }

      rawItems.push({
        id: `meta-${meta.id}`,
        sourceType: 'CLASSIFICATION',
        sourceId: meta.id,
        authorityTier: RAG_AUTHORITY_TIERS.STRUCTURED_INTELLIGENCE,
        title: 'Classification & Metadata',
        text: metaParts.join('\n'),
        relevance: {
          rank: 4,
          reasonCodes: [RAG_REASON_CODES.CLASSIFICATION_METADATA],
        },
        provenance: {
          projectId: req.projectId,
          requirementId: req.id,
          requirementKey: req.requirementKey,
          versionNumber: currentVersionNumber,
        },
        state: {
          stale: false,
          confirmed: meta.reviewStatus === 'REVIEWED',
          isUntrustedContext: true,
        },
      });
    }

    // --------------------------------------------------------------------------
    // Tier 3: Quality & Testability Findings
    // --------------------------------------------------------------------------
    if (req.qualityAnalysis) {
      sourcesConsulted.push('QUALITY_ANALYSIS');
      const qa = req.qualityAnalysis;
      const qaParts: string[] = [`TESTABILITY STATUS: ${qa.testabilityStatus}`];
      if (qa.qualityScore !== null) {
        qaParts.push(`QUALITY SCORE: ${qa.qualityScore}/100`);
      }

      if (req.qualityFindings && req.qualityFindings.length > 0) {
        qaParts.push(`OPEN FINDINGS:`);
        for (const f of req.qualityFindings) {
          qaParts.push(`- [${f.severity}] (${f.code}) ${f.message}`);
          if (f.suggestedClarification) {
            qaParts.push(`  Clarification: ${f.suggestedClarification}`);
          }
        }
      }

      rawItems.push({
        id: `qa-${qa.id}`,
        sourceType: 'QUALITY_FINDING',
        sourceId: qa.id,
        authorityTier: RAG_AUTHORITY_TIERS.STRUCTURED_INTELLIGENCE,
        title: 'Quality & Testability Analysis',
        text: qaParts.join('\n'),
        relevance: {
          rank: 5,
          reasonCodes: [RAG_REASON_CODES.QUALITY_FINDING_CONTEXT],
        },
        provenance: {
          projectId: req.projectId,
          requirementId: req.id,
          requirementKey: req.requirementKey,
          versionNumber: currentVersionNumber,
        },
        state: {
          stale: false,
          confirmed: true,
          isUntrustedContext: true,
        },
      });
    }

    // --------------------------------------------------------------------------
    // Tier 4 & 7: Requirement Relationships (Dependencies, Conflicts, Refines)
    // --------------------------------------------------------------------------
    sourcesConsulted.push('REQUIREMENT_RELATIONSHIPS');
    const allRel = [
      ...req.outgoingRelationships.map(r => ({
        ...r,
        direction: 'OUTGOING' as const,
        target: r.targetRequirement,
      })),
      ...req.incomingRelationships.map(r => ({
        ...r,
        direction: 'INCOMING' as const,
        target: r.sourceRequirement,
      })),
    ];

    let relCount = 0;
    for (const rel of allRel) {
      // Exclude rejected relationships
      if (rel.status === 'REJECTED') {
        continue;
      }

      if (relCount >= effectiveLimits.maxRelationshipDepth * 10) {
        break;
      }

      const isConfirmed = rel.status === 'CONFIRMED';
      const tier: RagAuthorityTier = isConfirmed
        ? RAG_AUTHORITY_TIERS.CONFIRMED_RELATIONSHIP
        : RAG_AUTHORITY_TIERS.PROPOSED_CANDIDATE_CONTEXT;

      const reasonCode = isConfirmed
        ? rel.relationshipType === 'DEPENDS_ON'
          ? RAG_REASON_CODES.CONFIRMED_DEPENDENCY
          : RAG_REASON_CODES.CONFIRMED_RELATIONSHIP
        : RAG_REASON_CODES.PROPOSED_RELATIONSHIP;

      const relText = [
        `RELATIONSHIP: ${rel.direction === 'OUTGOING' ? `${req.requirementKey} -> ${rel.target.requirementKey}` : `${rel.target.requirementKey} -> ${req.requirementKey}`}`,
        `TYPE: ${rel.relationshipType}`,
        `STATUS: ${rel.status}`,
        `RELATED REQUIREMENT TITLE: ${rel.target.title}`,
        `RELATED REQUIREMENT TEXT:`,
        rel.target.originalText,
      ].join('\n');

      rawItems.push({
        id: `rel-${rel.id}`,
        sourceType: 'RELATIONSHIP',
        sourceId: rel.id,
        authorityTier: tier,
        title: `${rel.relationshipType}: ${rel.target.requirementKey}`,
        text: relText,
        relevance: {
          rank: 10 + relCount,
          reasonCodes: [reasonCode],
        },
        provenance: {
          projectId: req.projectId,
          requirementId: rel.target.id,
          requirementKey: rel.target.requirementKey,
          relationshipId: rel.id,
          relationshipType: rel.relationshipType,
        },
        state: {
          stale: false,
          confirmed: isConfirmed,
          isUntrustedContext: true,
        },
      });
      relCount++;
    }

    // --------------------------------------------------------------------------
    // Tier 5 & 7: Repository Evidence (Files, Symbols, Routes)
    // --------------------------------------------------------------------------
    if (req.repositoryEvidence && req.repositoryEvidence.length > 0) {
      sourcesConsulted.push('REPOSITORY_EVIDENCE');
      let repoCount = 0;

      for (const ev of req.repositoryEvidence) {
        if (ev.status === 'REJECTED') {
          continue;
        }
        if (repoCount >= effectiveLimits.maxRepositoryItems) {
          break;
        }

        const isConfirmed = ev.status === 'CONFIRMED';
        const tier: RagAuthorityTier = isConfirmed
          ? RAG_AUTHORITY_TIERS.CONFIRMED_REPOSITORY_EVIDENCE
          : RAG_AUTHORITY_TIERS.PROPOSED_CANDIDATE_CONTEXT;

        const evParts: string[] = [
          `EVIDENCE TYPE: ${ev.evidenceType}`,
          `FILE PATH: ${ev.filePath}`,
        ];
        if (ev.symbolName) {
          evParts.push(`SYMBOL: ${ev.symbolName}`);
        }
        if (ev.lineStart !== null && ev.lineEnd !== null) {
          evParts.push(`LINES: ${ev.lineStart}-${ev.lineEnd}`);
        }
        evParts.push(`STATUS: ${ev.status}`);
        evParts.push(`MATCH METHOD: ${ev.matchMethod}`);

        rawItems.push({
          id: `repo-ev-${ev.id}`,
          sourceType: 'REPOSITORY_EVIDENCE',
          sourceId: ev.id,
          authorityTier: tier,
          title: ev.symbolName ? `${ev.filePath}#${ev.symbolName}` : ev.filePath,
          text: evParts.join('\n'),
          relevance: {
            rank: 20 + repoCount,
            reasonCodes: [RAG_REASON_CODES.CONFIRMED_REPOSITORY_EVIDENCE],
          },
          provenance: {
            projectId: req.projectId,
            requirementId: req.id,
            requirementKey: req.requirementKey,
            repositoryPath: ev.filePath,
            symbolId: ev.symbolId ?? undefined,
            repositorySnapshotId: ev.repositorySnapshotId ?? undefined,
          },
          state: {
            stale: false,
            confirmed: isConfirmed,
            isUntrustedContext: true,
          },
        });
        repoCount++;
      }
    }

    // --------------------------------------------------------------------------
    // Tier 6: Semantic Vector Retrieval (Phase 45 Vector Search)
    // --------------------------------------------------------------------------
    let vectorSearchDurationMs: number | undefined;

    if (this.vectorSearchService && effectiveLimits.maxRelatedRequirements > 0) {
      sourcesConsulted.push('VECTOR_INDEX');
      const queryText = RequirementQueryBuilder.buildQuery({
        title: req.title,
        originalText: req.originalText,
        normalizedText: req.representation?.normalizedText,
        actor: req.representation?.actor,
        action: req.representation?.action,
        category: req.metadata?.category,
      });

      const vecStart = performance.now();
      try {
        const matches = await this.vectorSearchService.searchSimilar(
          {
            projectId: req.projectId,
            queryText,
            topK: effectiveLimits.maxRelatedRequirements + 2, // Query extra to allow for self-match deduplication
            minimumSimilarity: effectiveLimits.minimumSimilarity,
          },
          signal,
        );

        vectorSearchDurationMs = Math.round(performance.now() - vecStart);

        let relatedAdded = 0;
        for (const m of matches) {
          // Self-match deduplication: never return primary requirement as a semantic match
          if (m.subjectId === req.id) {
            continue;
          }
          if (relatedAdded >= effectiveLimits.maxRelatedRequirements) {
            break;
          }

          if (m.subjectType === 'REQUIREMENT') {
            // Load requirement details to ensure project isolation & current text
            const relatedReq = await prisma.requirement.findUnique({
              where: { id: m.subjectId },
              include: { versions: { orderBy: { versionNumber: 'desc' }, take: 1 } },
            });

            if (
              relatedReq &&
              relatedReq.projectId === req.projectId &&
              relatedReq.status !== 'ARCHIVED'
            ) {
              const relText = [
                `RELATED REQUIREMENT: ${relatedReq.requirementKey}`,
                `TITLE: ${relatedReq.title}`,
                `TYPE: ${relatedReq.type}`,
                `CONTENT:`,
                relatedReq.originalText,
              ].join('\n');

              rawItems.push({
                id: `vec-req-${relatedReq.id}`,
                sourceType: 'RELATED_REQUIREMENT',
                sourceId: relatedReq.id,
                authorityTier: RAG_AUTHORITY_TIERS.SEMANTIC_RELATED_CONTEXT,
                title: `${relatedReq.requirementKey}: ${relatedReq.title}`,
                text: relText,
                relevance: {
                  rank: 30 + relatedAdded,
                  similarityScore: m.similarity,
                  distance: m.distance,
                  reasonCodes: [RAG_REASON_CODES.SEMANTIC_REQUIREMENT_MATCH],
                },
                provenance: {
                  projectId: req.projectId,
                  requirementId: relatedReq.id,
                  requirementKey: relatedReq.requirementKey,
                  versionNumber: relatedReq.versions[0]?.versionNumber ?? 1,
                },
                state: {
                  stale: false,
                  confirmed: true,
                  isUntrustedContext: true,
                },
              });
              relatedAdded++;
            }
          }
        }
      } catch (err) {
        warnings.push(
          `Vector search failed or index unavailable: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    // --------------------------------------------------------------------------
    // Tier 6: Document Extraction Context (Nearby extraction blocks/sections)
    // --------------------------------------------------------------------------
    if (req.provenance?.extractionId && effectiveLimits.maxDocumentItems > 0) {
      sourcesConsulted.push('DOCUMENT_EXTRACTION');
      try {
        const extraction = await prisma.requirementDocumentExtraction.findUnique({
          where: { id: req.provenance.extractionId },
          include: { requirementDocument: true },
        });

        if (extraction && extraction.projectId === req.projectId) {
          const sections = (
            Array.isArray(extraction.sections) ? extraction.sections : []
          ) as Array<{
            id: string;
            title: string;
            level: number;
            lineStart?: number;
            lineEnd?: number;
          }>;

          const targetSectionId = req.provenance.sectionId;
          const matchingSection = sections.find(s => s.id === targetSectionId) ?? sections[0];

          if (matchingSection) {
            rawItems.push({
              id: `doc-sec-${matchingSection.id}`,
              sourceType: 'DOCUMENT_SECTION',
              sourceId: matchingSection.id,
              authorityTier: RAG_AUTHORITY_TIERS.SEMANTIC_RELATED_CONTEXT,
              title: `Document Section: ${matchingSection.title}`,
              text: `SECTION: ${matchingSection.title} (Level ${matchingSection.level})\nDOCUMENT: ${extraction.requirementDocument.originalFileName}`,
              relevance: {
                rank: 40,
                reasonCodes: [RAG_REASON_CODES.NEARBY_DOCUMENT_SECTION],
              },
              provenance: {
                projectId: req.projectId,
                documentId: extraction.requirementDocumentId,
                documentFileName: extraction.requirementDocument.originalFileName,
                sectionId: matchingSection.id,
              },
              state: {
                stale: false,
                confirmed: true,
                isUntrustedContext: true,
              },
            });
          }
        }
      } catch (err) {
        warnings.push(
          `Document extraction retrieval failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    return {
      primaryRequirement: {
        id: req.id,
        requirementKey: req.requirementKey,
        title: req.title,
        originalText: req.originalText,
        type: req.type,
        priority: req.priority,
        status: req.status,
        versionNumber: currentVersionNumber,
        updatedAt: req.updatedAt,
      },
      items: rawItems,
      sourcesConsulted,
      warnings,
      vectorSearchDurationMs,
    };
  }
}
