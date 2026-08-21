# Repository Change Detection Foundation (V2 Phase 27)

## Overview

The Change Detection subsystem performs fast, deterministic $O(B + C)$ comparison between the active baseline snapshot and the current repository index run, identifying added, modified, deleted, renamed, and unchanged files.

## Comparison Algorithm

1. **Path-Based Indexing**: Files from the active baseline and current index are indexed into lookup maps by `relativePath`.
2. **State Categorization**:
   - Files with matching path and identical `contentHash` -> `UNCHANGED`.
   - Files with matching path and differing `contentHash` -> `MODIFIED`.
   - Files in baseline missing from current index -> candidate `DELETED`.
   - Files in current index missing from baseline -> candidate `ADDED`.
3. **Exact 1-to-1 Content Hash Rename Detection**:
   - Candidate `DELETED` and candidate `ADDED` files are grouped by `contentHash`.
   - If exactly 1 deleted file and 1 added file share the same exact content hash, they are paired as `RENAMED` (`previousPath` -> `currentPath`).
   - If ambiguous (multiple files share the same hash), no arbitrary pairing is made; files remain `DELETED` and `ADDED`.
4. **Context Enrichment**: Direct importer relationships from `RepositoryImport` edges are attached to changed files.
