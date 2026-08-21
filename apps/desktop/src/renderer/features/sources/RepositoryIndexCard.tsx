/**
 * @file apps/desktop/src/renderer/features/sources/RepositoryIndexCard.tsx
 * UI Card presenting repository source index facts, summary metrics, and rebuild actions.
 */

import React from 'react';
import type { RepositoryIndexStatusDto } from '@ai-quality/contracts';
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardFooter,
  Badge,
  Button,
} from '../../ui/index.js';
import { formatDate } from '../../utils/date.js';

export interface RepositoryIndexCardProps {
  readonly status: RepositoryIndexStatusDto | null;
  readonly isIndexing?: boolean;
  readonly onRefreshIndex?: () => void;
}

export function RepositoryIndexCard({
  status,
  isIndexing = false,
  onRefreshIndex,
}: RepositoryIndexCardProps): React.JSX.Element {
  if (!status || !status.isIndexed) {
    return (
      <Card className="card-repository-index">
        <CardHeader>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              width: '100%',
            }}
          >
            <CardTitle>Repository Index &amp; Source Intelligence</CardTitle>
            <Badge variant="neutral">Not Indexed</Badge>
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
            No repository index built yet. Build the repository index to extract top-level symbols,
            module imports, and enable structured source intelligence.
          </div>
        </CardContent>
        {onRefreshIndex && (
          <CardFooter>
            <div style={{ display: 'flex', justifyContent: 'flex-end', width: '100%' }}>
              <Button variant="primary" size="sm" onClick={onRefreshIndex} disabled={isIndexing}>
                {isIndexing ? 'Building Index...' : 'Build Repository Index'}
              </Button>
            </div>
          </CardFooter>
        )}
      </Card>
    );
  }

  const summary = status.summary;

  return (
    <Card className="card-repository-index">
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
            <CardTitle>Repository Index &amp; Source Intelligence</CardTitle>
            <div
              style={{
                fontSize: 'var(--font-size-sm)',
                color: 'var(--color-text-secondary)',
                marginTop: '2px',
              }}
            >
              {`Persistent repository facts, symbols, and imports (Schema v${status.schemaVersion}, Parser v${status.parserVersion})`}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
            <Badge variant="success">Ready</Badge>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
            gap: 'var(--space-md)',
            marginBottom: 'var(--space-lg)',
          }}
        >
          <div
            style={{
              padding: 'var(--space-md)',
              background: 'var(--color-bg-subtle, #f5f5f5)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--color-border-subtle)',
            }}
          >
            <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>
              Files Indexed
            </div>
            <div style={{ fontSize: 'var(--font-size-xl)', fontWeight: 600, marginTop: '4px' }}>
              {summary?.filesIndexed ?? 0}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '2px' }}>
              {`of ${summary?.filesEligible ?? 0} eligible`}
            </div>
          </div>

          <div
            style={{
              padding: 'var(--space-md)',
              background: 'var(--color-bg-subtle, #f5f5f5)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--color-border-subtle)',
            }}
          >
            <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>
              Symbols Extracted
            </div>
            <div style={{ fontSize: 'var(--font-size-xl)', fontWeight: 600, marginTop: '4px' }}>
              {summary?.symbolsIndexed ?? 0}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '2px' }}>
              Top-level declarations
            </div>
          </div>

          <div
            style={{
              padding: 'var(--space-md)',
              background: 'var(--color-bg-subtle, #f5f5f5)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--color-border-subtle)',
            }}
          >
            <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>
              Imports Tracked
            </div>
            <div style={{ fontSize: 'var(--font-size-xl)', fontWeight: 600, marginTop: '4px' }}>
              {summary?.importsIndexed ?? 0}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '2px' }}>
              Module dependencies
            </div>
          </div>

          <div
            style={{
              padding: 'var(--space-md)',
              background: 'var(--color-bg-subtle, #f5f5f5)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--color-border-subtle)',
            }}
          >
            <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>
              Skipped / Excluded
            </div>
            <div style={{ fontSize: 'var(--font-size-xl)', fontWeight: 600, marginTop: '4px' }}>
              {summary?.filesSkipped ?? 0}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '2px' }}>
              Sensitive &amp; binary files
            </div>
          </div>
        </div>
      </CardContent>

      <CardFooter>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            width: '100%',
          }}
        >
          <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
            {status.lastIndexedAt
              ? `Last indexed ${formatDate(status.lastIndexedAt)}${
                  summary?.durationMs ? ` in ${summary.durationMs}ms` : ''
                }`
              : 'Not indexed'}
          </div>
          {onRefreshIndex && (
            <Button variant="secondary" size="sm" onClick={onRefreshIndex} disabled={isIndexing}>
              {isIndexing ? 'Rebuilding Index...' : 'Rebuild Index'}
            </Button>
          )}
        </div>
      </CardFooter>
    </Card>
  );
}
