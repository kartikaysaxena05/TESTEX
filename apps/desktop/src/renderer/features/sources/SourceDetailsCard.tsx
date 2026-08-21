/**
 * @file apps/desktop/src/renderer/features/sources/SourceDetailsCard.tsx
 * Card component displaying persistent source project metadata, identity, and management actions.
 */

import React from 'react';
import type { ProjectSourceDto } from '@ai-quality/contracts';
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardFooter,
  Badge,
  Button,
  Separator,
} from '../../ui/index.js';
import { formatDate } from '../../utils/date.js';

export interface SourceDetailsCardProps {
  readonly source: ProjectSourceDto;
  readonly isRefreshing?: boolean;
  readonly onRefreshMetadata: () => void;
  readonly onChangeFolder: () => void;
  readonly onDetach: () => void;
}

export function SourceDetailsCard({
  source,
  isRefreshing = false,
  onRefreshMetadata,
  onChangeFolder,
  onDetach,
}: SourceDetailsCardProps): React.JSX.Element {
  const isAvailable = source.availability === 'AVAILABLE';

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
            <CardTitle level={3}>{source.displayName}</CardTitle>
            <Badge variant="neutral">Local Directory</Badge>
            {source.identityFingerprint && <Badge variant="info">Identity Verified</Badge>}
          </div>
          <Badge variant={isAvailable ? 'success' : 'danger'} dot>
            {isAvailable ? 'Available' : 'Unavailable / Inaccessible'}
          </Badge>
        </div>
      </CardHeader>

      <CardContent>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
          <div>
            <label
              style={{
                display: 'block',
                fontSize: 'var(--font-size-xs)',
                fontWeight: 500,
                color: 'var(--color-text-muted)',
                marginBottom: 'var(--space-xs)',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}
            >
              Canonical Root Path
            </label>
            <div
              style={{
                padding: 'var(--space-sm) var(--space-md)',
                backgroundColor: 'var(--color-bg-subtle)',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--color-border)',
                fontFamily: 'var(--font-mono)',
                fontSize: 'var(--font-size-sm)',
                wordBreak: 'break-all',
                color: 'var(--color-text)',
              }}
            >
              {source.rootPath}
            </div>
          </div>

          <Separator />

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: 'var(--space-md)',
            }}
          >
            <div>
              <span
                style={{
                  display: 'block',
                  fontSize: 'var(--font-size-xs)',
                  color: 'var(--color-text-muted)',
                  marginBottom: '2px',
                }}
              >
                Attached Date
              </span>
              <span style={{ fontSize: 'var(--font-size-sm)', fontWeight: 500 }}>
                {formatDate(source.createdAt)}
              </span>
            </div>

            <div>
              <span
                style={{
                  display: 'block',
                  fontSize: 'var(--font-size-xs)',
                  color: 'var(--color-text-muted)',
                  marginBottom: '2px',
                }}
              >
                Last Validated
              </span>
              <span style={{ fontSize: 'var(--font-size-sm)', fontWeight: 500 }}>
                {source.lastValidatedAt ? formatDate(source.lastValidatedAt) : 'Not yet validated'}
              </span>
            </div>

            <div>
              <span
                style={{
                  display: 'block',
                  fontSize: 'var(--font-size-xs)',
                  color: 'var(--color-text-muted)',
                  marginBottom: '2px',
                }}
              >
                Metadata Refreshed
              </span>
              <span style={{ fontSize: 'var(--font-size-sm)', fontWeight: 500 }}>
                {source.metadataRefreshedAt
                  ? formatDate(source.metadataRefreshedAt)
                  : 'Not refreshed yet'}
              </span>
            </div>

            <div>
              <span
                style={{
                  display: 'block',
                  fontSize: 'var(--font-size-xs)',
                  color: 'var(--color-text-muted)',
                  marginBottom: '2px',
                }}
              >
                Filesystem Modified
              </span>
              <span style={{ fontSize: 'var(--font-size-sm)', fontWeight: 500 }}>
                {source.filesystemModifiedAt
                  ? formatDate(source.filesystemModifiedAt)
                  : 'Unavailable'}
              </span>
            </div>
          </div>

          {source.identityFingerprint && (
            <div style={{ marginTop: 'var(--space-xs)' }}>
              <span
                style={{
                  display: 'block',
                  fontSize: 'var(--font-size-xs)',
                  color: 'var(--color-text-muted)',
                  marginBottom: '2px',
                }}
              >
                Root Identity Fingerprint (SHA-256)
              </span>
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 'var(--font-size-xs)',
                  color: 'var(--color-text-muted)',
                  wordBreak: 'break-all',
                }}
              >
                {source.identityFingerprint}
              </span>
            </div>
          )}
        </div>
      </CardContent>

      <CardFooter>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 'var(--space-sm)',
            flexWrap: 'wrap',
            width: '100%',
          }}
        >
          <Button variant="secondary" size="sm" onClick={onRefreshMetadata} loading={isRefreshing}>
            Refresh Metadata
          </Button>
          <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
            <Button variant="secondary" size="sm" onClick={onChangeFolder}>
              Change Folder
            </Button>
            <Button variant="danger" size="sm" onClick={onDetach}>
              Detach
            </Button>
          </div>
        </div>
      </CardFooter>
    </Card>
  );
}
