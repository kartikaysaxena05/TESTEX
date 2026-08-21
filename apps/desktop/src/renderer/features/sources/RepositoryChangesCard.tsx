/**
 * @file apps/desktop/src/renderer/features/sources/RepositoryChangesCard.tsx
 * UI Card displaying repository file changes against active baseline snapshot.
 */

import React from 'react';
import type { RepositoryChangeSetDto, FileChangeType } from '@ai-quality/contracts';
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardFooter,
  Badge,
  Button,
} from '../../ui/index.js';

export interface RepositoryChangesCardProps {
  readonly changeSet: RepositoryChangeSetDto | null;
  readonly isLoading?: boolean;
  readonly onRefreshChanges?: () => void;
}

export function RepositoryChangesCard({
  changeSet,
  isLoading = false,
  onRefreshChanges,
}: RepositoryChangesCardProps): React.JSX.Element {
  if (!changeSet || (!changeSet.baselineSnapshotId && changeSet.changes.length === 0)) {
    return (
      <Card className="card-repository-changes">
        <CardHeader>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              width: '100%',
            }}
          >
            <CardTitle>Repository Change Detection</CardTitle>
            <Badge variant="neutral">No Baseline</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div
            style={{
              padding: 'var(--space-md)',
              color: 'var(--color-text-secondary)',
              fontSize: 'var(--font-size-sm)',
            }}
          >
            No baseline snapshot is selected. Create or select a baseline snapshot above to track
            file modifications, additions, deletions, and renames.
          </div>
        </CardContent>
      </Card>
    );
  }

  const getChangeBadgeVariant = (
    type: FileChangeType,
  ): 'success' | 'warning' | 'danger' | 'info' | 'neutral' => {
    switch (type) {
      case 'ADDED':
        return 'success';
      case 'MODIFIED':
        return 'warning';
      case 'DELETED':
        return 'danger';
      case 'RENAMED':
        return 'info';
      default:
        return 'neutral';
    }
  };

  return (
    <Card className="card-repository-changes">
      <CardHeader>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            width: '100%',
          }}
        >
          <div>
            <CardTitle>Repository Change Detection</CardTitle>
            <div
              style={{
                fontSize: 'var(--font-size-sm)',
                color: 'var(--color-text-secondary)',
                marginTop: '2px',
              }}
            >
              Baseline: {changeSet.baselineLabel ?? changeSet.baselineSnapshotId?.substring(0, 8)} •
              Compared vs Current Index
            </div>
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-xs)',
              flexWrap: 'wrap',
            }}
          >
            <Badge variant={changeSet.totalChanges > 0 ? 'warning' : 'success'}>
              {`${changeSet.totalChanges} Changes`}
            </Badge>
            {changeSet.modifiedCount > 0 && (
              <Badge variant="warning">{`${changeSet.modifiedCount} Modified`}</Badge>
            )}
            {changeSet.addedCount > 0 && (
              <Badge variant="success">{`${changeSet.addedCount} Added`}</Badge>
            )}
            {changeSet.deletedCount > 0 && (
              <Badge variant="danger">{`${changeSet.deletedCount} Deleted`}</Badge>
            )}
            {changeSet.renamedCount > 0 && (
              <Badge variant="info">{`${changeSet.renamedCount} Renamed`}</Badge>
            )}
            <Badge variant="neutral">{changeSet.unchangedCount} Unchanged</Badge>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        {changeSet.warnings.length > 0 && (
          <div
            style={{
              padding: 'var(--space-sm) var(--space-md)',
              background: 'var(--color-warning-subtle, #fef3c7)',
              borderRadius: 'var(--radius-md)',
              marginBottom: 'var(--space-md)',
              fontSize: 'var(--font-size-xs)',
              color: 'var(--color-warning-text, #92400e)',
            }}
          >
            {changeSet.warnings.join(' • ')}
          </div>
        )}

        {/* Change Breakdown by Classification */}
        {Object.keys(changeSet.changesByClassification).length > 0 && (
          <div
            style={{
              display: 'flex',
              gap: 'var(--space-sm)',
              flexWrap: 'wrap',
              marginBottom: 'var(--space-md)',
            }}
          >
            <span
              style={{
                fontSize: 'var(--font-size-xs)',
                fontWeight: 600,
                color: 'var(--color-text-secondary)',
              }}
            >
              Classification Breakdown:
            </span>
            {Object.entries(changeSet.changesByClassification).map(([category, count]) => (
              <span
                key={category}
                style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-primary)' }}
              >
                {category}: <strong>{count}</strong>
              </span>
            ))}
          </div>
        )}

        {/* Changes List */}
        {changeSet.changes.length === 0 ? (
          <div
            style={{
              padding: 'var(--space-md)',
              color: 'var(--color-success, #16a34a)',
              fontSize: 'var(--font-size-sm)',
            }}
          >
            ✓ Repository is identical to the active baseline snapshot ({changeSet.unchangedCount}{' '}
            files verified unchanged).
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table
              style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--font-size-sm)' }}
            >
              <thead>
                <tr
                  style={{
                    borderBottom: '1px solid var(--color-border-subtle)',
                    textAlign: 'left',
                    color: 'var(--color-text-muted)',
                  }}
                >
                  <th style={{ padding: 'var(--space-xs) var(--space-sm)' }}>Type</th>
                  <th style={{ padding: 'var(--space-xs) var(--space-sm)' }}>File Path</th>
                  <th style={{ padding: 'var(--space-xs) var(--space-sm)' }}>Classification</th>
                  <th style={{ padding: 'var(--space-xs) var(--space-sm)' }}>Language</th>
                  <th style={{ padding: 'var(--space-xs) var(--space-sm)' }}>Direct Importers</th>
                </tr>
              </thead>
              <tbody>
                {changeSet.changes.map((c, idx) => (
                  <tr
                    key={`${c.changeType}-${c.currentPath ?? c.previousPath}-${idx}`}
                    style={{ borderBottom: '1px solid var(--color-border-subtle)' }}
                  >
                    <td style={{ padding: 'var(--space-sm)' }}>
                      <Badge variant={getChangeBadgeVariant(c.changeType)}>{c.changeType}</Badge>
                    </td>
                    <td style={{ padding: 'var(--space-sm)' }}>
                      {c.changeType === 'RENAMED' ? (
                        <span>
                          <code
                            style={{
                              color: 'var(--color-text-muted)',
                              textDecoration: 'line-through',
                            }}
                          >
                            {c.previousPath}
                          </code>
                          {' → '}
                          <strong>
                            <code>{c.currentPath}</code>
                          </strong>
                        </span>
                      ) : (
                        <strong>
                          <code>{c.currentPath ?? c.previousPath}</code>
                        </strong>
                      )}
                    </td>
                    <td
                      style={{ padding: 'var(--space-sm)', color: 'var(--color-text-secondary)' }}
                    >
                      {c.classification ?? '—'}
                    </td>
                    <td
                      style={{ padding: 'var(--space-sm)', color: 'var(--color-text-secondary)' }}
                    >
                      {c.language ?? '—'}
                    </td>
                    <td
                      style={{
                        padding: 'var(--space-sm)',
                        color: 'var(--color-text-muted)',
                        fontSize: '11px',
                      }}
                    >
                      {c.directImporters.length > 0 ? (
                        <span>
                          {c.directImporters.length} ({c.directImporters.slice(0, 2).join(', ')}
                          {c.directImporters.length > 2 ? '...' : ''})
                        </span>
                      ) : (
                        'None'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>

      {onRefreshChanges && (
        <CardFooter>
          <div style={{ display: 'flex', justifyContent: 'flex-end', width: '100%' }}>
            <Button variant="secondary" size="sm" onClick={onRefreshChanges} disabled={isLoading}>
              {isLoading ? 'Comparing...' : 'Refresh Change Detection'}
            </Button>
          </div>
        </CardFooter>
      )}
    </Card>
  );
}
