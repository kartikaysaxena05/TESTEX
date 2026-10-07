/**
 * @file apps/desktop/src/renderer/features/environments/AuthProfilesModal.tsx
 * Management modal for Browser Authentication Profiles (V5 Phase 62).
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Dialog } from '../../ui/Dialog.js';
import { Table } from '../../ui/Table.js';
import { Badge } from '../../ui/Badge.js';
import { Button } from '../../ui/Button.js';
import { FormField } from '../../ui/FormField.js';
import { Input } from '../../ui/Input.js';
import { Select } from '../../ui/Select.js';
import { Alert } from '../../ui/Alert.js';
import { Spinner } from '../../ui/Spinner.js';
import { EmptyState } from '../../ui/EmptyState.js';
import type {
  AuthProfileDto,
  AuthStrategy,
  AuthValidationType,
  ProjectEnvironmentDto,
} from '@ai-quality/contracts';

export interface AuthProfilesModalProps {
  readonly projectId: string;
  readonly environments: readonly ProjectEnvironmentDto[];
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly defaultEnvironmentId?: string;
}

const AUTH_STRATEGIES: readonly { readonly value: AuthStrategy; readonly label: string }[] = [
  { value: 'NONE', label: 'None (No Authentication Required)' },
  { value: 'FORM_LOGIN', label: 'Form Login (Username & Password)' },
  { value: 'STORAGE_STATE', label: 'Storage State (Restored Cookies & LocalStorage)' },
  { value: 'HTTP_BASIC', label: 'HTTP Basic Auth' },
];

const VALIDATION_TYPES: readonly { readonly value: AuthValidationType; readonly label: string }[] =
  [
    { value: 'NONE', label: 'None (Assume Login Succeeded)' },
    { value: 'URL_MATCH', label: 'URL Match (Current URL contains string)' },
    { value: 'ELEMENT_PRESENT', label: 'Element Present (DOM selector becomes visible)' },
    { value: 'COOKIE_PRESENT', label: 'Cookie Present (Session cookie exists)' },
  ];

export function AuthProfilesModal({
  projectId,
  environments,
  isOpen,
  onClose,
  defaultEnvironmentId,
}: AuthProfilesModalProps): React.JSX.Element {
  const [profiles, setProfiles] = useState<readonly AuthProfileDto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Form State
  const [isAdding, setIsAdding] = useState(false);
  const [editingProfileId, setEditingProfileId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [environmentId, setEnvironmentId] = useState<string>(defaultEnvironmentId ?? '');
  const [strategy, setStrategy] = useState<AuthStrategy>('FORM_LOGIN');
  const [description, setDescription] = useState('');
  const [loginUrl, setLoginUrl] = useState('');
  const [usernameFieldSelector, setUsernameFieldSelector] = useState('');
  const [passwordFieldSelector, setPasswordFieldSelector] = useState('');
  const [submitControlSelector, setSubmitControlSelector] = useState('');
  const [successValidationType, setSuccessValidationType] =
    useState<AuthValidationType>('URL_MATCH');
  const [successValidationValue, setSuccessValidationValue] = useState('');
  const [credentialReference, setCredentialReference] = useState('');
  const [isReusable, setIsReusable] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Test Validation State
  const [validatingProfileId, setValidatingProfileId] = useState<string | null>(null);
  const [testPassword, setTestPassword] = useState('');
  const [showTestPasswordPrompt, setShowTestPasswordPrompt] = useState<string | null>(null);

  const loadProfiles = useCallback(async () => {
    if (!isOpen || !projectId) return;
    setIsLoading(true);
    setErrorMessage(null);

    try {
      if (window.desktop?.authProfiles?.list) {
        const res = await window.desktop.authProfiles.list({ projectId });
        if (res.ok) {
          setProfiles(res.data);
        } else {
          setErrorMessage(res.error.message);
        }
      }
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Failed to load authentication profiles.',
      );
    } finally {
      setIsLoading(false);
    }
  }, [isOpen, projectId]);

  useEffect(() => {
    if (isOpen) {
      loadProfiles();
    } else {
      setIsAdding(false);
      setEditingProfileId(null);
      setFormError(null);
      setSuccessMessage(null);
    }
  }, [isOpen, loadProfiles]);

  const handleStartAdd = () => {
    setIsAdding(true);
    setEditingProfileId(null);
    setName('');
    setEnvironmentId(defaultEnvironmentId ?? '');
    setStrategy('FORM_LOGIN');
    setDescription('');
    setLoginUrl('');
    setUsernameFieldSelector('');
    setPasswordFieldSelector('');
    setSubmitControlSelector('');
    setSuccessValidationType('URL_MATCH');
    setSuccessValidationValue('');
    setCredentialReference('');
    setIsReusable(false);
    setFormError(null);
  };

  const handleStartEdit = (profile: AuthProfileDto) => {
    setEditingProfileId(profile.id);
    setIsAdding(false);
    setName(profile.name);
    setEnvironmentId(profile.environmentId ?? '');
    setStrategy(profile.strategy);
    setDescription(profile.description ?? '');
    setLoginUrl(profile.loginUrl ?? '');
    setUsernameFieldSelector(profile.usernameFieldSelector ?? '');
    setPasswordFieldSelector(profile.passwordFieldSelector ?? '');
    setSubmitControlSelector(profile.submitControlSelector ?? '');
    setSuccessValidationType(profile.successValidationType);
    setSuccessValidationValue(profile.successValidationValue ?? '');
    setCredentialReference(profile.credentialReference ?? '');
    setIsReusable(profile.isReusable);
    setFormError(null);
  };

  const handleCancelForm = () => {
    setIsAdding(false);
    setEditingProfileId(null);
    setFormError(null);
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setFormError('Profile name is required.');
      return;
    }

    if (!window.desktop?.authProfiles) return;

    setIsSubmitting(true);
    setFormError(null);

    try {
      if (editingProfileId) {
        const res = await window.desktop.authProfiles.update({
          projectId,
          profileId: editingProfileId,
          name: name.trim(),
          environmentId: environmentId || null,
          strategy,
          description: description.trim() || null,
          loginUrl: loginUrl.trim() || null,
          usernameFieldSelector: usernameFieldSelector.trim() || null,
          passwordFieldSelector: passwordFieldSelector.trim() || null,
          submitControlSelector: submitControlSelector.trim() || null,
          successValidationType,
          successValidationValue: successValidationValue.trim() || null,
          credentialReference: credentialReference.trim() || null,
          isReusable,
        });

        if (res.ok) {
          setSuccessMessage(`Authentication profile "${res.data.name}" updated successfully.`);
          setIsAdding(false);
          setEditingProfileId(null);
          await loadProfiles();
        } else {
          setFormError(res.error.message);
        }
      } else {
        const res = await window.desktop.authProfiles.create({
          projectId,
          name: name.trim(),
          environmentId: environmentId || undefined,
          strategy,
          description: description.trim() || undefined,
          loginUrl: loginUrl.trim() || undefined,
          usernameFieldSelector: usernameFieldSelector.trim() || undefined,
          passwordFieldSelector: passwordFieldSelector.trim() || undefined,
          submitControlSelector: submitControlSelector.trim() || undefined,
          successValidationType,
          successValidationValue: successValidationValue.trim() || undefined,
          credentialReference: credentialReference.trim() || undefined,
          isReusable,
        });

        if (res.ok) {
          setSuccessMessage(`Authentication profile "${res.data.name}" created successfully.`);
          setIsAdding(false);
          await loadProfiles();
        } else {
          setFormError(res.error.message);
        }
      }
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'An error occurred while saving profile.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteProfile = async (profileId: string) => {
    if (!window.desktop?.authProfiles?.delete) return;
    try {
      const res = await window.desktop.authProfiles.delete({ projectId, profileId });
      if (res.ok) {
        setSuccessMessage('Profile deleted.');
        await loadProfiles();
      } else {
        setErrorMessage(res.error.message);
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to delete profile.');
    }
  };

  const handleTestValidate = async (profileId: string) => {
    if (!window.desktop?.authProfiles?.validate) return;
    setValidatingProfileId(profileId);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const res = await window.desktop.authProfiles.validate({
        projectId,
        profileId,
        testPassword: testPassword || undefined,
      });

      if (res.ok) {
        if (res.data.success) {
          setSuccessMessage(`Validation succeeded (${res.data.durationMs}ms): ${res.data.message}`);
        } else {
          setErrorMessage(`Validation failed: ${res.data.message}`);
        }
        setShowTestPasswordPrompt(null);
        setTestPassword('');
        await loadProfiles();
      } else {
        setErrorMessage(res.error.message);
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Validation test failed.');
    } finally {
      setValidatingProfileId(null);
    }
  };

  return (
    <Dialog
      open={isOpen}
      onClose={onClose}
      title="Authentication & Session Profiles"
      description="Manage credentials, form login configurations, and reusable storage states for autonomous test execution."
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', minWidth: '700px' }}>
        {errorMessage && (
          <Alert variant="danger" title="Error">
            {errorMessage}
          </Alert>
        )}

        {successMessage && (
          <Alert variant="success" title="Success">
            {successMessage}
          </Alert>
        )}

        {/* Action Header */}
        {!isAdding && !editingProfileId && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>
              {profiles.length} profile{profiles.length === 1 ? '' : 's'} configured
            </div>
            <Button variant="primary" size="sm" onClick={handleStartAdd}>
              Add Authentication Profile
            </Button>
          </div>
        )}

        {/* Profile Create / Edit Form */}
        {(isAdding || editingProfileId) && (
          <form
            onSubmit={handleSaveProfile}
            style={{
              padding: '16px',
              backgroundColor: 'var(--color-bg-subtle)',
              border: '1px solid var(--color-border-subtle)',
              borderRadius: '8px',
            }}
          >
            <div
              style={{
                fontSize: '14px',
                fontWeight: 600,
                marginBottom: '12px',
                color: 'var(--color-text-primary)',
              }}
            >
              {editingProfileId ? 'Edit Authentication Profile' : 'New Authentication Profile'}
            </div>

            {formError && (
              <div style={{ marginBottom: '12px' }}>
                <Alert variant="danger" title="Form Error">
                  {formError}
                </Alert>
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <FormField label="Profile Name *" htmlFor="profile-name" required>
                <Input
                  id="profile-name"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="e.g. Staging Customer Login"
                  disabled={isSubmitting}
                />
              </FormField>

              <FormField label="Target Environment" htmlFor="profile-env">
                <Select
                  id="profile-env"
                  value={environmentId}
                  onChange={e => setEnvironmentId(e.target.value)}
                  disabled={isSubmitting}
                >
                  <option value="">(All Environments)</option>
                  {environments.map(env => (
                    <option key={env.id} value={env.id}>
                      {env.name} ({env.type})
                    </option>
                  ))}
                </Select>
              </FormField>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '12px',
                marginTop: '8px',
              }}
            >
              <FormField label="Authentication Strategy" htmlFor="profile-strat">
                <Select
                  id="profile-strat"
                  value={strategy}
                  onChange={e => setStrategy(e.target.value as AuthStrategy)}
                  disabled={isSubmitting}
                >
                  {AUTH_STRATEGIES.map(st => (
                    <option key={st.value} value={st.value}>
                      {st.label}
                    </option>
                  ))}
                </Select>
              </FormField>

              <FormField label="Credential Reference (Secret Store Key)" htmlFor="profile-cred-ref">
                <Input
                  id="profile-cred-ref"
                  value={credentialReference}
                  onChange={e => setCredentialReference(e.target.value)}
                  placeholder="e.g. auth.staging.admin"
                  disabled={isSubmitting}
                />
              </FormField>
            </div>

            {strategy === 'FORM_LOGIN' && (
              <div
                style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}
              >
                <FormField label="Login URL *" htmlFor="profile-login-url">
                  <Input
                    id="profile-login-url"
                    value={loginUrl}
                    onChange={e => setLoginUrl(e.target.value)}
                    placeholder="https://app.example.com/login"
                    disabled={isSubmitting}
                  />
                </FormField>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
                  <FormField label="Username Selector" htmlFor="profile-user-sel">
                    <Input
                      id="profile-user-sel"
                      value={usernameFieldSelector}
                      onChange={e => setUsernameFieldSelector(e.target.value)}
                      placeholder="#username or input[type=email]"
                      disabled={isSubmitting}
                    />
                  </FormField>

                  <FormField label="Password Selector" htmlFor="profile-pass-sel">
                    <Input
                      id="profile-pass-sel"
                      value={passwordFieldSelector}
                      onChange={e => setPasswordFieldSelector(e.target.value)}
                      placeholder="#password or input[type=password]"
                      disabled={isSubmitting}
                    />
                  </FormField>

                  <FormField label="Submit Button Selector" htmlFor="profile-submit-sel">
                    <Input
                      id="profile-submit-sel"
                      value={submitControlSelector}
                      onChange={e => setSubmitControlSelector(e.target.value)}
                      placeholder="button[type=submit] or #login-btn"
                      disabled={isSubmitting}
                    />
                  </FormField>
                </div>
              </div>
            )}

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '12px',
                marginTop: '12px',
              }}
            >
              <FormField label="Success Validation Check" htmlFor="profile-val-type">
                <Select
                  id="profile-val-type"
                  value={successValidationType}
                  onChange={e => setSuccessValidationType(e.target.value as AuthValidationType)}
                  disabled={isSubmitting}
                >
                  {VALIDATION_TYPES.map(vt => (
                    <option key={vt.value} value={vt.value}>
                      {vt.label}
                    </option>
                  ))}
                </Select>
              </FormField>

              <FormField label="Success Expected Value" htmlFor="profile-val-val">
                <Input
                  id="profile-val-val"
                  value={successValidationValue}
                  onChange={e => setSuccessValidationValue(e.target.value)}
                  placeholder={
                    successValidationType === 'URL_MATCH'
                      ? '/dashboard'
                      : successValidationType === 'ELEMENT_PRESENT'
                        ? '#user-profile-menu'
                        : successValidationType === 'COOKIE_PRESENT'
                          ? 'session_id'
                          : 'Validation parameter'
                  }
                  disabled={isSubmitting}
                />
              </FormField>
            </div>

            <div style={{ marginTop: '12px', display: 'flex', gap: '16px', alignItems: 'center' }}>
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontSize: '13px',
                  cursor: 'pointer',
                }}
              >
                <input
                  type="checkbox"
                  checked={isReusable}
                  onChange={e => setIsReusable(e.target.checked)}
                  disabled={isSubmitting}
                />
                Save and Reuse Authenticated Storage State across runs
              </label>
            </div>

            <div
              style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '16px' }}
            >
              <Button variant="ghost" size="sm" onClick={handleCancelForm} disabled={isSubmitting}>
                Cancel
              </Button>
              <Button variant="primary" size="sm" type="submit" loading={isSubmitting}>
                {editingProfileId ? 'Update Profile' : 'Save Profile'}
              </Button>
            </div>
          </form>
        )}

        {/* Profiles Table */}
        {isLoading ? (
          <div style={{ padding: '32px', textAlign: 'center' }}>
            <Spinner size="md" />
          </div>
        ) : profiles.length === 0 ? (
          <EmptyState
            title="No Authentication Profiles"
            description="Create an authentication profile to support tests requiring form login, cookies, or basic auth."
            action={
              !isAdding && !editingProfileId ? (
                <Button variant="primary" size="sm" onClick={handleStartAdd}>
                  Create First Profile
                </Button>
              ) : undefined
            }
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <th>Profile Name</th>
                <th>Strategy</th>
                <th>Environment</th>
                <th>Status</th>
                <th>Credentials</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {profiles.map(profile => (
                <tr key={profile.id}>
                  <td>
                    <div style={{ fontWeight: 500 }}>{profile.name}</div>
                    {profile.description && (
                      <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>
                        {profile.description}
                      </div>
                    )}
                  </td>
                  <td>
                    <Badge variant={profile.strategy === 'NONE' ? 'neutral' : 'info'}>
                      {profile.strategy}
                    </Badge>
                  </td>
                  <td>
                    <span style={{ fontSize: '12px' }}>
                      {profile.environmentName || 'All Environments'}
                    </span>
                  </td>
                  <td>
                    <Badge
                      variant={
                        profile.status === 'VALID'
                          ? 'success'
                          : profile.status === 'INVALID'
                            ? 'danger'
                            : profile.status === 'STALE'
                              ? 'warning'
                              : 'neutral'
                      }
                    >
                      {profile.status}
                    </Badge>
                    {profile.lastValidatedAt && (
                      <div
                        style={{
                          fontSize: '10px',
                          color: 'var(--color-text-muted)',
                          marginTop: '2px',
                        }}
                      >
                        Validated: {new Date(profile.lastValidatedAt).toLocaleTimeString()}
                      </div>
                    )}
                  </td>
                  <td>
                    <span style={{ fontSize: '12px' }}>
                      {profile.credentialReference
                        ? '••••••••'
                        : profile.hasStorageState
                          ? 'Session Saved'
                          : 'None'}
                    </span>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <div style={{ display: 'inline-flex', gap: '6px' }}>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          if (profile.strategy === 'FORM_LOGIN' && !profile.credentialReference) {
                            setShowTestPasswordPrompt(profile.id);
                          } else {
                            handleTestValidate(profile.id);
                          }
                        }}
                        loading={validatingProfileId === profile.id}
                        title="Test Authentication Validation"
                      >
                        Test Auth
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleStartEdit(profile)}
                        disabled={isAdding || Boolean(editingProfileId)}
                      >
                        Edit
                      </Button>
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => handleDeleteProfile(profile.id)}
                        disabled={isAdding || Boolean(editingProfileId)}
                      >
                        Delete
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}

        {/* Test Password Prompt Dialog */}
        <Dialog
          open={Boolean(showTestPasswordPrompt)}
          onClose={() => setShowTestPasswordPrompt(null)}
          title="Supply Test Password for Validation"
          description="Enter credentials temporarily to validate authentication without saving plaintext secrets."
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <FormField label="Test Password" htmlFor="temp-test-password">
              <Input
                id="temp-test-password"
                type="password"
                value={testPassword}
                onChange={e => setTestPassword(e.target.value)}
                placeholder="Temporary test password"
              />
            </FormField>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <Button variant="ghost" size="sm" onClick={() => setShowTestPasswordPrompt(null)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => showTestPasswordPrompt && handleTestValidate(showTestPasswordPrompt)}
                loading={Boolean(validatingProfileId)}
              >
                Run Validation
              </Button>
            </div>
          </div>
        </Dialog>
      </div>
    </Dialog>
  );
}
