# Repository File Filtering & Ignore Rules

## 1. Overview

**V2 Phase 19: File Filtering, Ignore Rules & Safe Traversal** upgrades raw repository structure discovery into a **filtered, intelligence-ready view** of the software repository.

This phase parses root and nested `.gitignore` files, evaluates standard Git ignore semantics (comments, blank lines, negation, wildcards, directory rules, anchored paths), applies hard security exclusions (`.git`), default product exclusions (`node_modules`), performs early directory pruning for high traversal performance, and reports comprehensive filtering summaries.

---

## 2. Core Architectural Principle

```text
Phase 18:
What exists?

Phase 19:
What should later repository intelligence consider?
```

Phase 19 answers:

- What software files should be included for subsequent technology, test, and quality analysis?
- Which files and directories were ignored by `.gitignore` rules?
- Which entries were excluded by security policies or default product boundaries?
- How many `.gitignore` files and rules were active during traversal?

Phase 19 **explicitly does NOT**:

- Read application source code files (`.ts`, `.js`, `.py`, `.java`, etc.)
- Parse package manifests (`package.json`, `pom.xml`, `Cargo.toml`, etc.)
- Detect languages, frameworks, or technologies (Phase 20+)
- Classify source vs test vs config files (Phase 22)
- Index or embed repository files (Phase 24)

---

## 3. Four-Tier Filtering Decision Architecture

```
┌────────────────────────────────────────────────────────┐
│                   DISCOVERED ENTRY                     │
└──────────────────────────┬─────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────┐
│  TIER 1: SECURITY & CONTAINMENT                        │
│  - Path must remain within authorized source root      │
└──────────────────────────┬─────────────────────────────┘
                           │ Passed
                           ▼
┌────────────────────────────────────────────────────────┐
│  TIER 2: HARD SECURITY EXCLUSIONS                      │
│  - .git internals are ALWAYS excluded                  │
│  - Negation rules (e.g. !.git/**) CANNOT override     │
└──────────────────────────┬─────────────────────────────┘
                           │ Passed
                           ▼
┌────────────────────────────────────────────────────────┐
│  TIER 3: DEFAULT PRODUCT EXCLUSIONS                    │
│  - node_modules early-pruned by default                │
└──────────────────────────┬─────────────────────────────┘
                           │ Passed
                           ▼
┌────────────────────────────────────────────────────────┐
│  TIER 4: HIERARCHICAL .GITIGNORE RULES                 │
│  - Evaluated in priority from closest scope to root    │
│  - Negation (!pattern) explicitly re-includes entries  │
└──────────────────────────┬─────────────────────────────┘
                           │
             ┌─────────────┴─────────────┐
             ▼                           ▼
       [ INCLUDED ]                [ FILTERED ]
     (To Tree & Intel)        (Counted in Summary)
```

---

## 4. Permitted File Reading Scope

Phase 19 authorizes **strictly one file type for reading**: `.gitignore` files used solely for extracting ignore rules.

Reading any of the following remains **strictly forbidden**:

- Application source files (`src/app.ts`, `main.py`, etc.)
- Package manifests (`package.json`, `pom.xml`, `Cargo.toml`)
- Environment/secret files (`.env`, `credentials.json`)
- Documentation files for analysis (`README.md`)

---

## 5. Early Directory Pruning

When an excluded directory is identified (such as `node_modules/`, `dist/`, `.git/`, or `coverage/`), the traversal engine **prunes the entire subtree immediately**:

- Descendant files and subdirectories are not traversed.
- Drastically reduces filesystem I/O and CPU overhead on massive projects with hundreds of thousands of generated dependency files.
- The skipped directory is counted as `earlyPrunedDirectories`.

---

## 6. Structure Summary Metrics

```ts
export interface SourceStructureSummaryDto {
  readonly filesDiscovered: number;
  readonly directoriesDiscovered: number;
  readonly symlinksDiscovered: number;
  readonly totalDiscovered: number;
  readonly includedFiles: number;
  readonly includedDirectories: number;
  readonly totalIncluded: number;
  readonly ignoredEntries: number;
  readonly safetyExcludedEntries: number;
  readonly earlyPrunedDirectories: number;
  readonly ignoreFilesLoaded: number;
  readonly ignoreRulesLoaded: number;
  readonly warnings: readonly string[];
}
```
