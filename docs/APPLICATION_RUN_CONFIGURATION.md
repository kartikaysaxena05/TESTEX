# Application Run & Startup Configuration (V2 Phase 26)

## Overview

The Application Run Configuration subsystem analyzes the attached repository source to discover and determine safe, deterministic, non-shell execution commands (`executable`, `args[]`, `workingDirectory`) without launching processes or executing arbitrary user commands.

## Architecture

```text
Renderer (RunConfigurationCard)
          ↓
useSelectedProjectRunConfig(projectId, hasSource)
          ↓
desktop:sources:run-config:*
          ↓
RunConfigService
   ├─► FrameworkProfileService (Phase 21 manifests & package managers)
   ├─► ArchitectureService (Phase 25 application units & entry points)
   ├─► CommandSafetyChecker (non-shell syntax & operator inspector)
   ├─► RuntimeChecker (bounded execFile with shell: false)
   ├─► StartupCandidateDetector
   └─► RunConfigRepository (PostgreSQL persistence)
```

## Security & Architectural Guarantees

1. **Zero Target Execution**: Zero processes or servers are launched during detection.
2. **Zero Shell Evaluation**: Commands are parsed strictly into an executable name and argument array (`shell: false`). Scripts containing shell chaining (`&&`, `||`, `;`), pipes (`|`), redirects (`>`, `<`), or expansions (`$()`, backticks) are classified as `REQUIRES_REVIEW`.
3. **Safe Target URL Validation**: Only `http:` and `https:` schemes without embedded credentials (`user:pass@`) are accepted. Invalid schemes like `javascript:`, `file:`, or `data:` are rejected by strict Zod and service-layer validation.
4. **Relational Persistence & Cascade Cleanup**: Run configuration records cascade delete automatically when a project source or project is removed.
