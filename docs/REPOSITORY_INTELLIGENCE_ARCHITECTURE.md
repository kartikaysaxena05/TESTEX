# Repository Intelligence Architecture

## Overview

The Repository Intelligence subsystem (Version 2, Phases 15–28) provides an offline, deterministic, and security-hardened pipeline for extracting structural, architectural, dependency, and change intelligence from local source code repositories.

---

## Architectural Pipeline

```
       ┌────────────────────────┐
       │   QA Project Entity    │
       └───────────┬────────────┘
                   │
                   ▼
       ┌────────────────────────┐
       │     ProjectSource      │  (Phase 15: Attachment & Path Canonicalization)
       └───────────┬────────────┘
                   │
                   ▼
       ┌────────────────────────┐
       │    Source Identity     │  (Phase 16: SHA-256 Fingerprint, Availability)
       └───────────┬────────────┘
                   │
                   ▼
       ┌────────────────────────┐
       │      Git Context       │  (Phase 17: Read-Only Git Plumbing & Root Isolation)
       └───────────┬────────────┘
                   │
                   ▼
       ┌────────────────────────┐
       │   Structure Discovery  │  (Phase 18: Stack-Safe Iterative Directory Walker)
       └───────────┬────────────┘
                   │
                   ▼
       ┌────────────────────────┐
       │   Ignore & Filtering   │  (Phase 19: .gitignore Matcher, .git Security Exclusions)
       └───────────┬────────────┘
                   │
                   ▼
       ┌────────────────────────┐
       │ Languages & Tech Stack │  (Phase 20: Byte-Proportional Classifier, Tech Signals)
       └───────────┬────────────┘
                   │
                   ▼
       ┌────────────────────────┐
       │ Frameworks & Manifests │  (Phase 21: Safe Manifest Parsers, Package Ecosystems)
       └───────────┬────────────┘
                   │
                   ▼
       ┌────────────────────────┐
       │  File Classification   │  (Phase 22: SOURCE, TEST, CONFIG, ASSET, DATABASE, etc.)
       └───────────┬────────────┘
                   │
                   ▼
       ┌────────────────────────┐
       │ Secure Content Gateway │  (Phase 23: Path Traversal Check, Secret Protection, UTF-8)
       └───────────┬────────────┘
                   │
                   ▼
       ┌────────────────────────┐
       │    Repository Index    │  (Phase 24: AST Parsing, Symbol & Import Extraction)
       └───────────┬────────────┘
                   │
                   ▼
       ┌────────────────────────┐
       │ Architecture & Entries │  (Phase 25: App Kinds, Structural Areas, Module Hubs, Entries)
       └───────────┬────────────┘
                   │
                   ▼
       ┌────────────────────────┐
       │   Run Configuration    │  (Phase 26: Startup Candidates, Script Safety Auditing)
       └───────────┬────────────┘
                   │
                   ▼
       ┌────────────────────────┐
       │ Snapshots & Baselines  │  (Phase 27: Fingerprinted Baselines, Change Detection)
       └────────────────────────┘
```

---

## Core Security & Isolation Principles

1. **Source Authority Isolation**:
   - The attached source root is the hard security boundary.
   - If the attached source directory is nested inside a larger parent Git repository, intelligence operations **never** read or traverse parent repository files outside the attached root.
2. **Zero Code Execution**:
   - Target configuration scripts (`next.config.js`, `vite.config.ts`, `setup.py`, `build.gradle`, etc.) are parsed as text or AST — never dynamically imported, `eval`'d, or executed.
3. **No Target Process Spawning**:
   - The QA platform never runs target application start scripts or builds (`npm start`, `flask run`, etc.).
   - Tooling validation is strictly restricted to verifying installed local CLI versions (e.g. `node --version`, `pnpm --version`).
4. **Zero AI / External Network Dependency**:
   - Repository analysis runs 100% locally and deterministically.
   - No data is transmitted to LLM APIs, vector databases, or remote telemetry.
5. **No Source Mutation**:
   - The platform never modifies, creates, or deletes files within the attached source folder.
