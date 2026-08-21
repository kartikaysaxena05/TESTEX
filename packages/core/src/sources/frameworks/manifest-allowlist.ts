/**
 * @file packages/core/src/sources/frameworks/manifest-allowlist.ts
 * Centralized allowlist and bounds policy for repository manifest and configuration files.
 */

export const MAX_MANIFEST_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB max per manifest
export const MAX_LOCKFILE_SIZE_BYTES = 20 * 1024 * 1024; // 20 MB max per lockfile
export const MAX_DISCOVERED_MANIFESTS = 100; // Upper limit to prevent unbounded processing

export type ManifestKind =
  | 'PACKAGE_JSON'
  | 'PYPROJECT_TOML'
  | 'REQUIREMENTS_TXT'
  | 'POM_XML'
  | 'BUILD_GRADLE'
  | 'CARGO_TOML'
  | 'GO_MOD'
  | 'COMPOSER_JSON'
  | 'GEMFILE'
  | 'PUBSPEC_YAML'
  | 'CSPROJ';

export interface RecognizedManifestSpec {
  readonly filenamePattern: RegExp;
  readonly kind: ManifestKind;
  readonly ecosystem: string;
}

export const RECOGNIZED_MANIFESTS: readonly RecognizedManifestSpec[] = [
  { filenamePattern: /^package\.json$/i, kind: 'PACKAGE_JSON', ecosystem: 'Node.js' },
  { filenamePattern: /^pyproject\.toml$/i, kind: 'PYPROJECT_TOML', ecosystem: 'Python' },
  {
    filenamePattern: /^(requirements|requirements-dev|requirements-test)\.txt$/i,
    kind: 'REQUIREMENTS_TXT',
    ecosystem: 'Python',
  },
  { filenamePattern: /^pom\.xml$/i, kind: 'POM_XML', ecosystem: 'Java/JVM' },
  { filenamePattern: /^build\.gradle(\.kts)?$/i, kind: 'BUILD_GRADLE', ecosystem: 'Java/JVM' },
  { filenamePattern: /^Cargo\.toml$/i, kind: 'CARGO_TOML', ecosystem: 'Rust' },
  { filenamePattern: /^go\.mod$/i, kind: 'GO_MOD', ecosystem: 'Go' },
  { filenamePattern: /^composer\.json$/i, kind: 'COMPOSER_JSON', ecosystem: 'PHP' },
  { filenamePattern: /^Gemfile$/i, kind: 'GEMFILE', ecosystem: 'Ruby' },
  { filenamePattern: /^pubspec\.yaml$/i, kind: 'PUBSPEC_YAML', ecosystem: 'Dart/Flutter' },
  { filenamePattern: /\.csproj$/i, kind: 'CSPROJ', ecosystem: '.NET' },
] as const;

export const RECOGNIZED_LOCKFILES = [
  { filenamePattern: /^package-lock\.json$/i, packageManager: 'npm' },
  { filenamePattern: /^yarn\.lock$/i, packageManager: 'Yarn' },
  { filenamePattern: /^pnpm-lock\.yaml$/i, packageManager: 'pnpm' },
  { filenamePattern: /^pnpm-workspace\.yaml$/i, packageManager: 'pnpm' },
  { filenamePattern: /^poetry\.lock$/i, packageManager: 'Poetry' },
  { filenamePattern: /^Pipfile\.lock$/i, packageManager: 'Pipenv' },
  { filenamePattern: /^Cargo\.lock$/i, packageManager: 'Cargo' },
  { filenamePattern: /^go\.sum$/i, packageManager: 'Go' },
  { filenamePattern: /^composer\.lock$/i, packageManager: 'Composer' },
  { filenamePattern: /^Gemfile\.lock$/i, packageManager: 'Bundler' },
  { filenamePattern: /^packages\.lock\.json$/i, packageManager: 'NuGet' },
  { filenamePattern: /^pubspec\.lock$/i, packageManager: 'Pub' },
] as const;
