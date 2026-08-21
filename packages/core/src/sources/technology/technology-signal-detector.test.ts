import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { SourceStructureEntryDto } from '@ai-quality/contracts';
import { TechnologySignalDetector } from './technology-signal-detector.js';

describe('TechnologySignalDetector Unit Tests', () => {
  const detector = new TechnologySignalDetector();

  it('should detect Node.js ecosystem and Docker signals with transparent evidence', () => {
    const entries: SourceStructureEntryDto[] = [
      { relativePath: 'package.json', name: 'package.json', kind: 'FILE', depth: 1 },
      { relativePath: 'Dockerfile', name: 'Dockerfile', kind: 'FILE', depth: 1 },
      { relativePath: 'docker-compose.yml', name: 'docker-compose.yml', kind: 'FILE', depth: 1 },
      { relativePath: 'src/app.ts', name: 'app.ts', kind: 'FILE', depth: 2 },
    ];

    const signals = detector.detect(entries);

    const nodeSignal = signals.find(s => s.technology === 'Node.js Ecosystem');
    assert.ok(nodeSignal);
    assert.strictEqual(nodeSignal.confidence, 'HIGH');
    assert.ok(nodeSignal.evidence.includes('package.json'));

    const dockerSignal = signals.find(s => s.technology === 'Docker');
    assert.ok(dockerSignal);
    assert.strictEqual(dockerSignal.confidence, 'HIGH');
    assert.ok(dockerSignal.evidence.includes('Dockerfile'));

    // Strictly verify NO framework is claimed
    assert.strictEqual(
      signals.some(s => s.technology.includes('React')),
      false,
    );
    assert.strictEqual(
      signals.some(s => s.technology.includes('Next')),
      false,
    );
  });

  it('should detect Python, Java, Rust, and Go ecosystem signals', () => {
    const entries: SourceStructureEntryDto[] = [
      { relativePath: 'pyproject.toml', name: 'pyproject.toml', kind: 'FILE', depth: 1 },
      { relativePath: 'src/main.py', name: 'main.py', kind: 'FILE', depth: 2 },
      { relativePath: 'pom.xml', name: 'pom.xml', kind: 'FILE', depth: 1 },
      { relativePath: 'src/App.java', name: 'App.java', kind: 'FILE', depth: 2 },
      { relativePath: 'Cargo.toml', name: 'Cargo.toml', kind: 'FILE', depth: 1 },
      { relativePath: 'src/lib.rs', name: 'lib.rs', kind: 'FILE', depth: 2 },
      { relativePath: 'go.mod', name: 'go.mod', kind: 'FILE', depth: 1 },
      { relativePath: 'main.go', name: 'main.go', kind: 'FILE', depth: 1 },
    ];

    const signals = detector.detect(entries);

    assert.ok(signals.some(s => s.technology === 'Python Ecosystem' && s.confidence === 'HIGH'));
    assert.ok(
      signals.some(s => s.technology === 'Java / JVM Ecosystem' && s.confidence === 'HIGH'),
    );
    assert.ok(signals.some(s => s.technology === 'Rust Ecosystem' && s.confidence === 'HIGH'));
    assert.ok(signals.some(s => s.technology === 'Go Ecosystem' && s.confidence === 'HIGH'));

    // Verify NO Django, Spring, Flask claims
    assert.strictEqual(
      signals.some(s => s.technology.includes('Spring')),
      false,
    );
    assert.strictEqual(
      signals.some(s => s.technology.includes('Django')),
      false,
    );
  });

  it('should detect GraphQL, Protobuf, and Terraform signals', () => {
    const entries: SourceStructureEntryDto[] = [
      { relativePath: 'schema.graphql', name: 'schema.graphql', kind: 'FILE', depth: 1 },
      { relativePath: 'service.proto', name: 'service.proto', kind: 'FILE', depth: 1 },
      { relativePath: 'main.tf', name: 'main.tf', kind: 'FILE', depth: 1 },
    ];

    const signals = detector.detect(entries);

    assert.ok(signals.some(s => s.technology === 'GraphQL'));
    assert.ok(signals.some(s => s.technology === 'Protocol Buffers'));
    assert.ok(signals.some(s => s.technology === 'Terraform (HCL)'));
  });
});
