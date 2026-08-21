import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseBulkRequirementsText,
  BULK_PARSER_VERSION,
  MAX_CANDIDATES_PER_BATCH,
} from './bulk-requirement-parser.js';

describe('BulkRequirementParser Unit Tests', () => {
  it('should return empty result for empty or whitespace-only input', () => {
    const res1 = parseBulkRequirementsText('');
    assert.equal(res1.candidates.length, 0);
    assert.equal(res1.totalParsed, 0);
    assert.equal(res1.parseVersion, BULK_PARSER_VERSION);

    const res2 = parseBulkRequirementsText('   \n\n\t  \n  ');
    assert.equal(res2.candidates.length, 0);
    assert.equal(res2.totalParsed, 0);
  });

  it('should parse plain one-per-line requirement statements', () => {
    const text = `The user shall be able to log in.
The user shall be able to log out.
The user shall be able to reset password.`;

    const res = parseBulkRequirementsText(text);
    assert.equal(res.candidates.length, 3);
    assert.equal(res.candidates[0]?.originalText, 'The user shall be able to log in.');
    assert.equal(res.candidates[0]?.parseMethod, 'PLAIN_LINE');
    assert.equal(res.candidates[1]?.originalText, 'The user shall be able to log out.');
    assert.equal(res.candidates[2]?.originalText, 'The user shall be able to reset password.');
    assert.equal(res.duplicateCount, 0);
  });

  it('should parse numbered lists in multiple formats (1., 1), (1), [1])', () => {
    const text = `1. The system shall authenticate users.
2) The system shall generate an access token.
(3) The system shall invalidate tokens on logout.
[4] The system shall log security events.`;

    const res = parseBulkRequirementsText(text);
    assert.equal(res.candidates.length, 4);
    assert.equal(res.candidates[0]?.originalText, 'The system shall authenticate users.');
    assert.equal(res.candidates[0]?.parseMethod, 'NUMBERED');
    assert.equal(res.candidates[1]?.originalText, 'The system shall generate an access token.');
    assert.equal(res.candidates[2]?.originalText, 'The system shall invalidate tokens on logout.');
    assert.equal(res.candidates[3]?.originalText, 'The system shall log security events.');
  });

  it('should parse bullet points with various bullet symbols (-, *, •, +, –)', () => {
    const text = `- User shall view dashboard.
* User shall export reports as CSV.
• User shall manage project settings.
+ User shall invite team members.
– User shall receive notifications.`;

    const res = parseBulkRequirementsText(text);
    assert.equal(res.candidates.length, 5);
    for (const c of res.candidates) {
      assert.equal(c.parseMethod, 'BULLET');
      assert.ok(c.originalText.length > 5);
    }
    assert.equal(res.candidates[0]?.originalText, 'User shall view dashboard.');
    assert.equal(res.candidates[2]?.originalText, 'User shall manage project settings.');
  });

  it('should extract common prefix identifiers (REQ-001:, FR-02 -, AUTH_01:)', () => {
    const text = `REQ-001: The system shall encrypt all passwords at rest.
FR-02 - The system shall rate limit login requests to 5 per minute.
AUTH_01: The user shall receive email verification upon registration.`;

    const res = parseBulkRequirementsText(text);
    assert.equal(res.candidates.length, 3);
    assert.equal(res.candidates[0]?.detectedExternalKey, 'REQ-001');
    assert.equal(res.candidates[0]?.parseMethod, 'PREFIXED');
    assert.equal(
      res.candidates[0]?.originalText,
      'The system shall encrypt all passwords at rest.',
    );

    assert.equal(res.candidates[1]?.detectedExternalKey, 'FR-02');
    assert.equal(res.candidates[1]?.parseMethod, 'PREFIXED');

    assert.equal(res.candidates[2]?.detectedExternalKey, 'AUTH_01');
  });

  it('should attach multiline indented continuation lines to the parent candidate', () => {
    const text = `1. The system shall lock the user account
   after five consecutive failed login
   attempts within a 15-minute window.
2. The administrator shall be able to
   manually unlock the account from the admin console.`;

    const res = parseBulkRequirementsText(text);
    assert.equal(res.candidates.length, 2);
    assert.equal(
      res.candidates[0]?.originalText,
      'The system shall lock the user account after five consecutive failed login attempts within a 15-minute window.',
    );
    assert.equal(res.candidates[0]?.lineStart, 1);
    assert.equal(res.candidates[0]?.lineEnd, 3);

    assert.equal(
      res.candidates[1]?.originalText,
      'The administrator shall be able to manually unlock the account from the admin console.',
    );
    assert.equal(res.candidates[1]?.lineStart, 4);
    assert.equal(res.candidates[1]?.lineEnd, 5);
  });

  it('should ignore multiple blank lines without creating empty candidates', () => {
    const text = `Requirement Alpha



Requirement Beta


Requirement Gamma
`;

    const res = parseBulkRequirementsText(text);
    assert.equal(res.candidates.length, 3);
    assert.equal(res.candidates[0]?.originalText, 'Requirement Alpha');
    assert.equal(res.candidates[1]?.originalText, 'Requirement Beta');
    assert.equal(res.candidates[2]?.originalText, 'Requirement Gamma');
  });

  it('should detect exact/whitespace-equivalent duplicate requirements within batch', () => {
    const text = `The system shall support user authentication.
The system shall enforce TLS 1.3 encryption.
the system shall support user authentication.   
The system shall enforce TLS 1.3 encryption.`;

    const res = parseBulkRequirementsText(text);
    assert.equal(res.candidates.length, 4);
    assert.equal(res.duplicateCount, 2);

    assert.equal(res.candidates[0]?.isDuplicateInBatch, false);
    assert.equal(res.candidates[1]?.isDuplicateInBatch, false);
    assert.equal(res.candidates[2]?.isDuplicateInBatch, true);
    assert.ok(res.candidates[2]?.warnings.some(w => w.includes('Duplicate requirement')));
    assert.equal(res.candidates[3]?.isDuplicateInBatch, true);
  });

  it('should NOT flag semantically related but textually different requirements as duplicates', () => {
    const text = `The user shall be able to sign in.
Registered users are permitted to authenticate.`;

    const res = parseBulkRequirementsText(text);
    assert.equal(res.candidates.length, 2);
    assert.equal(res.duplicateCount, 0);
    assert.equal(res.candidates[0]?.isDuplicateInBatch, false);
    assert.equal(res.candidates[1]?.isDuplicateInBatch, false);
  });

  it('should handle Windows CRLF line endings identically to Unix LF', () => {
    const lfText = '1. First item.\n2. Second item.';
    const crlfText = '1. First item.\r\n2. Second item.';

    const resLf = parseBulkRequirementsText(lfText);
    const resCrlf = parseBulkRequirementsText(crlfText);

    assert.equal(resLf.candidates.length, resCrlf.candidates.length);
    assert.equal(resLf.candidates[0]?.originalText, resCrlf.candidates[0]?.originalText);
    assert.equal(resLf.candidates[1]?.originalText, resCrlf.candidates[1]?.originalText);
  });

  it('should preserve international Unicode characters and symbols without corruption', () => {
    const text = `1. The invoice payment shall support ₹ (INR) and € (EUR) currencies.
2. ユーザーは日本語で要件を入力できること。
3. एप्लिकेशन को हिंदी भाषा का समर्थन करना चाहिए।
4. Système de gestion de qualité logicielle avec caractères accentués: é, à, ç.`;

    const res = parseBulkRequirementsText(text);
    assert.equal(res.candidates.length, 4);
    assert.ok(res.candidates[0]?.originalText.includes('₹ (INR) and € (EUR)'));
    assert.ok(res.candidates[1]?.originalText.includes('ユーザーは日本語'));
    assert.ok(res.candidates[2]?.originalText.includes('एप्लिकेशन को हिंदी'));
    assert.ok(res.candidates[3]?.originalText.includes('é, à, ç'));
  });

  it('should ignore Markdown headings from candidate list', () => {
    const text = `# Project Specifications
## Authentication Module
1. User shall provide email.
2. User shall provide password.
### Error Handling
3. System shall display error on invalid credentials.`;

    const res = parseBulkRequirementsText(text);
    assert.equal(res.candidates.length, 3);
    assert.equal(res.candidates[0]?.originalText, 'User shall provide email.');
    assert.equal(res.candidates[1]?.originalText, 'User shall provide password.');
    assert.equal(
      res.candidates[2]?.originalText,
      'System shall display error on invalid credentials.',
    );
  });

  it('should bound candidate count to MAX_CANDIDATES_PER_BATCH (500)', () => {
    const lines = [];
    for (let i = 1; i <= 600; i++) {
      lines.push(`${i}. Requirement statement number ${i} for scale verification.`);
    }

    const res = parseBulkRequirementsText(lines.join('\n'));
    assert.equal(res.candidates.length, MAX_CANDIDATES_PER_BATCH);
    assert.equal(res.totalParsed, MAX_CANDIDATES_PER_BATCH);
  });

  it('should be pure and deterministic (identical output for identical input)', () => {
    const text = `1. Verify order creation.
2. Verify payment gateway callback.
3. Verify inventory decrement.`;

    const run1 = parseBulkRequirementsText(text);
    const run2 = parseBulkRequirementsText(text);

    assert.deepEqual(run1, run2);
  });
});
