/**
 * @file packages/core/src/sources/changes/change-detector.ts
 * Deterministic O(B + C) repository state comparator and 1-to-1 content hash rename detector.
 */

import type {
  RepositoryFileChangeDto,
  FileChangeType,
  RepositoryFileDto,
} from '@ai-quality/contracts';
import type { RepositorySnapshotFile } from '@prisma/client';

export interface ComparisonInput {
  readonly baselineFiles: readonly RepositorySnapshotFile[];
  readonly currentFiles: readonly RepositoryFileDto[];
  readonly importsByPath?: Map<string, readonly string[]>; // file -> files that import this file
}

export interface ComparisonResult {
  readonly totalChanges: number;
  readonly addedCount: number;
  readonly modifiedCount: number;
  readonly deletedCount: number;
  readonly renamedCount: number;
  readonly unchangedCount: number;
  readonly changesByClassification: Record<string, number>;
  readonly changesByLanguage: Record<string, number>;
  readonly changes: readonly RepositoryFileChangeDto[];
}

export class ChangeDetector {
  /**
   * Compares baseline snapshot files against current indexed repository files deterministically.
   */
  static compare(input: ComparisonInput): ComparisonResult {
    const baselineMap = new Map<string, RepositorySnapshotFile>();
    for (const bf of input.baselineFiles) {
      baselineMap.set(bf.relativePath, bf);
    }

    const currentMap = new Map<string, RepositoryFileDto>();
    for (const cf of input.currentFiles) {
      currentMap.set(cf.relativePath, cf);
    }

    const rawDeleted: RepositorySnapshotFile[] = [];
    const rawAdded: RepositoryFileDto[] = [];
    const changes: RepositoryFileChangeDto[] = [];

    let unchangedCount = 0;

    // 1. Process all Current files (detect Unchanged, Modified, and Added candidates)
    for (const [relPath, cur] of currentMap.entries()) {
      const base = baselineMap.get(relPath);
      if (!base) {
        rawAdded.push(cur);
      } else {
        if (base.contentHash === cur.contentHash) {
          unchangedCount++;
        } else {
          changes.push({
            changeType: 'MODIFIED',
            previousPath: base.relativePath,
            currentPath: cur.relativePath,
            previousHash: base.contentHash,
            currentHash: cur.contentHash,
            language: cur.language,
            classification: cur.classification,
            directImporters: input.importsByPath?.get(cur.relativePath) ?? [],
          });
        }
      }
    }

    // 2. Process Baseline files (detect Deleted candidates)
    for (const [relPath, base] of baselineMap.entries()) {
      if (!currentMap.has(relPath)) {
        rawDeleted.push(base);
      }
    }

    // 3. Exact 1-to-1 Content Hash Rename Detection
    const deletedByHash = new Map<string, RepositorySnapshotFile[]>();
    for (const d of rawDeleted) {
      if (d.contentHash) {
        const list = deletedByHash.get(d.contentHash) ?? [];
        list.push(d);
        deletedByHash.set(d.contentHash, list);
      }
    }

    const addedByHash = new Map<string, RepositoryFileDto[]>();
    for (const a of rawAdded) {
      if (a.contentHash) {
        const list = addedByHash.get(a.contentHash) ?? [];
        list.push(a);
        addedByHash.set(a.contentHash, list);
      }
    }

    const matchedDeletedPaths = new Set<string>();
    const matchedAddedPaths = new Set<string>();

    for (const [hash, deletedGroup] of deletedByHash.entries()) {
      const addedGroup = addedByHash.get(hash);
      // Strict 1-to-1 match: exactly 1 deleted file and 1 added file share the exact same hash
      if (deletedGroup.length === 1 && addedGroup && addedGroup.length === 1) {
        const d = deletedGroup[0]!;
        const a = addedGroup[0]!;

        matchedDeletedPaths.add(d.relativePath);
        matchedAddedPaths.add(a.relativePath);

        changes.push({
          changeType: 'RENAMED',
          previousPath: d.relativePath,
          currentPath: a.relativePath,
          previousHash: d.contentHash,
          currentHash: a.contentHash,
          language: a.language ?? d.language,
          classification: a.classification ?? d.classification,
          directImporters: input.importsByPath?.get(a.relativePath) ?? [],
        });
      }
    }

    // 4. Record unmatched Added files
    for (const a of rawAdded) {
      if (!matchedAddedPaths.has(a.relativePath)) {
        changes.push({
          changeType: 'ADDED',
          previousPath: null,
          currentPath: a.relativePath,
          previousHash: null,
          currentHash: a.contentHash,
          language: a.language,
          classification: a.classification,
          directImporters: input.importsByPath?.get(a.relativePath) ?? [],
        });
      }
    }

    // 5. Record unmatched Deleted files
    for (const d of rawDeleted) {
      if (!matchedDeletedPaths.has(d.relativePath)) {
        changes.push({
          changeType: 'DELETED',
          previousPath: d.relativePath,
          currentPath: null,
          previousHash: d.contentHash,
          currentHash: null,
          language: d.language,
          classification: d.classification,
          directImporters: input.importsByPath?.get(d.relativePath) ?? [],
        });
      }
    }

    // Sort changes deterministically: changeType priority, then currentPath/previousPath
    const typeOrder: Record<FileChangeType, number> = {
      MODIFIED: 1,
      ADDED: 2,
      DELETED: 3,
      RENAMED: 4,
      UNCHANGED: 5,
    };

    changes.sort((a, b) => {
      const orderA = typeOrder[a.changeType] ?? 99;
      const orderB = typeOrder[b.changeType] ?? 99;
      if (orderA !== orderB) return orderA - orderB;
      const pathA = a.currentPath ?? a.previousPath ?? '';
      const pathB = b.currentPath ?? b.previousPath ?? '';
      return pathA.localeCompare(pathB);
    });

    let addedCount = 0;
    let modifiedCount = 0;
    let deletedCount = 0;
    let renamedCount = 0;

    const changesByClassification: Record<string, number> = {};
    const changesByLanguage: Record<string, number> = {};

    for (const c of changes) {
      if (c.changeType === 'ADDED') addedCount++;
      else if (c.changeType === 'MODIFIED') modifiedCount++;
      else if (c.changeType === 'DELETED') deletedCount++;
      else if (c.changeType === 'RENAMED') renamedCount++;

      if (c.classification) {
        changesByClassification[c.classification] =
          (changesByClassification[c.classification] ?? 0) + 1;
      }
      if (c.language) {
        changesByLanguage[c.language] = (changesByLanguage[c.language] ?? 0) + 1;
      }
    }

    return {
      totalChanges: changes.length,
      addedCount,
      modifiedCount,
      deletedCount,
      renamedCount,
      unchangedCount,
      changesByClassification,
      changesByLanguage,
      changes,
    };
  }
}
