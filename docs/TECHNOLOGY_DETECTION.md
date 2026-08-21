# Programming Language & Technology Detection

## 1. Overview

**V2 Phase 20: Programming Language & Technology Detection** establishes the platform's evidence-backed technology profiling engine.

Using the **filtered Phase-19 repository structure** as input, Phase 20 calculates programming language distributions, determines dominant programming languages (safely separating programming languages from data/config formats), and detects broad technology signals (Node, Docker, Python, Java/JVM, Rust, Go, GraphQL, Protobuf, Terraform, SQL) with explicit evidence lists and deterministic confidence levels.

---

## 2. Core Architectural Flow

```text
Filtered Repository Structure (Phase 19 Included Entries)
                     │
                     ▼
             Language Registry
                     │
        ┌────────────┴────────────┐
        ▼                         ▼
Language Breakdown        Broad Technology Signals
  - File counts             - Node.js Ecosystem
  - Percentages             - Docker
  - Dominant language       - Python / Java / Rust / Go
  - Unclassified files      - GraphQL / Protobuf / Terraform
        │                         │
        └────────────┬────────────┘
                     ▼
         Technology Profile DTO
                     │
                     ▼
          Renderer Display & UI
```

---

## 3. Strict Phase Boundaries

- **Zero Source Content Reading:** Detection operates entirely over the included path metadata from Phase 19. No application source code (`.ts`, `.py`, `.java`, etc.) is opened or read.
- **Zero Manifest Parsing:** Manifests (`package.json`, `pom.xml`, `Cargo.toml`) are detected as _structural presence signals_ only; their internal dependencies are NOT parsed.
- **No Framework Claims:** Phase 20 detects language & ecosystem signals (e.g. `TypeScript`, `Node.js Ecosystem`), but does NOT make framework claims (`React`, `Next.js`, `Django`, `Spring Boot` are deferred to Phase 21).
- **No Source File Classification:** Classification into source, test, or config code is deferred to Phase 22.

---

## 4. Dominant Language Evaluation Rules

To prevent data and configuration files from misleadingly dominating source code repositories:

1. Languages are categorized into `PROGRAMMING`, `SCRIPT`, `MARKUP`, `STYLE`, `QUERY`, `DATA`, and `CONFIGURATION`.
2. Dominant language candidate evaluation is strictly restricted to `PROGRAMMING` and `SCRIPT` categories.
3. If a repository has 500 JSON files and 10 Python files, the dominant programming language is accurately identified as `Python` (not `JSON`).
4. In the event of a tie for top file count among programming languages, `dominantLanguage` is reported as `null` (representing honest polyglot ambiguity).

---

## 5. Technology & Ecosystem Signals

| Signal                   | Category                |  Confidence   | Evidence Rules                                                            |
| :----------------------- | :---------------------- | :-----------: | :------------------------------------------------------------------------ |
| **Node.js Ecosystem**    | Runtime / Ecosystem     | HIGH / MEDIUM | `package.json` present (HIGH) or `.ts`/`.js` files (MEDIUM)               |
| **Docker**               | DevOps / Infrastructure |     HIGH      | `Dockerfile`, `docker-compose.yml`, `compose.yaml`                        |
| **Python Ecosystem**     | Runtime / Ecosystem     | HIGH / MEDIUM | `pyproject.toml`, `requirements.txt`, `setup.py` (HIGH) or `.py` (MEDIUM) |
| **Java / JVM Ecosystem** | Runtime / Ecosystem     | HIGH / MEDIUM | `pom.xml`, `build.gradle` (HIGH) or `.java` (MEDIUM)                      |
| **Rust Ecosystem**       | Runtime / Ecosystem     | HIGH / MEDIUM | `Cargo.toml` (HIGH) or `.rs` (MEDIUM)                                     |
| **Go Ecosystem**         | Runtime / Ecosystem     | HIGH / MEDIUM | `go.mod` (HIGH) or `.go` (MEDIUM)                                         |
| **.NET / C# Ecosystem**  | Runtime / Ecosystem     | HIGH / MEDIUM | `*.csproj`, `*.sln` (HIGH) or `.cs` (MEDIUM)                              |
| **GraphQL**              | API / Data              |     HIGH      | `*.graphql`, `*.gql` files                                                |
| **Protocol Buffers**     | API / Data              |     HIGH      | `*.proto` files                                                           |
| **Terraform (HCL)**      | DevOps / Infrastructure |     HIGH      | `*.tf`, `*.tfvars` files                                                  |
| **SQL Database Scripts** | Database / Storage      |     HIGH      | `*.sql` files                                                             |

---

## 6. Technology Profile DTO Specification

```ts
export interface TechnologyProfileDto {
  readonly sourceId: string;
  readonly detectedLanguages: readonly LanguageDetectionDto[];
  readonly dominantLanguage: string | null;
  readonly technologySignals: readonly TechnologySignalDto[];
  readonly totalIncludedFiles: number;
  readonly totalLanguageFiles: number;
  readonly unknownFiles: number;
  readonly analyzedAt: string;
}
```
