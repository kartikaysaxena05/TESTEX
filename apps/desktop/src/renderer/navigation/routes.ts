/**
 * @file apps/desktop/src/renderer/navigation/routes.ts
 * Central typed route identifiers and definition interfaces for desktop UI navigation.
 */

export type AppRouteId =
  | 'overview'
  | 'projects'
  | 'source'
  | 'requirements'
  | 'test-cases'
  | 'test-runs'
  | 'defects'
  | 'traceability'
  | 'reports'
  | 'settings';

export type NavigationGroupId = 'workspace' | 'quality' | 'insights' | 'system';

export interface AppRouteDefinition {
  readonly id: AppRouteId;
  readonly path: string;
  readonly label: string;
  readonly title: string;
  readonly description: string;
  readonly group: NavigationGroupId;
}
