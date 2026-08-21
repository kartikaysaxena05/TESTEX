/**
 * @file apps/desktop/src/renderer/features/sources/FrameworkProfileCard.tsx
 * Card component presenting evidence-backed framework detections, package managers, and dependencies.
 */

import React, { useState } from 'react';
import type { FrameworkProfileDto } from '@ai-quality/contracts';
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

export interface FrameworkProfileCardProps {
  readonly profile: FrameworkProfileDto | null;
  readonly isAnalyzing?: boolean;
  readonly onRefreshProfile?: () => void;
}

export function FrameworkProfileCard({
  profile,
  isAnalyzing = false,
  onRefreshProfile,
}: FrameworkProfileCardProps): React.JSX.Element {
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');

  if (!profile) {
    return (
      <Card data-testid="framework-profile-empty">
        <CardHeader>
          <CardTitle level={3}>Frameworks & Dependencies</CardTitle>
        </CardHeader>
        <CardContent>
          <p
            style={{ margin: 0, color: 'var(--color-text-muted)', fontSize: 'var(--font-size-sm)' }}
          >
            {isAnalyzing
              ? 'Analyzing repository manifests...'
              : 'No framework profile available for this repository.'}
          </p>
        </CardContent>
      </Card>
    );
  }

  const {
    primaryEcosystem,
    packageManager,
    manifests,
    frameworks,
    directDependencyCount,
    devDependencyCount,
    warnings,
  } = profile;

  const filteredFrameworks = frameworks.filter(fw => {
    const matchesCategory = selectedCategory === 'ALL' || fw.category === selectedCategory;
    const matchesSearch =
      searchTerm === '' ||
      fw.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      fw.id.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const categories = Array.from(new Set(frameworks.map(f => f.category)));

  return (
    <Card data-testid="framework-profile-card">
      <CardHeader>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            width: '100%',
            flexWrap: 'wrap',
            gap: 'var(--space-sm)',
          }}
        >
          <div>
            <CardTitle level={3}>Frameworks & Dependencies</CardTitle>
            <p
              style={{
                margin: 'var(--space-xs) 0 0 0',
                color: 'var(--color-text-muted)',
                fontSize: 'var(--font-size-sm)',
              }}
            >
              Ecosystems, declared dependencies, and framework evidence
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-xs)' }}>
            {primaryEcosystem && <Badge variant="info">{primaryEcosystem}</Badge>}
            {packageManager && (
              <Badge variant={packageManager.isAmbiguous ? 'warning' : 'success'}>
                {`PM: ${packageManager.name}`}
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)' }}>
          {/* Top Metrics Row */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
              gap: 'var(--space-md)',
              padding: 'var(--space-md)',
              backgroundColor: 'var(--color-bg-secondary)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--color-border)',
            }}
          >
            <div>
              <span
                style={{
                  fontSize: 'var(--font-size-xs)',
                  color: 'var(--color-text-muted)',
                  display: 'block',
                  fontWeight: 600,
                }}
              >
                Manifests
              </span>
              <span
                style={{
                  fontSize: 'var(--font-size-xl)',
                  fontWeight: 700,
                  color: 'var(--color-text)',
                }}
              >
                {manifests.length}
              </span>
            </div>
            <div>
              <span
                style={{
                  fontSize: 'var(--font-size-xs)',
                  color: 'var(--color-text-muted)',
                  display: 'block',
                  fontWeight: 600,
                }}
              >
                Direct Dependencies
              </span>
              <span
                style={{
                  fontSize: 'var(--font-size-xl)',
                  fontWeight: 700,
                  color: 'var(--color-success)',
                }}
              >
                {directDependencyCount}
              </span>
            </div>
            <div>
              <span
                style={{
                  fontSize: 'var(--font-size-xs)',
                  color: 'var(--color-text-muted)',
                  display: 'block',
                  fontWeight: 600,
                }}
              >
                Dev Dependencies
              </span>
              <span
                style={{
                  fontSize: 'var(--font-size-xl)',
                  fontWeight: 700,
                  color: 'var(--color-info)',
                }}
              >
                {devDependencyCount}
              </span>
            </div>
            <div>
              <span
                style={{
                  fontSize: 'var(--font-size-xs)',
                  color: 'var(--color-text-muted)',
                  display: 'block',
                  fontWeight: 600,
                }}
              >
                Frameworks & Tools
              </span>
              <span
                style={{
                  fontSize: 'var(--font-size-xl)',
                  fontWeight: 700,
                  color: 'var(--color-accent)',
                }}
              >
                {frameworks.length}
              </span>
            </div>
          </div>

          {/* Warnings Banner */}
          {warnings.length > 0 && (
            <div
              style={{
                backgroundColor: 'rgba(245, 158, 11, 0.1)',
                border: '1px solid var(--color-warning)',
                borderRadius: 'var(--radius-md)',
                padding: 'var(--space-md)',
                fontSize: 'var(--font-size-xs)',
                color: 'var(--color-warning)',
              }}
            >
              <strong style={{ display: 'block', marginBottom: 'var(--space-xs)' }}>
                ⚠️ Analysis Warnings:
              </strong>
              {warnings.map((w, idx) => (
                <div key={idx}>• {w}</div>
              ))}
            </div>
          )}

          {/* Frameworks & Tools Section */}
          <div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 'var(--space-sm)',
                flexWrap: 'wrap',
                gap: 'var(--space-xs)',
              }}
            >
              <h4
                style={{
                  margin: 0,
                  fontSize: 'var(--font-size-xs)',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  color: 'var(--color-text-muted)',
                }}
              >
                Detected Frameworks & Libraries ({frameworks.length})
              </h4>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-xs)' }}>
                <input
                  type="text"
                  placeholder="Filter frameworks..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  style={{
                    backgroundColor: 'var(--color-bg-tertiary)',
                    border: '1px solid var(--color-border)',
                    borderRadius: 'var(--radius-sm)',
                    padding: '2px 8px',
                    fontSize: 'var(--font-size-xs)',
                    color: 'var(--color-text)',
                  }}
                />
                {categories.length > 1 && (
                  <select
                    value={selectedCategory}
                    onChange={e => setSelectedCategory(e.target.value)}
                    style={{
                      backgroundColor: 'var(--color-bg-tertiary)',
                      border: '1px solid var(--color-border)',
                      borderRadius: 'var(--radius-sm)',
                      padding: '2px 8px',
                      fontSize: 'var(--font-size-xs)',
                      color: 'var(--color-text)',
                    }}
                  >
                    <option value="ALL">All Categories</option>
                    {categories.map(cat => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </div>

            {filteredFrameworks.length === 0 ? (
              <div
                style={{
                  fontSize: 'var(--font-size-xs)',
                  color: 'var(--color-text-muted)',
                  textAlign: 'center',
                  padding: 'var(--space-md)',
                  backgroundColor: 'var(--color-bg-secondary)',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--color-border)',
                }}
              >
                No matching frameworks found.
              </div>
            ) : (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                  gap: 'var(--space-md)',
                }}
              >
                {filteredFrameworks.map(fw => (
                  <div
                    key={fw.id}
                    style={{
                      backgroundColor: 'var(--color-bg-secondary)',
                      border: '1px solid var(--color-border)',
                      borderRadius: 'var(--radius-md)',
                      padding: 'var(--space-md)',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      gap: 'var(--space-sm)',
                    }}
                  >
                    <div>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          marginBottom: 'var(--space-xs)',
                        }}
                      >
                        <span
                          style={{
                            fontSize: 'var(--font-size-sm)',
                            fontWeight: 600,
                            color: 'var(--color-text)',
                          }}
                        >
                          {fw.name}
                        </span>
                        <div
                          style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-xs)' }}
                        >
                          <Badge variant="neutral">{fw.category}</Badge>
                          <Badge
                            variant={
                              fw.confidence === 'HIGH'
                                ? 'success'
                                : fw.confidence === 'MEDIUM'
                                  ? 'info'
                                  : 'warning'
                            }
                          >
                            {fw.confidence}
                          </Badge>
                        </div>
                      </div>
                      {fw.declaredVersion && (
                        <div
                          style={{
                            fontSize: 'var(--font-size-xs)',
                            color: 'var(--color-text-muted)',
                          }}
                        >
                          Constraint:{' '}
                          <code style={{ color: 'var(--color-text)' }}>{fw.declaredVersion}</code>
                        </div>
                      )}
                    </div>

                    {/* Evidence List */}
                    <div
                      style={{
                        borderTop: '1px solid var(--color-border)',
                        paddingTop: 'var(--space-xs)',
                        fontSize: '11px',
                        color: 'var(--color-text-muted)',
                      }}
                    >
                      <span
                        style={{
                          fontSize: '10px',
                          textTransform: 'uppercase',
                          fontWeight: 600,
                          display: 'block',
                          marginBottom: '2px',
                        }}
                      >
                        Evidence:
                      </span>
                      {fw.evidence.map((ev, idx) => (
                        <div
                          key={idx}
                          style={{
                            fontFamily: 'monospace',
                            fontSize: '11px',
                            color: 'var(--color-text-secondary)',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          <span style={{ color: 'var(--color-accent)' }}>{`[${ev.kind}] `}</span>
                          {`${ev.source}: ${ev.detail}`}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Manifests Overview */}
          <div>
            <h4
              style={{
                margin: '0 0 var(--space-xs) 0',
                fontSize: 'var(--font-size-xs)',
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                color: 'var(--color-text-muted)',
              }}
            >
              Discovered Manifests ({manifests.length})
            </h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-xs)' }}>
              {manifests.map((m, idx) => (
                <div
                  key={idx}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    backgroundColor: 'var(--color-bg-secondary)',
                    border: '1px solid var(--color-border)',
                    borderRadius: 'var(--radius-sm)',
                    padding: 'var(--space-xs) var(--space-sm)',
                    fontSize: 'var(--font-size-xs)',
                  }}
                >
                  <div style={{ fontFamily: 'monospace', color: 'var(--color-text)' }}>
                    {m.relativePath}
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 'var(--space-sm)',
                      color: 'var(--color-text-muted)',
                    }}
                  >
                    <span>{m.ecosystem}</span>
                    <span>•</span>
                    <span
                      style={{ color: 'var(--color-success)' }}
                    >{`${m.directDependencyCount} direct`}</span>
                    <span>•</span>
                    <span
                      style={{ color: 'var(--color-info)' }}
                    >{`${m.devDependencyCount} dev`}</span>
                  </div>
                </div>
              ))}
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
          <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
            Last analyzed: {formatDate(profile.analyzedAt)}
          </span>
          {onRefreshProfile && (
            <Button variant="secondary" size="sm" onClick={onRefreshProfile} loading={isAnalyzing}>
              Refresh Frameworks
            </Button>
          )}
        </div>
      </CardFooter>
    </Card>
  );
}
