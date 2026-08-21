/**
 * @file packages/core/src/sources/technology/language-registry.ts
 * Centralized, data-driven registry of programming, markup, style, and query languages.
 */

import type { LanguageCategory, LanguageConfidence } from '@ai-quality/contracts';

export interface LanguageDefinition {
  readonly id: string;
  readonly displayName: string;
  readonly category: LanguageCategory;
  readonly extensions: readonly string[];
  readonly filenames?: readonly string[];
  readonly defaultConfidence?: LanguageConfidence;
}

export const LANGUAGE_REGISTRY: readonly LanguageDefinition[] = [
  // Programming & Scripting Languages
  {
    id: 'typescript',
    displayName: 'TypeScript',
    category: 'PROGRAMMING',
    extensions: ['.ts', '.tsx', '.mts', '.cts'],
  },
  {
    id: 'javascript',
    displayName: 'JavaScript',
    category: 'PROGRAMMING',
    extensions: ['.js', '.jsx', '.mjs', '.cjs'],
  },
  {
    id: 'python',
    displayName: 'Python',
    category: 'PROGRAMMING',
    extensions: ['.py', '.pyi', '.pyw'],
  },
  {
    id: 'java',
    displayName: 'Java',
    category: 'PROGRAMMING',
    extensions: ['.java'],
  },
  {
    id: 'go',
    displayName: 'Go',
    category: 'PROGRAMMING',
    extensions: ['.go'],
  },
  {
    id: 'rust',
    displayName: 'Rust',
    category: 'PROGRAMMING',
    extensions: ['.rs'],
  },
  {
    id: 'csharp',
    displayName: 'C#',
    category: 'PROGRAMMING',
    extensions: ['.cs', '.csx'],
  },
  {
    id: 'cpp',
    displayName: 'C++',
    category: 'PROGRAMMING',
    extensions: ['.cpp', '.cxx', '.cc', '.hpp', '.hxx'],
  },
  {
    id: 'c',
    displayName: 'C',
    category: 'PROGRAMMING',
    extensions: ['.c'],
  },
  {
    id: 'c_cpp_header',
    displayName: 'C/C++ Header',
    category: 'PROGRAMMING',
    extensions: ['.h'],
    defaultConfidence: 'LOW',
  },
  {
    id: 'php',
    displayName: 'PHP',
    category: 'PROGRAMMING',
    extensions: ['.php', '.phtml'],
  },
  {
    id: 'ruby',
    displayName: 'Ruby',
    category: 'PROGRAMMING',
    extensions: ['.rb', '.rake', '.gemspec'],
    filenames: ['Gemfile', 'Rakefile'],
  },
  {
    id: 'kotlin',
    displayName: 'Kotlin',
    category: 'PROGRAMMING',
    extensions: ['.kt', '.kts'],
  },
  {
    id: 'swift',
    displayName: 'Swift',
    category: 'PROGRAMMING',
    extensions: ['.swift'],
  },
  {
    id: 'dart',
    displayName: 'Dart',
    category: 'PROGRAMMING',
    extensions: ['.dart'],
  },
  {
    id: 'scala',
    displayName: 'Scala',
    category: 'PROGRAMMING',
    extensions: ['.scala', '.sc'],
  },
  {
    id: 'shell',
    displayName: 'Shell',
    category: 'SCRIPT',
    extensions: ['.sh', '.bash', '.zsh'],
  },
  {
    id: 'powershell',
    displayName: 'PowerShell',
    category: 'SCRIPT',
    extensions: ['.ps1', '.psm1', '.psd1'],
  },

  // Query Languages
  {
    id: 'sql',
    displayName: 'SQL',
    category: 'QUERY',
    extensions: ['.sql'],
  },
  {
    id: 'graphql',
    displayName: 'GraphQL',
    category: 'QUERY',
    extensions: ['.graphql', '.gql'],
  },

  // Markup & Styles
  {
    id: 'html',
    displayName: 'HTML',
    category: 'MARKUP',
    extensions: ['.html', '.htm'],
  },
  {
    id: 'css',
    displayName: 'CSS',
    category: 'STYLE',
    extensions: ['.css'],
  },
  {
    id: 'scss',
    displayName: 'SCSS',
    category: 'STYLE',
    extensions: ['.scss'],
  },
  {
    id: 'less',
    displayName: 'Less',
    category: 'STYLE',
    extensions: ['.less'],
  },
  {
    id: 'vue',
    displayName: 'Vue SFC',
    category: 'MARKUP',
    extensions: ['.vue'],
  },
  {
    id: 'svelte',
    displayName: 'Svelte',
    category: 'MARKUP',
    extensions: ['.svelte'],
  },

  // Configuration & Data
  {
    id: 'json',
    displayName: 'JSON',
    category: 'DATA',
    extensions: ['.json', '.jsonc'],
  },
  {
    id: 'yaml',
    displayName: 'YAML',
    category: 'DATA',
    extensions: ['.yaml', '.yml'],
  },
  {
    id: 'xml',
    displayName: 'XML',
    category: 'DATA',
    extensions: ['.xml'],
  },
  {
    id: 'toml',
    displayName: 'TOML',
    category: 'CONFIGURATION',
    extensions: ['.toml'],
  },
  {
    id: 'terraform',
    displayName: 'Terraform (HCL)',
    category: 'CONFIGURATION',
    extensions: ['.tf', '.tfvars'],
  },
  {
    id: 'protobuf',
    displayName: 'Protocol Buffers',
    category: 'DATA',
    extensions: ['.proto'],
  },
  {
    id: 'dockerfile',
    displayName: 'Dockerfile',
    category: 'CONFIGURATION',
    extensions: ['.dockerfile'],
    filenames: ['Dockerfile'],
  },
] as const;

export class LanguageRegistry {
  private readonly extensionMap = new Map<string, LanguageDefinition>();
  private readonly filenameMap = new Map<string, LanguageDefinition>();

  constructor(definitions: readonly LanguageDefinition[] = LANGUAGE_REGISTRY) {
    for (const def of definitions) {
      for (const ext of def.extensions) {
        this.extensionMap.set(ext.toLowerCase(), def);
      }
      if (def.filenames) {
        for (const fn of def.filenames) {
          this.filenameMap.set(fn.toLowerCase(), def);
        }
      }
    }
  }

  /**
   * Matches a filename/path to its language definition.
   */
  match(filePath: string): LanguageDefinition | null {
    const baseName = filePath.split('/').pop()?.toLowerCase() ?? '';

    // 1. Check exact special filename match (e.g. Dockerfile, Gemfile)
    const exactMatch = this.filenameMap.get(baseName);
    if (exactMatch) {
      return exactMatch;
    }

    // 2. Check extension match (multi-suffix safe: last dot)
    const lastDotIndex = baseName.lastIndexOf('.');
    if (lastDotIndex !== -1 && lastDotIndex < baseName.length - 1) {
      const ext = baseName.substring(lastDotIndex);
      const extMatch = this.extensionMap.get(ext);
      if (extMatch) {
        return extMatch;
      }
    }

    return null;
  }
}
