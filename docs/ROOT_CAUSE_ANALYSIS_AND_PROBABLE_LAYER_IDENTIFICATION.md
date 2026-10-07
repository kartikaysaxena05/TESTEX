# V6 Phase 83: Root-Cause Analysis & Probable Layer Identification

## 1. Overview

Phase 83 implements the **Root-Cause Analysis & Probable Layer Identification** subsystem within the V6 Failure Intelligence domain. It ingests verified facts from preceding V6 phases:

- **Phase 74**: Failure case lifecycle, state machines, and ownership
- **Phase 75**: Normalized evidence artifacts (screenshots, console logs, network events, DOM trees, traces) with SHA-256 integrity validation
- **Phase 76**: Reproduction results and environmental stability verification
- **Phases 77–78**: Deterministic rule classification and decision integrity arbitration
- **Phase 79**: Flakiness metrics and intermittent failure pattern detection
- **Phase 80**: Failure domain separation (Application Defect vs Automation vs Test Data vs Environment)
- **Phase 81**: Technical cause localization and timeline correlation
- **Phase 82**: AI-assisted failure classification reasoning with confidence calibration
- **V2**: Repository intelligence (files, AST symbols, modules, routes)

Phase 83 determines the **most evidence-supported probable root-cause hypothesis**, the **probable software layer** (from 17 canonical layers), and the **probable component/module**.

---

## 2. Architectural Boundaries & Guarantees

### 2.1 Advisory Hypothesis, Not Absolute Ground Truth

Root-cause analysis produces evidence-backed **hypotheses**. The system explicitly guarantees that an AI hypothesis is never presented as an unverified absolute truth. Permitted statuses:

- `SUPPORTED_HYPOTHESIS`: Strong, coherent multi-source evidence supporting the primary hypothesis.
- `MULTIPLE_PLAUSIBLE_CAUSES`: Co-equal competing hypotheses where available evidence cannot differentiate among them.
- `INSUFFICIENT_EVIDENCE`: Insufficient diagnostic telemetry, error messages, or classification facts to formulate a responsible hypothesis.
- `NO_REPOSITORY_CONTEXT`: Diagnostic reasoning succeeded for a live web target without an indexed source code repository.
- `NOT_APPLICABLE`: Assigned to non-application failures (such as environment or automation failures) where application root cause is inapplicable.
- `INCONCLUSIVE`: Conflicting signals prevent high-confidence conclusion.

### 2.2 Strict Anti-Hallucination Guarantee

LLMs are prohibited from inventing phantom source files or function symbols. All repository references suggested by AI models are strictly verified against actual indexed `RepositoryFile` (`relativePath`) and `RepositorySymbol` records for the project. Any hallucinated file or symbol is rejected and recorded in the analysis limitations.

### 2.3 Clean Zero-Repository Mode

When testing a live web application without a connected Git repository, Phase 83 operates in zero-repository mode:

- `repositoryContextAvailable: false`
- `repositoryReferences: []`
- Fabricated source files are strictly rejected
- Probable cause, probable layer, and human explanations are derived from network, console, and DOM evidence.

### 2.4 Dynamic Staleness Detection on Passive Read

Read requests (`getRootCauseAnalysis` or UI rendering) execute **zero LLM calls**. Staleness is dynamically evaluated against subsequent database events:

- Newer evidence artifacts attached (`failureEvidenceReference.attachedAt > analyzedAt`)
- New authoritative deterministic classification (`failureClassification.createdAt > analyzedAt`)
- Domain separation re-evaluation (`failureDomainSeparation.evaluatedAt > analyzedAt`)
- Technical localization update (`failureTechnicalLocalization.localizedAt > analyzedAt`)
- AI assessment re-evaluation (`failureAiAssessment.assessedAt > analyzedAt`)

When stale, the existing record is updated with `isStale: true` and `stalenessReason`.

### 2.5 Mutex Serialization & Concurrency Safety

A per-failure-case mutex (`Mutex`) serializes concurrent analysis requests. Simultaneous requests for the same failure case coalesce into a single execution, preventing duplicate authoritative database records.

### 2.6 Out of Scope (Phase 84+)

Phase 83 strictly excludes:

- Severity and priority scoring (Phase 84)
- Duplicate defect clustering (Phase 85)
- Bug report generation / Jira ticket creation (Phase 87)
- Code repair, patch generation, and automated fixing

---

## 3. Probable Layer Taxonomy (17 Canonical Layers)

The platform categorizes root causes into 17 mutually exclusive canonical layers:

1. `FRONTEND`: Client-side UI, markup, styles, or client logic
2. `BACKEND`: Server-side application services, workers, or business logic
3. `API`: HTTP endpoints, REST/GraphQL controllers, or API routing
4. `DATABASE`: Relational/NoSQL database queries, migrations, or constraints
5. `AUTHENTICATION`: Credential validation, token issuance, or session creation
6. `AUTHORIZATION`: Role-based access control, permissions, or tenant boundaries
7. `VALIDATION`: Input schema validation, payload type checks, or form validation
8. `BUSINESS_LOGIC`: Domain rules, calculations, workflows, or state transitions
9. `NETWORK`: DNS resolution, proxy timeouts, TLS errors, or connectivity drops
10. `CONFIGURATION`: Environment variables, feature flags, or server config files
11. `INFRASTRUCTURE`: Cloud services, container runtimes, disk space, or hardware
12. `TEST_AUTOMATION`: Flaky locators, timing race conditions, or Playwright scripts
13. `TEST_DATA`: Missing seed fixtures, expired mock users, or corrupted test data
14. `ENVIRONMENT`: Staging drift, unavailable dependency services, or port conflicts
15. `THIRD_PARTY_DEPENDENCY`: External SaaS APIs (Stripe, Twilio, SendGrid, OAuth)
16. `UNKNOWN`: Insufficient evidence to pinpoint a specific technical layer
17. `MULTI_LAYER`: Cascading failures spanning multiple distinct architectural layers

---

## 4. Database Schema

Model `FailureRootCauseAnalysis` in `prisma/schema.prisma`:

- Linked to `Project`, `FailureCase`, `TestCase`, `FailureAnalysisRun`, `FailureClassification`, `FailureTechnicalLocalization`, `FailureDomainSeparation`, and `FailureAiAssessment`
- Self-relation `supersededBy` / `supersedes` for revision lineage
- Indexes on `projectId`, `failureCaseId`, `probableLayer`, `rootCauseStatus`, `isAuthoritative`, `analyzedAt`

---

## 5. IPC Channels & Preload API

```typescript
// Channels
DESKTOP_CHANNELS.FAILURES_ANALYZE_ROOT_CAUSE = 'failures:analyze-root-cause';
DESKTOP_CHANNELS.FAILURES_GET_ROOT_CAUSE_ANALYSIS = 'failures:get-root-cause-analysis';
DESKTOP_CHANNELS.FAILURES_REANALYZE_ROOT_CAUSE = 'failures:reanalyze-root-cause';
DESKTOP_CHANNELS.FAILURES_LIST_ROOT_CAUSE_HISTORY = 'failures:list-root-cause-history';

// Preload API
window.desktop.failures.analyzeRootCause(input);
window.desktop.failures.getRootCauseAnalysis(input);
window.desktop.failures.reanalyzeRootCause(input);
window.desktop.failures.listRootCauseHistory(input);
```

---

## 6. Verification & Test Coverage

- Unit tests for sanitizer, fingerprint, validator, prompt definition, and security
- Concurrency and mutex tests
- Adversarial prompt injection and anti-hallucination tests
- End-to-end certification scenario test
- IPC handler validation tests
- React UI inspection panel component tests
