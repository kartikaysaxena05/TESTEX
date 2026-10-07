/**
 * @file apps/desktop/src/renderer/screens/auth/AuthScreen.tsx
 * Authoritative Desktop Authentication Screen for V8 Phase 114.
 *
 * Implements:
 * 1. Login with email and password
 * 2. Signup with real credential registration and client validation
 * 3. Forgot Password request yielding cryptographic recovery token
 * 4. Reset Password consuming single-use recovery token
 * 5. Explicitly disabled Google & Apple OAuth placeholders ("Coming in Phase 115")
 * 6. Accessible semantic markup, error alerts, and loading states
 */

import React, { useState, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext.js';
import { Button, Input, Alert } from '../../ui/index.js';

export type AuthScreenMode = 'login' | 'signup' | 'forgot-password' | 'reset-password';

export interface AuthScreenProps {
  readonly initialMode?: AuthScreenMode;
}

export function AuthScreen({ initialMode = 'login' }: AuthScreenProps): React.JSX.Element {
  const { login, signup, forgotPassword, resetPassword, startSocialAuth, cancelSocialAuth } = useAuth();

  const [mode, setMode] = useState<AuthScreenMode>(initialMode);
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [resetToken, setResetToken] = useState('');

  const [loading, setLoading] = useState(false);
  const [socialLoading, setSocialLoading] = useState<'GOOGLE' | 'APPLE' | null>(null);
  const [activeSocialState, setActiveSocialState] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [deliveredToken, setDeliveredToken] = useState<string | null>(null);

  const switchMode = useCallback((newMode: AuthScreenMode) => {
    setMode(newMode);
    setErrorMessage(null);
    setSuccessMessage(null);
    setDeliveredToken(null);
    setSocialLoading(null);
    setActiveSocialState(null);
  }, []);

  const handleSocialAuth = async (provider: 'GOOGLE' | 'APPLE') => {
    setErrorMessage(null);
    setSuccessMessage(null);
    setSocialLoading(provider);

    try {
      const res = await startSocialAuth(provider);
      if (res.success && res.state) {
        setActiveSocialState(res.state);
        setSuccessMessage(
          `Authorizing with ${provider === 'GOOGLE' ? 'Google' : 'Apple'}... Complete authentication in your browser.`,
        );
      } else {
        setErrorMessage(res.error ?? `Failed to initiate ${provider} authentication.`);
        setSocialLoading(null);
      }
    } catch (err: unknown) {
      setErrorMessage(
        err instanceof Error ? err.message : `Failed to start ${provider} authentication.`,
      );
      setSocialLoading(null);
    }
  };

  const handleCancelSocial = async () => {
    if (activeSocialState) {
      await cancelSocialAuth(activeSocialState);
    }
    setActiveSocialState(null);
    setSocialLoading(null);
    setSuccessMessage(null);
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    // Mode-specific validation
    if (mode === 'signup') {
      if (!displayName.trim()) {
        setErrorMessage('Display name is required.');
        return;
      }
      if (password.length < 12) {
        setErrorMessage('Password must be at least 12 characters long.');
        return;
      }
      if (password !== confirmPassword) {
        setErrorMessage('Passwords do not match.');
        return;
      }
    } else if (mode === 'reset-password') {
      if (!resetToken.trim()) {
        setErrorMessage('Password reset token is required.');
        return;
      }
      if (password.length < 12) {
        setErrorMessage('New password must be at least 12 characters long.');
        return;
      }
      if (password !== confirmPassword) {
        setErrorMessage('Passwords do not match.');
        return;
      }
    }

    setLoading(true);

    try {
      if (mode === 'login') {
        const result = await login({ email, password });
        if (!result.success) {
          setErrorMessage(result.error ?? 'Invalid email or password.');
        }
      } else if (mode === 'signup') {
        const result = await signup({
          email,
          fullName: displayName.trim(),
          password,
          confirmPassword,
        });
        if (!result.success) {
          setErrorMessage(result.error ?? 'Failed to create account.');
        }
      } else if (mode === 'forgot-password') {
        const result = await forgotPassword({ email });
        if (result.success) {
          setSuccessMessage(result.message);
          if (result.resetToken) {
            setDeliveredToken(result.resetToken);
          }
        } else {
          setErrorMessage(result.error ?? 'Failed to process password recovery.');
        }
      } else if (mode === 'reset-password') {
        const result = await resetPassword({
          resetToken: resetToken.trim(),
          newPassword: password,
          confirmPassword,
        });
        if (result.success) {
          setSuccessMessage('Password reset successfully! Please sign in with your new password.');
          setPassword('');
          setConfirmPassword('');
          setResetToken('');
          setMode('login');
        } else {
          setErrorMessage(result.error ?? 'Failed to reset password.');
        }
      }
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : 'An unexpected authentication error occurred.';
      setErrorMessage(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleUseDeliveredToken = () => {
    if (deliveredToken) {
      setResetToken(deliveredToken);
      switchMode('reset-password');
    }
  };

  return (
    <div className="auth-viewport-wrapper" data-testid="auth-screen" data-auth-mode={mode}>
      <div className="auth-container" data-testid={`auth-mode-${mode}`}>
        <div className="auth-card">
          {/* Header */}
          <div className="auth-header">
            <div className="auth-brand">
              <div className="auth-brand-logo" aria-hidden="true">
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                </svg>
              </div>
              <span className="auth-brand-title">AI Quality Platform</span>
            </div>

            {mode === 'login' && (
              <>
                <h1 className="auth-title">Sign In to Your Account</h1>
                <p className="auth-subtitle">
                  Enter your credentials to access your quality engineering workspace.
                </p>
              </>
            )}

            {mode === 'signup' && (
              <>
                <h1 className="auth-title">Create an Account</h1>
                <p className="auth-subtitle">
                  Set up your developer profile with local credential security.
                </p>
              </>
            )}

            {mode === 'forgot-password' && (
              <>
                <h1 className="auth-title">Reset Your Password</h1>
                <p className="auth-subtitle">
                  Enter your email address to generate a secure recovery token.
                </p>
              </>
            )}

            {mode === 'reset-password' && (
              <>
                <h1 className="auth-title">Set New Password</h1>
                <p className="auth-subtitle">
                  Enter your recovery token and configure your new secure password.
                </p>
              </>
            )}
          </div>

          {/* Feedback Alerts */}
          {errorMessage && (
            <div data-testid="auth-error-alert">
              <Alert variant="danger" title="Authentication Error">
                {errorMessage}
              </Alert>
            </div>
          )}

          {successMessage && (
            <div data-testid="auth-success-alert">
              <Alert variant="success" title="Success">
                {successMessage}
              </Alert>
            </div>
          )}

          {/* Delivered Reset Token Box (Local Desktop Environment) */}
          {deliveredToken && (
            <div className="auth-delivery-box" data-testid="auth-delivered-token-container">
              <span className="auth-label">Recovery Token Issued (Local Desktop):</span>
              <div className="auth-token-display" data-testid="auth-delivered-token">
                {deliveredToken}
              </div>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                data-testid="btn-proceed-reset"
                onClick={handleUseDeliveredToken}
              >
                Proceed to Reset Password
              </Button>
            </div>
          )}

          {/* Form */}
          <form className="auth-form" data-testid="auth-form" onSubmit={handleSubmit} noValidate>
            {/* Display Name (Signup Only) */}
            {mode === 'signup' && (
              <div className="auth-field">
                <label className="auth-label" htmlFor="auth-input-name">
                  Full Name
                </label>
                <Input
                  id="auth-input-name"
                  data-testid="input-name"
                  type="text"
                  placeholder="e.g. Lead QA Engineer"
                  value={displayName}
                  onChange={e => setDisplayName(e.target.value)}
                  disabled={loading}
                  autoComplete="name"
                  required
                />
              </div>
            )}

            {/* Email (Login, Signup, Forgot-Password) */}
            {mode !== 'reset-password' && (
              <div className="auth-field">
                <label className="auth-label" htmlFor="auth-input-email">
                  Email Address
                </label>
                <Input
                  id="auth-input-email"
                  data-testid="input-email"
                  type="email"
                  placeholder="engineer@quality.platform"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  disabled={loading}
                  autoComplete="email"
                  required
                />
              </div>
            )}

            {/* Reset Token (Reset-Password Only) */}
            {mode === 'reset-password' && (
              <div className="auth-field">
                <label className="auth-label" htmlFor="auth-input-token">
                  Reset Token
                </label>
                <Input
                  id="auth-input-token"
                  data-testid="input-reset-token"
                  type="text"
                  placeholder="Paste 64-character token"
                  value={resetToken}
                  onChange={e => setResetToken(e.target.value)}
                  disabled={loading}
                  required
                />
              </div>
            )}

            {/* Password (Login, Signup, Reset-Password) */}
            {mode !== 'forgot-password' && (
              <div className="auth-field">
                <div className="auth-forgot-link-wrapper">
                  <label className="auth-label" htmlFor="auth-input-password">
                    {mode === 'reset-password' ? 'New Password' : 'Password'}
                  </label>
                  {mode === 'login' && (
                    <button
                      type="button"
                      className="auth-link-button"
                      data-testid="link-forgot-password"
                      onClick={() => switchMode('forgot-password')}
                    >
                      Forgot password?
                    </button>
                  )}
                </div>
                <Input
                  id="auth-input-password"
                  data-testid="input-password"
                  type="password"
                  placeholder="••••••••••••"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  disabled={loading}
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  required
                />
                {mode !== 'login' && (
                  <span className="auth-password-hint">
                    At least 12 characters, uppercase, lowercase, numbers, and symbols.
                  </span>
                )}
              </div>
            )}

            {/* Confirm Password (Signup, Reset-Password) */}
            {(mode === 'signup' || mode === 'reset-password') && (
              <div className="auth-field">
                <label className="auth-label" htmlFor="auth-input-confirm-password">
                  Confirm Password
                </label>
                <Input
                  id="auth-input-confirm-password"
                  data-testid="input-confirm-password"
                  type="password"
                  placeholder="••••••••••••"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  disabled={loading}
                  autoComplete="new-password"
                  required
                />
              </div>
            )}

            {/* Submit Button */}
            <Button
              type="submit"
              variant="primary"
              size="md"
              className="auth-submit-btn"
              data-testid="btn-submit"
              loading={loading}
              disabled={loading}
            >
              {mode === 'login' && (loading ? 'Signing in...' : 'Sign In')}
              {mode === 'signup' && (loading ? 'Creating account...' : 'Create Account')}
              {mode === 'forgot-password' && (loading ? 'Sending...' : 'Send Reset Token')}
              {mode === 'reset-password' && (loading ? 'Resetting...' : 'Reset Password')}
            </Button>
          </form>

          {/* Social Auth Providers (Google & Apple) */}
          {(mode === 'login' || mode === 'signup') && (
            <>
              <div className="auth-divider-container" aria-hidden="true">
                <div className="auth-divider-line" />
                <span className="auth-divider-text">or continue with</span>
                <div className="auth-divider-line" />
              </div>

              {socialLoading ? (
                <div className="auth-social-active-card" data-testid="social-loading-state">
                  <div
                    className="auth-loading-spinner"
                    style={{ width: 24, height: 24, borderWidth: 2 }}
                  />
                  <span>
                    Connecting to {socialLoading === 'GOOGLE' ? 'Google' : 'Apple'}...
                  </span>
                  <button
                    type="button"
                    className="auth-social-cancel-btn"
                    data-testid="social-cancel-btn"
                    onClick={handleCancelSocial}
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <div className="auth-social-buttons">
                  <button
                    type="button"
                    disabled={loading}
                    className="auth-social-btn"
                    data-testid="oauth-google-btn"
                    title="Sign in with Google"
                    aria-label="Sign in with Google"
                    onClick={() => handleSocialAuth('GOOGLE')}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053H12.48z" />
                    </svg>
                    <span>Google</span>
                  </button>

                  <button
                    type="button"
                    disabled={loading}
                    className="auth-social-btn"
                    data-testid="oauth-apple-btn"
                    title="Sign in with Apple"
                    aria-label="Sign in with Apple"
                    onClick={() => handleSocialAuth('APPLE')}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M15.97 7.17c.65-.79 1.1-1.89.98-2.99-1 .04-2.13.67-2.79 1.45-.58.67-1.09 1.77-.96 2.84 1.12.09 2.19-.58 2.77-1.3" />
                    </svg>
                    <span>Apple</span>
                  </button>
                </div>
              )}
            </>
          )}

          {/* Mode Switcher Links */}
          <div className="auth-footer">
            {mode === 'login' && (
              <>
                <span>Don&apos;t have an account?</span>
                <button
                  type="button"
                  className="auth-link-button"
                  data-testid="link-signup"
                  onClick={() => switchMode('signup')}
                >
                  Sign Up
                </button>
              </>
            )}

            {mode === 'signup' && (
              <>
                <span>Already have an account?</span>
                <button
                  type="button"
                  className="auth-link-button"
                  data-testid="link-login"
                  onClick={() => switchMode('login')}
                >
                  Sign In
                </button>
              </>
            )}

            {(mode === 'forgot-password' || mode === 'reset-password') && (
              <button
                type="button"
                className="auth-link-button"
                data-testid="link-back-login"
                onClick={() => switchMode('login')}
              >
                Back to Sign In
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
