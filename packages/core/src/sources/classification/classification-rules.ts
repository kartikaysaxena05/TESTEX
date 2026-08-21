/**
 * @file packages/core/src/sources/classification/classification-rules.ts
 * Declarative classification rules with deterministic priorities and strict boundary guards.
 */

import type { ClassificationRule } from './classification-types.js';
import { LanguageRegistry } from '../technology/language-registry.js';

const languageRegistry = new LanguageRegistry();

// Reusable regex helpers with exact boundary checks
const TEST_DIR_REGEX =
  /(^|\/)(tests|test|__tests__|__snapshots__|spec|specs|fixtures|e2e|integration)(\/|$)/i;
const TEST_FILENAME_REGEX =
  /(\.(test|spec)\.[a-zA-Z0-9]+$|^test_[a-zA-Z0-9_\-.]+\.py$|^[a-zA-Z0-9_\-.]+(_test|\.test)\.py$|^[a-zA-Z0-9_\-.]+Test\.java$|^[a-zA-Z0-9_\-.]+Tests\.cs$|^[a-zA-Z0-9_\-.]+(_test|\.test)\.go$|^conftest\.py$|^setupTests\.[a-zA-Z0-9]+$|^jest\.setup\.[a-zA-Z0-9]+$)/i;
const SNAPSHOT_REGEX = /\.(snap|snapshot)$/i;

const MIGRATION_DIR_REGEX =
  /(^|\/)(migrations|migration|prisma\/migrations|db\/migrate|alembic\/versions)(\/|$)/i;

const DOC_FILENAMES_REGEX =
  /^(README|CONTRIBUTING|CHANGELOG|LICENSE|CODE_OF_CONDUCT|SECURITY|AUTHORS)(\.[a-zA-Z0-9]+)?$/i;
const DOC_DIR_REGEX = /(^|\/)(docs|documentation|guide|manual)(\/|$)/i;
const DOC_EXT_REGEX = /\.(md|markdown|rst|adoc|asciidoc)$/i;

const ASSET_EXT_REGEX =
  /\.(png|jpg|jpeg|gif|webp|svg|ico|bmp|tiff|avif|woff|woff2|ttf|eot|otf|mp4|mp3|wav|webm|ogg|mov|pdf)$/i;

const CONFIG_FILENAMES_REGEX =
  /^(package\.json|tsconfig(\.[a-zA-Z0-9_-]+)?\.json|eslint\.config\.[a-zA-Z0-9]+|\.eslintrc(\.[a-zA-Z0-9]+)?|\.prettierrc(\.[a-zA-Z0-9]+)?|prettier\.config\.[a-zA-Z0-9]+|pyproject\.toml|requirements([_-][a-zA-Z0-9]+)?\.txt|Pipfile(\.lock)?|poetry\.lock|pom\.xml|Cargo\.toml|Cargo\.lock|go\.mod|go\.sum|composer\.json|composer\.lock|Gemfile(\.lock)?|pubspec\.yaml|pubspec\.lock|\.env\.example|\.env\.local\.example|\.env\.template|package-lock\.json|yarn\.lock|pnpm-lock\.yaml|pnpm-workspace\.yaml|\.editorconfig|packages\.lock\.json)$/i;
const CONFIG_EXT_REGEX = /\.(csproj|sln)$/i;

const BUILD_TOOLING_FILENAMES_REGEX =
  /^(Dockerfile([._a-zA-Z0-9-]+)?|docker-compose([._a-zA-Z0-9-]+)?\.ya?ml|compose([._a-zA-Z0-9-]+)?\.ya?ml|Makefile|CMakeLists\.txt|Jenkinsfile|vite\.config\.[a-zA-Z0-9]+|webpack\.config\.[a-zA-Z0-9]+|rollup\.config\.[a-zA-Z0-9]+|babel\.config\.[a-zA-Z0-9]+|tailwind\.config\.[a-zA-Z0-9]+|postcss\.config\.[a-zA-Z0-9]+|next\.config\.[a-zA-Z0-9]+|angular\.json|nuxt\.config\.[a-zA-Z0-9]+|svelte\.config\.[a-zA-Z0-9]+|astro\.config\.[a-zA-Z0-9]+)$/i;
const CI_WORKFLOW_DIR_REGEX = /^\.github\/workflows\//i;

const DATABASE_FILENAMES_REGEX = /^(schema\.prisma|schema\.sql|seed\.sql)$/i;
const DATABASE_EXT_REGEX = /\.sql$/i;

const GENERATED_DIR_REGEX = /(^|\/)(generated|codegen|__generated__)(\/|$)/i;
const GENERATED_FILENAME_REGEX = /(\.generated\.[a-zA-Z0-9]+$|\.g\.cs$|\.designer\.cs$)/i;

const SCRIPT_DIR_REGEX = /(^|\/)(scripts|bin|tools)(\/|$)/i;
const SCRIPT_EXT_REGEX = /\.(sh|bash|zsh|ps1|bat|cmd)$/i;

const TEMPLATE_DIR_REGEX = /(^|\/)(templates|views)(\/|$)/i;
const TEMPLATE_EXT_REGEX = /\.(ejs|hbs|handlebars|twig|mustache|liquid|jinja|jinja2|pug)$/i;

const SOURCE_DIR_REGEX =
  /(^|\/)(src|app|lib|server|client|components|services|controllers|models|repositories|domain|core|packages)(\/|$)/i;

export const CLASSIFICATION_RULES: readonly ClassificationRule[] = [
  // 1. TEST (Priority 100)
  {
    id: 'test-rule',
    category: 'TEST',
    priority: 100,
    match: (normalizedPath, fileName) => {
      const inTestDir = TEST_DIR_REGEX.test(normalizedPath);
      const isTestFile = TEST_FILENAME_REGEX.test(fileName);
      const isSnap = SNAPSHOT_REGEX.test(fileName);

      if (isTestFile || isSnap) {
        return {
          matched: true,
          category: 'TEST',
          confidence: 'HIGH',
          evidence: [
            {
              type: 'FILENAME_PATTERN',
              detail: `Matched test file naming pattern: "${fileName}"`,
            },
          ],
        };
      }

      if (inTestDir) {
        return {
          matched: true,
          category: 'TEST',
          confidence: 'HIGH',
          evidence: [
            {
              type: 'DIRECTORY_CONTEXT',
              detail: `Located under test directory context: "${normalizedPath}"`,
            },
          ],
        };
      }

      return null;
    },
  },

  // 2. MIGRATION (Priority 90)
  {
    id: 'migration-rule',
    category: 'MIGRATION',
    priority: 90,
    match: normalizedPath => {
      if (MIGRATION_DIR_REGEX.test(normalizedPath)) {
        return {
          matched: true,
          category: 'MIGRATION',
          confidence: 'HIGH',
          evidence: [
            {
              type: 'PATH_PATTERN',
              detail: `Located under database migrations path: "${normalizedPath}"`,
            },
          ],
        };
      }
      return null;
    },
  },

  // 3. DOCUMENTATION (Priority 80)
  {
    id: 'documentation-rule',
    category: 'DOCUMENTATION',
    priority: 80,
    match: (normalizedPath, fileName) => {
      if (DOC_FILENAMES_REGEX.test(fileName)) {
        return {
          matched: true,
          category: 'DOCUMENTATION',
          confidence: 'HIGH',
          evidence: [
            {
              type: 'FILENAME_PATTERN',
              detail: `Standard documentation filename: "${fileName}"`,
            },
          ],
        };
      }

      if (DOC_DIR_REGEX.test(normalizedPath) || DOC_EXT_REGEX.test(fileName)) {
        return {
          matched: true,
          category: 'DOCUMENTATION',
          confidence: 'HIGH',
          evidence: [
            {
              type: 'EXTENSION',
              detail: `Documentation format or directory: "${normalizedPath}"`,
            },
          ],
        };
      }

      return null;
    },
  },

  // 4. ASSET (Priority 70)
  {
    id: 'asset-rule',
    category: 'ASSET',
    priority: 70,
    match: (_normalizedPath, fileName, extension) => {
      if (ASSET_EXT_REGEX.test(fileName) || ASSET_EXT_REGEX.test(extension)) {
        return {
          matched: true,
          category: 'ASSET',
          confidence: 'HIGH',
          evidence: [
            {
              type: 'EXTENSION',
              detail: `Media / graphic / binary asset extension: "${extension}"`,
            },
          ],
        };
      }
      return null;
    },
  },

  // 5. CONFIGURATION (Priority 60)
  {
    id: 'configuration-rule',
    category: 'CONFIGURATION',
    priority: 60,
    match: (_normalizedPath, fileName) => {
      if (CONFIG_FILENAMES_REGEX.test(fileName) || CONFIG_EXT_REGEX.test(fileName)) {
        return {
          matched: true,
          category: 'CONFIGURATION',
          confidence: 'HIGH',
          evidence: [
            {
              type: 'FILENAME_PATTERN',
              detail: `Standard manifest or project configuration file: "${fileName}"`,
            },
          ],
        };
      }
      return null;
    },
  },

  // 6. BUILD_TOOLING (Priority 55)
  {
    id: 'build-tooling-rule',
    category: 'BUILD_TOOLING',
    priority: 55,
    match: (normalizedPath, fileName) => {
      if (
        BUILD_TOOLING_FILENAMES_REGEX.test(fileName) ||
        CI_WORKFLOW_DIR_REGEX.test(normalizedPath)
      ) {
        return {
          matched: true,
          category: 'BUILD_TOOLING',
          confidence: 'HIGH',
          evidence: [
            {
              type: 'FILENAME_PATTERN',
              detail: `Build tool, container, or CI/CD workflow definition: "${fileName}"`,
            },
          ],
        };
      }
      return null;
    },
  },

  // 7. DATABASE (Priority 50)
  {
    id: 'database-rule',
    category: 'DATABASE',
    priority: 50,
    match: (_normalizedPath, fileName) => {
      if (DATABASE_FILENAMES_REGEX.test(fileName) || DATABASE_EXT_REGEX.test(fileName)) {
        return {
          matched: true,
          category: 'DATABASE',
          confidence: 'HIGH',
          evidence: [
            {
              type: 'FILENAME_PATTERN',
              detail: `Database schema or SQL script: "${fileName}"`,
            },
          ],
        };
      }
      return null;
    },
  },

  // 8. GENERATED (Priority 45)
  {
    id: 'generated-rule',
    category: 'GENERATED',
    priority: 45,
    match: (normalizedPath, fileName) => {
      if (GENERATED_DIR_REGEX.test(normalizedPath) || GENERATED_FILENAME_REGEX.test(fileName)) {
        return {
          matched: true,
          category: 'GENERATED',
          confidence: 'HIGH',
          evidence: [
            {
              type: 'PATH_PATTERN',
              detail: `Codegen output path or generated suffix: "${normalizedPath}"`,
            },
          ],
        };
      }
      return null;
    },
  },

  // 9. SCRIPT (Priority 40)
  {
    id: 'script-rule',
    category: 'SCRIPT',
    priority: 40,
    match: (normalizedPath, fileName) => {
      if (SCRIPT_DIR_REGEX.test(normalizedPath) || SCRIPT_EXT_REGEX.test(fileName)) {
        return {
          matched: true,
          category: 'SCRIPT',
          confidence: 'HIGH',
          evidence: [
            {
              type: 'EXTENSION',
              detail: `Shell or automation script: "${normalizedPath}"`,
            },
          ],
        };
      }
      return null;
    },
  },

  // 10. TEMPLATE (Priority 35)
  {
    id: 'template-rule',
    category: 'TEMPLATE',
    priority: 35,
    match: (normalizedPath, fileName) => {
      if (TEMPLATE_DIR_REGEX.test(normalizedPath) || TEMPLATE_EXT_REGEX.test(fileName)) {
        return {
          matched: true,
          category: 'TEMPLATE',
          confidence: 'HIGH',
          evidence: [
            {
              type: 'EXTENSION',
              detail: `HTML template engine file or views folder: "${normalizedPath}"`,
            },
          ],
        };
      }
      return null;
    },
  },

  // 11. SOURCE (Priority 20)
  {
    id: 'source-rule',
    category: 'SOURCE',
    priority: 20,
    match: (normalizedPath, fileName) => {
      const inSourceDir = SOURCE_DIR_REGEX.test(normalizedPath);
      const langSpec = languageRegistry.match(fileName);
      const isLang = langSpec !== null;

      if (inSourceDir && isLang) {
        return {
          matched: true,
          category: 'SOURCE',
          confidence: 'HIGH',
          evidence: [
            {
              type: 'DIRECTORY_CONTEXT',
              detail: `Located under application source path: "${normalizedPath}"`,
            },
            {
              type: 'LANGUAGE_SIGNAL',
              detail: `Recognized source language extension: "${fileName}"`,
            },
          ],
        };
      }

      if (isLang && langSpec) {
        if (langSpec.category === 'PROGRAMMING' || langSpec.category === 'SCRIPT') {
          return {
            matched: true,
            category: 'SOURCE',
            confidence: 'MEDIUM',
            evidence: [
              {
                type: 'LANGUAGE_SIGNAL',
                detail: `Recognized programming language file: "${fileName}" (${langSpec.displayName})`,
              },
            ],
          };
        }
      }

      if (inSourceDir) {
        return {
          matched: true,
          category: 'SOURCE',
          confidence: 'MEDIUM',
          evidence: [
            {
              type: 'DIRECTORY_CONTEXT',
              detail: `Located under application source path: "${normalizedPath}"`,
            },
          ],
        };
      }

      return null;
    },
  },
];
