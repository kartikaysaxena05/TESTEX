#!/usr/bin/env node
/**
 * @file scripts/run-all-tests.js
 * Comprehensive test runner for all packages and apps in the monorepo.
 *
 * Discovers all compiled .test.js files that correspond to active TypeScript sources,
 * sorts them deterministically, and runs them via node:test with --test-concurrency=1
 * to prevent mock server port collisions and race conditions.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

/**
 * Recursively find all files matching a predicate.
 */
function findFiles(dir, predicate) {
  const results = [];
  if (!fs.existsSync(dir)) return results;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && entry.name !== '.git') {
        results.push(...findFiles(fullPath, predicate));
      }
    } else if (entry.isFile() && predicate(entry.name)) {
      results.push(fullPath);
    }
  }
  return results;
}

// 1. Discover all compiled test files in packages and apps
const candidateFiles = [
  ...findFiles(path.join(rootDir, 'packages'), name => name.endsWith('.test.js')),
  ...findFiles(path.join(rootDir, 'apps'), name => name.endsWith('.test.js')),
];

// 2. Filter to only test files that have an active source .ts or .tsx file
const validTestFiles = candidateFiles.filter(distPath => {
  const rel = path.relative(rootDir, distPath);
  const srcTs = path.join(
    rootDir,
    rel.replace(/([/\\])dist([/\\])/, '$1src$2').replace(/\.js$/, '.ts'),
  );
  const srcTsx = path.join(
    rootDir,
    rel.replace(/([/\\])dist([/\\])/, '$1src$2').replace(/\.js$/, '.tsx'),
  );
  return fs.existsSync(srcTs) || fs.existsSync(srcTsx);
});

validTestFiles.sort();

console.log(
  `[run-all-tests] Discovered ${validTestFiles.length} active compiled test suites across monorepo.`,
);

if (validTestFiles.length === 0) {
  console.error(
    '[run-all-tests] No test files found. Did you run `npm run typecheck` or `npm run desktop:build` first?',
  );
  process.exit(1);
}

// 3. Execute node:test with concurrency=1 to protect streaming and mock ports
const relFiles = validTestFiles.map(f => path.relative(rootDir, f));
const result = spawnSync(process.execPath, ['--test', '--test-concurrency=1', ...relFiles], {
  cwd: rootDir,
  stdio: 'inherit',
  env: process.env,
});

process.exit(result.status ?? (result.error ? 1 : 0));
