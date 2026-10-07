/**
 * @file packages/core/src/website-targets/index.ts
 * Public exports and singleton factory for Website Targets and Production Safety.
 */

import { getPrismaClient } from '../database/index.js';
import { WebsiteTargetService } from './website-target-service.js';

export * from './website-target-errors.js';
export * from './url-safety.js';
export * from './connectivity-checker.js';
export * from './production-safety-checker.js';
export * from './website-target-repository.js';
export * from './website-target-mappers.js';
export * from './website-target-service.js';

let websiteTargetServiceInstance: WebsiteTargetService | null = null;

export function getWebsiteTargetService(): WebsiteTargetService {
  if (!websiteTargetServiceInstance) {
    const client = getPrismaClient();
    if (!client) {
      throw new Error('Database client is not initialized.');
    }
    websiteTargetServiceInstance = new WebsiteTargetService(client);
  }
  return websiteTargetServiceInstance;
}
