# V9 Phase 137 — AI Privacy & Local-Only Mode Architecture

## Overview
Phase 137 establishes a secure, kernel-enforced privacy policy and context firewall for the V9 AI Runtime. It ensures that local processing via Ollama on `127.0.0.1` is the strict default, while guaranteeing that source code, requirements, credentials, and test evidence never leak to remote AI providers without explicit, audited authorization.

---

## Key Principles & Guardrails

1. **Default `LOCAL_ONLY` Mode**:
   - Every newly created project defaults to `LOCAL_ONLY`.
   - Global requests without project configuration inherit `LOCAL_ONLY`.
   - Under `LOCAL_ONLY`, only providers with `type: 'LOCAL'` (e.g. Ollama) or `type: 'EMULATED'` are permitted.
   - Remote AI providers (e.g. OpenAI, Anthropic, cloud APIs) are deterministically blocked with `AiRemoteProviderBlockedError` (`AI_REMOTE_PROVIDER_BLOCKED`).

2. **No Automatic Cloud Fallback**:
   - If Ollama is offline or unavailable, requests immediately fail with `AiConnectionError` or `AiProviderUnavailableError`.
   - The runtime never silently falls back to remote cloud endpoints.

3. **Multi-Stage AI Context Firewall & Secret Redaction**:
   - All prompts, system prompts, and project context undergo automated sanitization before transmission to the model.
   - Secrets matching assigned regex patterns (`PRIVATE_KEY`, `GITHUB_TOKEN`, `API_KEY`, `BEARER_TOKEN`, `DATABASE_URL`, `PLAINTEXT_PASSWORD`), `sanitizeStringCredentials`, and `SecretRedactor` are masked with `[REDACTED]`.
   - Context is classified into deterministic categories: `PUBLIC`, `PROJECT_DATA`, `SOURCE_CODE`, `REQUIREMENTS`, `TEST_DATA`, `EXECUTION_EVIDENCE`, `CREDENTIAL`, and `SECRET`.

4. **Multi-Tenant Isolation**:
   - Privacy settings are strictly partitioned per project and owner UUID.
   - Cross-project privacy configuration access attempts fail with `AiCrossProjectAccessError`.

5. **Security Audit Logging**:
   - Security-sensitive actions emit authoritative `AuthAuditEvent` records:
     - `AI_PRIVACY_MODE_CHANGED`
     - `AI_REMOTE_PROVIDER_BLOCKED`
     - `AI_SECRET_REDACTION_APPLIED`
   - Raw credentials, access keys, or prompts are never stored in audit logs.

6. **Desktop Settings UI**:
   - An interactive `AiPrivacySettingsCard` is embedded in the Settings Screen under the Privacy tab.
   - Displays real-time privacy status badge, toggles for Local-Only mode, cloud fallback, and secret redaction.

---

## Technical Architecture

```text
User / Desktop Renderer
        ↓
IPC Handlers (apps/desktop/src/main/ipc/generation-handlers.ts)
        ↓
AiProviderService (packages/core/src/ai-provider/ai-provider-service.ts)
        ↓
AiPrivacyService (packages/core/src/ai-provider/ai-privacy-service.ts)
  ├── 1. Evaluate Privacy Policy (LOCAL_ONLY vs REMOTE_ALLOWED)
  ├── 2. Context Firewall Check & Secret Redaction
  └── 3. Emit Audit Events (AI_PRIVACY_MODE_CHANGED, AI_REMOTE_PROVIDER_BLOCKED, etc.)
        ↓
IAiProvider (OllamaProviderAdapter on localhost)
```

---

## Certification Suite
- Test file: `packages/core/src/ai-provider/certification/v9-phase137-certification.test.ts`
- Coverage:
  1. Default `LOCAL_ONLY` enforcement & cloud provider blocking.
  2. Prevention of silent cloud fallback on local failure.
  3. Deep secret & credential redaction across prompts & context.
  4. Context data categorization (`PROJECT_DATA`, `SOURCE_CODE`, `REQUIREMENTS`, `TEST_DATA`, `EXECUTION_EVIDENCE`, `SECRET`).
  5. Multi-tenant project isolation & authorization boundaries.
  6. Controlled switching to `REMOTE_ALLOWED` and return to `LOCAL_ONLY`.
  7. Structured audit event verification.
