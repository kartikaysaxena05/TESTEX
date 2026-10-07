/**
 * @file apps/desktop/src/renderer/features/environments/TargetEnvironmentConfigModal.tsx
 * Modal for configuring the real web application target, browser runtime, and authentication (Phase 122).
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Dialog } from '../../ui/Dialog.js';
import { Button } from '../../ui/Button.js';
import { FormField } from '../../ui/FormField.js';
import { Input } from '../../ui/Input.js';
import { Select } from '../../ui/Select.js';
import { Alert } from '../../ui/Alert.js';
import { Spinner } from '../../ui/Spinner.js';
import { Badge } from '../../ui/Badge.js';
import type {
  TargetEnvironmentConfigDto,
  TargetConnectionTestResultDto,
  TargetAuthTestResultDto,
  BrowserEngine,
  EnvironmentType,
  AuthStrategy,
  AuthValidationType,
} from '@ai-quality/contracts';

export interface TargetEnvironmentConfigModalProps {
  readonly isOpen: boolean;
  readonly projectId: string;
  readonly projectName: string;
  readonly initialEnvironmentId?: string | null;
  readonly onClose: () => void;
  readonly onSuccess?: (env: TargetEnvironmentConfigDto) => void;
}

const BROWSER_OPTIONS: readonly { readonly value: BrowserEngine; readonly label: string }[] = [
  { value: 'chromium', label: 'Chromium (Default)' },
  { value: 'firefox', label: 'Mozilla Firefox' },
  { value: 'webkit', label: 'WebKit (Safari engine)' },
];

const ENVIRONMENT_TYPES: readonly { readonly value: EnvironmentType; readonly label: string }[] = [
  { value: 'DEVELOPMENT', label: 'Development' },
  { value: 'STAGING', label: 'Staging' },
  { value: 'PRODUCTION', label: 'Production' },
];

const AUTH_STRATEGIES: readonly {
  readonly value: AuthStrategy;
  readonly label: string;
}[] = [
  { value: 'NONE', label: 'None (Public Application)' },
  { value: 'FORM_LOGIN', label: 'Form Login (Username & Password)' },
  { value: 'HTTP_BASIC', label: 'HTTP Basic Authentication' },
  { value: 'STORAGE_STATE', label: 'Stored Session / Storage State' },
];

export function TargetEnvironmentConfigModal({
  isOpen,
  projectId,
  projectName,
  initialEnvironmentId,
  onClose,
  onSuccess,
}: TargetEnvironmentConfigModalProps): React.JSX.Element | null {
  const [environments, setEnvironments] = useState<readonly TargetEnvironmentConfigDto[]>([]);
  const [selectedEnvId, setSelectedEnvId] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [isTestingAuth, setIsTestingAuth] = useState(false);

  // Form Fields
  const [name, setName] = useState('');
  const [type, setType] = useState<EnvironmentType>('DEVELOPMENT');
  const [baseUrl, setBaseUrl] = useState('');
  const [apiUrl, setApiUrl] = useState('');
  const [browserEngine, setBrowserEngine] = useState<BrowserEngine>('chromium');
  const [headless, setHeadless] = useState(true);
  const [viewportWidth, setViewportWidth] = useState(1280);
  const [viewportHeight, setViewportHeight] = useState(720);
  const [ignoreHttpsErrors, setIgnoreHttpsErrors] = useState(false);
  const [isDefault, setIsDefault] = useState(false);

  // Auth fields
  const [strategy, setStrategy] = useState<AuthStrategy>('NONE');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [passwordPreview, setPasswordPreview] = useState<string | null>(null);
  const [loginUrl, setLoginUrl] = useState('');
  const [usernameFieldSelector, setUsernameFieldSelector] = useState('');
  const [passwordFieldSelector, setPasswordFieldSelector] = useState('');
  const [submitControlSelector, setSubmitControlSelector] = useState('');
  const [successValidationType, setSuccessValidationType] = useState<AuthValidationType>('NONE');
  const [successValidationValue, setSuccessValidationValue] = useState('');

  // Diagnostic states
  const [connectionResult, setConnectionResult] = useState<TargetConnectionTestResultDto | null>(null);
  const [authResult, setAuthResult] = useState<TargetAuthTestResultDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  const applyEnvToForm = (env: TargetEnvironmentConfigDto) => {
    setSelectedEnvId(env.id);
    setName(env.name);
    setType(env.type);
    setBaseUrl(env.baseUrl ?? '');
    setApiUrl(env.apiUrl ?? '');
    setBrowserEngine(env.browserEngine);
    setHeadless(env.headless);
    setViewportWidth(env.viewportWidth);
    setViewportHeight(env.viewportHeight);
    setIgnoreHttpsErrors(env.ignoreHttpsErrors);
    setIsDefault(env.isDefault);

    if (env.auth) {
      setStrategy(env.auth.strategy);
      setUsername(env.auth.username ?? '');
      setPassword('');
      setPasswordPreview(env.auth.passwordPreview ?? null);
      setLoginUrl(env.auth.loginUrl ?? '');
      setUsernameFieldSelector(env.auth.usernameFieldSelector ?? '');
      setPasswordFieldSelector(env.auth.passwordFieldSelector ?? '');
      setSubmitControlSelector(env.auth.submitControlSelector ?? '');
      setSuccessValidationType(env.auth.successValidationType ?? 'NONE');
      setSuccessValidationValue(env.auth.successValidationValue ?? '');
    } else {
      setStrategy('NONE');
      setUsername('');
      setPassword('');
      setPasswordPreview(null);
      setLoginUrl('');
      setUsernameFieldSelector('');
      setPasswordFieldSelector('');
      setSubmitControlSelector('');
      setSuccessValidationType('NONE');
      setSuccessValidationValue('');
    }

    setConnectionResult(null);
    setAuthResult(null);
    setError(null);
    setInfoMessage(null);
  };

  const loadEnvironments = useCallback(async () => {
    if (!window.desktop?.targetEnvironment?.list) return;
    setIsLoading(true);
    setError(null);
    try {
      const res = await window.desktop.targetEnvironment.list({ projectId });
      if (res.ok) {
        setEnvironments(res.data);
        const match =
          res.data.find(e => e.id === initialEnvironmentId) ??
          res.data.find(e => e.isDefault) ??
          res.data[0];
        if (match) {
          applyEnvToForm(match);
        }
      } else {
        setError(res.error.message);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load environments');
    } finally {
      setIsLoading(false);
    }
  }, [projectId, initialEnvironmentId]);

  useEffect(() => {
    if (isOpen) {
      void loadEnvironments();
    }
  }, [isOpen, loadEnvironments]);

  const handleSelectEnvChange = (envId: string) => {
    const found = environments.find(e => e.id === envId);
    if (found) {
      applyEnvToForm(found);
    }
  };

  const handleTestConnection = async () => {
    if (!baseUrl.trim()) {
      setError('Please provide a target Base URL before testing connection.');
      return;
    }
    if (!window.desktop?.targetEnvironment?.testConnection) {
      setError('Desktop targetEnvironment bridge unavailable');
      return;
    }
    setIsTestingConnection(true);
    setConnectionResult(null);
    setError(null);
    setInfoMessage(null);

    try {
      const res = await window.desktop.targetEnvironment.testConnection({
        projectId,
        environmentId: selectedEnvId || undefined,
        url: baseUrl.trim(),
      });

      if (res.ok) {
        setConnectionResult(res.data);
      } else {
        setError(res.error.message);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network test failed');
    } finally {
      setIsTestingConnection(false);
    }
  };

  const handleTestAuth = async () => {
    if (!selectedEnvId) {
      setError('Please select or save the environment before testing authentication.');
      return;
    }
    if (!window.desktop?.targetEnvironment?.testAuth) {
      setError('Desktop targetEnvironment bridge unavailable');
      return;
    }
    setIsTestingAuth(true);
    setAuthResult(null);
    setError(null);
    setInfoMessage(null);

    try {
      const res = await window.desktop.targetEnvironment.testAuth({
        projectId,
        environmentId: selectedEnvId,
        temporaryPassword: password || undefined,
        browserEngine,
        headless,
      });

      if (res.ok) {
        setAuthResult(res.data);
      } else {
        setError(res.error.message);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication verification failed');
    } finally {
      setIsTestingAuth(false);
    }
  };

  const handleSave = async () => {
    if (!name.trim()) {
      setError('Environment name is required.');
      return;
    }
    if (!window.desktop?.targetEnvironment?.save) {
      setError('Desktop targetEnvironment bridge unavailable');
      return;
    }
    setIsSaving(true);
    setError(null);
    setInfoMessage(null);

    try {
      const res = await window.desktop.targetEnvironment.save({
        projectId,
        environmentId: selectedEnvId || undefined,
        name: name.trim(),
        type,
        baseUrl: baseUrl.trim() || null,
        apiUrl: apiUrl.trim() || null,
        isEnabled: true,
        isProduction: type === 'PRODUCTION',
        productionSafetyPolicy: type === 'PRODUCTION' ? 'PROHIBITED' : 'SAFE_MODE',
        browserEngine,
        headless,
        viewportWidth: Number(viewportWidth) || 1280,
        viewportHeight: Number(viewportHeight) || 720,
        ignoreHttpsErrors,
        isDefault,
        auth: {
          strategy,
          loginUrl: loginUrl.trim() || null,
          username: username.trim() || null,
          password: password || undefined,
          usernameFieldSelector: usernameFieldSelector.trim() || null,
          passwordFieldSelector: passwordFieldSelector.trim() || null,
          submitControlSelector: submitControlSelector.trim() || null,
          successValidationType,
          successValidationValue: successValidationValue.trim() || null,
        },
      });

      if (res.ok) {
        setInfoMessage('Target environment configuration saved successfully.');
        onSuccess?.(res.data);
        onClose();
      } else {
        setError(res.error.message);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save configuration');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSetActive = async () => {
    if (!selectedEnvId) return;
    if (!window.desktop?.targetEnvironment?.setActive) {
      setError('Desktop targetEnvironment bridge unavailable');
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      const res = await window.desktop.targetEnvironment.setActive({
        projectId,
        environmentId: selectedEnvId,
      });
      if (res.ok) {
        setIsDefault(true);
        setInfoMessage(`Environment "${res.data.name}" is now the active target.`);
        onSuccess?.(res.data);
      } else {
        setError(res.error.message);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to switch active environment');
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <Dialog
      open={isOpen}
      onClose={onClose}
      title={`Target Environment & Browser Configuration — ${projectName}`}
      description="Configure real web application target, browser execution runtime, and authentication credentials."
      className="target-env-config-modal"
      footer={
        <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
          <div>
            {selectedEnvId && !isDefault && (
              <Button
                variant="secondary"
                size="md"
                onClick={handleSetActive}
                disabled={isSaving || isTestingConnection || isTestingAuth}
              >
                Set as Active Target
              </Button>
            )}
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <Button variant="ghost" size="md" onClick={onClose} disabled={isSaving}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="md"
              onClick={handleSave}
              disabled={isSaving || isTestingConnection || isTestingAuth}
            >
              {isSaving ? <Spinner size="sm" /> : 'Save Configuration'}
            </Button>
          </div>
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxHeight: '72vh', overflowY: 'auto', paddingRight: '4px' }}>
        {isLoading && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px' }}>
            <Spinner size="sm" /> Loading environment profile...
          </div>
        )}

        {error && <Alert variant="danger">{error}</Alert>}
        {infoMessage && <Alert variant="success">{infoMessage}</Alert>}

        {/* Environment Selection & Profile Header */}
        <div style={{ background: 'var(--color-bg-secondary, #1f2937)', padding: '12px', borderRadius: '6px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--color-text-secondary, #9ca3af)' }}>
              ENVIRONMENT PROFILE
            </span>
            {isDefault && <Badge variant="success">Active Target</Badge>}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
            <FormField label="Environment Profile" htmlFor="select-env-profile">
              <Select
                id="select-env-profile"
                value={selectedEnvId}
                onChange={e => handleSelectEnvChange(e.target.value)}
              >
                {environments.map(env => (
                  <option key={env.id} value={env.id}>
                    {env.name} ({env.type}){env.isDefault ? ' [ACTIVE]' : ''}
                  </option>
                ))}
              </Select>
            </FormField>

            <FormField label="Display Name" htmlFor="env-name">
              <Input
                id="env-name"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g. Local Dev / Staging"
              />
            </FormField>

            <FormField label="Environment Type" htmlFor="env-type">
              <Select
                id="env-type"
                value={type}
                onChange={e => setType(e.target.value as EnvironmentType)}
              >
                {ENVIRONMENT_TYPES.map(opt => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </Select>
            </FormField>
          </div>
        </div>

        {/* Target URL & Network Configuration */}
        <div style={{ border: '1px solid var(--color-border, #374151)', borderRadius: '6px', padding: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <span style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--color-text-secondary, #9ca3af)' }}>
            TARGET WEB APPLICATION URL
          </span>

          <FormField label="Application Base URL *" htmlFor="base-url" description="Root address where web application is hosted (e.g. http://localhost:3000, https://staging.myapp.com)">
            <Input
              id="base-url"
              value={baseUrl}
              onChange={e => setBaseUrl(e.target.value)}
              placeholder="https://example.com"
            />
          </FormField>

          <FormField label="Optional API Base URL" htmlFor="api-url" description="Dedicated backend API endpoint if distinct from frontend web address">
            <Input
              id="api-url"
              value={apiUrl}
              onChange={e => setApiUrl(e.target.value)}
              placeholder="https://api.example.com"
            />
          </FormField>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '4px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.85rem' }}>
              <input
                type="checkbox"
                checked={ignoreHttpsErrors}
                onChange={e => setIgnoreHttpsErrors(e.target.checked)}
              />
              Ignore HTTPS / TLS Certificate Errors (for self-signed certs in dev)
            </label>

            <Button
              variant="secondary"
              size="sm"
              onClick={handleTestConnection}
              disabled={isTestingConnection || !baseUrl.trim()}
            >
              {isTestingConnection ? <Spinner size="sm" /> : 'Test Connection'}
            </Button>
          </div>

          {/* Connection Test Diagnostics */}
          {connectionResult && (
            <div
              style={{
                marginTop: '8px',
                padding: '10px',
                borderRadius: '4px',
                fontSize: '0.85rem',
                backgroundColor: connectionResult.reachable ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                border: `1px solid ${connectionResult.reachable ? '#10b981' : '#ef4444'}`,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontWeight: 600 }}>
                  {connectionResult.reachable ? '✓ Target Reachable' : '✗ Target Unreachable'}
                </span>
                <span>Latency: {connectionResult.responseTimeMs}ms</span>
              </div>
              <div style={{ marginTop: '4px', color: 'var(--color-text-secondary, #9ca3af)' }}>
                HTTP Status: {connectionResult.statusCode ?? 'N/A'} | Redirects: {connectionResult.redirectCount} | TLS Valid: {connectionResult.tlsValid === null ? 'N/A' : connectionResult.tlsValid ? 'Yes' : 'No'}
              </div>
              {connectionResult.finalUrl && (
                <div style={{ marginTop: '4px', fontSize: '0.75rem' }}>
                  Final URL: {connectionResult.finalUrl}
                </div>
              )}
              {connectionResult.errorMessage && (
                <div style={{ marginTop: '4px', color: '#ef4444', fontWeight: 500 }}>
                  Error: {connectionResult.errorMessage}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Browser Engine & Viewport Configuration */}
        <div style={{ border: '1px solid var(--color-border, #374151)', borderRadius: '6px', padding: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <span style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--color-text-secondary, #9ca3af)' }}>
            PLAYWRIGHT BROWSER EXECUTION
          </span>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <FormField label="Browser Engine" htmlFor="browser-engine">
              <Select
                id="browser-engine"
                value={browserEngine}
                onChange={e => setBrowserEngine(e.target.value as BrowserEngine)}
              >
                {BROWSER_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </Select>
            </FormField>

            <FormField label="Execution Mode" htmlFor="execution-mode">
              <Select
                id="execution-mode"
                value={headless ? 'headless' : 'headed'}
                onChange={e => setHeadless(e.target.value === 'headless')}
              >
                <option value="headless">Headless (Fast, Background Execution)</option>
                <option value="headed">Headed (Visible Browser Window)</option>
              </Select>
            </FormField>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <FormField label="Viewport Width (px)" htmlFor="viewport-width">
              <Input
                id="viewport-width"
                type="number"
                value={viewportWidth}
                onChange={e => setViewportWidth(Number(e.target.value))}
                min={320}
                max={3840}
              />
            </FormField>

            <FormField label="Viewport Height (px)" htmlFor="viewport-height">
              <Input
                id="viewport-height"
                type="number"
                value={viewportHeight}
                onChange={e => setViewportHeight(Number(e.target.value))}
                min={240}
                max={2160}
              />
            </FormField>
          </div>
        </div>

        {/* Authentication Configuration */}
        <div style={{ border: '1px solid var(--color-border, #374151)', borderRadius: '6px', padding: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--color-text-secondary, #9ca3af)' }}>
              AUTHENTICATION CONFIGURATION
            </span>
            <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted, #6b7280)' }}>
              Encrypted with AES-256-GCM Vault
            </span>
          </div>

          <FormField label="Authentication Strategy" htmlFor="auth-strategy">
            <Select
              id="auth-strategy"
              value={strategy}
              onChange={e => setStrategy(e.target.value as AuthStrategy)}
            >
              {AUTH_STRATEGIES.map(opt => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </Select>
          </FormField>

          {strategy === 'FORM_LOGIN' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '6px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <FormField label="Username / Email" htmlFor="auth-username">
                  <Input
                    id="auth-username"
                    value={username}
                    onChange={e => setUsername(e.target.value)}
                    placeholder="admin@example.com"
                  />
                </FormField>

                <FormField
                  label="Password"
                  htmlFor="auth-password"
                  description={passwordPreview ? `Stored: ${passwordPreview} (Enter new to overwrite)` : 'Secret is redacted from logs'}
                >
                  <Input
                    id="auth-password"
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder={passwordPreview ? '••••••••' : 'Enter password'}
                  />
                </FormField>
              </div>

              <FormField label="Login Page URL" htmlFor="auth-login-url" description="Relative path or absolute URL of login form">
                <Input
                  id="auth-login-url"
                  value={loginUrl}
                  onChange={e => setLoginUrl(e.target.value)}
                  placeholder="/login or https://example.com/login"
                />
              </FormField>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
                <FormField label="Username Selector" htmlFor="username-selector">
                  <Input
                    id="username-selector"
                    value={usernameFieldSelector}
                    onChange={e => setUsernameFieldSelector(e.target.value)}
                    placeholder="input[name='username']"
                  />
                </FormField>

                <FormField label="Password Selector" htmlFor="password-selector">
                  <Input
                    id="password-selector"
                    value={passwordFieldSelector}
                    onChange={e => setPasswordFieldSelector(e.target.value)}
                    placeholder="input[name='password']"
                  />
                </FormField>

                <FormField label="Submit Selector" htmlFor="submit-selector">
                  <Input
                    id="submit-selector"
                    value={submitControlSelector}
                    onChange={e => setSubmitControlSelector(e.target.value)}
                    placeholder="button[type='submit']"
                  />
                </FormField>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <FormField label="Validation Type" htmlFor="validation-type">
                  <Select
                    id="validation-type"
                    value={successValidationType}
                    onChange={e => setSuccessValidationType(e.target.value as AuthValidationType)}
                  >
                    <option value="NONE">None (Assume Success)</option>
                    <option value="URL_MATCH">URL Match (URL contains substring)</option>
                    <option value="ELEMENT_PRESENT">Element Present (DOM selector appears)</option>
                    <option value="COOKIE_PRESENT">Cookie Present (Specific cookie set)</option>
                  </Select>
                </FormField>

                <FormField label="Validation Expected Value" htmlFor="validation-val">
                  <Input
                    id="validation-val"
                    value={successValidationValue}
                    onChange={e => setSuccessValidationValue(e.target.value)}
                    placeholder="e.g. /dashboard or #user-avatar or session_id"
                  />
                </FormField>
              </div>
            </div>
          )}

          {strategy === 'HTTP_BASIC' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '6px' }}>
              <FormField label="Basic Auth Username" htmlFor="basic-username">
                <Input
                  id="basic-username"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  placeholder="admin"
                />
              </FormField>

              <FormField
                label="Basic Auth Password"
                htmlFor="basic-password"
                description={passwordPreview ? `Stored: ${passwordPreview}` : 'Never logged in plaintext'}
              >
                <Input
                  id="basic-password"
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder={passwordPreview ? '••••••••' : 'Enter password'}
                />
              </FormField>
            </div>
          )}

          {strategy === 'STORAGE_STATE' && (
            <div style={{ marginTop: '6px' }}>
              <FormField label="Storage State Selector / Info" htmlFor="storage-state-info" description="Playwright storage state profile used for restored authentication">
                <Input
                  id="storage-state-info"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  placeholder="e.g. session-user-admin"
                />
              </FormField>
            </div>
          )}

          {strategy !== 'NONE' && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '6px' }}>
              <Button
                variant="secondary"
                size="sm"
                onClick={handleTestAuth}
                disabled={isTestingAuth || !selectedEnvId}
              >
                {isTestingAuth ? <Spinner size="sm" /> : 'Test Authentication Flow'}
              </Button>
            </div>
          )}

          {/* Auth Test Diagnostics */}
          {authResult && (
            <div
              style={{
                marginTop: '8px',
                padding: '10px',
                borderRadius: '4px',
                fontSize: '0.85rem',
                backgroundColor: authResult.authenticated ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                border: `1px solid ${authResult.authenticated ? '#10b981' : '#ef4444'}`,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontWeight: 600 }}>
                  {authResult.authenticated ? '✓ Authentication Successful' : '✗ Authentication Failed'}
                </span>
                <span>Duration: {authResult.durationMs}ms</span>
              </div>
              <div style={{ marginTop: '4px', color: 'var(--color-text-secondary, #9ca3af)' }}>
                Target Final URL: {authResult.finalUrl ?? 'N/A'}
              </div>
              {authResult.errorMessage && (
                <div style={{ marginTop: '4px', color: '#ef4444', fontWeight: 500 }}>
                  Error: {authResult.errorMessage}
                </div>
              )}
              {authResult.diagnosticEvidence?.screenshotBase64 && (
                <div style={{ marginTop: '6px', fontSize: '0.75rem', color: 'var(--color-text-muted, #6b7280)' }}>
                  Diagnostic failure screenshot captured for inspection.
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </Dialog>
  );
}
