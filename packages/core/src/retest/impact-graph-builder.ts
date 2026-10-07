/**
 * @file packages/core/src/retest/impact-graph-builder.ts
 * Builds the in-memory directed impact graph linking requirements, code, dependencies, and tests.
 */

import type { PrismaClient } from '@prisma/client';
import type {
  RetestImpactGraphDto,
  RetestImpactNodeDto,
  RetestImpactEdgeDto,
} from '@ai-quality/contracts';
import { RETEST_BOUNDS } from './retest-types.js';

export interface DependencyChain {
  readonly targetFile: string;
  readonly path: readonly string[];
  readonly depth: number;
}

export class ImpactGraphBuilder {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Constructs the impact graph and returns helper lookups for dependency and trace traversal.
   */
  async buildGraph(
    projectId: string,
    changedFiles: readonly string[],
    changedRequirements: readonly string[],
  ): Promise<{
    impactGraph: RetestImpactGraphDto;
    dependencyChainsByFile: Map<string, DependencyChain[]>;
    reqToFileMap: Map<string, Set<string>>;
    fileToReqMap: Map<string, Set<string>>;
    reqToTestsMap: Map<string, Set<string>>;
    testToReqsMap: Map<string, Set<string>>;
  }> {
    const nodesMap = new Map<string, RetestImpactNodeDto>();
    const edges: RetestImpactEdgeDto[] = [];

    // Helper to register nodes idempotently
    const addNode = (node: RetestImpactNodeDto) => {
      if (!nodesMap.has(node.id)) {
        nodesMap.set(node.id, node);
      }
    };

    // Helper to register edges
    const addEdge = (edge: RetestImpactEdgeDto) => {
      edges.push(edge);
    };

    // 1. Fetch all requirements for the project
    const requirements = await this.prisma.requirement.findMany({
      where: { projectId },
      include: {
        repositoryEvidence: true,
        testTraces: {
          include: {
            testCase: true,
          },
        },
      },
    });

    const reqToFileMap = new Map<string, Set<string>>();
    const fileToReqMap = new Map<string, Set<string>>();
    const reqToTestsMap = new Map<string, Set<string>>();
    const testToReqsMap = new Map<string, Set<string>>();

    for (const req of requirements) {
      const reqNodeId = `req:${req.id}`;
      addNode({
        id: reqNodeId,
        type: 'Requirement',
        label: req.requirementKey || req.title,
        entityId: req.id,
        metadata: {
          priority: req.priority,
          status: req.status,
        },
      });

      if (!reqToFileMap.has(req.id)) {
        reqToFileMap.set(req.id, new Set<string>());
      }
      if (!reqToTestsMap.has(req.id)) {
        reqToTestsMap.set(req.id, new Set<string>());
      }

      // Map evidence (Requirement <-> File/Symbol)
      for (const ev of req.repositoryEvidence) {
        if (!ev.filePath) continue;
        const normalPath = ev.filePath.replace(/^\/+/, '');
        reqToFileMap.get(req.id)!.add(normalPath);

        if (!fileToReqMap.has(normalPath)) {
          fileToReqMap.set(normalPath, new Set<string>());
        }
        fileToReqMap.get(normalPath)!.add(req.id);

        const fileNodeId = `file:${normalPath}`;
        addNode({
          id: fileNodeId,
          type: 'SourceFile',
          label: normalPath,
          entityId: ev.indexedFileId ?? undefined,
        });

        addEdge({
          from: fileNodeId,
          to: reqNodeId,
          type: 'IMPLEMENTS',
        });

        if (ev.symbolName) {
          const symNodeId = `sym:${normalPath}#${ev.symbolName}`;
          addNode({
            id: symNodeId,
            type: 'Symbol',
            label: ev.symbolName,
            entityId: ev.symbolId ?? undefined,
          });
          addEdge({
            from: symNodeId,
            to: reqNodeId,
            type: 'IMPLEMENTS',
          });
          addEdge({
            from: fileNodeId,
            to: symNodeId,
            type: 'CALLS',
          });
        }
      }

      // Map traces (Requirement <-> Test Case)
      for (const trace of req.testTraces) {
        const testCase = trace.testCase;
        if (!testCase) continue;

        reqToTestsMap.get(req.id)!.add(testCase.id);

        if (!testToReqsMap.has(testCase.id)) {
          testToReqsMap.set(testCase.id, new Set<string>());
        }
        testToReqsMap.get(testCase.id)!.add(req.id);

        const testNodeId = `test:${testCase.id}`;
        addNode({
          id: testNodeId,
          type: 'TestCase',
          label: testCase.testCaseKey || testCase.title,
          entityId: testCase.id,
          metadata: {
            priority: testCase.priority,
            status: testCase.status,
          },
        });

        addEdge({
          from: testNodeId,
          to: reqNodeId,
          type: 'TRACES_TO',
        });
      }
    }

    // 2. Fetch Project Source and Repository Files/Imports
    const projectSources = await this.prisma.projectSource.findMany({
      where: { projectId },
      select: { id: true },
    });
    const sourceIds = projectSources.map(s => s.id);

    const repositoryFiles = await this.prisma.repositoryFile.findMany({
      where: { sourceId: { in: sourceIds } },
      include: {
        imports: true,
      },
    });

    // Build incoming import graph: who imports file X?
    // importedFile -> list of files that import it
    const importedByMap = new Map<string, Set<string>>();

    for (const rf of repositoryFiles) {
      const importerPath = rf.relativePath.replace(/^\/+/, '');
      const importerNodeId = `file:${importerPath}`;
      addNode({
        id: importerNodeId,
        type: 'SourceFile',
        label: importerPath,
        entityId: rf.id,
      });

      for (const imp of rf.imports) {
        const importedPathRaw = imp.resolvedRelativePath || imp.specifier;
        if (!importedPathRaw) continue;
        const importedPath = importedPathRaw.replace(/^\/+/, '');

        if (!importedByMap.has(importedPath)) {
          importedByMap.set(importedPath, new Set<string>());
        }
        importedByMap.get(importedPath)!.add(importerPath);

        const importedNodeId = `file:${importedPath}`;
        addNode({
          id: importedNodeId,
          type: 'SourceFile',
          label: importedPath,
        });

        addEdge({
          from: importerNodeId,
          to: importedNodeId,
          type: 'IMPORTS',
        });
      }
    }

    // 3. Compute transitive dependency chains for all changed files
    const dependencyChainsByFile = new Map<string, DependencyChain[]>();

    for (const rawFile of changedFiles) {
      const file = rawFile.replace(/^\/+/, '');
      const chains: DependencyChain[] = [];
      const visited = new Set<string>([file]);

      // BFS/DFS queue: [currentFile, currentPath]
      const queue: Array<{ current: string; path: string[]; depth: number }> = [
        { current: file, path: [file], depth: 0 },
      ];

      while (queue.length > 0) {
        const { current, path, depth } = queue.shift()!;
        if (depth >= RETEST_BOUNDS.MAX_DEPENDENCY_DEPTH) {
          continue;
        }

        const importers = importedByMap.get(current);
        if (!importers) continue;

        for (const importer of importers) {
          if (visited.has(importer)) continue;
          visited.add(importer);

          const newPath = [...path, importer];
          const newDepth = depth + 1;
          chains.push({
            targetFile: importer,
            path: newPath,
            depth: newDepth,
          });

          queue.push({
            current: importer,
            path: newPath,
            depth: newDepth,
          });
        }
      }

      dependencyChainsByFile.set(file, chains);
    }

    // 4. Connect change indicators to nodes
    for (const changedReqIdOrKey of changedRequirements) {
      const matchedReq = requirements.find(
        r => r.id === changedReqIdOrKey || r.requirementKey === changedReqIdOrKey,
      );
      if (matchedReq) {
        addEdge({
          from: 'change:source',
          to: `req:${matchedReq.id}`,
          type: 'AFFECTS',
          label: 'Direct Requirement Change',
        });
      }
    }

    for (const changedFile of changedFiles) {
      const normalFile = changedFile.replace(/^\/+/, '');
      addEdge({
        from: 'change:source',
        to: `file:${normalFile}`,
        type: 'AFFECTS',
        label: 'Direct Code Change',
      });
    }

    const impactGraph: RetestImpactGraphDto = {
      nodes: Array.from(nodesMap.values()),
      edges,
    };

    return {
      impactGraph,
      dependencyChainsByFile,
      reqToFileMap,
      fileToReqMap,
      reqToTestsMap,
      testToReqsMap,
    };
  }
}
