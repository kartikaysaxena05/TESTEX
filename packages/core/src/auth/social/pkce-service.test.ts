import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PkceService } from './pkce-service.js';

describe('PkceService', () => {
  it('generates random hex state and nonce of expected lengths', () => {
    const state = PkceService.generateState();
    const nonce = PkceService.generateNonce();

    assert.equal(typeof state, 'string');
    assert.equal(state.length, 64); // 32 bytes hex
    assert.equal(typeof nonce, 'string');
    assert.equal(nonce.length, 64);
    assert.notEqual(state, nonce);
  });

  it('generates random code verifier within RFC 7636 bounds (43-128 chars)', () => {
    const verifier = PkceService.generateCodeVerifier();
    assert.equal(typeof verifier, 'string');
    assert.ok(verifier.length >= 43 && verifier.length <= 128);
    // Base64URL safe characters only
    assert.match(verifier, /^[A-Za-z0-9\-_.~]+$/);
  });

  it('derives RFC 7636 S256 code challenge deterministically', () => {
    const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
    const challenge1 = PkceService.deriveCodeChallenge(verifier);
    const challenge2 = PkceService.deriveCodeChallenge(verifier);

    assert.equal(challenge1, challenge2);
    // RFC 7636 Appendix B test vector:
    assert.equal(challenge1, 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
  });

  it('hashes secrets deterministically with SHA-256 hex', () => {
    const secret = 'my-secret-state-value';
    const hash1 = PkceService.hashSecret(secret);
    const hash2 = PkceService.hashSecret(secret);

    assert.equal(hash1, hash2);
    assert.equal(hash1.length, 64);
    assert.notEqual(hash1, secret);
  });
});
