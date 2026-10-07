/**
 * @file packages/core/src/environments/index.ts
 * Public exports and singleton factories for Target Application & Test Environment Configuration.
 */

import { getPrismaClient } from '../database/index.js';
import { TargetApplicationService } from './target-application-service.js';
import { EnvironmentConfigurationService } from './environment-configuration-service.js';

export * from './environment-types.js';
export * from './environment-errors.js';
export * from './url-validator.js';
export * from './reachability-checker.js';
export * from './target-application-service.js';
export * from './environment-configuration-service.js';

let targetAppServiceInstance: TargetApplicationService | null = null;
let envConfigServiceInstance: EnvironmentConfigurationService | null = null;

export function getTargetApplicationService(): TargetApplicationService {
  if (!targetAppServiceInstance) {
    const client = getPrismaClient();
    if (!client) {
      throw new Error('Database client is not initialized.');
    }
    targetAppServiceInstance = new TargetApplicationService(client);
  }
  return targetAppServiceInstance;
}

export function getEnvironmentConfigurationService(): EnvironmentConfigurationService {
  if (!envConfigServiceInstance) {
    const client = getPrismaClient();
    if (!client) {
      throw new Error('Database client is not initialized.');
    }
    envConfigServiceInstance = new EnvironmentConfigurationService(client);
  }
  return envConfigServiceInstance;
}
