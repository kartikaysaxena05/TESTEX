import React, { useState, useMemo } from 'react';
import type { ClassificationProfileDto, FileCategory } from '@ai-quality/contracts';
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

export interface FileClassificationCardProps {
  readonly profile: ClassificationProfileDto | null;
  readonly isAnalyzing?: boolean;
  readonly onRefreshProfile?: () => void;
  readonly onPreviewFile?: (relativePath: string) => void;
}

export function FileClassificationCard({
  profile,
  isAnalyzing = false,
  onRefreshProfile,
  onPreviewFile,
}: FileClassificationCardProps): React.JSX.Element {
  const [selectedCategory, setSelectedCategory] = useState<FileCategory | 'ALL'>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const summary = profile?.summary;

  const filteredFiles = useMemo(() => {
    if (!profile) return [];

    return profile.files.filter(file => {
      const matchesCategory = selectedCategory === 'ALL' || file.category === selectedCategory;
      const matchesSearch =
        searchQuery.trim().length === 0 ||
        file.relativePath.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesCategory && matchesSearch;
    });
  }, [profile, selectedCategory, searchQuery]);

  if (!profile) {
    return (
      <Card className="card-source-classification">
        <CardHeader>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              width: '100%',
            }}
          >
            <CardTitle>File Classification</CardTitle>
            <Badge variant="neutral">Not Inspected</Badge>
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
            No repository source attached or file classification not yet performed.
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="card-source-classification">
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
            <CardTitle>File Classification</CardTitle>
            <div
              style={{
                fontSize: 'var(--font-size-sm)',
                color: 'var(--color-text-secondary)',
                marginTop: '2px',
              }}
            >
              {`Deterministic role classification and evidence analysis (Rule v${profile.ruleVersion})`}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
            <Badge variant="info">{`${summary?.totalFiles ?? 0} Included Files`}</Badge>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        {/* Summary Metrics Grid */}
        {summary && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
              gap: 'var(--space-sm)',
              marginBottom: 'var(--space-md)',
            }}
          >
            <div
              style={{
                padding: 'var(--space-sm)',
                backgroundColor: 'var(--color-bg-secondary)',
                borderRadius: 'var(--radius-sm)',
              }}
            >
              <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
                Source
              </div>
              <div
                style={{
                  fontSize: 'var(--font-size-lg)',
                  fontWeight: 600,
                  color: 'var(--color-primary)',
                }}
              >
                {summary.sourceFiles}
              </div>
            </div>
            <div
              style={{
                padding: 'var(--space-sm)',
                backgroundColor: 'var(--color-bg-secondary)',
                borderRadius: 'var(--radius-sm)',
              }}
            >
              <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
                Tests
              </div>
              <div
                style={{
                  fontSize: 'var(--font-size-lg)',
                  fontWeight: 600,
                  color: 'var(--color-success)',
                }}
              >
                {summary.testFiles}
              </div>
            </div>
            <div
              style={{
                padding: 'var(--space-sm)',
                backgroundColor: 'var(--color-bg-secondary)',
                borderRadius: 'var(--radius-sm)',
              }}
            >
              <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
                Config
              </div>
              <div
                style={{
                  fontSize: 'var(--font-size-lg)',
                  fontWeight: 600,
                  color: 'var(--color-warning)',
                }}
              >
                {summary.configurationFiles}
              </div>
            </div>
            <div
              style={{
                padding: 'var(--space-sm)',
                backgroundColor: 'var(--color-bg-secondary)',
                borderRadius: 'var(--radius-sm)',
              }}
            >
              <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
                Build / CI
              </div>
              <div
                style={{
                  fontSize: 'var(--font-size-lg)',
                  fontWeight: 600,
                  color: 'var(--color-info)',
                }}
              >
                {summary.buildToolingFiles}
              </div>
            </div>
            <div
              style={{
                padding: 'var(--space-sm)',
                backgroundColor: 'var(--color-bg-secondary)',
                borderRadius: 'var(--radius-sm)',
              }}
            >
              <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
                Docs
              </div>
              <div
                style={{
                  fontSize: 'var(--font-size-lg)',
                  fontWeight: 600,
                  color: 'var(--color-text-secondary)',
                }}
              >
                {summary.documentationFiles}
              </div>
            </div>
            <div
              style={{
                padding: 'var(--space-sm)',
                backgroundColor: 'var(--color-bg-secondary)',
                borderRadius: 'var(--radius-sm)',
              }}
            >
              <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
                Assets
              </div>
              <div
                style={{
                  fontSize: 'var(--font-size-lg)',
                  fontWeight: 600,
                  color: 'var(--color-text)',
                }}
              >
                {summary.assetFiles}
              </div>
            </div>
            <div
              style={{
                padding: 'var(--space-sm)',
                backgroundColor: 'var(--color-bg-secondary)',
                borderRadius: 'var(--radius-sm)',
              }}
            >
              <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
                Migrations
              </div>
              <div
                style={{
                  fontSize: 'var(--font-size-lg)',
                  fontWeight: 600,
                  color: 'var(--color-primary)',
                }}
              >
                {summary.migrationFiles}
              </div>
            </div>
            <div
              style={{
                padding: 'var(--space-sm)',
                backgroundColor: 'var(--color-bg-secondary)',
                borderRadius: 'var(--radius-sm)',
              }}
            >
              <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
                Database
              </div>
              <div
                style={{
                  fontSize: 'var(--font-size-lg)',
                  fontWeight: 600,
                  color: 'var(--color-info)',
                }}
              >
                {summary.databaseFiles}
              </div>
            </div>
            <div
              style={{
                padding: 'var(--space-sm)',
                backgroundColor: 'var(--color-bg-secondary)',
                borderRadius: 'var(--radius-sm)',
              }}
            >
              <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
                Scripts
              </div>
              <div
                style={{
                  fontSize: 'var(--font-size-lg)',
                  fontWeight: 600,
                  color: 'var(--color-warning)',
                }}
              >
                {summary.scriptFiles}
              </div>
            </div>
            <div
              style={{
                padding: 'var(--space-sm)',
                backgroundColor: 'var(--color-bg-secondary)',
                borderRadius: 'var(--radius-sm)',
              }}
            >
              <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
                Generated
              </div>
              <div
                style={{
                  fontSize: 'var(--font-size-lg)',
                  fontWeight: 600,
                  color: 'var(--color-danger)',
                }}
              >
                {summary.generatedFiles}
              </div>
            </div>
            <div
              style={{
                padding: 'var(--space-sm)',
                backgroundColor: 'var(--color-bg-secondary)',
                borderRadius: 'var(--radius-sm)',
              }}
            >
              <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
                Templates
              </div>
              <div
                style={{
                  fontSize: 'var(--font-size-lg)',
                  fontWeight: 600,
                  color: 'var(--color-text-secondary)',
                }}
              >
                {summary.templateFiles}
              </div>
            </div>
            <div
              style={{
                padding: 'var(--space-sm)',
                backgroundColor: 'var(--color-bg-secondary)',
                borderRadius: 'var(--radius-sm)',
              }}
            >
              <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
                Unknown
              </div>
              <div
                style={{
                  fontSize: 'var(--font-size-lg)',
                  fontWeight: 600,
                  color: 'var(--color-text-muted)',
                }}
              >
                {summary.unknownFiles}
              </div>
            </div>
          </div>
        )}

        {/* Controls: Search and Filter */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-sm)',
            marginBottom: 'var(--space-md)',
          }}
        >
          <input
            type="text"
            placeholder="Search classified files by path..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{
              padding: 'var(--space-sm) var(--space-md)',
              backgroundColor: 'var(--color-bg-secondary)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--color-text)',
              fontSize: 'var(--font-size-sm)',
              outline: 'none',
            }}
          />

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-xs)' }}>
            {(
              [
                'ALL',
                'SOURCE',
                'TEST',
                'CONFIGURATION',
                'BUILD_TOOLING',
                'DOCUMENTATION',
                'ASSET',
                'DATABASE',
                'MIGRATION',
                'SCRIPT',
                'TEMPLATE',
                'GENERATED',
                'UNKNOWN',
              ] as const
            ).map(cat => (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCategory(cat)}
                style={{
                  padding: '4px 10px',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: 'var(--font-size-xs)',
                  fontWeight: selectedCategory === cat ? 600 : 400,
                  backgroundColor:
                    selectedCategory === cat ? 'var(--color-primary)' : 'var(--color-bg-secondary)',
                  color: selectedCategory === cat ? '#ffffff' : 'var(--color-text-secondary)',
                  border: '1px solid var(--color-border)',
                  cursor: 'pointer',
                }}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Filtered Files Table / List */}
        <div
          style={{
            maxHeight: '340px',
            overflowY: 'auto',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-sm)',
            backgroundColor: 'var(--color-bg-secondary)',
          }}
        >
          {filteredFiles.length === 0 ? (
            <div
              style={{
                padding: 'var(--space-md)',
                textAlign: 'center',
                color: 'var(--color-text-muted)',
              }}
            >
              No files match the selected filter or search query.
            </div>
          ) : (
            <table
              style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--font-size-sm)' }}
            >
              <thead>
                <tr
                  style={{
                    borderBottom: '1px solid var(--color-border)',
                    color: 'var(--color-text-muted)',
                    textAlign: 'left',
                  }}
                >
                  <th style={{ padding: 'var(--space-sm) var(--space-md)' }}>Relative Path</th>
                  <th style={{ padding: 'var(--space-sm)', width: '130px' }}>Category</th>
                  <th style={{ padding: 'var(--space-sm)', width: '90px' }}>Confidence</th>
                  <th style={{ padding: 'var(--space-sm) var(--space-md)' }}>Evidence</th>
                  {onPreviewFile && (
                    <th style={{ padding: 'var(--space-sm)', width: '80px', textAlign: 'center' }}>
                      Action
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {filteredFiles.slice(0, 100).map(file => (
                  <tr
                    key={file.relativePath}
                    style={{
                      borderBottom: '1px solid var(--color-border-subtle)',
                      color: 'var(--color-text)',
                    }}
                  >
                    <td
                      style={{
                        padding: 'var(--space-xs) var(--space-md)',
                        fontFamily: 'monospace',
                        fontSize: '12px',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        maxWidth: '280px',
                      }}
                      title={file.relativePath}
                    >
                      {file.relativePath}
                    </td>
                    <td style={{ padding: 'var(--space-xs)' }}>
                      <Badge
                        variant={
                          file.category === 'SOURCE'
                            ? 'info'
                            : file.category === 'TEST'
                              ? 'success'
                              : file.category === 'CONFIGURATION'
                                ? 'warning'
                                : file.category === 'BUILD_TOOLING'
                                  ? 'info'
                                  : file.category === 'GENERATED'
                                    ? 'danger'
                                    : 'neutral'
                        }
                      >
                        {file.category}
                      </Badge>
                    </td>
                    <td style={{ padding: 'var(--space-xs)' }}>
                      <Badge
                        variant={
                          file.confidence === 'HIGH'
                            ? 'success'
                            : file.confidence === 'MEDIUM'
                              ? 'info'
                              : 'warning'
                        }
                      >
                        {file.confidence}
                      </Badge>
                    </td>
                    <td
                      style={{
                        padding: 'var(--space-xs) var(--space-md)',
                        fontSize: '11px',
                        color: 'var(--color-text-secondary)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        maxWidth: '240px',
                      }}
                      title={file.evidence.map(e => `[${e.type}] ${e.detail}`).join(' | ')}
                    >
                      {file.evidence.map(e => `[${e.type}] ${e.detail}`).join('; ')}
                    </td>
                    {onPreviewFile && (
                      <td style={{ padding: 'var(--space-xs)', textAlign: 'center' }}>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => onPreviewFile(file.relativePath)}
                        >
                          Preview
                        </Button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        {filteredFiles.length > 100 && (
          <div
            style={{
              fontSize: 'var(--font-size-xs)',
              color: 'var(--color-text-muted)',
              marginTop: 'var(--space-xs)',
              textAlign: 'right',
            }}
          >
            {`Showing first 100 of ${filteredFiles.length} matched files`}
          </div>
        )}
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
            {`Analyzed ${formatDate(profile.analyzedAt)}`}
          </div>
          {onRefreshProfile && (
            <Button variant="secondary" size="sm" onClick={onRefreshProfile} disabled={isAnalyzing}>
              {isAnalyzing ? 'Refreshing Classification...' : 'Refresh Classification'}
            </Button>
          )}
        </div>
      </CardFooter>
    </Card>
  );
}
