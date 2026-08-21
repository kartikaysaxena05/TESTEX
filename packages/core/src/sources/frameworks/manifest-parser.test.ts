import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { SafeManifestParser } from './manifest-parser.js';

describe('SafeManifestParser Unit & Security Tests', () => {
  const parser = new SafeManifestParser();

  it('should parse package.json correctly with runtime, dev, and peer scopes', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'manifest-pjson-'));
    fs.writeFileSync(
      path.join(tempDir, 'package.json'),
      JSON.stringify({
        name: 'sample-app',
        packageManager: 'pnpm@9.1.0',
        scripts: { build: 'tsc', test: 'vitest' },
        dependencies: { react: '^19.0.0', 'react-dom': '^19.0.0' },
        devDependencies: { typescript: '^5.7.0', vitest: '^3.0.0' },
        peerDependencies: { graphql: '^16.0.0' },
      }),
      'utf-8',
    );

    const res = await parser.parseManifest(tempDir, 'package.json');
    assert.ok(res);
    assert.strictEqual(res.manifestSummary.directDependencyCount, 2);
    assert.strictEqual(res.manifestSummary.devDependencyCount, 2);
    assert.deepStrictEqual(res.manifestSummary.scriptNames, ['build', 'test']);
    assert.strictEqual(res.packageManagerField, 'pnpm@9.1.0');

    assert.ok(
      res.dependencies.some(
        d => d.name === 'react' && d.scope === 'RUNTIME' && d.declaredVersion === '^19.0.0',
      ),
    );
    assert.ok(res.dependencies.some(d => d.name === 'vitest' && d.scope === 'DEVELOPMENT'));
    assert.ok(res.dependencies.some(d => d.name === 'graphql' && d.scope === 'PEER'));

    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('should parse pyproject.toml and requirements.txt safely without executing code', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'manifest-py-'));
    fs.writeFileSync(
      path.join(tempDir, 'pyproject.toml'),
      `[project]
name = "my-service"
dependencies = [
  "fastapi>=0.115.0",
  "uvicorn"
]
[tool.poetry.dependencies]
python = "^3.12"
pydantic = "^2.10.0"
`,
      'utf-8',
    );

    fs.writeFileSync(
      path.join(tempDir, 'requirements-dev.txt'),
      `# Test dependencies
pytest>=8.0.0
pytest-asyncio==0.23.0
-r base.txt
`,
      'utf-8',
    );

    const tomlRes = await parser.parseManifest(tempDir, 'pyproject.toml');
    assert.ok(tomlRes);
    assert.ok(tomlRes.dependencies.some(d => d.name === 'fastapi'));
    assert.ok(tomlRes.dependencies.some(d => d.name === 'pydantic'));

    const reqRes = await parser.parseManifest(tempDir, 'requirements-dev.txt');
    assert.ok(reqRes);
    assert.ok(reqRes.dependencies.some(d => d.name === 'pytest' && d.scope === 'DEVELOPMENT'));

    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('should parse pom.xml dependencies and block XXE external entity injection', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'manifest-pom-'));

    // 1. Valid POM
    const validPom = `<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0">
  <modelVersion>4.0.0</modelVersion>
  <groupId>com.example</groupId>
  <artifactId>demo-app</artifactId>
  <version>1.0.0</version>
  <dependencies>
    <dependency>
      <groupId>org.springframework.boot</groupId>
      <artifactId>spring-boot-starter-web</artifactId>
      <version>3.4.0</version>
    </dependency>
    <dependency>
      <groupId>org.junit.jupiter</groupId>
      <artifactId>junit-jupiter</artifactId>
      <scope>test</scope>
    </dependency>
  </dependencies>
</project>`;

    fs.writeFileSync(path.join(tempDir, 'pom.xml'), validPom, 'utf-8');

    const validRes = await parser.parseManifest(tempDir, 'pom.xml');
    assert.ok(validRes);
    assert.ok(
      validRes.dependencies.some(
        d => d.name.includes('spring-boot-starter-web') && d.scope === 'RUNTIME',
      ),
    );
    assert.ok(
      validRes.dependencies.some(
        d => d.name.includes('junit-jupiter') && d.scope === 'DEVELOPMENT',
      ),
    );

    // 2. Malicious XXE POM
    const maliciousPom = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE project [
  <!ENTITY xxe SYSTEM "file:///etc/passwd">
]>
<project xmlns="http://maven.apache.org/POM/4.0.0">
  <modelVersion>4.0.0</modelVersion>
  <groupId>com.example</groupId>
  <artifactId>demo-app</artifactId>
  <version>1.0.0</version>
  <dependencies>
    <dependency>
      <groupId>&xxe;</groupId>
      <artifactId>spring-boot-starter-web</artifactId>
    </dependency>
  </dependencies>
</project>`;

    fs.writeFileSync(path.join(tempDir, 'pom.xml'), maliciousPom, 'utf-8');

    const xxeRes = await parser.parseManifest(tempDir, 'pom.xml');
    assert.ok(xxeRes);
    assert.ok(
      xxeRes.warnings.some(
        w => w.includes('External entities are not supported') || w.includes('Failed to parse'),
      ),
    );

    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('should parse Cargo.toml, go.mod, pubspec.yaml, and *.csproj', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'manifest-poly-'));

    // Cargo.toml
    fs.writeFileSync(
      path.join(tempDir, 'Cargo.toml'),
      `[package]
name = "rust-service"
version = "0.1.0"

[dependencies]
actix-web = "4"
serde = { version = "1.0", features = ["derive"] }

[dev-dependencies]
tokio-test = "0.4"
`,
      'utf-8',
    );

    // go.mod
    fs.writeFileSync(
      path.join(tempDir, 'go.mod'),
      `module github.com/example/goservice

go 1.22

require (
\tgithub.com/gin-gonic/gin v1.9.1
\tgithub.com/stretchr/testify v1.8.4
)
`,
      'utf-8',
    );

    // pubspec.yaml
    fs.writeFileSync(
      path.join(tempDir, 'pubspec.yaml'),
      `name: flutter_app
dependencies:
  flutter:
    sdk: flutter
  cupertino_icons: ^1.0.8
dev_dependencies:
  flutter_test:
    sdk: flutter
`,
      'utf-8',
    );

    // service.csproj
    fs.writeFileSync(
      path.join(tempDir, 'service.csproj'),
      `<Project Sdk="Microsoft.NET.Sdk.Web">
  <ItemGroup>
    <PackageReference Include="Microsoft.AspNetCore.OpenApi" Version="8.0.0" />
    <PackageReference Include="Swashbuckle.AspNetCore" Version="6.4.0" />
  </ItemGroup>
</Project>`,
      'utf-8',
    );

    const cargoRes = await parser.parseManifest(tempDir, 'Cargo.toml');
    assert.ok(cargoRes);
    assert.ok(cargoRes.dependencies.some(d => d.name === 'actix-web'));

    const goRes = await parser.parseManifest(tempDir, 'go.mod');
    assert.ok(goRes);
    assert.ok(goRes.dependencies.some(d => d.name === 'github.com/gin-gonic/gin'));

    const pubRes = await parser.parseManifest(tempDir, 'pubspec.yaml');
    assert.ok(pubRes);
    assert.ok(pubRes.dependencies.some(d => d.name === 'cupertino_icons'));

    const csRes = await parser.parseManifest(tempDir, 'service.csproj');
    assert.ok(csRes);
    assert.ok(csRes.dependencies.some(d => d.name === 'Microsoft.AspNetCore.OpenApi'));

    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('should skip oversized manifests safely with warning', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'manifest-huge-'));
    const bigFile = path.join(tempDir, 'package.json');
    // Create a 6MB file (exceeds 5MB limit)
    const handle = fs.openSync(bigFile, 'w');
    const buffer = Buffer.alloc(1024 * 1024, ' ');
    for (let i = 0; i < 6; i++) {
      fs.writeSync(handle, buffer);
    }
    fs.closeSync(handle);

    const res = await parser.parseManifest(tempDir, 'package.json');
    assert.ok(res);
    assert.strictEqual(res.dependencies.length, 0);
    assert.ok(res.warnings.some(w => w.includes('exceeds maximum size')));

    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('should prevent path containment escape and symlink escape', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'manifest-escape-'));
    const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), 'manifest-outside-'));
    const secretFile = path.join(outsideDir, 'secret.json');
    fs.writeFileSync(secretFile, '{"dependencies":{"secret":"1.0.0"}}', 'utf-8');

    // 1. Directory traversal attempt
    const resTraversal = await parser.parseManifest(tempDir, '../manifest-outside/secret.json');
    assert.strictEqual(resTraversal, null);

    // 2. Symlink escape attempt
    fs.symlinkSync(secretFile, path.join(tempDir, 'package.json'));
    const resSymlink = await parser.parseManifest(tempDir, 'package.json');
    assert.strictEqual(resSymlink, null);

    fs.rmSync(tempDir, { recursive: true, force: true });
    fs.rmSync(outsideDir, { recursive: true, force: true });
  });
});
