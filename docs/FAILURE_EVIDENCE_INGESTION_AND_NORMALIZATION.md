# Failure Evidence Ingestion, Normalization & Integrity Validation

**Version:** V6 — Failure Intelligence, Root-Cause Analysis & Intelligent Bug Triage  
**Phase:** 75 — Failure Evidence Ingestion, Normalization & Integrity Validation  
**Status:** COMPLETE / FROZEN / CERTIFIED

---

## 1. Architectural Overview & Boundaries

Phase 75 implements the authoritative domain services, cryptographic integrity verification, normalization engine, secret redactor, deterministic signature generator, desktop IPC infrastructure, and inspection UI bridging V5 autonomous execution evidence into V6 failure intelligence.

### Key Invariants

1. **Zero Evidence Duplication:** V5 remains the sole producer of screenshots, Playwright traces, console logs, network captures, DOM snapshots, and runtime logs. V6 creates foreign-key references (`FailureEvidenceReference`) pointing to V5 artifacts rather than duplicating raw files.
2. **Deterministic Failure Signatures:** Signatures (`sig_<hash>`) are computed using SHA-256 over normalized failure characteristics (action type, target summary, assertion type, error message, browser engine) with volatile tokens (UUIDs, timestamps, session tokens, ephemeral ports) stripped.
3. **Truthful Evidence Availability States:** Strict distinction between `CAPTURED_EMPTY`, `NOT_CAPTURED`, `UNAVAILABLE`, and `VERIFIED`. Unknown or missing artifacts remain explicitly missing rather than assumed.
4. **Cryptographic Integrity & Path Traversal Rejection:** Managed evidence paths are resolved strictly within the sandbox root. Byte-level SHA-256 comparisons verify file authenticity.
5. **Secret Redaction:** High-entropy Bearer tokens, Basic authorization headers, database connection strings, passwords, and sensitive query parameters (`apiKey`, `token`, `secret`) are sanitized recursively before UI rendering.

---

## 2. Evidence Taxonomy & Normalization Model

| Taxonomy Dimension      | Canonical Source                                                     | Normalization Output                                                                |
| :---------------------- | :------------------------------------------------------------------- | :---------------------------------------------------------------------------------- |
| **Failed Step**         | `StepExecutionRecord`                                                | `NormalizedFailedStepDto` (index, action, target, duration, error)                  |
| **Assertion Context**   | `AssertionExecutionRecord`                                           | `NormalizedExpectedActualDto` (type, operator, expected, actual, diff)              |
| **Screenshots**         | `ExecutionEvidenceArtifact` (`SCREENSHOT`)                           | `NormalizedScreenshotDto` (resolution, base64 / path reference)                     |
| **Console Logs**        | `ExecutionEvidenceArtifact` (`CONSOLE_LOG`)                          | `NormalizedConsoleMessageDto[]` (level, sanitized text, timestamp)                  |
| **Network Logs**        | `ExecutionEvidenceArtifact` (`NETWORK_LOG` / `REQUEST` / `RESPONSE`) | `NormalizedNetworkRecordDto[]` (method, url, status, duration, redacted payload)    |
| **DOM & State**         | `ExecutionEvidenceArtifact` (`DOM_SNAPSHOT`)                         | `NormalizedDomEvidenceDto` (bounded HTML string, URL, title)                        |
| **Retries & Flakiness** | `TestCaseExecution` sibling attempts                                 | `NormalizedRetryRecordDto[]` (attempt numbers, statuses, durations)                 |
| **Locator Healing**     | `LocatorHealingAttempt`                                              | `NormalizedHealingRecordDto[]` (strategies, original vs healed locator, confidence) |
| **Environment**         | `ProjectEnvironment` + `ExecutionEnvironmentSnapshot`                | `NormalizedEnvironmentDto` (name, baseUrl, browser, viewport, OS)                   |

---

## 3. Completeness & Integrity Matrix

### Completeness Levels (`evidenceCompleteness`):

- `COMPLETE`: Step execution, assertion/error context, screenshots, and console logs are present.
- `PARTIAL`: Step execution and screenshot or console logs are present.
- `MINIMAL`: Only basic execution error message is present.
- `INSUFFICIENT`: No step execution records or artifact details available.

### Integrity States (`integrityStatus`):

- `VERIFIED`: File exists on disk and physical byte SHA-256 digest matches stored checksum.
- `UNVERIFIED`: Reference attached but hash check has not been executed.
- `MISSING`: File referenced in DB is absent from managed storage disk.
- `MISMATCH`: Physical file bytes do not match expected cryptographic hash.
- `CORRUPT`: File unreadable, size exceeds 50 MB, or illegal path traversal attempted.
- `UNAVAILABLE`: Storage subsystem unreachable or uninitialized.

---

## 4. Verification & Certification

All 1687 platform unit and integration test suites pass across V1 through V6 Phase 75:

```bash
npm run typecheck       # 0 errors across contracts, core, and desktop
npm run test:failures   # 75/75 passing failure domain and evidence tests
npm run desktop:build   # Clean production bundle
npm run desktop:smoke   # Verified Electron launch
npm test                # 1687/1687 platform tests passing
```
