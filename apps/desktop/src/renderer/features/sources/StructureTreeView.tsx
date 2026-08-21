/**
 * @file apps/desktop/src/renderer/features/sources/StructureTreeView.tsx
 * Accessible, hierarchical directory and file tree component.
 */

import React, { useState, useMemo } from 'react';
import type { SourceStructureEntryDto } from '@ai-quality/contracts';

export interface StructureTreeViewProps {
  readonly entries: readonly SourceStructureEntryDto[];
}

interface TreeNode {
  readonly path: string;
  readonly name: string;
  readonly kind: 'FILE' | 'DIRECTORY' | 'SYMLINK';
  readonly depth: number;
  readonly children: TreeNode[];
}

export function StructureTreeView({ entries }: StructureTreeViewProps): React.JSX.Element {
  // Set of expanded directory relative paths. Top-level directories expanded by default.
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    for (const entry of entries) {
      if (entry.kind === 'DIRECTORY' && entry.depth <= 1) {
        initial.add(entry.relativePath);
      }
    }
    return initial;
  });

  const toggleDirectory = (dirPath: string) => {
    setExpandedPaths(prev => {
      const next = new Set(prev);
      if (next.has(dirPath)) {
        next.delete(dirPath);
      } else {
        next.add(dirPath);
      }
      return next;
    });
  };

  // Build tree from flat list
  const rootNodes = useMemo(() => {
    const nodeMap = new Map<string, TreeNode>();
    const roots: TreeNode[] = [];

    for (const entry of entries) {
      const node: TreeNode = {
        path: entry.relativePath,
        name: entry.name,
        kind: entry.kind,
        depth: entry.depth,
        children: [],
      };
      nodeMap.set(entry.relativePath, node);

      const lastSlashIndex = entry.relativePath.lastIndexOf('/');
      if (lastSlashIndex === -1) {
        roots.push(node);
      } else {
        const parentPath = entry.relativePath.substring(0, lastSlashIndex);
        const parentNode = nodeMap.get(parentPath);
        if (parentNode) {
          parentNode.children.push(node);
        } else {
          roots.push(node);
        }
      }
    }

    return roots;
  }, [entries]);

  if (entries.length === 0) {
    return (
      <div
        style={{
          padding: 'var(--space-md)',
          color: 'var(--color-text-muted)',
          fontSize: 'var(--font-size-sm)',
          fontStyle: 'italic',
        }}
      >
        No files or directories discovered in this source root.
      </div>
    );
  }

  const renderNode = (node: TreeNode): React.JSX.Element => {
    const isDir = node.kind === 'DIRECTORY';
    const isSymlink = node.kind === 'SYMLINK';
    const isExpanded = isDir && expandedPaths.has(node.path);

    return (
      <div key={node.path} style={{ display: 'flex', flexDirection: 'column' }}>
        <div
          role={isDir ? 'button' : 'treeitem'}
          tabIndex={0}
          aria-expanded={isDir ? isExpanded : undefined}
          onClick={() => isDir && toggleDirectory(node.path)}
          onKeyDown={e => {
            if (isDir && (e.key === 'Enter' || e.key === ' ')) {
              e.preventDefault();
              toggleDirectory(node.path);
            }
          }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-xs)',
            padding: '2px var(--space-xs)',
            paddingLeft: `calc(var(--space-md) * ${node.depth - 1} + var(--space-xs))`,
            borderRadius: 'var(--radius-sm)',
            cursor: isDir ? 'pointer' : 'default',
            userSelect: 'none',
            fontSize: 'var(--font-size-xs)',
            fontFamily: 'var(--font-mono)',
            color: isDir ? 'var(--color-text)' : 'var(--color-text-muted)',
            lineHeight: 1.6,
          }}
        >
          {isDir ? (
            <span
              style={{
                width: '14px',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--color-text-muted)',
                fontWeight: 'bold',
              }}
            >
              {isExpanded ? '▾' : '▸'}
            </span>
          ) : (
            <span
              style={{
                width: '14px',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: isSymlink ? 'var(--color-info)' : 'var(--color-text-subtle)',
              }}
            >
              {isSymlink ? '↗' : '•'}
            </span>
          )}

          <span
            style={{
              fontWeight: isDir ? 600 : 400,
              color: isDir
                ? 'var(--color-text)'
                : isSymlink
                  ? 'var(--color-info)'
                  : 'var(--color-text)',
            }}
          >
            {`${node.name}${isDir ? '/' : ''}`}
          </span>

          {isSymlink && (
            <span
              style={{
                fontSize: '10px',
                padding: '0 4px',
                borderRadius: '2px',
                backgroundColor: 'var(--color-bg-subtle)',
                color: 'var(--color-text-muted)',
                marginLeft: 'var(--space-xs)',
              }}
            >
              symlink
            </span>
          )}
        </div>

        {isDir && isExpanded && node.children.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {node.children.map(child => renderNode(child))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div
      role="tree"
      aria-label="Repository File Structure"
      style={{
        display: 'flex',
        flexDirection: 'column',
        maxHeight: '400px',
        overflowY: 'auto',
        padding: 'var(--space-sm)',
        backgroundColor: 'var(--color-bg-subtle)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-md)',
      }}
    >
      {rootNodes.map(node => renderNode(node))}
    </div>
  );
}
