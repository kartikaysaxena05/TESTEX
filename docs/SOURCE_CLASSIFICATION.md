# Source File Classification

## 1. Overview

**V2 Phase 22: Source File Classification** introduces the platform's deterministic, evidence-backed file role classification engine.

Building directly upon the **filtered Phase-19 repository structure** and incorporating **Phase-20 programming language** and **Phase-21 framework & manifest intelligence**, Phase 22 categorizes all included files into standard architectural roles (`SOURCE`, `TEST`, `CONFIGURATION`, `BUILD_TOOLING`, `DOCUMENTATION`, `ASSET`, `DATABASE`, `MIGRATION`, `GENERATED`, `SCRIPT`, `TEMPLATE`, `UNKNOWN`).

---

## 2. Core Architectural Flow

```text
Filtered Repository Structure (Phase 19 Included Entries)
                     │
                     ├────────► Language Registry & Technology Signals (Phase 20)
                     │
                     ├────────► Manifests & Framework Evidence (Phase 21)
                     │
                     ▼
          Deterministic File Classifier
          (Priority Precedence Engine)
                     │
        ┌────────────┴────────────┐
        ▼                         ▼
   Category Match          Evidence & Confidence
   - Strict Boundaries       - PATH_PATTERN
   - Context Dominance       - FILENAME_PATTERN
   - False-Positive Guards   - DIRECTORY_CONTEXT
        │                    - EXTENSION / LANGUAGE
        └────────────┬────────────┘
                     ▼
       Classification Profile DTO
                     │
                     ▼
           Renderer UI & Filters
```

---

## 3. Strict Security & Architectural Invariants

1. **Zero Source Content Reading:** Classification operates strictly on relative paths, filenames, extensions, and cached metadata. Application source files (`.ts`, `.py`, `.java`, etc.) are **NEVER read from disk**.
2. **Zero New Traversal or Re-Scanning:** Input is strictly the set of included files discovered by the Phase-19 bounded walker.
3. **Zero AST Parsing or Symbol Extraction:** No functions, classes, decorators, imports, or exports are extracted (deferred to subsequent source intelligence phases).
4. **Zero Entry-Point or Route Discovery:** Files under `app/page.tsx` or `src/index.ts` are categorized as generic `SOURCE`, not labeled as routes or application entry points (deferred to Phase 25).
5. **No AI / LLM Evaluation:** Classification is 100% deterministic, rule-based, and explainable with traceable evidence.
6. **No Premature Database Persistence:** Results are aggregated in-memory and cached per source attachment rather than inserting thousands of individual file rows into PostgreSQL (formal repository indexing is Phase 24).

---

## 4. Classification Taxonomy & Priority Precedence

When evaluating a repository file, rules are executed in strict descending priority order. The first rule that matches establishes the file's primary category:

| Priority | Category        | Description & Typical Evidence                                                                                                                                                                                                      |
| :------: | :-------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **100**  | `TEST`          | Test files (`*.test.*`, `*.spec.*`, `test_*.py`, `*Test.java`, `*Tests.cs`, `*_test.go`), snapshots (`*.snap`), test directories (`tests/`, `spec/`, `fixtures/`, `e2e/`), and test setup scripts (`conftest.py`, `setupTests.ts`). |
|  **90**  | `MIGRATION`     | Database schema migrations (`migrations/`, `prisma/migrations/`, `db/migrate/`, `alembic/versions/`).                                                                                                                               |
|  **80**  | `DOCUMENTATION` | Documentation files (`README*`, `CONTRIBUTING*`, `CHANGELOG*`, `LICENSE*`), docs directories (`docs/`, `guide/`), and markup formats (`.md`, `.rst`, `.adoc`).                                                                      |
|  **70**  | `ASSET`         | Images (`.png`, `.jpg`, `.svg`, `.ico`, `.webp`), fonts (`.woff`, `.woff2`, `.ttf`), audio/video (`.mp4`, `.mp3`), and binary documents (`.pdf`).                                                                                   |
|  **60**  | `CONFIGURATION` | Project manifests and configs (`package.json`, `tsconfig*.json`, `eslint.config.*`, `.prettierrc`, `pom.xml`, `Cargo.toml`, `go.mod`, `pubspec.yaml`, `*.csproj`, `.env.example`, lockfiles).                                       |
|  **55**  | `BUILD_TOOLING` | Build definitions, containers, and CI workflows (`Dockerfile`, `docker-compose.yml`, `Makefile`, `CMakeLists.txt`, `Jenkinsfile`, `.github/workflows/**`, `vite.config.*`, `webpack.config.*`).                                     |
|  **50**  | `DATABASE`      | Database scripts and schemas outside migration folders (`schema.prisma`, `schema.sql`, `seed.sql`, `*.sql`).                                                                                                                        |
|  **45**  | `GENERATED`     | Generated code and compiler outputs (`*.generated.*`, `*.g.cs`, `*.designer.cs`, `generated/`, `codegen/`).                                                                                                                         |
|  **40**  | `SCRIPT`        | Automation and utility scripts (`scripts/`, `bin/`, `tools/`, `*.sh`, `*.ps1`, `*.bat`).                                                                                                                                            |
|  **35**  | `TEMPLATE`      | View templates (`*.ejs`, `*.hbs`, `*.handlebars`, `*.twig`, `*.mustache`, `templates/`, `views/`).                                                                                                                                  |
|  **20**  | `SOURCE`        | Application source code files located in `src/`, `app/`, `lib/`, etc., or matching recognized programming/scripting languages in `LanguageRegistry`.                                                                                |
|  **0**   | `UNKNOWN`       | Unclassified files with unmapped extensions or ambiguous roles.                                                                                                                                                                     |

---

## 5. False-Positive Prevention

To prevent accidental misclassification:

- **Substring Protections:** Exact directory segment regexes `(^|\/)(tests|test)(\/|$)` prevent names like `src/contest/` from triggering test rules.
- **Word Boundary Guards:** Exact filename patterns prevent `contest.ts` or `latest.ts` from becoming `TEST`.
- **Service Name Guards:** `src/migration-service.ts` is classified as `SOURCE`, not `MIGRATION`.
- **Document Service Guards:** `src/document-service.ts` is classified as `SOURCE`, not `DOCUMENTATION`.
- **Image Service Guards:** `src/image-service.ts` is classified as `SOURCE`, not `ASSET`.
- **Generator Guards:** `src/generator.ts` is classified as `SOURCE`, not `GENERATED`.

---

## 6. Directory Context Dominance

Repository directory role context takes precedence over raw file formats:

- `tests/fixtures/config.json` -> Classified as `TEST` (not `CONFIGURATION`).
- `prisma/migrations/001/migration.sql` -> Classified as `MIGRATION` (not `DATABASE`).
- `src/README.md` -> Classified as `DOCUMENTATION` (not `SOURCE`).
