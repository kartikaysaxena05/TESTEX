/**
 * @file apps/desktop/src/renderer/features/sources/TechnologyProfileCard.tsx
 * Card component presenting programming language distribution and evidence-backed technology signals.
 */

import React from 'react';
import type { TechnologyProfileDto } from '@ai-quality/contracts';
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

export interface TechnologyProfileCardProps {
  readonly profile: TechnologyProfileDto | null;
  readonly isAnalyzing?: boolean;
  readonly onRefreshProfile: () => void;
}

export function TechnologyProfileCard({
  profile,
  isAnalyzing = false,
  onRefreshProfile,
}: TechnologyProfileCardProps): React.JSX.Element {
  if (!profile) {
    return (
      <Card>
        <CardHeader>
          <CardTitle level={3}>Technology Profile</CardTitle>
        </CardHeader>
        <CardContent>
          <p
            style={{ margin: 0, color: 'var(--color-text-muted)', fontSize: 'var(--font-size-sm)' }}
          >
            Technology profile not yet analyzed for this source.
          </p>
        </CardContent>
        <CardFooter>
          <Button variant="secondary" size="sm" onClick={onRefreshProfile} loading={isAnalyzing}>
            Analyze Profile
          </Button>
        </CardFooter>
      </Card>
    );
  }

  const {
    detectedLanguages,
    dominantLanguage,
    technologySignals,
    totalIncludedFiles,
    totalLanguageFiles,
    unknownFiles,
    analyzedAt,
  } = profile;

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
            <CardTitle level={3}>Technology Profile</CardTitle>
            {dominantLanguage ? (
              <Badge variant="success">{`Primary: ${dominantLanguage}`}</Badge>
            ) : (
              <Badge variant="neutral">Multi-Language / Polyglot</Badge>
            )}
          </div>
          <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
            Analyzed {formatDate(analyzedAt)}
          </span>
        </div>
      </CardHeader>

      <CardContent>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)' }}>
          {/* Programming & Source Languages Breakdown */}
          <div>
            <h4
              style={{
                margin: '0 0 var(--space-xs) 0',
                fontSize: 'var(--font-size-sm)',
                color: 'var(--color-text)',
                fontWeight: '600',
              }}
            >
              Detected Languages & Formats
            </h4>

            {detectedLanguages.length === 0 ? (
              <p
                style={{
                  margin: 0,
                  color: 'var(--color-text-muted)',
                  fontSize: 'var(--font-size-xs)',
                }}
              >
                No recognizable programming language or format files detected.
              </p>
            ) : (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 'var(--space-xs)',
                  marginTop: 'var(--space-xs)',
                }}
              >
                {detectedLanguages.map(item => (
                  <div
                    key={item.language}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '4px',
                      padding: 'var(--space-xs) var(--space-sm)',
                      backgroundColor: 'var(--color-bg-subtle)',
                      borderRadius: 'var(--radius-sm)',
                      border: '1px solid var(--color-border)',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        fontSize: 'var(--font-size-xs)',
                      }}
                    >
                      <div
                        style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-xs)' }}
                      >
                        <strong>{item.language}</strong>
                        <span style={{ color: 'var(--color-text-muted)' }}>({item.category})</span>
                      </div>
                      <div
                        style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)' }}
                      >
                        <span style={{ color: 'var(--color-text-muted)' }}>
                          {item.fileCount} {item.fileCount === 1 ? 'file' : 'files'}
                        </span>
                        <strong style={{ minWidth: '45px', textAlign: 'right' }}>
                          {item.percentage}%
                        </strong>
                      </div>
                    </div>

                    {/* Proportional visual bar */}
                    <div
                      style={{
                        width: '100%',
                        height: '4px',
                        backgroundColor: 'var(--color-border)',
                        borderRadius: '2px',
                        overflow: 'hidden',
                      }}
                    >
                      <div
                        style={{
                          width: `${Math.min(100, Math.max(2, item.percentage))}%`,
                          height: '100%',
                          backgroundColor: 'var(--color-primary)',
                          borderRadius: '2px',
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Broad Technology & Ecosystem Signals */}
          <div>
            <h4
              style={{
                margin: '0 0 var(--space-xs) 0',
                fontSize: 'var(--font-size-sm)',
                color: 'var(--color-text)',
                fontWeight: '600',
              }}
            >
              Technology & Ecosystem Signals
            </h4>

            {technologySignals.length === 0 ? (
              <p
                style={{
                  margin: 0,
                  color: 'var(--color-text-muted)',
                  fontSize: 'var(--font-size-xs)',
                }}
              >
                No broad technology signals detected from repository structure.
              </p>
            ) : (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                  gap: 'var(--space-sm)',
                  marginTop: 'var(--space-xs)',
                }}
              >
                {technologySignals.map(sig => (
                  <div
                    key={sig.technology}
                    style={{
                      padding: 'var(--space-sm)',
                      backgroundColor: 'var(--color-bg-subtle)',
                      borderRadius: 'var(--radius-sm)',
                      border: '1px solid var(--color-border)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 'var(--space-xs)',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <strong style={{ fontSize: 'var(--font-size-xs)' }}>{sig.technology}</strong>
                      <Badge variant={sig.confidence === 'HIGH' ? 'neutral' : 'neutral'}>
                        {sig.confidence}
                      </Badge>
                    </div>
                    <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
                      {sig.category}
                    </span>
                    <div style={{ fontSize: '11px', color: 'var(--color-text)' }}>
                      <span style={{ color: 'var(--color-text-muted)' }}>Evidence: </span>
                      {sig.evidence.join(', ')}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Summary Footer Line */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: 'var(--space-xs) var(--space-sm)',
              fontSize: 'var(--font-size-xs)',
              color: 'var(--color-text-muted)',
              borderTop: '1px solid var(--color-border)',
            }}
          >
            <span>
              {`${totalIncludedFiles} total files analyzed (${totalLanguageFiles} mapped)`}
            </span>
            {unknownFiles > 0 && (
              <span>{`${unknownFiles} unclassified ${unknownFiles === 1 ? 'file' : 'files'}`}</span>
            )}
          </div>
        </div>
      </CardContent>

      <CardFooter>
        <div style={{ display: 'flex', justifyContent: 'flex-start', width: '100%' }}>
          <Button variant="secondary" size="sm" onClick={onRefreshProfile} loading={isAnalyzing}>
            Refresh Profile
          </Button>
        </div>
      </CardFooter>
    </Card>
  );
}
