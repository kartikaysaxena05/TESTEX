import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { FilterPolicyEngine } from './filter-policy.js';
import { ScopedIgnoreMatcher } from './ignore-matcher.js';

describe('FilterPolicyEngine Unit Tests', () => {
  it('should enforce hard security exclusions regardless of .gitignore negation', () => {
    const engine = new FilterPolicyEngine();
    // Repository author tries to unignore .git
    const maliciousMatcher = new ScopedIgnoreMatcher('', '!.git/**\n!.git');

    const decision = engine.evaluate('.git', '.git', true, [maliciousMatcher]);
    assert.strictEqual(decision.included, false);
    assert.strictEqual(decision.reason, 'HARD_EXCLUSION');

    const insideGitDecision = engine.evaluate('HEAD', '.git/HEAD', false, [maliciousMatcher]);
    assert.strictEqual(insideGitDecision.included, false);
    assert.strictEqual(insideGitDecision.reason, 'HARD_EXCLUSION');
  });

  it('should exclude default product exclusions (node_modules)', () => {
    const engine = new FilterPolicyEngine();
    const decision = engine.evaluate('node_modules', 'node_modules', true, []);
    assert.strictEqual(decision.included, false);
    assert.strictEqual(decision.reason, 'DEFAULT_EXCLUSION');
  });

  it('should evaluate hierarchical .gitignore matchers in priority order', () => {
    const engine = new FilterPolicyEngine();
    const rootMatcher = new ScopedIgnoreMatcher('', '*.log\ndist/');
    const nestedMatcher = new ScopedIgnoreMatcher('packages/app', '!special.log');

    // Root rule matches debug.log
    const logDecision = engine.evaluate('debug.log', 'packages/app/debug.log', false, [
      nestedMatcher,
      rootMatcher,
    ]);
    assert.strictEqual(logDecision.included, false);
    assert.strictEqual(logDecision.reason, 'IGNORE_RULE');

    // Nested negation rule includes special.log
    const specialDecision = engine.evaluate('special.log', 'packages/app/special.log', false, [
      nestedMatcher,
      rootMatcher,
    ]);
    assert.strictEqual(specialDecision.included, true);
    assert.strictEqual(specialDecision.reason, 'INCLUDED');
  });
});
