import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ScopedIgnoreMatcher } from './ignore-matcher.js';

describe('ScopedIgnoreMatcher Unit Tests', () => {
  it('should match basic filenames, extensions, and wildcards', () => {
    const content = `
      # Comments should be ignored
      *.log
      temp.*
      cache/
    `;
    const matcher = new ScopedIgnoreMatcher('', content);

    assert.strictEqual(matcher.ruleCount, 3);
    assert.strictEqual(matcher.ignores('app.log'), true);
    assert.strictEqual(matcher.ignores('src/debug.log'), true);
    assert.strictEqual(matcher.ignores('temp.txt'), true);
    assert.strictEqual(matcher.ignores('src/temp.dat'), true);
    assert.strictEqual(matcher.ignores('cache', true), true);
    assert.strictEqual(matcher.ignores('app.ts'), false);
  });

  it('should support .gitignore negation rules', () => {
    const content = `
      *.log
      !important.log
    `;
    const matcher = new ScopedIgnoreMatcher('', content);

    assert.strictEqual(matcher.ignores('debug.log'), true);
    assert.strictEqual(matcher.ignores('important.log'), false);
  });

  it('should support directory-only rules', () => {
    const content = `
      build/
      dist/
    `;
    const matcher = new ScopedIgnoreMatcher('', content);

    assert.strictEqual(matcher.ignores('build', true), true);
    assert.strictEqual(matcher.ignores('dist', true), true);
    // A file named 'build' without trailing slash should not match build/
    assert.strictEqual(matcher.ignores('build', false), false);
  });

  it('should support root-anchored rules', () => {
    const content = `
      /root-only.txt
      /build/
    `;
    const matcher = new ScopedIgnoreMatcher('', content);

    assert.strictEqual(matcher.ignores('root-only.txt'), true);
    assert.strictEqual(matcher.ignores('nested/root-only.txt'), false);
    assert.strictEqual(matcher.ignores('build', true), true);
    assert.strictEqual(matcher.ignores('packages/app/build', true), false);
  });

  it('should support nested ignore rule scoping', () => {
    const content = `
      *.tmp
      dist/
    `;
    const nestedMatcher = new ScopedIgnoreMatcher('packages/client-app', content);

    assert.strictEqual(nestedMatcher.ruleCount, 2);

    // Target inside scope
    assert.strictEqual(nestedMatcher.ignores('packages/client-app/test.tmp'), true);
    assert.strictEqual(nestedMatcher.ignores('packages/client-app/dist', true), true);

    // Target outside scope should not be matched by this scoped matcher
    assert.strictEqual(nestedMatcher.ignores('packages/other-app/test.tmp'), false);
    assert.strictEqual(nestedMatcher.ignores('test.tmp'), false);
  });

  it('should normalize Windows path separators in input', () => {
    const content = `
      logs/*.log
    `;
    const matcher = new ScopedIgnoreMatcher('', content);

    assert.strictEqual(matcher.ignores('logs\\debug.log'), true);
  });

  it('should support Unicode filenames in rules and paths', () => {
    const content = `
      *.тест
      données/
    `;
    const matcher = new ScopedIgnoreMatcher('', content);

    assert.strictEqual(matcher.ignores('file.тест'), true);
    assert.strictEqual(matcher.ignores('données', true), true);
    assert.strictEqual(matcher.ignores('valid.ts'), false);
  });
});
