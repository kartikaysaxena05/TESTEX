/**
 * @file packages/core/src/sources/architecture/structural-area-detector.ts
 * Identifies high-level functional areas, subdirectories, and architectural modules.
 */

import type {
  StructuralAreaDto,
  StructuralAreaRole,
  RepositoryFileDto,
  DetectionEvidenceDto,
} from '@ai-quality/contracts';
import { MAX_STRUCTURAL_AREAS } from './architecture-types.js';

export class StructuralAreaDetector {
  /**
   * Discovers structural repository areas from indexed file paths and classifications.
   */
  detectAreas(indexedFiles: readonly RepositoryFileDto[]): readonly StructuralAreaDto[] {
    const areaMap = new Map<
      string,
      {
        name: string;
        role: StructuralAreaRole;
        fileCount: number;
        languages: Map<string, number>;
        evidence: DetectionEvidenceDto[];
      }
    >();

    const getRoleForArea = (dirName: string, relPath: string): StructuralAreaRole => {
      const lower = dirName.toLowerCase();
      const relLower = relPath.toLowerCase();

      if (
        lower === 'tests' ||
        lower === 'test' ||
        lower === '__tests__' ||
        relLower.includes('test')
      ) {
        return 'TEST';
      }
      if (lower === 'database' || lower === 'prisma' || lower === 'migrations' || lower === 'db') {
        return 'DATABASE';
      }
      if (lower === 'scripts' || lower === 'config' || lower === 'infra') {
        return 'CONFIGURATION';
      }
      if (
        lower === 'shared' ||
        lower === 'common' ||
        lower === 'docs' ||
        lower === 'documentation'
      ) {
        return 'SHARED';
      }
      if (
        lower === 'src' ||
        lower === 'app' ||
        lower === 'apps' ||
        lower === 'packages' ||
        lower === 'components' ||
        lower === 'services' ||
        lower === 'controllers' ||
        lower === 'models' ||
        lower === 'repositories' ||
        lower === 'domain' ||
        lower === 'api' ||
        lower === 'routes'
      ) {
        return 'APPLICATION';
      }
      return 'UNKNOWN';
    };

    for (const file of indexedFiles) {
      const parts = file.relativePath.split('/');
      if (parts.length <= 1) {
        // Root file
        continue;
      }

      // 1. First-level directory
      let areaKey = parts[0]!;
      let areaName = parts[0]!;

      // 2. Monorepo sub-apps (e.g. apps/web or packages/core)
      if ((areaKey === 'apps' || areaKey === 'packages') && parts.length > 2) {
        areaKey = `${parts[0]}/${parts[1]}`;
        areaName = parts[1]!;
      }
      // 3. Granular src subdirectories (e.g. src/controllers or src/services)
      else if (areaKey === 'src' && parts.length > 2) {
        const sub = parts[1]!;
        const subLower = sub.toLowerCase();
        if (
          subLower === 'controllers' ||
          subLower === 'services' ||
          subLower === 'repositories' ||
          subLower === 'models' ||
          subLower === 'domain' ||
          subLower === 'components' ||
          subLower === 'routes' ||
          subLower === 'api'
        ) {
          areaKey = `src/${sub}`;
          areaName = sub;
        }
      }

      let area = areaMap.get(areaKey);
      if (!area) {
        const role = getRoleForArea(areaName, areaKey);
        area = {
          name: areaName,
          role,
          fileCount: 0,
          languages: new Map(),
          evidence: [
            {
              kind: 'FILE_PATH',
              source: areaKey,
              detail: `Structural area: ${areaKey} (Role: ${role})`,
            },
          ],
        };
        areaMap.set(areaKey, area);
      }

      area.fileCount++;
      if (file.language) {
        area.languages.set(file.language, (area.languages.get(file.language) ?? 0) + 1);
      }
    }

    const result: StructuralAreaDto[] = [];
    for (const [relPath, area] of areaMap.entries()) {
      const sortedLangs = Array.from(area.languages.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([lang]) => lang);

      result.push({
        relativePath: relPath,
        name: area.name,
        role: area.role,
        fileCount: area.fileCount,
        primaryLanguages: sortedLangs.slice(0, 3),
        evidence: area.evidence,
      });
    }

    // Sort by file count descending
    result.sort((a, b) => b.fileCount - a.fileCount);
    return result.slice(0, MAX_STRUCTURAL_AREAS);
  }
}
