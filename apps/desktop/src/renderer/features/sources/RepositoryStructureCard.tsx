/**
 * @file apps/desktop/src/renderer/features/sources/RepositoryStructureCard.tsx
 * Card component presenting filtered repository file hierarchy, ignore rules, and discovery metrics.
 */

import React from 'react';
import type { SourceStructureDto } from '@ai-quality/contracts';
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardFooter,
  Badge,
  Button,
  Alert,
} from '../../ui/index.js';
import { formatDate } from '../../utils/date.js';
import { StructureTreeView } from './StructureTreeView.js';

export interface RepositoryStructureCardProps {
  readonly structure: SourceStructureDto | null;
  readonly isRefreshing?: boolean;
  readonly onRefreshStructure: () => void;
}

export function RepositoryStructureCard({
  structure,
  isRefreshing = false,
  onRefreshStructure,
}: RepositoryStructureCardProps): React.JSX.Element {
  if (!structure) {
    return (
      <Card>
        <CardHeader>
          <CardTitle level={3}>Repository Structure</CardTitle>
        </CardHeader>
        <CardContent>
          <p
            style={{ margin: 0, color: 'var(--color-text-muted)', fontSize: 'var(--font-size-sm)' }}
          >
            Repository structure not yet discovered for this source.
          </p>
        </CardContent>
        <CardFooter>
          <Button variant="secondary" size="sm" onClick={onRefreshStructure} loading={isRefreshing}>
            Discover Structure
          </Button>
        </CardFooter>
      </Card>
    );
  }

  const { summary, truncated, truncationReason, scannedAt, entries } = structure;

  return (
    <Card>
      <CardHeader>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 'var(--space-md)',
            flexWrap: 'wrap',
            width: '100%',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
            <CardTitle level={3}>Repository Structure</CardTitle>
            <Badge variant="neutral">
              {`${summary.totalIncluded} ${summary.totalIncluded === 1 ? 'included' : 'included'}`}
            </Badge>
            {summary.ignoredEntries > 0 && (
              <Badge variant="neutral">{`${summary.ignoredEntries} ignored`}</Badge>
            )}
            {truncated && (
              <Badge variant="warning">Truncated ({truncationReason ?? 'Limit Reached'})</Badge>
            )}
          </div>
          <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
            Scanned {formatDate(scannedAt)}
          </span>
        </div>
      </CardHeader>

      <CardContent>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
          {/* Summary metrics strip */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
              gap: 'var(--space-sm)',
            }}
          >
            <div
              style={{
                padding: 'var(--space-sm)',
                backgroundColor: 'var(--color-bg-subtle)',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--color-border)',
              }}
            >
              <span
                style={{
                  display: 'block',
                  fontSize: '11px',
                  color: 'var(--color-text-muted)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}
              >
                Included Files
              </span>
              <strong style={{ fontSize: 'var(--font-size-md)', color: 'var(--color-text)' }}>
                {summary.includedFiles}
              </strong>
            </div>

            <div
              style={{
                padding: 'var(--space-sm)',
                backgroundColor: 'var(--color-bg-subtle)',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--color-border)',
              }}
            >
              <span
                style={{
                  display: 'block',
                  fontSize: '11px',
                  color: 'var(--color-text-muted)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}
              >
                Directories
              </span>
              <strong style={{ fontSize: 'var(--font-size-md)', color: 'var(--color-text)' }}>
                {summary.includedDirectories}
              </strong>
            </div>

            <div
              style={{
                padding: 'var(--space-sm)',
                backgroundColor: 'var(--color-bg-subtle)',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--color-border)',
              }}
            >
              <span
                style={{
                  display: 'block',
                  fontSize: '11px',
                  color: 'var(--color-text-muted)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}
              >
                Ignored
              </span>
              <strong style={{ fontSize: 'var(--font-size-md)', color: 'var(--color-text)' }}>
                {summary.ignoredEntries}
              </strong>
            </div>

            <div
              style={{
                padding: 'var(--space-sm)',
                backgroundColor: 'var(--color-bg-subtle)',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--color-border)',
              }}
            >
              <span
                style={{
                  display: 'block',
                  fontSize: '11px',
                  color: 'var(--color-text-muted)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}
              >
                Safety Excluded
              </span>
              <strong style={{ fontSize: 'var(--font-size-md)', color: 'var(--color-text)' }}>
                {summary.safetyExcludedEntries}
              </strong>
            </div>
          </div>

          {/* Filtering Context Details */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: 'var(--space-xs) var(--space-sm)',
              fontSize: 'var(--font-size-xs)',
              color: 'var(--color-text-muted)',
              borderBottom: '1px solid var(--color-border)',
            }}
          >
            <span>
              {`${summary.ignoreFilesLoaded} .gitignore ${summary.ignoreFilesLoaded === 1 ? 'file' : 'files'} (${summary.ignoreRulesLoaded} active rules)`}
            </span>
            <span>
              Security Exclusions: <code>.git</code>, <code>node_modules</code>
            </span>
          </div>

          {/* Warnings Alert */}
          {summary.warnings.length > 0 && (
            <Alert variant="warning" title="Filtering Warning">
              <ul style={{ margin: 'var(--space-xs) 0 0 0', paddingLeft: 'var(--space-md)' }}>
                {summary.warnings.map((w, idx) => (
                  <li key={idx}>{w}</li>
                ))}
              </ul>
            </Alert>
          )}

          {/* Truncation warning if applicable */}
          {truncated && (
            <Alert variant="warning" title="Partial Structure Discovery">
              The repository scan reached the safety threshold ({truncationReason}). Only the first{' '}
              {summary.totalIncluded} included entries are displayed.
            </Alert>
          )}

          {/* Tree view */}
          <StructureTreeView entries={entries} />
        </div>
      </CardContent>

      <CardFooter>
        <div style={{ display: 'flex', justifyContent: 'flex-start', width: '100%' }}>
          <Button variant="secondary" size="sm" onClick={onRefreshStructure} loading={isRefreshing}>
            Refresh Structure
          </Button>
        </div>
      </CardFooter>
    </Card>
  );
}
