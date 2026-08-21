import type { HealthInfo } from '@ai-quality/contracts';

/**
 * Handle deterministic health check inspection.
 */
export function getHealthStatus(): HealthInfo {
  return {
    status: 'ok',
  };
}
