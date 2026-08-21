/**
 * @file apps/desktop/src/renderer/features/sources/GitDetailsCard.tsx
 * Card component presenting Git repository detection, relation, branch, and HEAD commit state.
 */

import React from 'react';
import type { GitStatusDto } from '@ai-quality/contracts';
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

export interface GitDetailsCardProps {
  readonly gitStatus: GitStatusDto | null;
  readonly isRefreshing?: boolean;
  readonly onRefreshGit: () => void;
}

export function GitDetailsCard({
  gitStatus,
  isRefreshing = false,
  onRefreshGit,
}: GitDetailsCardProps): React.JSX.Element {
  if (!gitStatus) {
    return (
      <Card>
        <CardHeader>
          <CardTitle level={3}>Git Repository Status</CardTitle>
        </CardHeader>
        <CardContent>
          <p
            style={{ margin: 0, color: 'var(--color-text-muted)', fontSize: 'var(--font-size-sm)' }}
          >
            Git status not yet checked for this source.
          </p>
        </CardContent>
        <CardFooter>
          <Button variant="secondary" size="sm" onClick={onRefreshGit} loading={isRefreshing}>
            Check Git Repository
          </Button>
        </CardFooter>
      </Card>
    );
  }

  const {
    gitAvailable,
    gitVersion,
    isGitRepository,
    repositoryRoot,
    sourceRelationToRepository,
    currentBranch,
    headCommit,
    isDetachedHead,
    lastCheckedAt,
  } = gitStatus;

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
            <CardTitle level={3}>Git Repository</CardTitle>
            <Badge variant={gitAvailable ? 'neutral' : 'danger'}>
              {gitAvailable ? `Git ${gitVersion ?? 'Available'}` : 'Git Unavailable'}
            </Badge>
          </div>
          <Badge variant={isGitRepository ? 'success' : 'neutral'} dot={isGitRepository}>
            {isGitRepository ? 'Repository Detected' : 'Not a Git Repository'}
          </Badge>
        </div>
      </CardHeader>

      <CardContent>
        {!gitAvailable ? (
          <p
            style={{ margin: 0, color: 'var(--color-text-muted)', fontSize: 'var(--font-size-sm)' }}
          >
            Git is not available in the current environment. Local repository inspection using Git
            is unavailable.
          </p>
        ) : !isGitRepository ? (
          <p
            style={{ margin: 0, color: 'var(--color-text-muted)', fontSize: 'var(--font-size-sm)' }}
          >
            This attached project folder is not located inside a Git working tree. The project will
            be managed as a standard local directory.
          </p>
        ) : (
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
                Repository Root
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
                {repositoryRoot ?? 'Unknown'}
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
                  Source Relation
                </span>
                <span style={{ fontSize: 'var(--font-size-sm)', fontWeight: 500 }}>
                  {sourceRelationToRepository === 'ROOT'
                    ? 'Repository Root'
                    : sourceRelationToRepository === 'NESTED'
                      ? 'Nested inside Repository'
                      : 'Unknown'}
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
                  Current Branch
                </span>
                <span style={{ fontSize: 'var(--font-size-sm)', fontWeight: 500 }}>
                  {isDetachedHead ? '(Detached HEAD)' : (currentBranch ?? '(Empty / No Commits)')}
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
                  HEAD Commit
                </span>
                <span
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 'var(--font-size-sm)',
                    fontWeight: 500,
                  }}
                >
                  {headCommit ? headCommit.substring(0, 10) : 'None (Unborn)'}
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
                  Last Checked
                </span>
                <span style={{ fontSize: 'var(--font-size-sm)', fontWeight: 500 }}>
                  {formatDate(lastCheckedAt)}
                </span>
              </div>
            </div>
          </div>
        )}
      </CardContent>

      <CardFooter>
        <div style={{ display: 'flex', justifyContent: 'flex-start', width: '100%' }}>
          <Button variant="secondary" size="sm" onClick={onRefreshGit} loading={isRefreshing}>
            Recheck Git
          </Button>
        </div>
      </CardFooter>
    </Card>
  );
}
