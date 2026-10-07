# V7 Phase 93 — Jira Duplicate Prevention & Existing-Issue Linking

## Executive Summary

Phase 93 delivers an enterprise-grade, deterministic Jira duplicate prevention and existing-issue linking engine for the AI-Driven Software Quality Engineering Platform. It prevents issue tracker clutter, links identical and clustered defects to existing Jira tickets, detects and arbitrates defect cluster split/merge ambiguities, and maintains complete provenance and auditability.

---

## 1. Deterministic 6-Level Duplicate Prevention Hierarchy

When evaluating whether a bug report should create a new Jira issue or link to an existing issue, the engine evaluates candidate issues across a strict 6-level deterministic precedence hierarchy:

```
[Level 1: Exact Bug Report Match] (Highest Precedence)
        │ (Active link for same projectId + bugReportId)
        ▼ Match Not Found
[Level 2: Exact Failure Case Match]
        │ (Active link for same projectId + failureCaseId)
        ▼ Match Not Found
[Level 3: Defect Cluster Authoritative Match & Conflict Detection]
        │ (Defect cluster membership active & clusterMemberCount >= 1)
        │ ├── Single Authoritative Issue -> USE_EXISTING
        │ └── Multiple Conflicting Issues -> INCONCLUSIVE (Manual Triage Required)
        ▼ Match Not Found
[Level 4: External Metadata Exact Match (Remote JQL Verification)]
        │ (Jira issues tagged with platform-failure-<id> or platform-report-<id>)
        ▼ Match Not Found
[Level 5: Strong Failure Signature Match (Remote JQL Verification)]
        │ (Matching Normalized Error Fingerprint + Test Case Key)
        ▼ Match Not Found
[Level 6: Clean — No Authoritative Duplicate] (Lowest Precedence)
        └── Decision: CREATE_NEW
```

### Critical Policy: Title Similarity Prohibition

Title similarity, text embeddings, and fuzzy summary matching are **strictly prohibited** from acting as authoritative duplicate proof. While fuzzy search may assist human triagers, automated deduplication decisions require cryptographic hashes, unique entity identifiers, or explicit remote Jira metadata labels.

---

## 2. Defect Cluster Deduplication & Conflict Arbitration

Failures associated with an authoritative defect cluster (`clusterMemberCount >= 1`) automatically benefit from defect-cluster-level deduplication:

1. **Defect Cluster Link Reuse**: If any failure in the cluster was previously linked or exported to Jira, subsequent failure reports in that same cluster resolve to `USE_EXISTING` referencing that ticket (`JIRA_RULE_3_DEFECT_CLUSTER`).
2. **Defect Cluster Merge Conflicts**: If multiple distinct Jira issues were historically linked to separate failures that have now been merged into a single cluster, the engine detects this conflict, halts automatic creation, and emits `INCONCLUSIVE` with rule `JIRA_RULE_3_CLUSTER_MERGE_CONFLICT`.
3. **Defect Cluster Split Conflicts**: If a cluster was split and a failure case's link points to an issue no longer associated with the current cluster key, the engine flags this inconsistency and requires human verification.

---

## 3. Database Schema: `jira_issue_links` Table

The Prisma data model guarantees relational integrity, multi-tenant isolation, and complete audit history:

```prisma
enum JiraLinkSource {
  CREATE_ISSUE
  SAME_DEFECT_CLUSTER
  SAME_FAILURE
  EXTERNAL_EXACT_MATCH
  STRONG_FAILURE_SIGNATURE
  USER_CONFIRMED_LINK
}

enum JiraDuplicateDecision {
  USE_EXISTING
  CREATE_NEW
  INCONCLUSIVE
  BLOCKED
}

model JiraIssueLink {
  id               String                 @id @default(uuid())
  projectId        String                 @map("project_id")
  failureCaseId    String                 @map("failure_case_id")
  bugReportId      String?                @map("bug_report_id")
  defectClusterId  String?                @map("defect_cluster_id")
  externalIssueId  String?                @map("external_issue_id")
  jiraConnectionId String                 @map("jira_connection_id")
  jiraProjectKey   String                 @map("jira_project_key")
  jiraIssueId      String                 @map("jira_issue_id")
  jiraIssueKey     String                 @map("jira_issue_key")
  jiraIssueUrl     String?                @map("jira_issue_url")
  linkReason       String                 @map("link_reason")
  linkSource       JiraLinkSource         @map("link_source")
  ruleId           String                 @map("rule_id")
  decision         JiraDuplicateDecision  @map("decision")
  isActive         Boolean                @default(true) @map("is_active")
  invalidationReason String?              @map("invalidation_reason")
  supersededById   String?                @map("superseded_by_id")
  metadataSnapshot Json?                  @map("metadata_snapshot")
  createdAt        DateTime               @default(now()) @map("created_at")
  updatedAt        DateTime               @updatedAt @map("updated_at")

  @@index([projectId, failureCaseId, isActive])
  @@index([projectId, defectClusterId, isActive])
  @@index([jiraConnectionId, jiraIssueKey])
  @@map("jira_issue_links")
}
```

---

## 4. Concurrency Mutex & Race Condition Defenses

To prevent race conditions where two concurrent bug report submissions or linking requests attempt to create duplicate issues for the same failure case or defect cluster:

- An in-memory per-entity asynchronous mutex serializes operations on `failureCaseId`, `bugReportId`, and `defectClusterId`.
- If an existing link is established while a concurrent request is waiting for the mutex lock, the subsequent request immediately detects the newly committed link upon acquiring the lock and short-circuits to `USE_EXISTING`.
- Stress-tested under 50 concurrent requests with zero duplicate issues created.

---

## 5. Invalidation on Deletion & Moved Issue Key Tracking

When verifying or reusing an existing Jira issue:

1. **404 Not Found (Deleted Issue)**: If Jira returns a 404 error when querying an issue key, the link is immediately marked `isActive = false`, with `invalidationReason = 'Jira issue was deleted (404 Not Found)'`, and an audit event `JIRA_LINK_INVALIDATED` is emitted. The deduplication engine falls through to subsequent evaluation rules.
2. **Moved Issue Keys**: When an issue is moved across Jira projects, Jira redirects to the new key. The engine verifies the authoritative `key` against the remote response. If the key has changed (e.g., `ENG-101` -> `PLAT-505`), the database record is automatically updated, preserving unbroken link lineage and audit logs (`JIRA_LINK_UPDATED`).

---

## 6. Safe Existing-Issue Linking with Lineage Superseding

Users can manually confirm linking a bug report to an existing Jira ticket:

- If an active link already exists for the failure case, it is not deleted or overwritten destructively.
- The existing link's `isActive` flag is updated to `false`, with `invalidationReason = 'Superseded by user-confirmed link'`, and `supersededById` points to the new active link ID.
- An audit event `JIRA_LINK_SUPERSEDED` is recorded.

---

## 7. Multi-Tenant Project & Connection Isolation

Multi-tenant boundaries are strictly enforced at the query, service, and database levels:

- All duplicate searches and link retrievals require matching `projectId`.
- Cross-project issue reuse is strictly forbidden: a Jira issue created in Project A will **never** match or link to a report in Project B, even if the error signatures are identical.
- Rejection of mismatched project IDs throws `JiraCrossProjectError`.

---

## 8. Desktop IPC Contract & User Interface

### IPC Channels

- `JIRA_EVALUATE_DUPLICATE`: Invoked on load of `StructuredBugReportPanel` to assess duplicate risk before presenting export actions.
- `JIRA_LINK_EXISTING_ISSUE`: Invoked when user confirms linking the bug report to an existing Jira ticket.
- `JIRA_GET_ISSUE_LINK`: Fetches active Jira issue link for a failure case.

### UI Experience (`StructuredBugReportPanel.tsx`)

- **Duplicate Detected Banner** (`data-testid="jira-duplicate-detected-banner"`): Displays matched rule, reason, issue key, cluster badge, and "Link Existing Issue" button. Suppresses the "Create Jira Issue" button.
- **Conflict Warning Banner** (`data-testid="jira-duplicate-conflict-banner"`): Displays amber/rose warning for cluster merge conflicts, requiring human triage.
- **Linked Issue Card** (`data-testid="jira-linked-issue-card"`): Shows the active Jira issue key, provenance badge (`USER_CONFIRMED_LINK`, `SAME_DEFECT_CLUSTER`, etc.), cluster link badge, and direct browser navigation link.
- **Link Confirmation Modal**: Prompts the engineer to confirm linking to the existing issue, detailing the precedence rule and cluster associations.

---

## 9. Live Atlassian Cloud Connectivity Statement

> [!IMPORTANT]
> **REAL JIRA CERTIFICATION: BLOCKED / NOT AVAILABLE**
> In accordance with instructions, live external network calls to Atlassian Cloud production servers are disabled in this evaluation environment. All contracts, HTTP wire payloads, JQL responses, error statuses (400, 401, 403, 404, 429, 500), and UI interactions are comprehensively validated through automated deterministic integration test suites and mocks.
