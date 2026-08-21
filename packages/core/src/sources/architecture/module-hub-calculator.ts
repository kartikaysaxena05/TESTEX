/**
 * @file packages/core/src/sources/architecture/module-hub-calculator.ts
 * Computes structural module import degrees (incoming / outgoing) from indexed repository imports.
 */

import type { ModuleHubDto } from '@ai-quality/contracts';
import { MAX_MODULE_HUBS } from './architecture-types.js';

export interface RawImportEdge {
  readonly fromRelativePath: string;
  readonly resolvedRelativePath: string | null;
}

export class ModuleHubCalculator {
  /**
   * Computes top module hubs by incoming and outgoing import counts.
   */
  static calculateHubs(importEdges: readonly RawImportEdge[]): readonly ModuleHubDto[] {
    const incomingMap = new Map<string, number>();
    const outgoingMap = new Map<string, number>();

    for (const edge of importEdges) {
      outgoingMap.set(edge.fromRelativePath, (outgoingMap.get(edge.fromRelativePath) ?? 0) + 1);

      if (edge.resolvedRelativePath) {
        incomingMap.set(
          edge.resolvedRelativePath,
          (incomingMap.get(edge.resolvedRelativePath) ?? 0) + 1,
        );
      }
    }

    const allPaths = new Set([...incomingMap.keys(), ...outgoingMap.keys()]);
    const hubs: ModuleHubDto[] = [];

    for (const p of allPaths) {
      const inc = incomingMap.get(p) ?? 0;
      const out = outgoingMap.get(p) ?? 0;
      if (inc > 0 || out > 0) {
        hubs.push({
          relativePath: p,
          incomingImports: inc,
          outgoingImports: out,
        });
      }
    }

    // Sort by incoming imports descending, then outgoing imports descending
    hubs.sort((a, b) => {
      if (b.incomingImports !== a.incomingImports) {
        return b.incomingImports - a.incomingImports;
      }
      return b.outgoingImports - a.outgoingImports;
    });

    return hubs.slice(0, MAX_MODULE_HUBS);
  }
}
