/**
 * @file apps/desktop/src/renderer/features/dashboard/PlatformHealthPanel.tsx
 * Platform Health monitoring card showing real infrastructure and AI service readiness.
 */

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardHeader, CardTitle, CardContent } from '../../ui/Card.js';
import { Badge, type BadgeVariant } from '../../ui/Badge.js';
import { Spinner } from '../../ui/Spinner.js';
import { usePlatformHealth, type HealthBadgeStatus } from './usePlatformHealth.js';

function mapHealthToBadgeVariant(status: HealthBadgeStatus): BadgeVariant {
  switch (status) {
    case 'ready':
      return 'success';
    case 'degraded':
      return 'warning';
    case 'error':
      return 'danger';
    case 'neutral':
    default:
      return 'neutral';
  }
}

export function PlatformHealthPanel(): React.JSX.Element {
  const navigate = useNavigate();
  const { services, isChecking } = usePlatformHealth();

  return (
    <Card variant="default" className="platform-health-panel" data-testid="platform-health-panel">
      <CardHeader>
        <div className="platform-health-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <CardTitle level={3} className="platform-health-title">
              Platform Health
            </CardTitle>
            {isChecking && <Spinner size="sm" />}
          </div>
          <span className="platform-health-subtitle">Real-time infrastructure</span>
        </div>
      </CardHeader>

      <CardContent>
        <div className="health-services-list" role="list" aria-label="Platform Services Status">
          {services.map(service => (
            <div
              key={service.id}
              className="health-service-row"
              data-testid={`health-service-${service.id}`}
              role="listitem"
            >
              <div className="health-service-info">
                <span className="health-service-name">{service.name}</span>
                {service.detail && <span className="health-service-detail">{service.detail}</span>}
              </div>

              <div className="health-service-status">
                <Badge
                  variant={mapHealthToBadgeVariant(service.status)}
                  dot
                  title={`${service.name}: ${service.statusLabel}`}
                >
                  {service.statusLabel}
                </Badge>
              </div>
            </div>
          ))}
        </div>

        <div className="platform-health-footer">
          <button
            type="button"
            className="settings-link-btn"
            onClick={() => navigate('/settings')}
            aria-label="View system settings"
          >
            <span>View system settings</span>
            <span aria-hidden="true">→</span>
          </button>
        </div>
      </CardContent>
    </Card>
  );
}
