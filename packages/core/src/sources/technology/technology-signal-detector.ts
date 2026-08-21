/**
 * @file packages/core/src/sources/technology/technology-signal-detector.ts
 * Evidence-based broad technology and ecosystem signal detection.
 */

import type {
  SourceStructureEntryDto,
  TechnologySignalDto,
  LanguageConfidence,
} from '@ai-quality/contracts';

interface SignalRule {
  readonly technology: string;
  readonly category: string;
  readonly match: (files: readonly SourceStructureEntryDto[]) => {
    readonly matched: boolean;
    readonly confidence: LanguageConfidence;
    readonly evidence: readonly string[];
  };
}

export class TechnologySignalDetector {
  private readonly rules: readonly SignalRule[] = [
    // 1. Node.js Ecosystem
    {
      technology: 'Node.js Ecosystem',
      category: 'Runtime / Ecosystem',
      match: files => {
        const evidence: string[] = [];
        const hasPackageJson = files.some(f => f.name.toLowerCase() === 'package.json');
        if (hasPackageJson) evidence.push('package.json');

        const hasTsOrJs = files.some(f => {
          const lower = f.name.toLowerCase();
          return (
            lower.endsWith('.ts') ||
            lower.endsWith('.tsx') ||
            lower.endsWith('.js') ||
            lower.endsWith('.jsx') ||
            lower.endsWith('.mjs') ||
            lower.endsWith('.cjs')
          );
        });
        if (hasTsOrJs) evidence.push('TypeScript/JavaScript source files');

        if (hasPackageJson) {
          return { matched: true, confidence: 'HIGH', evidence };
        }
        if (hasTsOrJs) {
          return { matched: true, confidence: 'MEDIUM', evidence };
        }
        return { matched: false, confidence: 'LOW', evidence: [] };
      },
    },

    // 2. Docker
    {
      technology: 'Docker',
      category: 'DevOps / Infrastructure',
      match: files => {
        const evidence: string[] = [];
        for (const file of files) {
          const lower = file.name.toLowerCase();
          if (
            lower === 'dockerfile' ||
            lower.startsWith('dockerfile.') ||
            lower.endsWith('.dockerfile') ||
            lower === 'docker-compose.yml' ||
            lower === 'docker-compose.yaml' ||
            lower === 'compose.yaml' ||
            lower === 'compose.yml'
          ) {
            if (!evidence.includes(file.name)) {
              evidence.push(file.name);
            }
          }
        }
        return {
          matched: evidence.length > 0,
          confidence: 'HIGH',
          evidence: evidence.slice(0, 5),
        };
      },
    },

    // 3. Python Ecosystem
    {
      technology: 'Python Ecosystem',
      category: 'Runtime / Ecosystem',
      match: files => {
        const evidence: string[] = [];
        const manifests = ['pyproject.toml', 'requirements.txt', 'setup.py', 'pipfile'];
        for (const file of files) {
          if (manifests.includes(file.name.toLowerCase())) {
            evidence.push(file.name);
          }
        }
        const hasPy = files.some(f => f.name.toLowerCase().endsWith('.py'));
        if (hasPy) evidence.push('Python source files (*.py)');

        if (evidence.length === 0) {
          return { matched: false, confidence: 'LOW', evidence: [] };
        }

        const hasManifest = evidence.some(e => !e.includes('source files'));
        return {
          matched: true,
          confidence: hasManifest ? 'HIGH' : 'MEDIUM',
          evidence: evidence.slice(0, 5),
        };
      },
    },

    // 4. Java / JVM Ecosystem
    {
      technology: 'Java / JVM Ecosystem',
      category: 'Runtime / Ecosystem',
      match: files => {
        const evidence: string[] = [];
        for (const file of files) {
          const lower = file.name.toLowerCase();
          if (
            lower === 'pom.xml' ||
            lower === 'build.gradle' ||
            lower === 'build.gradle.kts' ||
            lower === 'settings.gradle' ||
            lower === 'settings.gradle.kts'
          ) {
            evidence.push(file.name);
          }
        }
        const hasJava = files.some(f => f.name.toLowerCase().endsWith('.java'));
        if (hasJava) evidence.push('Java source files (*.java)');

        if (evidence.length === 0) {
          return { matched: false, confidence: 'LOW', evidence: [] };
        }

        const hasManifest = evidence.some(e => !e.includes('source files'));
        return {
          matched: true,
          confidence: hasManifest ? 'HIGH' : 'MEDIUM',
          evidence: evidence.slice(0, 5),
        };
      },
    },

    // 5. Rust Ecosystem
    {
      technology: 'Rust Ecosystem',
      category: 'Runtime / Ecosystem',
      match: files => {
        const evidence: string[] = [];
        const hasCargo = files.some(f => f.name.toLowerCase() === 'cargo.toml');
        if (hasCargo) evidence.push('Cargo.toml');
        const hasRs = files.some(f => f.name.toLowerCase().endsWith('.rs'));
        if (hasRs) evidence.push('Rust source files (*.rs)');

        if (evidence.length === 0) {
          return { matched: false, confidence: 'LOW', evidence: [] };
        }
        return {
          matched: true,
          confidence: hasCargo ? 'HIGH' : 'MEDIUM',
          evidence,
        };
      },
    },

    // 6. Go Ecosystem
    {
      technology: 'Go Ecosystem',
      category: 'Runtime / Ecosystem',
      match: files => {
        const evidence: string[] = [];
        const hasGoMod = files.some(f => f.name.toLowerCase() === 'go.mod');
        if (hasGoMod) evidence.push('go.mod');
        const hasGo = files.some(f => f.name.toLowerCase().endsWith('.go'));
        if (hasGo) evidence.push('Go source files (*.go)');

        if (evidence.length === 0) {
          return { matched: false, confidence: 'LOW', evidence: [] };
        }
        return {
          matched: true,
          confidence: hasGoMod ? 'HIGH' : 'MEDIUM',
          evidence,
        };
      },
    },

    // 7. .NET / C# Ecosystem
    {
      technology: '.NET / C# Ecosystem',
      category: 'Runtime / Ecosystem',
      match: files => {
        const evidence: string[] = [];
        for (const file of files) {
          const lower = file.name.toLowerCase();
          if (lower.endsWith('.csproj') || lower.endsWith('.sln')) {
            evidence.push(file.name);
          }
        }
        const hasCs = files.some(f => f.name.toLowerCase().endsWith('.cs'));
        if (hasCs) evidence.push('C# source files (*.cs)');

        if (evidence.length === 0) {
          return { matched: false, confidence: 'LOW', evidence: [] };
        }
        const hasProjectFile = evidence.some(e => !e.includes('source files'));
        return {
          matched: true,
          confidence: hasProjectFile ? 'HIGH' : 'MEDIUM',
          evidence: evidence.slice(0, 5),
        };
      },
    },

    // 8. GraphQL
    {
      technology: 'GraphQL',
      category: 'API / Data',
      match: files => {
        const hasGql = files.some(
          f => f.name.toLowerCase().endsWith('.graphql') || f.name.toLowerCase().endsWith('.gql'),
        );
        return {
          matched: hasGql,
          confidence: 'HIGH',
          evidence: hasGql ? ['GraphQL schema / query files (*.graphql, *.gql)'] : [],
        };
      },
    },

    // 9. Protocol Buffers
    {
      technology: 'Protocol Buffers',
      category: 'API / Data',
      match: files => {
        const hasProto = files.some(f => f.name.toLowerCase().endsWith('.proto'));
        return {
          matched: hasProto,
          confidence: 'HIGH',
          evidence: hasProto ? ['Protocol Buffer definitions (*.proto)'] : [],
        };
      },
    },

    // 10. Terraform
    {
      technology: 'Terraform (HCL)',
      category: 'DevOps / Infrastructure',
      match: files => {
        const hasTf = files.some(
          f => f.name.toLowerCase().endsWith('.tf') || f.name.toLowerCase().endsWith('.tfvars'),
        );
        return {
          matched: hasTf,
          confidence: 'HIGH',
          evidence: hasTf ? ['Terraform configuration files (*.tf, *.tfvars)'] : [],
        };
      },
    },

    // 11. SQL / Database Scripts
    {
      technology: 'SQL Database Scripts',
      category: 'Database / Storage',
      match: files => {
        const hasSql = files.some(f => f.name.toLowerCase().endsWith('.sql'));
        return {
          matched: hasSql,
          confidence: 'HIGH',
          evidence: hasSql ? ['SQL database scripts (*.sql)'] : [],
        };
      },
    },
  ];

  detect(entries: readonly SourceStructureEntryDto[]): readonly TechnologySignalDto[] {
    const fileEntries = entries.filter(e => e.kind === 'FILE');
    const signals: TechnologySignalDto[] = [];

    for (const rule of this.rules) {
      const result = rule.match(fileEntries);
      if (result.matched) {
        signals.push({
          technology: rule.technology,
          category: rule.category,
          confidence: result.confidence,
          evidence: result.evidence,
        });
      }
    }

    return signals.sort((a, b) => a.technology.localeCompare(b.technology));
  }
}
