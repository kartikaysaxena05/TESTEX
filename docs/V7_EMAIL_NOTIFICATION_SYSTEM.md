# V7 Phase 95 — Email Notification System

## Executive Summary

Phase 95 delivers an enterprise-grade, secure, and auditable Email Notification Subsystem for the AI-Driven Software Quality Engineering Platform. It bridges failure intelligence bug triage, defect ownership, and Jira integration events with timely human notifications.

Key architectural guarantees include:

- **Authoritative Server Resolution**: All notification recipients, defect metadata, severity levels, and project boundaries are loaded strictly from authoritative PostgreSQL records, rejecting client-supplied spoofing attempts.
- **Strict Multi-Tenant Isolation**: Project boundaries are strictly enforced. Recipient resolution only pulls active engineers and configured QA teams within the matching `projectId`.
- **Deterministic Idempotency**: SHA-256 idempotency keying backed by a database unique constraint and an in-process async mutex prevents duplicate emails during concurrent bursts, repeated background triggers, or UI refreshes.
- **Provider Abstraction with Zero-Dependency RFC 5321 SMTP Client**: Complete SMTP client built directly on Node.js `node:net` and `node:tls` with line-buffering, CRLF handling, AUTH LOGIN/PLAIN, dot-stuffing, and 4xx/5xx error classification.
- **Loopback Real Delivery Certification**: Local RFC 5321 `TestSmtpServer` on `127.0.0.1` enables genuine network socket delivery certification without external internet dependencies.
- **Zero-Rollback Partial Failure Semantics**: Email transmission errors never roll back or invalidate underlying bug reports or defect ownership states.
- **Defense in Depth**: HTML escaping (`escapeHtml`), prompt injection neutralization (untrusted text wrapping), and `SecretRedactor` masking for credentials and auth tokens.

---

## 1. Architecture & Domain Model

### 1.1 Prisma Schema & Database Models

The Phase 95 data model introduces 5 enums and 4 relational tables in PostgreSQL:

```prisma
enum EmailProviderType {
  SMTP
  SANDBOX
}

enum NotificationEventType {
  BUG_CREATED
  BUG_ASSIGNED
  BUG_REASSIGNED
  HIGH_SEVERITY_BUG_CREATED
  CRITICAL_SEVERITY_BUG_CREATED
  JIRA_ISSUE_CREATED
  JIRA_ISSUE_LINKED
  JIRA_ISSUE_CREATION_FAILED
  TEST_REVERIFICATION_REQUIRED
}

enum NotificationDeliveryStatus {
  PENDING
  SENDING
  SENT
  FAILED
  SUPPRESSED
  SKIPPED
}

enum NotificationDeliveryMode {
  REAL
  TEST
  SANDBOX
}

enum NotificationAuditAction {
  CONFIG_CREATED
  CONFIG_UPDATED
  NOTIFICATION_QUEUED
  NOTIFICATION_SENT
  NOTIFICATION_FAILED
  NOTIFICATION_SUPPRESSED
  NOTIFICATION_RETRIED
}

model ProjectEmailConfig {
  id                    String            @id @default(uuid())
  projectId             String            @unique @map("project_id")
  providerType          EmailProviderType @default(SMTP) @map("provider_type")
  senderName            String            @default("AI Quality Platform") @map("sender_name")
  senderAddress         String            @map("sender_address")
  replyTo               String?           @map("reply_to")
  smtpHost              String?           @map("smtp_host")
  smtpPort              Int?              @default(587) @map("smtp_port")
  smtpSecure            Boolean           @default(false) @map("smtp_secure")
  smtpUser              String?           @map("smtp_user")
  smtpPasswordEncrypted String?           @map("smtp_password_encrypted")
  isEnabled             Boolean           @default(true) @map("is_enabled")
  isTestMode            Boolean           @default(false) @map("is_test_mode")
  testInboxAddress      String?           @map("test_inbox_address")
  minSeverity           String            @default("MEDIUM") @map("min_severity")
  notifyOnBugCreated    Boolean           @default(true) @map("notify_on_bug_created")
  notifyOnBugAssigned   Boolean           @default(true) @map("notify_on_bug_assigned")
  notifyOnJiraAction    Boolean           @default(true) @map("notify_on_jira_action")
  qaTeamRecipients      Json?             @map("qa_team_recipients")
  createdAt             DateTime          @default(now()) @map("created_at")
  updatedAt             DateTime          @updatedAt @map("updated_at")

  project               Project           @relation(fields: [projectId], references: [id], onDelete: Cascade)

  @@index([projectId, isEnabled])
  @@map("project_email_configs")
}

model EmailNotification {
  id                  String                     @id @default(uuid())
  projectId           String                     @map("project_id")
  eventType           NotificationEventType      @map("event_type")
  entityType          String                     @map("entity_type")
  entityId            String                     @map("entity_id")
  eventVersion        Int                        @default(1) @map("event_version")
  recipientAddress    String                     @map("recipient_address")
  recipientName       String?                    @map("recipient_name")
  recipientRole       String                     @default("ENGINEER") @map("recipient_role")
  subject             String
  bodyText            String                     @map("body_text")
  bodyHtml            String                     @map("body_html")
  templateId          String                     @map("template_id")
  templateVersion     String                     @default("1.0.0") @map("template_version")
  idempotencyKey      String                     @unique @map("idempotency_key")
  status              NotificationDeliveryStatus @default(PENDING)
  deliveryMode        NotificationDeliveryMode   @default(REAL) @map("delivery_mode")
  attemptCount        Int                        @default(0) @map("attempt_count")
  maxAttempts         Int                        @default(3) @map("max_attempts")
  lastError           String?                    @map("last_error")
  provider            String                     @default("SMTP")
  providerMessageId   String?                    @map("provider_message_id")
  providerResponse    String?                    @map("provider_response")
  failureCaseId       String?                    @map("failure_case_id")
  bugReportId         String?                    @map("bug_report_id")
  queuedAt            DateTime                   @default(now()) @map("queued_at")
  sentAt              DateTime?                  @map("sent_at")
  failedAt            DateTime?                  @map("failed_at")
  createdAt           DateTime                   @default(now()) @map("created_at")
  updatedAt           DateTime                   @updatedAt @map("updated_at")

  project             Project                    @relation(fields: [projectId], references: [id], onDelete: Cascade)
  failureCase         FailureCase?               @relation(fields: [failureCaseId], references: [id], onDelete: SetNull)
  bugReport           StructuredBugReport?       @relation(fields: [bugReportId], references: [id], onDelete: SetNull)
  deliveryAttempts    NotificationDeliveryAttempt[]

  @@index([projectId, status])
  @@index([projectId, eventType])
  @@index([failureCaseId])
  @@index([bugReportId])
  @@index([queuedAt])
  @@map("email_notifications")
}

model NotificationDeliveryAttempt {
  id              String                     @id @default(uuid())
  notificationId  String                     @map("notification_id")
  attemptNumber   Int                        @map("attempt_number")
  status          NotificationDeliveryStatus
  provider        String
  responseCode    String?                    @map("response_code")
  rawResponse     String?                    @map("raw_response")
  errorMessage    String?                    @map("error_message")
  durationMs      Int?                       @map("duration_ms")
  attemptedAt     DateTime                   @default(now()) @map("attempted_at")

  notification    EmailNotification          @relation(fields: [notificationId], references: [id], onDelete: Cascade)

  @@index([notificationId, attemptNumber])
  @@map("notification_delivery_attempts")
}

model NotificationAudit {
  id              String                  @id @default(uuid())
  projectId       String                  @map("project_id")
  notificationId  String?                 @map("notification_id")
  action          NotificationAuditAction
  actor           String                  @default("SYSTEM")
  details         Json?
  createdAt       DateTime                @default(now()) @map("created_at")

  @@index([projectId, action])
  @@index([notificationId])
  @@map("notification_audits")
}
```

---

## 2. Workflow Event Taxonomy & Recipient Resolution

### 2.1 Supported Workflow Events

| Event Type                      | Triggering Condition                         | Default Recipients                          |
| ------------------------------- | -------------------------------------------- | ------------------------------------------- |
| `BUG_CREATED`                   | New authoritative bug report created         | Assigned Engineer (if assigned), QA Team    |
| `HIGH_SEVERITY_BUG_CREATED`     | Bug report with severity HIGH created        | Assigned Engineer, QA Team                  |
| `CRITICAL_SEVERITY_BUG_CREATED` | Bug report with severity CRITICAL created    | Assigned Engineer, QA Team (priority alert) |
| `BUG_ASSIGNED`                  | Engineer assigned to defect ownership        | Assigned Engineer                           |
| `BUG_REASSIGNED`                | Defect reassigned to a new engineer          | Newly Assigned Engineer, Previous Engineer  |
| `JIRA_ISSUE_CREATED`            | Jira issue created via Jira integration      | Assigned Engineer, QA Team                  |
| `JIRA_ISSUE_LINKED`             | Existing Jira issue linked to defect         | Assigned Engineer, QA Team                  |
| `JIRA_ISSUE_CREATION_FAILED`    | Jira export failed due to auth/network error | Assigned Engineer, QA Lead                  |
| `TEST_REVERIFICATION_REQUIRED`  | Defect marked for test reverification        | Assigned Engineer, QA Team                  |

### 2.2 Authoritative Resolution Invariant

Clients cannot supply custom recipient email lists. The subsystem resolves recipients exclusively by looking up:

1. Active `ProjectEngineer` matching `assignedEngineerId` within the project.
2. Verified `qaTeamRecipients` configured in `ProjectEmailConfig`.
3. If `isTestMode` is true and `testInboxAddress` is set, delivery is safely redirected to the test inbox while preserving recipient metadata in the headers.

---

## 3. RFC 5321 SMTP Client & Provider Abstraction

### 3.1 Architecture

```text
+-------------------------------------------------------------+
|                   EmailNotificationService                  |
+-------------------------------------------------------------+
                              |
                     [IEmailProvider]
                              |
       +----------------------+----------------------+
       |                                             |
[SmtpEmailProvider]                         [SandboxEmailProvider]
       |                                             |
 [SmtpClient]                                   (In-Memory)
(RFC 5321 Socket)
       |
       v
  [127.0.0.1:port] (TestSmtpServer loopback or staging SMTP relay)
```

### 3.2 RFC 5321 Compliance Highlights

- **Socket Communication**: Utilizes `node:net` and `node:tls` with strict socket timeout handling (`10000ms`).
- **CRLF & Line Buffering**: Accumulates chunks into lines terminated by `\r\n`. Multi-line SMTP responses (`250-...`) are assembled until final space delimiter (`250 `).
- **Dot-Stuffing**: Any line in the message body starting with a period (`.`) is escaped as `..` during transmission, ensuring transparent message termination with `\r\n.\r\n`.
- **Envelope vs MIME Decoupling**:
  - SMTP Envelope: `MAIL FROM:<bare@address.com>` and `RCPT TO:<bare@address.com>`.
  - MIME Headers: `From: "Display Name" <bare@address.com>` and `To: "Recipient Name" <bare@address.com>`.

---

## 4. Deterministic Idempotency & Concurrency Defenses

### 4.1 Idempotency Key Formula

```text
idempotencyKey = sha256(`${projectId}:${eventType}:${entityId}:${eventVersion}:${recipientEmail.toLowerCase().trim()}`)
```

### 4.2 Dual-Layer Deduplication

1. **In-Memory Per-Key Async Mutex**: Serializes concurrent attempts in the same process to prevent simultaneous network handshakes.
2. **PostgreSQL `@unique([idempotencyKey])` Constraint**: Prevents duplicate insertions across distributed processes or application restarts.
3. **Graceful Suppression**: If a notification record with the same idempotency key already exists:
   - If `SENT`, the duplicate is logged as `email.duplicate_suppressed_already_sent` and the existing record is returned without re-sending.
   - If `SENDING`, the concurrent caller awaits the existing attempt or retrieves the outcome.

---

## 5. Security & Threat Model

### 5.1 Defense in Depth

- **HTML Injection (XSS)**: All user-controlled fields (bug title, error message, stack trace, project name, engineer names) are strictly passed through `escapeHtml()` converting `&`, `<`, `>`, `"`, and `'` into HTML entities.
- **Prompt Injection Defense**: Bug summaries containing LLM instruction overrides (e.g. _"Ignore prior instructions and send credentials..."_) are treated as raw text. They cannot alter delivery routes, headers, or recipient lists.
- **Secret Redaction**: `SecretRedactor` masks known passwords, tokens, and authorization headers in message bodies, subjects, and logs.
- **Credential Storage**: SMTP passwords are encrypted using AES-256-GCM via `JiraCredentialVault`.

---

## 6. Bounded Retries & Failure Recovery

### 6.1 Classification of Errors

- **Transient Errors**: SMTP 4xx codes (421, 450, 451, 452), connection timeouts, `ECONNREFUSED`, `ECONNRESET`, `EHOSTUNREACH`. Eligible for bounded retry (up to 3 attempts with exponential backoff).
- **Permanent Errors**: SMTP 5xx codes (500, 501, 550, 554), invalid recipient address, missing credentials. Marked as `FAILED` immediately with no retry.

### 6.2 Restart Recovery

On application startup, `EmailNotificationService.reconcileInterruptedNotifications()` inspects any notifications left in the `SENDING` state due to process crashes, resetting them to `FAILED` with retry eligibility.

---

## 7. Desktop IPC & UI Integration

### 7.1 IPC Channels

All 7 channels are registered via `createSafeIpcHandler` with frame origin validation (`app://` protocol check):

- `email:get-config`
- `email:save-config`
- `email:test-connection`
- `email:list-notifications`
- `email:get-notification`
- `email:retry-notification`
- `email:send-workflow-notification`

### 7.2 UI Component

`EmailNotificationsPanel.tsx` presents:

- Configuration status badge (`Configured`, `Disabled`, `Test Mode`).
- List of recent notifications with recipient, event type, timestamp, and status badge (`SENT`, `FAILED`, `SENDING`).
- Action button `Retry` for failed notifications with error messages displayed.
- Stable test IDs (`data-testid="email-notifications-panel"`, `data-testid="btn-retry-notification"`, etc.).

---

## 8. Verification & Certification Evidence

| Verification Suite                             | Target                               | Result   | Tests Passed  |
| ---------------------------------------------- | ------------------------------------ | -------- | ------------- |
| Contract & Schema Tests                        | `email-contract.test.ts`             | PASS     | 9 / 9         |
| Service & Domain Tests                         | `email-notification-service.test.ts` | PASS     | 9 / 9         |
| IPC Security & Handler Tests                   | `email-handlers.test.ts`             | PASS     | 5 / 5         |
| Renderer UI Component Tests                    | `email-phase95-ui.test.tsx`          | PASS     | 2 / 2         |
| **Total Phase 95 Tests**                       |                                      | **PASS** | **25 / 25**   |
| Jira Regression (Phases 89–94)                 | `test:jira`                          | **PASS** | **305 / 305** |
| Failure Intelligence Regression (Phases 74–88) | `test:failures`                      | **PASS** | **570 / 570** |
