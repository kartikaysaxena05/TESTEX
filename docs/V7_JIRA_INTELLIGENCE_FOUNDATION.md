# V7 Phase 89: Jira Integration Foundation

## 1. Overview

Phase 89 introduces the **Jira Integration Foundation** within the V7 External Integrations subsystem of the AI-Driven Software Quality Engineering Platform. This phase establishes the core connection infrastructure, secure credential storage, SSRF-protected networking, multi-tenant project isolation, authoritative client adapter, IPC bridge, and configuration UI required to communicate with Atlassian Jira Cloud and Jira Data Center/Server instances.

### 1.1 Strict Scope Boundaries

In accordance with strict modular phase governance:

- **Included in Phase 89**:
  - Connection data modeling in PostgreSQL with Prisma ORM
  - Symmetric AES-256-GCM credential vault with Associated Authenticated Data (AAD)
  - Strict SSRF-protected base URL validation and normalization
  - Central authoritative Jira HTTP client adapter for read-only verification endpoints (`/myself`, `/serverInfo`)
  - Bounded request timeouts, rate-limit backoff with `Retry-After` parsing, and normalized error mappings
  - Multi-tenant project boundary enforcement and per-project mutex serialization
  - Full audit logging (`JiraConnectionAudit`)
  - Hardened Electron IPC handlers with origin verification (`isTrustedIpcSender`)
  - Modern settings UI card with masked credentials and real-time validation
- **Explicitly Excluded (Deferred to Phase 90+)**:
  - NO Jira issue creation or modification
  - NO bug report to Jira publishing
  - NO attachment, screenshot, trace, or video uploads
  - NO duplicate Jira issue search or deduplication
  - NO status synchronization, webhook handlers, or comment polling
  - NO engineer assignment or notification triggers
  - NO automated patch generation or source code repair

---

## 2. Architecture & Core Subsystems

```
┌────────────────────────────────────────────────────────────────────────┐
│                   Desktop Renderer (React 19)                          │
│        [ JiraIntegrationSettingsCard ] ─── (Masked DTOs Only)          │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ window.desktopBridge.jira
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│              Electron Preload Bridge (contextBridge)                   │
│          - Pure IPC invoke forwards with channel isolation             │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ IPC Channels (JIRA_*)
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                   Main Process (Node.js)                               │
│  [ jira-handlers.ts ]                                                  │
│   ├── isTrustedIpcSender(event)                                        │
│   ├── Zod Schema Parsing & Sanitization                                │
│   └── Error Normalization to DesktopErrorCode                         │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                      Core Package (@ai-quality/core)                   │
│                                                                        │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │                     JiraConnectionService                        │  │
│  │   - Mutex serialized writes per project                          │  │
│  │   - Tenant isolation & cross-project verification                │  │
│  │   - Mass assignment protection                                   │  │
│  │   - Audit log recording                                          │  │
│  └───────────────────┬───────────────────────────────┬──────────────┘  │
│                      │                               │                 │
│         ┌────────────▼─────────────┐   ┌─────────────▼───────────────┐ │
│         │   JiraCredentialVault    │   │         JiraClient          │ │
│         │   - AES-256-GCM (v1)     │   │   - Cloud v3 / DC v2 routes │ │
│         │   - AAD bound to connId  │   │   - Basic / Bearer auth     │ │
│         │   - SecretRedactor sync  │   │   - Bounded timeout         │ │
│         └────────────┬─────────────┘   │   - Rate limit & backoff    │ │
│                      │                 └─────────────┬───────────────┘ │
│                      ▼                               ▼                 │
│         ┌──────────────────────────┐   ┌─────────────────────────────┐ │
│         │    JiraUrlValidator      │   │   External Jira Endpoint    │ │
│         │   - HTTPS enforcement    │   │   - GET /rest/api/3/myself  │ │
│         │   - SSRF / Loopback deny │   │   - GET /rest/api/3/serverI.│ │
│         │   - Cloud metadata deny  │   └─────────────────────────────┘ │
│         └──────────────────────────┘                                   │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                 PostgreSQL Database (Prisma ORM)                       │
│    - jira_connections (project_id UNIQUE, encrypted_credentials)       │
│    - jira_connection_audits (event_type, actor, previous/new status)   │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Data Model & Storage

### 3.1 `JiraConnection`

Stores project-level configuration and current connection state.

| Field                  | Type                     | Description                                                   |
| ---------------------- | ------------------------ | ------------------------------------------------------------- |
| `id`                   | `UUID` (PK)              | Unique connection identifier                                  |
| `projectId`            | `UUID` (Unique FK)       | Multi-tenant project boundary (1-to-1)                        |
| `displayName`          | `VARCHAR(128)`           | Human-readable connection label                               |
| `deploymentType`       | `JiraDeploymentType`     | `JIRA_CLOUD`, `JIRA_DATA_CENTER`, `JIRA_SERVER`               |
| `baseUrl`              | `VARCHAR(512)`           | Validated, normalized HTTPS endpoint                          |
| `authenticationType`   | `JiraAuthenticationType` | `API_TOKEN`, `BASIC_AUTH`, `PERSONAL_ACCESS_TOKEN`, `OAUTH2`  |
| `accountIdentifier`    | `VARCHAR(255)`           | Username / email address                                      |
| `secretReference`      | `VARCHAR(255)`           | Internal vault reference (`vault:jira:<id>`)                  |
| `encryptedCredentials` | `TEXT`                   | AES-256-GCM encrypted envelope (`v1:...`)                     |
| `connectionStatus`     | `JiraConnectionStatus`   | Current operational health (`CONNECTED`, `UNVALIDATED`, etc.) |
| `lastValidatedAt`      | `TIMESTAMPTZ`            | Timestamp of most recent validation attempt                   |
| `lastValidationResult` | `JSONB`                  | Structured snapshot of last validation response               |
| `createdBy`            | `VARCHAR(128)`           | Author identity (`USER`, `SYSTEM`)                            |

### 3.2 `JiraConnectionAudit`

Immutable audit log recording connection lifecycle events.

| Field            | Type                   | Description                                                                                                                                                                    |
| ---------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `id`             | `UUID` (PK)            | Audit entry identifier                                                                                                                                                         |
| `connectionId`   | `UUID`                 | ID of the target connection                                                                                                                                                    |
| `projectId`      | `UUID` (FK)            | Enforces project scoping and cascade deletion on project purge                                                                                                                 |
| `eventType`      | `JiraAuditEventType`   | Lifecycle event: `CONNECTION_CREATED`, `CONNECTION_UPDATED`, `CREDENTIALS_REPLACED`, `VALIDATION_ATTEMPTED`, `VALIDATION_SUCCEEDED`, `VALIDATION_FAILED`, `CONNECTION_DELETED` |
| `previousStatus` | `JiraConnectionStatus` | Prior operational status                                                                                                                                                       |
| `newStatus`      | `JiraConnectionStatus` | Updated operational status                                                                                                                                                     |
| `details`        | `JSONB`                | Non-sensitive context (duration, error codes, changes)                                                                                                                         |
| `actor`          | `VARCHAR(128)`         | User or system trigger                                                                                                                                                         |
| `createdAt`      | `TIMESTAMPTZ`          | Timestamp of log event                                                                                                                                                         |

---

## 4. Security & Cryptographic Vault

### 4.1 AES-256-GCM Encryption (`JiraCredentialVault`)

- **Key Derivation**: Keys are derived from `JIRA_VAULT_MASTER_KEY` environment variable or fall back to an internal master secret.
- **Cipher Envelope**: Follows format `v1:<iv_b64>:<authTag_b64>:<ciphertext_b64>`.
- **Initialization Vector**: 12 bytes of cryptographically secure random bytes per encryption (`crypto.randomBytes(12)`).
- **Associated Authenticated Data (AAD)**: The `connectionId` UUID is passed as AAD into `cipher.setAAD()`. Any attempt to swap ciphertexts between different connections or database rows fails decryption with `JiraSecurityError`.
- **Automated Redaction**: On every encryption and decryption, the raw token is immediately registered with `SecretRedactor.registerSecret()`.

### 4.2 SSRF Defenses (`JiraUrlValidator`)

- **Strict HTTPS**: Rejects unencrypted `http:` schemes in production. (Explicit loopback HTTP is permitted only under `{ allowLocalhostForTesting: true }`).
- **Dangerous Schemes Denied**: Strictly rejects `javascript:`, `file:`, `data:`, `ftp:`, `gopher:`, `ldap:`.
- **Embedded Credentials Denied**: Rejects userinfo in URLs (e.g. `https://user:pass@host`).
- **Loopback & Private Address Denied**:
  - IPv4: `127.0.0.0/8`, `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `169.254.0.0/16`, `0.0.0.0/8`.
  - IPv6: `::1`, `fe80::/10` (link-local), `fc00::/7` (Unique Local Addresses `fc00::` to `fdff::`), and IPv4-mapped IPv6 (`::ffff:127.x.x.x`).
- **Cloud Metadata Protection**: Always blocks metadata hostnames regardless of testing mode:
  - `169.254.169.254` (AWS, GCP, Azure, OpenStack)
  - `metadata.google.internal` (GCP)
  - `100.100.100.200` (Alibaba Cloud)
  - `instance-data` (Cloud metadata alias)

---

## 5. Authoritative Jira Client Adapter (`JiraClient`)

### 5.1 Route Separation

- **Jira Cloud**: Uses REST API version 3 (`/rest/api/3/myself`, `/rest/api/3/serverInfo`).
- **Jira Data Center / Server**: Uses REST API version 2 (`/rest/api/2/myself`, `/rest/api/2/serverInfo`).

### 5.2 Header Construction & Privacy

- **Cloud (API Token)**: Uses HTTP Basic Authentication with `base64(email:apiToken)`.
- **Data Center (PAT)**: Uses HTTP Bearer Authentication with `Bearer <patToken>`.
- Standard headers: `Accept: application/json`, `Content-Type: application/json`, `User-Agent: AI-Quality-Platform/1.0`.

### 5.3 Resiliency & Backoff

- **Bounded Timeout**: Defaults to 10 seconds (`AbortSignal.timeout(10_000)`).
- **Bounded Retries**: Maximum 2 retries on HTTP 429 and transient 5xx errors.
- **Rate Limit Parsing**: Reads `Retry-After` header (seconds or RFC 1123 date) and limits delay to `MAX_RETRY_DELAY_MS` (5,000ms).
- **Fast-Fail on Auth**: HTTP 401 and 403 immediately terminate without retries.

---

## 6. IPC Interface & Renderer Desktop Bridge

### 6.1 IPC Channels & Sender Authorization

All Jira IPC requests are routed through verified channels:

- `jira:create-connection`
- `jira:update-connection`
- `jira:get-connection`
- `jira:delete-connection`
- `jira:validate-connection`
- `jira:list-audit-log`

Security enforcement:

- Each handler invokes `isTrustedIpcSender(event)` to ensure calls originate strictly from `app://renderer/index.html`. Untrusted frames are rejected with `UNAUTHORIZED_SENDER`.
- Inputs are validated via contracts Zod schemas before reaching the service layer.
- Responses conform to `IpcResponse<T>` and sanitize internal database models into safe DTOs.

### 6.2 Settings Screen Integration

- Embedded `<JiraIntegrationSettingsCard projectId={selectedProjectId} />` in `apps/desktop/src/renderer/screens/SettingsScreen.tsx`.
- Displays connection status badge (`Connected`, `Unvalidated`, `Auth Failed`, `Rate Limited`, etc.).
- Plaintext API tokens are never sent to the renderer; existing credentials display as `••••••••••••••••`.
- Implements optimistic UI with race guards on project switching.

---

## 7. Verification & Certification

### 7.1 Test Suite Breakdown

| Suite                        | File                                | Tests  | Status        |
| ---------------------------- | ----------------------------------- | ------ | ------------- |
| URL Validator                | `jira-url-validator.test.ts`        | 14     | Pass          |
| Credential Vault             | `jira-credential-vault.test.ts`     | 5      | Pass          |
| Authoritative Client         | `jira-client.test.ts`               | 7      | Pass          |
| Connection Service           | `jira-connection-service.test.ts`   | 8      | Pass          |
| Contract Protocol Simulation | `jira-contract-integration.test.ts` | 7      | Pass          |
| Main IPC Handlers            | `jira-handlers.test.ts`             | 7      | Pass          |
| Settings UI Component        | `jira-ui.test.tsx`                  | 3      | Pass          |
| **Total Phase 89 Tests**     |                                     | **51** | **100% Pass** |

### 7.2 Real Jira Cloud Status Certification

In accordance with platform certification guidelines:

- Local contract test suite simulates Atlassian Cloud HTTP contracts (200, 401, 403, 429, 500, and malformed HTML) with 100% pass rate.
- Since real Atlassian corporate credentials are not injected in the local test environment, real external live connectivity is certified as **`BLOCKED / NOT AVAILABLE`**. Plaintext or mock external certification is strictly not fabricated.

---

## 8. Handoff to Phase 90

Phase 89 provides the following validated foundations for Phase 90:

1. Validated Jira credentials and connection status available via `JiraConnectionService.getConnection()`.
2. Safe decryption utility `JiraCredentialVault.decrypt()` bound to `connectionId`.
3. Central `JiraClient` ready to be extended with issue creation routes (`POST /rest/api/3/issue`).
4. Secret redaction active for all error logging and audit trails.
