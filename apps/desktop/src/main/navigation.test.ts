import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  APP_ROUTES,
  NAVIGATION_GROUPS,
  getRouteById,
  getRouteByPath,
  getRoutesByGroup,
  DEFAULT_ROUTE,
} from '../renderer/navigation/navigation.js';
import type { AppRouteId } from '../renderer/navigation/routes.js';

describe('Navigation Registry and Route Definition Unit Tests', () => {
  const EXPECTED_ROUTE_IDS: AppRouteId[] = [
    'overview',
    'projects',
    'source',
    'requirements',
    'test-cases',
    'test-runs',
    'defects',
    'traceability',
    'reports',
    'settings',
  ];

  it('should contain all 10 core route definitions', () => {
    assert.strictEqual(APP_ROUTES.length, 10);
    const registeredIds = APP_ROUTES.map(r => r.id);
    for (const expectedId of EXPECTED_ROUTE_IDS) {
      assert.ok(
        registeredIds.includes(expectedId),
        `Route "${expectedId}" must be registered in APP_ROUTES`,
      );
    }
  });

  it('should enforce unique route IDs and unique paths', () => {
    const ids = new Set<string>();
    const paths = new Set<string>();

    for (const route of APP_ROUTES) {
      assert.strictEqual(ids.has(route.id), false, `Duplicate route ID found: ${route.id}`);
      assert.strictEqual(paths.has(route.path), false, `Duplicate route path found: ${route.path}`);
      ids.add(route.id);
      paths.add(route.path);
    }
  });

  it('should have non-empty metadata for every route', () => {
    for (const route of APP_ROUTES) {
      assert.ok(route.label.trim().length > 0, `Route ${route.id} must have non-empty label`);
      assert.ok(route.title.trim().length > 0, `Route ${route.id} must have non-empty title`);
      assert.ok(
        route.description.trim().length > 0,
        `Route ${route.id} must have non-empty description`,
      );
      assert.ok(route.path.startsWith('/'), `Route path ${route.path} must start with /`);
    }
  });

  it('should map routes to valid navigation groups', () => {
    const validGroupIds = new Set(NAVIGATION_GROUPS.map(g => g.id));
    for (const route of APP_ROUTES) {
      assert.ok(
        validGroupIds.has(route.group),
        `Route ${route.id} has invalid group: ${route.group}`,
      );
    }
  });

  it('should resolve route definitions by ID', () => {
    const reqRoute = getRouteById('requirements');
    assert.strictEqual(reqRoute.id, 'requirements');
    assert.strictEqual(reqRoute.path, '/requirements');
    assert.strictEqual(reqRoute.title, 'Requirements');

    assert.throws(() => getRouteById('non-existent-route' as AppRouteId), /Unknown route id/);
  });

  it('should resolve route definitions by pathname', () => {
    const overviewRoute = getRouteByPath('/overview');
    assert.ok(overviewRoute);
    assert.strictEqual(overviewRoute?.id, 'overview');

    // Test with trailing slash tolerance
    const trailingSlashRoute = getRouteByPath('/test-cases/');
    assert.ok(trailingSlashRoute);
    assert.strictEqual(trailingSlashRoute?.id, 'test-cases');

    const unknownRoute = getRouteByPath('/unknown-path');
    assert.strictEqual(unknownRoute, undefined);
  });

  it('should retrieve grouped routes correctly', () => {
    const workspaceRoutes = getRoutesByGroup('workspace');
    assert.strictEqual(workspaceRoutes.length, 3);
    assert.deepStrictEqual(
      workspaceRoutes.map(r => r.id),
      ['overview', 'projects', 'source'],
    );

    const qualityRoutes = getRoutesByGroup('quality');
    assert.strictEqual(qualityRoutes.length, 5);
    assert.deepStrictEqual(
      qualityRoutes.map(r => r.id),
      ['requirements', 'test-cases', 'test-runs', 'defects', 'traceability'],
    );
  });

  it('should designate overview as default route', () => {
    assert.strictEqual(DEFAULT_ROUTE.id, 'overview');
    assert.strictEqual(DEFAULT_ROUTE.path, '/overview');
  });
});
