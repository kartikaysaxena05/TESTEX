import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { CommandSafetyChecker } from './command-safety-checker.js';

describe('CommandSafetyChecker Unit Tests', () => {
  it('should parse simple single command without shell interpretation as SAFE_STRUCTURE', () => {
    const res = CommandSafetyChecker.inspectCommand('next dev --port 3000');
    assert.strictEqual(res.safety, 'SAFE_STRUCTURE');
    assert.strictEqual(res.executable, 'next');
    assert.deepStrictEqual(res.args, ['dev', '--port', '3000']);
  });

  it('should flag commands with shell chaining (&&) as REQUIRES_REVIEW', () => {
    const res = CommandSafetyChecker.inspectCommand('npm run setup && next dev');
    assert.strictEqual(res.safety, 'REQUIRES_REVIEW');
    assert.ok(res.reason.includes('shell chaining'));
  });

  it('should flag commands with shell pipelines (|) as REQUIRES_REVIEW', () => {
    const res = CommandSafetyChecker.inspectCommand('cat config.json | jq .');
    assert.strictEqual(res.safety, 'REQUIRES_REVIEW');
    assert.ok(res.reason.includes('pipelines'));
  });

  it('should flag destructive shell scripts as REQUIRES_REVIEW', () => {
    const res = CommandSafetyChecker.inspectCommand('rm -rf /');
    assert.strictEqual(res.safety, 'REQUIRES_REVIEW');
  });

  it('should flag repository wrapper scripts (./mvnw) as REQUIRES_REVIEW', () => {
    const res = CommandSafetyChecker.inspectCommand('./mvnw spring-boot:run');
    assert.strictEqual(res.safety, 'REQUIRES_REVIEW');
    assert.strictEqual(res.executable, './mvnw');
  });
});
