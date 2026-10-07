/**
 * @file packages/core/src/quick-fix/rules/blast-radius-calculator.ts
 * Queries repository imports and symbols to compute the blast radius of candidate fix files.
 */

import type { PrismaClient } from '@prisma/client';
import type { QuickFixBlastRadius } from '../quick-fix-types.js';

export interface BlastRadiusCalculatorOptions {
  readonly prisma?: PrismaClient;
}

export class BlastRadiusCalculator {
  private readonly prisma?: PrismaClient;

  // Prohibited/high-risk modules that flag highRiskDependents
  private static readonly HIGH_RISK_PATH_REGEX =
    /(?:auth|security|billing|payment|checkout|crypto|permissions|rbac|api|routes)/i;

  constructor(options: BlastRadiusCalculatorOptions = {}) {
    this.prisma = options.prisma;
  }

  /**
   * Computes the blast radius for candidate files using repository imports.
   */
  async computeBlastRadius(
    sourceId: string | null | undefined,
    candidateFiles: readonly string[],
  ): Promise<QuickFixBlastRadius> {
    if (!candidateFiles || candidateFiles.length === 0) {
      return {
        totalDependentFiles: 0,
        totalDependentSymbols: 0,
        affectedModules: [],
        affectedEndpoints: [],
        dependencyGraphDepth: 0,
        highRiskDependents: [],
      };
    }

    const normalizedCandidateFiles = candidateFiles.map(f =>
      f.replace(/\\/g, '/').replace(/^\/+/, ''),
    );

    const dependentFileSet = new Set<string>();
    const highRiskDependentsSet = new Set<string>();
    const affectedModulesSet = new Set<string>();
    let totalDependentSymbols = 0;

    if (this.prisma && sourceId) {
      try {
        // Query imports where resolvedRelativePath or specifier matches candidate files
        const imports = await this.prisma.repositoryImport.findMany({
          where: {
            repositoryFile: { sourceId },
            OR: [
              { resolvedRelativePath: { in: normalizedCandidateFiles } },
              {
                specifier: {
                  in: normalizedCandidateFiles.map(f => f.replace(/\.[^.]+$/, '')),
                },
              },
            ],
          },
          include: {
            repositoryFile: {
              select: {
                relativePath: true,
                _count: {
                  select: { symbols: true },
                },
              },
            },
          },
        });

        for (const imp of imports) {
          const importingPath = imp.repositoryFile.relativePath.replace(/\\/g, '/');
          // Don't count the candidate file itself as an external dependent
          if (!normalizedCandidateFiles.includes(importingPath)) {
            dependentFileSet.add(importingPath);
            totalDependentSymbols += imp.repositoryFile._count.symbols;

            if (BlastRadiusCalculator.HIGH_RISK_PATH_REGEX.test(importingPath)) {
              highRiskDependentsSet.add(importingPath);
            }

            const moduleName = importingPath.split('/')[0] || 'root';
            affectedModulesSet.add(moduleName);
          }
        }
      } catch {
        // Fallback gracefully if database or repository index is not accessible
      }
    }

    // Add candidate files' own modules to affected modules
    for (const file of normalizedCandidateFiles) {
      const parts = file.split('/');
      if (parts.length > 1 && parts[0]) {
        affectedModulesSet.add(parts[0]);
      }
    }

    return {
      totalDependentFiles: dependentFileSet.size,
      totalDependentSymbols,
      affectedModules: Array.from(affectedModulesSet).sort(),
      affectedEndpoints: [],
      dependencyGraphDepth: dependentFileSet.size > 0 ? 1 : 0,
      highRiskDependents: Array.from(highRiskDependentsSet).sort(),
    };
  }
}
