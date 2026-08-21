/**
 * @file packages/core/src/sources/frameworks/manifest-parser.ts
 * Safe, static, non-evaluating manifest parsing engine.
 *
 * CRITICAL SECURITY INVARIANTS:
 * 1. ZERO script/code execution (no eval, no require, no import, no process spawning).
 * 2. XML parsing has external entities (XXE) and external DTDs strictly disabled.
 * 3. File size limits are enforced before reading to prevent memory exhaustion.
 * 4. Path containment within authorized source root is re-verified before reading.
 * 5. Symlinks escaping root are skipped.
 */

import fs from 'node:fs';
import path from 'node:path';
import yaml from 'yaml';
import { XMLParser } from 'fast-xml-parser';
import * as toml from 'smol-toml';
import type { DependencyDto, ManifestSummaryDto } from '@ai-quality/contracts';
import {
  MAX_MANIFEST_SIZE_BYTES,
  RECOGNIZED_MANIFESTS,
  type ManifestKind,
} from './manifest-allowlist.js';

export interface ParsedManifestResult {
  readonly manifestSummary: ManifestSummaryDto;
  readonly dependencies: readonly DependencyDto[];
  readonly packageManagerField?: string;
  readonly warnings: readonly string[];
}

export class SafeManifestParser {
  private readonly xmlParser = new XMLParser({
    ignoreAttributes: false,
    processEntities: false, // XXE safety: disable entity expansion
    allowBooleanAttributes: true,
  });

  /**
   * Safely reads and statically parses a manifest file within the authorized root.
   */
  async parseManifest(
    authorizedRoot: string,
    repoRelativePath: string,
  ): Promise<ParsedManifestResult | null> {
    const warnings: string[] = [];
    const absolutePath = path.join(authorizedRoot, repoRelativePath);

    // 1. Path Containment Verification
    const relCheck = path.relative(authorizedRoot, absolutePath);
    if (relCheck.startsWith('..') || path.isAbsolute(relCheck)) {
      warnings.push(`Manifest path escapes authorized root: "${repoRelativePath}"`);
      return null;
    }

    // 2. Stat and Size Limit Check
    let stat: fs.Stats;
    try {
      stat = await fs.promises.lstat(absolutePath);
      if (stat.isSymbolicLink()) {
        const real = await fs.promises.realpath(absolutePath);
        const linkCheck = path.relative(authorizedRoot, real);
        if (linkCheck.startsWith('..') || path.isAbsolute(linkCheck)) {
          warnings.push(`Symlinked manifest points outside authorized root: "${repoRelativePath}"`);
          return null;
        }
      }
      if (!stat.isFile() && !stat.isSymbolicLink()) {
        return null;
      }
      if (stat.size > MAX_MANIFEST_SIZE_BYTES) {
        warnings.push(
          `Manifest "${repoRelativePath}" exceeds maximum size (${stat.size} bytes > ${MAX_MANIFEST_SIZE_BYTES} bytes). Skipped.`,
        );
        return {
          manifestSummary: {
            relativePath: repoRelativePath,
            ecosystem: 'Unknown',
            directDependencyCount: 0,
            devDependencyCount: 0,
            scriptNames: [],
          },
          dependencies: [],
          warnings,
        };
      }
    } catch {
      return null;
    }

    // 3. Identify Manifest Kind
    const fileName = path.basename(repoRelativePath);
    const spec = RECOGNIZED_MANIFESTS.find(m => m.filenamePattern.test(fileName));
    if (!spec) {
      return null;
    }

    // 4. Read File Content
    let content: string;
    try {
      content = await fs.promises.readFile(absolutePath, 'utf-8');
    } catch (err: unknown) {
      warnings.push(
        `Failed to read manifest "${repoRelativePath}": ${err instanceof Error ? err.message : 'I/O error'}`,
      );
      return null;
    }

    // 5. Parse Content statically based on Manifest Kind
    try {
      return this.parseByKind(spec.kind, spec.ecosystem, repoRelativePath, content);
    } catch (err: unknown) {
      warnings.push(
        `Failed to parse manifest "${repoRelativePath}": ${err instanceof Error ? err.message : 'Syntax error'}`,
      );
      return {
        manifestSummary: {
          relativePath: repoRelativePath,
          ecosystem: spec.ecosystem,
          directDependencyCount: 0,
          devDependencyCount: 0,
          scriptNames: [],
        },
        dependencies: [],
        warnings,
      };
    }
  }

  private parseByKind(
    kind: ManifestKind,
    ecosystem: string,
    relativePath: string,
    content: string,
  ): ParsedManifestResult {
    switch (kind) {
      case 'PACKAGE_JSON':
        return this.parsePackageJson(ecosystem, relativePath, content);
      case 'PYPROJECT_TOML':
        return this.parsePyprojectToml(ecosystem, relativePath, content);
      case 'REQUIREMENTS_TXT':
        return this.parseRequirementsTxt(ecosystem, relativePath, content);
      case 'POM_XML':
        return this.parsePomXml(ecosystem, relativePath, content);
      case 'BUILD_GRADLE':
        return this.parseBuildGradle(ecosystem, relativePath, content);
      case 'CARGO_TOML':
        return this.parseCargoToml(ecosystem, relativePath, content);
      case 'GO_MOD':
        return this.parseGoMod(ecosystem, relativePath, content);
      case 'COMPOSER_JSON':
        return this.parseComposerJson(ecosystem, relativePath, content);
      case 'GEMFILE':
        return this.parseGemfile(ecosystem, relativePath, content);
      case 'PUBSPEC_YAML':
        return this.parsePubspecYaml(ecosystem, relativePath, content);
      case 'CSPROJ':
        return this.parseCsproj(ecosystem, relativePath, content);
    }
  }

  // --- Parser Implementations ---

  private parsePackageJson(
    ecosystem: string,
    relativePath: string,
    content: string,
  ): ParsedManifestResult {
    const json = JSON.parse(content) as Record<string, unknown>;
    const dependencies: DependencyDto[] = [];

    const extractSection = (
      sectionObj: unknown,
      scope: 'RUNTIME' | 'DEVELOPMENT' | 'PEER' | 'OPTIONAL',
    ) => {
      if (sectionObj && typeof sectionObj === 'object') {
        for (const [name, version] of Object.entries(sectionObj as Record<string, unknown>)) {
          dependencies.push({
            name,
            declaredVersion: typeof version === 'string' ? version : null,
            scope,
            ecosystem,
            sourceManifest: relativePath,
          });
        }
      }
    };

    extractSection(json['dependencies'], 'RUNTIME');
    extractSection(json['devDependencies'], 'DEVELOPMENT');
    extractSection(json['peerDependencies'], 'PEER');
    extractSection(json['optionalDependencies'], 'OPTIONAL');

    const scriptNames =
      json['scripts'] && typeof json['scripts'] === 'object'
        ? Object.keys(json['scripts'] as Record<string, unknown>)
        : [];

    const packageManagerField =
      typeof json['packageManager'] === 'string' ? json['packageManager'] : undefined;

    const directCount = dependencies.filter(d => d.scope === 'RUNTIME').length;
    const devCount = dependencies.filter(d => d.scope === 'DEVELOPMENT').length;

    return {
      manifestSummary: {
        relativePath,
        ecosystem,
        directDependencyCount: directCount,
        devDependencyCount: devCount,
        scriptNames,
      },
      dependencies,
      packageManagerField,
      warnings: [],
    };
  }

  private parsePyprojectToml(
    ecosystem: string,
    relativePath: string,
    content: string,
  ): ParsedManifestResult {
    const parsed = toml.parse(content) as Record<string, unknown>;
    const dependencies: DependencyDto[] = [];

    // [project.dependencies]
    const project = parsed['project'] as Record<string, unknown> | undefined;
    if (project && Array.isArray(project['dependencies'])) {
      for (const item of project['dependencies']) {
        if (typeof item === 'string') {
          const match = item.match(/^([a-zA-Z0-9_\-.]+)(.*)$/);
          if (match) {
            dependencies.push({
              name: match[1]!,
              declaredVersion: match[2]?.trim() || null,
              scope: 'RUNTIME',
              ecosystem,
              sourceManifest: relativePath,
            });
          }
        }
      }
    }

    // [tool.poetry.dependencies]
    const tool = parsed['tool'] as Record<string, unknown> | undefined;
    const poetry = tool?.['poetry'] as Record<string, unknown> | undefined;
    const poetryDeps = poetry?.['dependencies'] as Record<string, unknown> | undefined;
    if (poetryDeps && typeof poetryDeps === 'object') {
      for (const [name, val] of Object.entries(poetryDeps)) {
        if (name.toLowerCase() !== 'python') {
          dependencies.push({
            name,
            declaredVersion: typeof val === 'string' ? val : null,
            scope: 'RUNTIME',
            ecosystem,
            sourceManifest: relativePath,
          });
        }
      }
    }

    const directCount = dependencies.length;
    return {
      manifestSummary: {
        relativePath,
        ecosystem,
        directDependencyCount: directCount,
        devDependencyCount: 0,
        scriptNames: [],
      },
      dependencies,
      warnings: [],
    };
  }

  private parseRequirementsTxt(
    ecosystem: string,
    relativePath: string,
    content: string,
  ): ParsedManifestResult {
    const lines = content.split(/\r?\n/);
    const dependencies: DependencyDto[] = [];
    const isDev =
      relativePath.toLowerCase().includes('dev') || relativePath.toLowerCase().includes('test');

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('-')) {
        continue;
      }
      const match = trimmed.match(/^([a-zA-Z0-9_\-.]+)(.*)$/);
      if (match) {
        dependencies.push({
          name: match[1]!,
          declaredVersion: match[2]?.trim() || null,
          scope: isDev ? 'DEVELOPMENT' : 'RUNTIME',
          ecosystem,
          sourceManifest: relativePath,
        });
      }
    }

    return {
      manifestSummary: {
        relativePath,
        ecosystem,
        directDependencyCount: isDev ? 0 : dependencies.length,
        devDependencyCount: isDev ? dependencies.length : 0,
        scriptNames: [],
      },
      dependencies,
      warnings: [],
    };
  }

  private parsePomXml(
    ecosystem: string,
    relativePath: string,
    content: string,
  ): ParsedManifestResult {
    const xml = this.xmlParser.parse(content) as Record<string, unknown>;
    const dependencies: DependencyDto[] = [];

    const project = xml['project'] as Record<string, unknown> | undefined;
    const depsNode = project?.['dependencies'] as Record<string, unknown> | undefined;
    const depList = depsNode?.['dependency'];

    const items = Array.isArray(depList) ? depList : depList ? [depList] : [];
    for (const item of items) {
      if (item && typeof item === 'object') {
        const artifactId = item['artifactId'];
        const groupId = item['groupId'];
        const version = item['version'];
        const scope = item['scope'];

        if (artifactId && typeof artifactId === 'string') {
          const name = groupId ? `${groupId}:${artifactId}` : artifactId;
          const isDev = scope === 'test';
          dependencies.push({
            name,
            declaredVersion: typeof version === 'string' ? version : null,
            scope: isDev ? 'DEVELOPMENT' : 'RUNTIME',
            ecosystem,
            sourceManifest: relativePath,
          });
        }
      }
    }

    return {
      manifestSummary: {
        relativePath,
        ecosystem,
        directDependencyCount: dependencies.filter(d => d.scope === 'RUNTIME').length,
        devDependencyCount: dependencies.filter(d => d.scope === 'DEVELOPMENT').length,
        scriptNames: [],
      },
      dependencies,
      warnings: [],
    };
  }

  private parseBuildGradle(
    ecosystem: string,
    relativePath: string,
    content: string,
  ): ParsedManifestResult {
    // Static regex extraction (zero execution)
    const dependencies: DependencyDto[] = [];
    const lines = content.split(/\r?\n/);

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('//') || trimmed.startsWith('/*')) continue;

      const match = trimmed.match(
        /(implementation|testImplementation|compileOnly|runtimeOnly|api)\s+['"]([^'"]+)['"]/,
      );
      if (match && match[2]) {
        const parts = match[2].split(':');
        const name = parts.length >= 2 ? `${parts[0]}:${parts[1]}` : match[2];
        const version = parts.length >= 3 ? (parts[2] ?? null) : null;
        const isDev = match[1]?.startsWith('test');

        dependencies.push({
          name,
          declaredVersion: version,
          scope: isDev ? 'DEVELOPMENT' : 'RUNTIME',
          ecosystem,
          sourceManifest: relativePath,
        });
      }
    }

    return {
      manifestSummary: {
        relativePath,
        ecosystem,
        directDependencyCount: dependencies.filter(d => d.scope === 'RUNTIME').length,
        devDependencyCount: dependencies.filter(d => d.scope === 'DEVELOPMENT').length,
        scriptNames: [],
      },
      dependencies,
      warnings: [],
    };
  }

  private parseCargoToml(
    ecosystem: string,
    relativePath: string,
    content: string,
  ): ParsedManifestResult {
    const parsed = toml.parse(content) as Record<string, unknown>;
    const dependencies: DependencyDto[] = [];

    const extractSection = (sectionObj: unknown, scope: 'RUNTIME' | 'DEVELOPMENT') => {
      if (sectionObj && typeof sectionObj === 'object') {
        for (const [name, val] of Object.entries(sectionObj as Record<string, unknown>)) {
          let version: string | null = null;
          if (typeof val === 'string') {
            version = val;
          } else if (
            val &&
            typeof val === 'object' &&
            'version' in (val as Record<string, unknown>)
          ) {
            const v = (val as Record<string, unknown>)['version'];
            if (typeof v === 'string') version = v;
          }
          dependencies.push({
            name,
            declaredVersion: version,
            scope,
            ecosystem,
            sourceManifest: relativePath,
          });
        }
      }
    };

    extractSection(parsed['dependencies'], 'RUNTIME');
    extractSection(parsed['dev-dependencies'], 'DEVELOPMENT');

    return {
      manifestSummary: {
        relativePath,
        ecosystem,
        directDependencyCount: dependencies.filter(d => d.scope === 'RUNTIME').length,
        devDependencyCount: dependencies.filter(d => d.scope === 'DEVELOPMENT').length,
        scriptNames: [],
      },
      dependencies,
      warnings: [],
    };
  }

  private parseGoMod(
    ecosystem: string,
    relativePath: string,
    content: string,
  ): ParsedManifestResult {
    const lines = content.split(/\r?\n/);
    const dependencies: DependencyDto[] = [];
    let insideRequireBlock = false;

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('require (')) {
        insideRequireBlock = true;
        continue;
      }
      if (insideRequireBlock && trimmed === ')') {
        insideRequireBlock = false;
        continue;
      }

      if (insideRequireBlock) {
        const parts = trimmed.split(/\s+/);
        if (parts.length >= 2 && !parts[0]!.startsWith('//')) {
          dependencies.push({
            name: parts[0]!,
            declaredVersion: parts[1] || null,
            scope: 'RUNTIME',
            ecosystem,
            sourceManifest: relativePath,
          });
        }
      } else if (trimmed.startsWith('require ')) {
        const parts = trimmed.slice(8).trim().split(/\s+/);
        if (parts.length >= 2) {
          dependencies.push({
            name: parts[0]!,
            declaredVersion: parts[1] || null,
            scope: 'RUNTIME',
            ecosystem,
            sourceManifest: relativePath,
          });
        }
      }
    }

    return {
      manifestSummary: {
        relativePath,
        ecosystem,
        directDependencyCount: dependencies.length,
        devDependencyCount: 0,
        scriptNames: [],
      },
      dependencies,
      warnings: [],
    };
  }

  private parseComposerJson(
    ecosystem: string,
    relativePath: string,
    content: string,
  ): ParsedManifestResult {
    const json = JSON.parse(content) as Record<string, unknown>;
    const dependencies: DependencyDto[] = [];

    const extractSection = (sectionObj: unknown, scope: 'RUNTIME' | 'DEVELOPMENT') => {
      if (sectionObj && typeof sectionObj === 'object') {
        for (const [name, val] of Object.entries(sectionObj as Record<string, unknown>)) {
          if (name !== 'php') {
            dependencies.push({
              name,
              declaredVersion: typeof val === 'string' ? val : null,
              scope,
              ecosystem,
              sourceManifest: relativePath,
            });
          }
        }
      }
    };

    extractSection(json['require'], 'RUNTIME');
    extractSection(json['require-dev'], 'DEVELOPMENT');

    return {
      manifestSummary: {
        relativePath,
        ecosystem,
        directDependencyCount: dependencies.filter(d => d.scope === 'RUNTIME').length,
        devDependencyCount: dependencies.filter(d => d.scope === 'DEVELOPMENT').length,
        scriptNames: [],
      },
      dependencies,
      warnings: [],
    };
  }

  private parseGemfile(
    ecosystem: string,
    relativePath: string,
    content: string,
  ): ParsedManifestResult {
    const lines = content.split(/\r?\n/);
    const dependencies: DependencyDto[] = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('#')) continue;

      const match = trimmed.match(/^gem\s+['"]([^'"]+)['"](?:\s*,\s*['"]([^'"]+)['"])?/);
      if (match && match[1]) {
        dependencies.push({
          name: match[1],
          declaredVersion: match[2] || null,
          scope: 'RUNTIME',
          ecosystem,
          sourceManifest: relativePath,
        });
      }
    }

    return {
      manifestSummary: {
        relativePath,
        ecosystem,
        directDependencyCount: dependencies.length,
        devDependencyCount: 0,
        scriptNames: [],
      },
      dependencies,
      warnings: [],
    };
  }

  private parsePubspecYaml(
    ecosystem: string,
    relativePath: string,
    content: string,
  ): ParsedManifestResult {
    const doc = yaml.parse(content) as Record<string, unknown>;
    const dependencies: DependencyDto[] = [];

    const extractSection = (sectionObj: unknown, scope: 'RUNTIME' | 'DEVELOPMENT') => {
      if (sectionObj && typeof sectionObj === 'object') {
        for (const [name, val] of Object.entries(sectionObj as Record<string, unknown>)) {
          if (name !== 'flutter') {
            const version =
              typeof val === 'string'
                ? val
                : val && typeof val === 'object' && 'sdk' in (val as Record<string, unknown>)
                  ? 'sdk'
                  : null;
            dependencies.push({
              name,
              declaredVersion: version ?? null,
              scope,
              ecosystem,
              sourceManifest: relativePath,
            });
          }
        }
      }
    };

    extractSection(doc['dependencies'], 'RUNTIME');
    extractSection(doc['dev_dependencies'], 'DEVELOPMENT');

    return {
      manifestSummary: {
        relativePath,
        ecosystem,
        directDependencyCount: dependencies.filter(d => d.scope === 'RUNTIME').length,
        devDependencyCount: dependencies.filter(d => d.scope === 'DEVELOPMENT').length,
        scriptNames: [],
      },
      dependencies,
      warnings: [],
    };
  }

  private parseCsproj(
    ecosystem: string,
    relativePath: string,
    content: string,
  ): ParsedManifestResult {
    const xml = this.xmlParser.parse(content) as Record<string, unknown>;
    const dependencies: DependencyDto[] = [];

    const project = xml['Project'] as Record<string, unknown> | undefined;
    const itemGroups = project?.['ItemGroup'];
    const groups = Array.isArray(itemGroups) ? itemGroups : itemGroups ? [itemGroups] : [];

    for (const group of groups) {
      if (group && typeof group === 'object') {
        const pkgRefs = (group as Record<string, unknown>)['PackageReference'];
        const refs = Array.isArray(pkgRefs) ? pkgRefs : pkgRefs ? [pkgRefs] : [];

        for (const ref of refs) {
          if (ref && typeof ref === 'object') {
            const name = (ref as Record<string, unknown>)['@_Include'];
            const version = (ref as Record<string, unknown>)['@_Version'];
            if (typeof name === 'string') {
              dependencies.push({
                name,
                declaredVersion: typeof version === 'string' ? version : null,
                scope: 'RUNTIME',
                ecosystem,
                sourceManifest: relativePath,
              });
            }
          }
        }
      }
    }

    return {
      manifestSummary: {
        relativePath,
        ecosystem,
        directDependencyCount: dependencies.length,
        devDependencyCount: 0,
        scriptNames: [],
      },
      dependencies,
      warnings: [],
    };
  }
}
