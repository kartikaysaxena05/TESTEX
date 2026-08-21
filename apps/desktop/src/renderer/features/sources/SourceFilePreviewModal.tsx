/**
 * @file apps/desktop/src/renderer/features/sources/SourceFilePreviewModal.tsx
 * Secure read-only source file preview dialog with safe text rendering and policy status banners.
 */

import React from 'react';
import { Dialog, Badge, Button, Alert } from '../../ui/index.js';
import type { SourceFileContentDto } from '@ai-quality/contracts';

export interface SourceFilePreviewModalProps {
  readonly isOpen: boolean;
  readonly relativePath: string | null;
  readonly contentDto: SourceFileContentDto | null;
  readonly isLoading: boolean;
  readonly error: string | null;
  readonly onClose: () => void;
}

export function SourceFilePreviewModal({
  isOpen,
  relativePath,
  contentDto,
  isLoading,
  error,
  onClose,
}: SourceFilePreviewModalProps): React.JSX.Element | null {
  if (!isOpen || !relativePath) {
    return null;
  }

  const formatBytes = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  return (
    <Dialog
      open={isOpen}
      onClose={onClose}
      title={`Preview: ${relativePath}`}
      footer={
        <div style={{ display: 'flex', justifyContent: 'flex-end', width: '100%' }}>
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
        {/* Metadata Header Badges */}
        <div
          style={{
            display: 'flex',
            gap: 'var(--space-xs)',
            flexWrap: 'wrap',
            alignItems: 'center',
          }}
        >
          {contentDto?.category && <Badge variant="info">{contentDto.category}</Badge>}
          {contentDto?.language && <Badge variant="neutral">{contentDto.language}</Badge>}
          {contentDto && <Badge variant="neutral">{formatBytes(contentDto.sizeBytes)}</Badge>}
          {contentDto?.status === 'AVAILABLE' && <Badge variant="success">AVAILABLE</Badge>}
          {contentDto?.status === 'SENSITIVE' && <Badge variant="danger">SENSITIVE (DENIED)</Badge>}
          {contentDto?.status === 'BINARY' && <Badge variant="warning">BINARY</Badge>}
          {contentDto?.status === 'TOO_LARGE' && <Badge variant="warning">TOO LARGE</Badge>}
          {contentDto?.status === 'FILTERED' && <Badge variant="neutral">FILTERED</Badge>}
          {contentDto?.status === 'NOT_FOUND' && <Badge variant="danger">NOT FOUND</Badge>}
        </div>

        {/* Loading State */}
        {isLoading && (
          <div
            style={{
              padding: 'var(--space-xl)',
              textAlign: 'center',
              color: 'var(--color-text-secondary)',
            }}
          >
            Reading authorized source file content...
          </div>
        )}

        {/* Error State */}
        {error && !isLoading && (
          <Alert variant="danger" title="Read Failed">
            {error}
          </Alert>
        )}

        {/* Policy & Status Alerts */}
        {!isLoading && contentDto && (
          <>
            {contentDto.status === 'SENSITIVE' && (
              <Alert variant="warning" title="Restricted Content">
                This file is restricted by the platform&apos;s source content security policy for
                secret-bearing and sensitive files.
              </Alert>
            )}

            {contentDto.status === 'BINARY' && (
              <Alert variant="info" title="Binary File">
                Preview is not available for binary, media, or compiled files.
              </Alert>
            )}

            {contentDto.status === 'TOO_LARGE' && (
              <Alert variant="warning" title="File Too Large">
                This file exceeds the 1 MB safe preview and read limit.
              </Alert>
            )}

            {contentDto.status === 'FILTERED' && (
              <Alert variant="info" title="Excluded File">
                This file is excluded by repository ignore rules and cannot be read.
              </Alert>
            )}

            {contentDto.status === 'NOT_FOUND' && (
              <Alert variant="danger" title="File Missing">
                This file could not be found on disk at the authorized location.
              </Alert>
            )}

            {contentDto.status === 'AVAILABLE' && contentDto.content !== null && (
              <pre
                style={{
                  margin: 0,
                  padding: 'var(--space-md)',
                  background: 'var(--color-bg-subtle, #1e1e1e)',
                  color: 'var(--color-text-primary, #d4d4d4)',
                  borderRadius: 'var(--radius-md)',
                  fontSize: '13px',
                  fontFamily: 'monospace',
                  overflow: 'auto',
                  maxHeight: '400px',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-all',
                }}
              >
                <code>{contentDto.content}</code>
              </pre>
            )}
          </>
        )}
      </div>
    </Dialog>
  );
}
