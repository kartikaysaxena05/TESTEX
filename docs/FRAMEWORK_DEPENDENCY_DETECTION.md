# Framework & Dependency Detection

## 1. Overview

**V2 Phase 21: Framework & Dependency Detection** establishes the platform's evidence-backed framework discovery and dependency extraction engine.

Using the **filtered Phase-19 repository structure** as input, Phase 21 safely discovers and statically parses recognized package manifests without executing any project code. It determines the authoritative package manager (identifying conflicts honestly), extracts declared direct and development dependencies with their scopes and version constraints, and evaluates framework rules with traceable provenance and deterministic confidence levels.

---

## 2. Core Architectural Flow

```text
Filtered Repository Structure (Phase 19 Included Entries)
                     │
                     ▼
             Manifest Allowlist
          (Size & Containment Verification)
                     │
                     ▼
          Safe Static Manifest Parsing
  (JSON, smol-toml, fast-xml-parser, yaml, safe regex)
                     │
        ┌────────────┴────────────┐
        ▼                         ▼
Package Manager Engine     Dependency Inventory
 - Lockfile inspection       - Runtime dependencies
 - packageManager field      - Dev dependencies
 - Conflict resolution       - Peer/Optional scopes
        │                         │
        └────────────┬────────────┘
                     ▼
           Framework Rule Engine
                     │
                     ▼
         Framework Profile DTO
                     │
                     ▼
          Renderer UI & Controls
```

---

## 3. Strict Security Invariants

1. **Zero Manifest / Build Script Execution:** Build scripts (`setup.py`, `build.gradle`, `Gemfile`, `next.config.js`, `vite.config.ts`) are **NEVER evaluated, imported, or executed**. Parsing is strictly static.
2. **XML XXE & DTD Protection:** XML parsing disables external entities and external DTDs (`processEntities: false`) to completely prevent XML External Entity (XXE) attacks against `pom.xml` and `*.csproj`.
3. **YAML Safety:** YAML parsing is strictly non-evaluating (`yaml.parse`).
4. **Path & Symlink Containment:** Manifest reads are bounded within the authorized source root. Symlinks or relative paths attempting directory traversal escape are rejected.
5. **Bounded Resource Consumption:** Manifests exceeding 5 MB and lockfiles exceeding 20 MB are skipped with explicit warnings. Total manifests analyzed per project is capped at 100.
6. **No Network Requests:** Detection is 100% local and offline. No package registries (npm, PyPI, Maven, crates.io) are queried.
7. **No Installation / Commands:** No package manager commands (`npm install`, `pip install`, `mvn`, `gradle`, `cargo`) are ever executed.

---

## 4. Supported Manifest Allowlist & Parsers

| Manifest Type        | Ecosystem    | Parser Strategy                     | File Size Limit |
| :------------------- | :----------- | :---------------------------------- | :-------------: |
| `package.json`       | Node.js      | Standard `JSON.parse`               |      5 MB       |
| `pyproject.toml`     | Python       | `smol-toml` static parser           |      5 MB       |
| `requirements*.txt`  | Python       | Safe line regex (no pip evaluation) |      5 MB       |
| `pom.xml`            | Java/JVM     | `fast-xml-parser` (XXE disabled)    |      5 MB       |
| `build.gradle(.kts)` | Java/JVM     | Static regex pattern extraction     |      5 MB       |
| `Cargo.toml`         | Rust         | `smol-toml` static parser           |      5 MB       |
| `go.mod`             | Go           | Static regex line extraction        |      5 MB       |
| `composer.json`      | PHP          | Standard `JSON.parse`               |      5 MB       |
| `Gemfile`            | Ruby         | Static regex line extraction        |      5 MB       |
| `pubspec.yaml`       | Dart/Flutter | `yaml.parse` safe loader            |      5 MB       |
| `*.csproj`           | .NET         | `fast-xml-parser` (XXE disabled)    |      5 MB       |

---

## 5. Package Manager Detection & Conflict Handling

The platform inspects lockfile presence and the `packageManager` manifest field:

- **npm:** `package-lock.json`
- **Yarn:** `yarn.lock`
- **pnpm:** `pnpm-lock.yaml`, `pnpm-workspace.yaml`
- **Cargo:** `Cargo.lock`
- **Poetry / Pipenv:** `poetry.lock`, `Pipfile.lock`
- **Maven / Gradle:** `pom.xml`, `build.gradle`
- **Composer:** `composer.lock`
- **Bundler:** `Gemfile.lock`
- **NuGet:** `packages.lock.json`

**Conflict Handling:** When multiple conflicting lockfiles are detected (e.g. both `package-lock.json` and `pnpm-lock.yaml`), the package manager is reported with `isAmbiguous: true`, confidence `LOW`, and an explanation containing all conflicting files.

---

## 6. Monorepo Support

In repositories containing multiple subprojects (e.g. `apps/web/package.json`, `apps/api/package.json`), all manifests within the authorized filtered boundary are discovered and parsed. Each dependency and framework detection preserves its exact `sourceManifest` relative path.

---

## 7. Framework Detection Rules

Over 30 major frameworks, UI libraries, test frameworks, ORMs, and build tools are detected via declarative dependency and configuration evidence:

- **Frontend Frameworks:** Next.js, React, Angular, Vue, Nuxt, Svelte, SvelteKit, Remix, Astro
- **Backend Frameworks:** Express, NestJS, Fastify, Django, Flask, FastAPI, Spring Boot, Laravel, Ruby on Rails, ASP.NET Core
- **Mobile Frameworks:** Flutter
- **Testing Frameworks:** Vitest, Jest, Playwright Test, Pytest, JUnit
- **ORM / Data Layer:** Prisma, TypeORM, Drizzle ORM, SQLAlchemy, Hibernate
- **Build & UI Tools:** Vite, Tailwind CSS
