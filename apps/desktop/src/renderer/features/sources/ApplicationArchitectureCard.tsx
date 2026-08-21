/**
 * @file apps/desktop/src/renderer/features/sources/ApplicationArchitectureCard.tsx
 * UI Card presenting discovered application architecture, ranked entry-point candidates, structural areas, and module hubs.
 */

import React from 'react';
import type { ApplicationArchitectureProfileDto } from '@ai-quality/contracts';
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

export interface ApplicationArchitectureCardProps {
  readonly profile: ApplicationArchitectureProfileDto | null;
  readonly isAnalyzing?: boolean;
  readonly onRefreshProfile?: () => void;
}

export function ApplicationArchitectureCard({
  profile,
  isAnalyzing = false,
  onRefreshProfile,
}: ApplicationArchitectureCardProps): React.JSX.Element {
  if (!profile) {
    return (
      <Card className="card-application-architecture">
        <CardHeader>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              width: '100%',
            }}
          >
            <CardTitle>Application Architecture &amp; Entry Points</CardTitle>
            <Badge variant="neutral">Not Analyzed</Badge>
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
            No architectural analysis performed yet. Run architecture discovery to identify
            application kind, entry-point candidates, and structural patterns.
          </div>
        </CardContent>
        {onRefreshProfile && (
          <CardFooter>
            <div style={{ display: 'flex', justifyContent: 'flex-end', width: '100%' }}>
              <Button variant="primary" size="sm" onClick={onRefreshProfile} disabled={isAnalyzing}>
                {isAnalyzing ? 'Analyzing Architecture...' : 'Analyze Architecture'}
              </Button>
            </div>
          </CardFooter>
        )}
      </Card>
    );
  }

  const formatKind = (kind: string): string => {
    return kind.replace(/_/g, ' ');
  };

  return (
    <Card className="card-application-architecture">
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
            <CardTitle>Application Architecture &amp; Entry Points</CardTitle>
            <div
              style={{
                fontSize: 'var(--font-size-sm)',
                color: 'var(--color-text-secondary)',
                marginTop: '2px',
              }}
            >
              Deterministic structural discovery and candidate ranking (Architecture v
              {profile.architectureVersion})
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
            <Badge variant={profile.primaryKind === 'UNKNOWN' ? 'neutral' : 'info'}>
              {formatKind(profile.primaryKind)}
            </Badge>
            <Badge
              variant={
                profile.confidence === 'HIGH'
                  ? 'success'
                  : profile.confidence === 'MEDIUM'
                    ? 'warning'
                    : 'neutral'
              }
            >
              {`${profile.confidence} Confidence`}
            </Badge>
            {profile.status === 'STALE' && <Badge variant="warning">Stale (Re-indexed)</Badge>}
          </div>
        </div>
      </CardHeader>

      <CardContent>
        {/* 1. Ranked Entry-Point Candidates */}
        <div style={{ marginBottom: 'var(--space-lg)' }}>
          <div
            style={{
              fontSize: 'var(--font-size-sm)',
              fontWeight: 600,
              color: 'var(--color-text-primary)',
              marginBottom: 'var(--space-sm)',
            }}
          >
            Entry-Point Candidates
          </div>
          {profile.entryCandidates.length === 0 ? (
            <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
              No standalone application entry points identified (likely library or package module).
            </div>
          ) : (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 'var(--space-xs)',
              }}
            >
              {profile.entryCandidates.map((c, idx) => (
                <div
                  key={c.relativePath}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: 'var(--space-sm) var(--space-md)',
                    background:
                      idx === 0 && c.confidence === 'HIGH'
                        ? 'var(--color-bg-subtle, #f0fdf4)'
                        : 'var(--color-bg-subtle, #fafafa)',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--color-border-subtle)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)' }}>
                    <span
                      style={{
                        fontWeight: 600,
                        fontSize: 'var(--font-size-xs)',
                        color: 'var(--color-text-muted)',
                        width: '18px',
                      }}
                    >
                      #{c.rank}
                    </span>
                    <div>
                      <code style={{ fontSize: 'var(--font-size-sm)', fontWeight: 600 }}>
                        {c.relativePath}
                      </code>
                      <div
                        style={{
                          fontSize: '11px',
                          color: 'var(--color-text-secondary)',
                          marginTop: '2px',
                        }}
                      >
                        {c.evidence.map(e => e.detail).join(' • ')}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-xs)' }}>
                    <Badge
                      variant={
                        c.kind === 'CLIENT' || c.kind === 'SERVER' || c.kind === 'APPLICATION'
                          ? 'info'
                          : 'neutral'
                      }
                    >
                      {formatKind(c.kind)}
                    </Badge>
                    <Badge variant={c.confidence === 'HIGH' ? 'success' : 'warning'}>
                      {c.confidence}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 2. Architecture Signals & Structural Areas */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: 'var(--space-md)',
            marginBottom: 'var(--space-lg)',
          }}
        >
          {/* Architecture Signals */}
          <div
            style={{
              padding: 'var(--space-md)',
              background: 'var(--color-bg-subtle, #f9fafb)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--color-border-subtle)',
            }}
          >
            <div
              style={{
                fontSize: 'var(--font-size-xs)',
                fontWeight: 600,
                color: 'var(--color-text-secondary)',
                marginBottom: 'var(--space-xs)',
              }}
            >
              Structural Signals
            </div>
            {profile.architectureSignals.length === 0 ? (
              <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
                No specialized structural signals observed.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-xs)' }}>
                {profile.architectureSignals.map(s => (
                  <div key={s.kind} style={{ fontSize: 'var(--font-size-xs)' }}>
                    <div style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>
                      • {s.title}
                    </div>
                    <div
                      style={{
                        fontSize: '11px',
                        color: 'var(--color-text-secondary)',
                        marginLeft: '10px',
                      }}
                    >
                      {s.description}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Module Hubs */}
          <div
            style={{
              padding: 'var(--space-md)',
              background: 'var(--color-bg-subtle, #f9fafb)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--color-border-subtle)',
            }}
          >
            <div
              style={{
                fontSize: 'var(--font-size-xs)',
                fontWeight: 600,
                color: 'var(--color-text-secondary)',
                marginBottom: 'var(--space-xs)',
              }}
            >
              Key Module Hubs (Import Degrees)
            </div>
            {profile.moduleHubs.length === 0 ? (
              <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
                No internal module import edges recorded.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {profile.moduleHubs.slice(0, 4).map(h => (
                  <div
                    key={h.relativePath}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      fontSize: '11px',
                    }}
                  >
                    <code style={{ fontSize: '11px', color: 'var(--color-text-primary)' }}>
                      {h.relativePath}
                    </code>
                    <span style={{ color: 'var(--color-text-muted)' }}>
                      {h.incomingImports} in / {h.outgoingImports} out
                    </span>
                  </div>
                ))}
              </div>
            )}
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
            Analyzed {formatDate(profile.analyzedAt)}
          </div>
          {onRefreshProfile && (
            <Button variant="secondary" size="sm" onClick={onRefreshProfile} disabled={isAnalyzing}>
              {isAnalyzing ? 'Analyzing...' : 'Refresh Architecture'}
            </Button>
          )}
        </div>
      </CardFooter>
    </Card>
  );
}
