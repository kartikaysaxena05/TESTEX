import type { AppRouteDefinition, AppRouteId, NavigationGroupId } from './routes.js';

export interface NavigationGroupConfig {
  readonly id: NavigationGroupId;
  readonly label: string;
}

export const NAVIGATION_GROUPS: readonly NavigationGroupConfig[] = [
  { id: 'workspace', label: 'Workspace' },
  { id: 'quality', label: 'Quality' },
  { id: 'insights', label: 'Insights' },
  { id: 'system', label: 'System' },
] as const;

export const APP_ROUTES: readonly AppRouteDefinition[] = [
  {
    id: 'overview',
    path: '/overview',
    label: 'Overview',
    title: 'Overview',
    description: 'Software quality engineering workspace',
    group: 'workspace',
  },
  {
    id: 'projects',
    path: '/projects',
    label: 'Projects',
    title: 'Projects',
    description: 'Manage software projects prepared for quality analysis',
    group: 'workspace',
  },
  {
    id: 'source',
    path: '/source',
    label: 'Source',
    title: 'Source',
    description: 'Inspect repository structure and quality metadata',
    group: 'workspace',
  },
  {
    id: 'requirements',
    path: '/requirements',
    label: 'Requirements',
    title: 'Requirements',
    description: 'Manage and analyse software requirements',
    group: 'quality',
  },
  {
    id: 'test-cases',
    path: '/test-cases',
    label: 'Test Cases',
    title: 'Test Cases',
    description: 'Review requirement-linked test cases',
    group: 'quality',
  },
  {
    id: 'test-runs',
    path: '/test-runs',
    label: 'Test Runs',
    title: 'Test Runs',
    description: 'Review autonomous test execution history and results',
    group: 'quality',
  },
  {
    id: 'defects',
    path: '/defects',
    label: 'Defects',
    title: 'Defects',
    description: 'Review confirmed and suspected software defects',
    group: 'quality',
  },
  {
    id: 'traceability',
    path: '/traceability',
    label: 'Traceability',
    title: 'Traceability',
    description: 'Inspect requirement-to-test and defect traceability matrix',
    group: 'quality',
  },
  {
    id: 'reports',
    path: '/reports',
    label: 'Reports',
    title: 'Reports',
    description: 'Inspect quality analytics and test execution summaries',
    group: 'insights',
  },
  {
    id: 'settings',
    path: '/settings',
    label: 'Settings',
    title: 'Settings',
    description: 'Platform configuration and environment settings',
    group: 'system',
  },
] as const;

export const DEFAULT_ROUTE = APP_ROUTES[0] as AppRouteDefinition;

/**
 * Lookup route definition by route ID.
 */
export function getRouteById(id: AppRouteId): AppRouteDefinition {
  const route = APP_ROUTES.find(r => r.id === id);
  if (!route) {
    throw new Error(`Unknown route id: "${id}"`);
  }
  return route;
}

/**
 * Lookup route definition by URL pathname.
 */
export function getRouteByPath(pathname: string): AppRouteDefinition | undefined {
  // Normalize leading/trailing slashes
  const normalized =
    pathname.endsWith('/') && pathname.length > 1 ? pathname.slice(0, -1) : pathname;
  return APP_ROUTES.find(r => r.path === normalized);
}

/**
 * Retrieve all routes belonging to a navigation group.
 */
export function getRoutesByGroup(groupId: NavigationGroupId): AppRouteDefinition[] {
  return APP_ROUTES.filter(r => r.group === groupId);
}
