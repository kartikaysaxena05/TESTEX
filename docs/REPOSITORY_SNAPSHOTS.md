# Repository Snapshots & Baseline Management (V2 Phase 27)

## Overview

The Repository Snapshot subsystem provides immutable, point-in-time reference captures of indexed repository states for baseline comparison and change detection.

## Snapshot Model & Data Architecture

- `RepositorySnapshot`: Represents a snapshot header containing fingerprint, file counts, Git commit/branch context, and status.
- `RepositorySnapshotFile`: Stores immutable path, SHA-256 content hash, classification, language, and size for each indexed file.
- `ProjectSource.activeBaselineSnapshotId`: Points to the currently active baseline snapshot used for change detection.

```text
ProjectSource
   │
   ├─► activeBaselineSnapshotId ────────┐
   │                                    ▼
   └─► RepositorySnapshot (Baseline Header)
          │
          ├─► RepositorySnapshotFile (File 1: relativePath, contentHash, classification)
          ├─► RepositorySnapshotFile (File 2: relativePath, contentHash, classification)
          └─► RepositorySnapshotFile (...)
```

## Security & Storage Guarantees

1. **Zero Source Code Text**: Only relative file paths, SHA-256 hashes, classifications, and basic metadata are saved in the database. Source code content is never stored in snapshot tables.
2. **Deterministic Fingerprints**: Snapshot fingerprints are calculated over ascending sorted `relativePath:contentHash\n` entries using SHA-256.
3. **Database Integrity**: Deleting a project or source cascades to all snapshots and snapshot files. Deleting an active baseline snapshot clears the `activeBaselineSnapshotId` pointer safely.
