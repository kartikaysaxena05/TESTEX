import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ModuleHubCalculator, type RawImportEdge } from './module-hub-calculator.js';

describe('ModuleHubCalculator Unit Tests', () => {
  it('should accurately calculate incoming and outgoing import degrees and rank hubs', () => {
    const edges: RawImportEdge[] = [
      { fromRelativePath: 'src/app.ts', resolvedRelativePath: 'src/services/user.service.ts' },
      { fromRelativePath: 'src/routes.ts', resolvedRelativePath: 'src/services/user.service.ts' },
      { fromRelativePath: 'src/cli.ts', resolvedRelativePath: 'src/services/user.service.ts' },
      { fromRelativePath: 'src/services/user.service.ts', resolvedRelativePath: 'src/db.ts' },
      { fromRelativePath: 'src/app.ts', resolvedRelativePath: 'src/db.ts' },
    ];

    const hubs = ModuleHubCalculator.calculateHubs(edges);

    assert.ok(hubs.length >= 2);

    // user.service.ts has 3 incoming imports (imported by app.ts, routes.ts, cli.ts) and 1 outgoing import (imports db.ts)
    const userHub = hubs.find(h => h.relativePath === 'src/services/user.service.ts');
    assert.ok(userHub);
    assert.strictEqual(userHub.incomingImports, 3);
    assert.strictEqual(userHub.outgoingImports, 1);

    // db.ts has 2 incoming imports
    const dbHub = hubs.find(h => h.relativePath === 'src/db.ts');
    assert.ok(dbHub);
    assert.strictEqual(dbHub.incomingImports, 2);

    // Top hub must be user.service.ts because it has highest incoming count (3)
    assert.strictEqual(hubs[0]?.relativePath, 'src/services/user.service.ts');
  });
});
