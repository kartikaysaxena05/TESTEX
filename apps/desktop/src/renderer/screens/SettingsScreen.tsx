/**
 * @file apps/desktop/src/renderer/screens/SettingsScreen.tsx
 * Multi-tab Settings Screen for V8 Phase 116.
 * Implements Profile, Account & Security, Appearance, Preferences, Notifications,
 * Privacy & Data, Infrastructure, and About sections.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import type {
  DatabaseStatus,
  AiProviderStatusDto,
  EmbeddingIndexStatusDto,
  UserProfileDto,
  UserAuthMethodsDto,
  SessionSummaryDto,
  ThemePreference,
  DensityPreference,
  TimeFormatPreference,
  BrowserPreference,
  AppInfo,
} from '@ai-quality/contracts';
import { useProject } from '../context/ProjectContext.js';
import { useAuth } from '../context/AuthContext.js';
import { usePreferences } from '../context/PreferencesContext.js';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
  Badge,
  type BadgeVariant,
  Button,
} from '../ui/index.js';
import { JiraIntegrationSettingsCard } from '../features/jira/JiraIntegrationSettingsCard.js';
import { OllamaSettingsCard } from '../features/ai/OllamaSettingsCard.js';
import { InstalledModelsCard } from '../features/ai/InstalledModelsCard.js';
import { LocalGenerationPlaygroundCard } from '../features/ai/LocalGenerationPlaygroundCard.js';
import { AiPrivacySettingsCard } from '../features/ai/AiPrivacySettingsCard.js';
import { AiFallbackSettingsCard } from '../features/ai/AiFallbackSettingsCard.js';
import { AiRuntimeRecoveryCard } from '../features/ai/AiRuntimeRecoveryCard.js';

export type SettingsTab =
  | 'profile'
  | 'security'
  | 'appearance'
  | 'preferences'
  | 'notifications'
  | 'privacy'
  | 'infrastructure'
  | 'about';

export interface SettingsScreenProps {
  readonly initialTab?: SettingsTab;
}

export function SettingsScreen({ initialTab }: SettingsScreenProps): React.JSX.Element {
  const [searchParams, setSearchParams] = useSearchParams();
  const tabFromUrl = searchParams.get('tab') as SettingsTab | null;
  const [activeTab, setActiveTab] = useState<SettingsTab>(
    initialTab ?? tabFromUrl ?? 'profile',
  );

  const { selectedProjectId } = useProject();
  const { user, logout, refreshAuth } = useAuth();
  const { preferences, updatePreferences } = usePreferences();

  // Profile State
  const [profile, setProfile] = useState<UserProfileDto | null>(null);
  const [displayNameInput, setDisplayNameInput] = useState<string>('');
  const [isSavingProfile, setIsSavingProfile] = useState<boolean>(false);
  const [profileMsg, setProfileMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null,
  );

  // Security State
  const [authMethods, setAuthMethods] = useState<UserAuthMethodsDto | null>(null);
  const [sessions, setSessions] = useState<readonly SessionSummaryDto[]>([]);
  const [currentPassword, setCurrentPassword] = useState<string>('');
  const [newPassword, setNewPassword] = useState<string>('');
  const [confirmPassword, setConfirmPassword] = useState<string>('');
  const [isChangingPassword, setIsChangingPassword] = useState<boolean>(false);
  const [securityMsg, setSecurityMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null,
  );

  // Danger Zone State
  const [deleteConfirmation, setDeleteConfirmation] = useState<string>('');
  const [deletePassword, setDeletePassword] = useState<string>('');
  const [isDeletingAccount, setIsDeletingAccount] = useState<boolean>(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Preferences save feedback
  const [prefSaveMsg, setPrefSaveMsg] = useState<string | null>(null);

  // App Info for About tab
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null);

  // Infrastructure State (Database, AI, RAG)
  const [dbStatus, setDbStatus] = useState<DatabaseStatus | null>(null);
  const [aiStatuses, setAiStatuses] = useState<readonly AiProviderStatusDto[]>([]);
  const [embeddingStatus, setEmbeddingStatus] = useState<EmbeddingIndexStatusDto | null>(null);
  const [isLoadingDb, setIsLoadingDb] = useState<boolean>(false);
  const [isLoadingAi, setIsLoadingAi] = useState<boolean>(false);
  const [isIndexing, setIsIndexing] = useState<boolean>(false);

  // Load Profile
  const fetchProfile = useCallback(async () => {
    if (!window.desktop?.settings?.getProfile) return;
    try {
      const res = await window.desktop.settings.getProfile();
      if (res.ok) {
        setProfile(res.data);
        setDisplayNameInput(res.data.displayName);
      }
    } catch {
      // Ignored
    }
  }, []);

  // Load Auth Methods & Sessions
  const fetchSecurityData = useCallback(async () => {
    if (window.desktop?.settings?.getAuthMethods) {
      const res = await window.desktop.settings.getAuthMethods();
      if (res.ok) setAuthMethods(res.data);
    }
    if (window.desktop?.settings?.getSessions) {
      const res = await window.desktop.settings.getSessions();
      if (res.ok) setSessions(res.data);
    }
  }, []);

  // Load App Info
  useEffect(() => {
    if (window.desktop?.app?.getInfo) {
      window.desktop.app.getInfo().then(res => {
        if (res.ok) setAppInfo(res.data);
      }).catch(() => {});
    }
  }, []);

  // Load Infrastructure Status
  const fetchDatabaseStatus = useCallback(async () => {
    if (!window.desktop?.database?.getStatus) {
      setDbStatus({ status: 'unavailable' });
      return;
    }
    setIsLoadingDb(true);
    try {
      const result = await window.desktop.database.getStatus();
      setDbStatus(result.ok ? result.data : { status: 'unavailable' });
    } catch {
      setDbStatus({ status: 'unavailable' });
    } finally {
      setIsLoadingDb(false);
    }
  }, []);

  const fetchAiAndEmbeddingStatus = useCallback(async () => {
    if (!window.desktop?.ai) return;
    setIsLoadingAi(true);
    try {
      const aiResult = await window.desktop.ai.getProviderStatus();
      if (aiResult.ok) {
        setAiStatuses(aiResult.data);
      }
      if (selectedProjectId && window.desktop.ai.getEmbeddingIndexStatus) {
        const embResult = await window.desktop.ai.getEmbeddingIndexStatus({
          projectId: selectedProjectId,
        });
        if (embResult.ok) {
          setEmbeddingStatus(embResult.data);
        }
      }
    } catch {
      // Handled silently
    } finally {
      setIsLoadingAi(false);
    }
  }, [selectedProjectId]);

  const handleIndexRequirements = async () => {
    if (!selectedProjectId || !window.desktop?.ai?.indexSubjects) return;
    setIsIndexing(true);
    try {
      await window.desktop.ai.indexSubjects({
        projectId: selectedProjectId,
        subjectType: 'REQUIREMENT',
        forceReindex: true,
      });
      await fetchAiAndEmbeddingStatus();
    } catch {
      // Handled silently
    } finally {
      setIsIndexing(false);
    }
  };

  useEffect(() => {
    void fetchProfile();
    void fetchSecurityData();
  }, [fetchProfile, fetchSecurityData]);

  useEffect(() => {
    if (activeTab === 'infrastructure') {
      void fetchDatabaseStatus();
      void fetchAiAndEmbeddingStatus();
    }
  }, [activeTab, fetchDatabaseStatus, fetchAiAndEmbeddingStatus]);

  const handleTabChange = (tab: SettingsTab) => {
    setActiveTab(tab);
    setSearchParams({ tab });
  };

  // Profile Save
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!window.desktop?.settings?.updateProfile) return;
    setIsSavingProfile(true);
    setProfileMsg(null);
    try {
      const res = await window.desktop.settings.updateProfile({
        displayName: displayNameInput.trim(),
      });
      if (res.ok) {
        setProfile(res.data);
        setProfileMsg({ type: 'success', text: 'Profile updated successfully.' });
        void refreshAuth();
      } else {
        setProfileMsg({ type: 'error', text: res.error.message });
      }
    } catch (err: unknown) {
      setProfileMsg({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to update profile.',
      });
    } finally {
      setIsSavingProfile(false);
    }
  };

  // Password Change
  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!window.desktop?.settings?.changePassword) return;
    if (newPassword !== confirmPassword) {
      setSecurityMsg({ type: 'error', text: 'New passwords do not match.' });
      return;
    }
    setIsChangingPassword(true);
    setSecurityMsg(null);
    try {
      const res = await window.desktop.settings.changePassword({
        currentPassword,
        newPassword,
      });
      if (res.ok) {
        setSecurityMsg({ type: 'success', text: 'Password changed successfully.' });
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
      } else {
        setSecurityMsg({ type: 'error', text: res.error.message });
      }
    } catch (err: unknown) {
      setSecurityMsg({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to change password.',
      });
    } finally {
      setIsChangingPassword(false);
    }
  };

  // Revoke Session
  const handleRevokeSession = async (sessionId: string) => {
    if (!window.desktop?.auth?.revokeSession) return;
    try {
      const res = await window.desktop.auth.revokeSession({ sessionId });
      if (res.ok) {
        void fetchSecurityData();
      }
    } catch {
      // Ignored
    }
  };

  // Delete Account
  const handleDeleteAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!window.desktop?.settings?.deleteAccount) return;
    if (deleteConfirmation !== 'DELETE') {
      setDeleteError('Please type DELETE to confirm account deletion.');
      return;
    }
    setIsDeletingAccount(true);
    setDeleteError(null);
    try {
      const res = await window.desktop.settings.deleteAccount({
        confirmationText: deleteConfirmation,
        currentPassword: deletePassword || undefined,
      });
      if (res.ok) {
        void logout();
      } else {
        setDeleteError(res.error.message);
      }
    } catch (err: unknown) {
      setDeleteError(err instanceof Error ? err.message : 'Failed to delete account.');
    } finally {
      setIsDeletingAccount(false);
    }
  };

  const handleTogglePref = async (key: string, value: boolean) => {
    const res = await updatePreferences({ [key]: value });
    if (res.success) {
      setPrefSaveMsg('Saved');
      setTimeout(() => setPrefSaveMsg(null), 2000);
    }
  };

  const handleSelectPref = async (key: string, value: string) => {
    const res = await updatePreferences({ [key]: value });
    if (res.success) {
      setPrefSaveMsg('Saved');
      setTimeout(() => setPrefSaveMsg(null), 2000);
    }
  };

  const configuredProvider = aiStatuses.find(p => p.configured) ?? aiStatuses[0];

  return (
    <div
      className="settings-screen-container"
      data-screen="settings"
      data-testid="settings-screen"
    >
      <div className="settings-header">
        <div>
          <h1 className="settings-title">Settings</h1>
          <p className="settings-description">
            Manage your personal profile, security credentials, and application preferences.
          </p>
        </div>
        {prefSaveMsg && (
          <Badge variant="success" dot>
            {prefSaveMsg}
          </Badge>
        )}
      </div>

      {/* Tabs Bar */}
      <nav className="settings-nav" aria-label="Settings Navigation" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'profile'}
          className={`settings-tab-btn ${activeTab === 'profile' ? 'active' : ''}`}
          data-testid="tab-profile"
          onClick={() => handleTabChange('profile')}
        >
          Profile
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'security'}
          className={`settings-tab-btn ${activeTab === 'security' ? 'active' : ''}`}
          data-testid="tab-security"
          onClick={() => handleTabChange('security')}
        >
          Account & Security
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'appearance'}
          className={`settings-tab-btn ${activeTab === 'appearance' ? 'active' : ''}`}
          data-testid="tab-appearance"
          onClick={() => handleTabChange('appearance')}
        >
          Appearance
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'preferences'}
          className={`settings-tab-btn ${activeTab === 'preferences' ? 'active' : ''}`}
          data-testid="tab-preferences"
          onClick={() => handleTabChange('preferences')}
        >
          Preferences
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'notifications'}
          className={`settings-tab-btn ${activeTab === 'notifications' ? 'active' : ''}`}
          data-testid="tab-notifications"
          onClick={() => handleTabChange('notifications')}
        >
          Notifications
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'privacy'}
          className={`settings-tab-btn ${activeTab === 'privacy' ? 'active' : ''}`}
          data-testid="tab-privacy"
          onClick={() => handleTabChange('privacy')}
        >
          Privacy & Data
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'infrastructure'}
          className={`settings-tab-btn ${activeTab === 'infrastructure' ? 'active' : ''}`}
          data-testid="tab-infrastructure"
          onClick={() => handleTabChange('infrastructure')}
        >
          Infrastructure
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'about'}
          className={`settings-tab-btn ${activeTab === 'about' ? 'active' : ''}`}
          data-testid="tab-about"
          onClick={() => handleTabChange('about')}
        >
          About
        </button>
      </nav>

      <div className="settings-content-pane">
        {/* ==================== 1. PROFILE TAB ==================== */}
        {activeTab === 'profile' && (
          <div className="setting-section" data-testid="settings-profile-pane">
            <Card variant="default">
              <CardHeader>
                <CardTitle level={2}>User Profile</CardTitle>
                <CardDescription>
                  Your platform identity and verified contact details.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSaveProfile} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {profileMsg && (
                    <div
                      className={`settings-alert ${
                        profileMsg.type === 'success' ? 'settings-alert-success' : 'settings-alert-danger'
                      }`}
                      data-testid="profile-feedback"
                    >
                      {profileMsg.text}
                    </div>
                  )}

                  <div className="setting-row">
                    <div className="setting-info">
                      <label htmlFor="input-display-name" className="setting-label">
                        Display Name
                      </label>
                      <span className="setting-desc">Visible across test reviews, audit logs, and collaborator lists.</span>
                    </div>
                    <div className="setting-action">
                      <input
                        id="input-display-name"
                        data-testid="input-display-name"
                        className="settings-input"
                        type="text"
                        value={displayNameInput}
                        onChange={e => setDisplayNameInput(e.target.value)}
                        required
                        minLength={2}
                        maxLength={100}
                      />
                    </div>
                  </div>

                  <div className="setting-row">
                    <div className="setting-info">
                      <span className="setting-label">Email Address</span>
                      <span className="setting-desc">Primary login identity (read-only; managed by system administrator).</span>
                    </div>
                    <div className="setting-action" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <input
                        data-testid="input-email-readonly"
                        className="settings-input"
                        type="email"
                        value={profile?.email ?? user?.email ?? ''}
                        disabled
                        readOnly
                      />
                      <Badge variant={profile?.emailVerified ? 'success' : 'neutral'} dot>
                        {profile?.emailVerified ? 'Verified' : 'Unverified'}
                      </Badge>
                    </div>
                  </div>

                  <div className="setting-row">
                    <div className="setting-info">
                      <span className="setting-label">Account Status</span>
                      <span className="setting-desc">Platform membership lifecycle state.</span>
                    </div>
                    <div className="setting-action">
                      <Badge variant={profile?.accountStatus === 'ACTIVE' ? 'success' : 'warning'}>
                        {profile?.accountStatus ?? 'ACTIVE'}
                      </Badge>
                    </div>
                  </div>

                  <div className="setting-row">
                    <div className="setting-info">
                      <span className="setting-label">User Identifier</span>
                      <span className="setting-desc">Authoritative internal unique reference key.</span>
                    </div>
                    <div className="setting-action">
                      <code style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        {profile?.userId ?? user?.id ?? '—'}
                      </code>
                    </div>
                  </div>

                  <div className="setting-row">
                    <div className="setting-info">
                      <span className="setting-label">Member Since</span>
                      <span className="setting-desc">Original account registration timestamp.</span>
                    </div>
                    <div className="setting-action">
                      <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                        {profile?.createdAt ? new Date(profile.createdAt).toLocaleDateString() : '—'}
                      </span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
                    <Button
                      type="submit"
                      variant="primary"
                      size="sm"
                      loading={isSavingProfile}
                      data-testid="btn-save-profile"
                    >
                      Save Changes
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          </div>
        )}

        {/* ==================== 2. ACCOUNT & SECURITY TAB ==================== */}
        {activeTab === 'security' && (
          <div className="setting-section" data-testid="settings-security-pane">
            {/* Password Management */}
            <Card variant="default">
              <CardHeader>
                <CardTitle level={2}>Password Management</CardTitle>
                <CardDescription>
                  Update your local password authentication credentials.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {authMethods && !authMethods.hasPassword ? (
                  <div className="settings-alert settings-alert-success" data-testid="social-only-notice">
                    This account is authenticated exclusively through external social identity (Google/Apple). Standalone password login is not active.
                  </div>
                ) : (
                  <form onSubmit={handleChangePassword} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {securityMsg && (
                      <div
                        className={`settings-alert ${
                          securityMsg.type === 'success' ? 'settings-alert-success' : 'settings-alert-danger'
                        }`}
                        data-testid="password-feedback"
                      >
                        {securityMsg.text}
                      </div>
                    )}

                    <div className="setting-row">
                      <div className="setting-info">
                        <label htmlFor="input-current-password" className="setting-label">
                          Current Password
                        </label>
                        <span className="setting-desc">Required to authorize credential updates.</span>
                      </div>
                      <div className="setting-action">
                        <input
                          id="input-current-password"
                          data-testid="input-current-password"
                          className="settings-input"
                          type="password"
                          value={currentPassword}
                          onChange={e => setCurrentPassword(e.target.value)}
                          required
                        />
                      </div>
                    </div>

                    <div className="setting-row">
                      <div className="setting-info">
                        <label htmlFor="input-new-password" className="setting-label">
                          New Password
                        </label>
                        <span className="setting-desc">Minimum 8 characters with at least one number and special character.</span>
                      </div>
                      <div className="setting-action">
                        <input
                          id="input-new-password"
                          data-testid="input-new-password"
                          className="settings-input"
                          type="password"
                          value={newPassword}
                          onChange={e => setNewPassword(e.target.value)}
                          required
                          minLength={8}
                        />
                      </div>
                    </div>

                    <div className="setting-row">
                      <div className="setting-info">
                        <label htmlFor="input-confirm-password" className="setting-label">
                          Confirm New Password
                        </label>
                        <span className="setting-desc">Re-enter your new password to verify.</span>
                      </div>
                      <div className="setting-action">
                        <input
                          id="input-confirm-password"
                          data-testid="input-confirm-password"
                          className="settings-input"
                          type="password"
                          value={confirmPassword}
                          onChange={e => setConfirmPassword(e.target.value)}
                          required
                          minLength={8}
                        />
                      </div>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
                      <Button
                        type="submit"
                        variant="primary"
                        size="sm"
                        loading={isChangingPassword}
                        data-testid="btn-update-password"
                      >
                        Update Password
                      </Button>
                    </div>
                  </form>
                )}
              </CardContent>
            </Card>

            {/* Connected Authentication Methods */}
            <Card variant="default">
              <CardHeader>
                <CardTitle level={2}>Authentication Methods</CardTitle>
                <CardDescription>
                  Supported authentication providers linked to your account.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <div className="setting-row">
                    <div className="setting-info">
                      <span className="setting-label">Local Password</span>
                      <span className="setting-desc">Standard email and cryptographic scrypt password login.</span>
                    </div>
                    <div className="setting-action">
                      <Badge variant={authMethods?.hasPassword ? 'success' : 'neutral'} dot>
                        {authMethods?.hasPassword ? 'Enabled' : 'Disabled'}
                      </Badge>
                    </div>
                  </div>

                  <div className="setting-row">
                    <div className="setting-info">
                      <span className="setting-label">Google Identity</span>
                      <span className="setting-desc">Sign in with Google OAuth 2.0 PKCE.</span>
                    </div>
                    <div className="setting-action">
                      <Badge
                        variant={authMethods?.googleConnected ? 'success' : 'neutral'}
                        dot
                      >
                        {authMethods?.googleConnected
                          ? `Connected (${authMethods.googleEmail ?? 'Google'})`
                          : 'Not Linked'}
                      </Badge>
                    </div>
                  </div>

                  <div className="setting-row">
                    <div className="setting-info">
                      <span className="setting-label">Apple ID</span>
                      <span className="setting-desc">Sign in with Apple ID OAuth 2.0.</span>
                    </div>
                    <div className="setting-action">
                      <Badge
                        variant={authMethods?.appleConnected ? 'success' : 'neutral'}
                        dot
                      >
                        {authMethods?.appleConnected
                          ? `Connected (${authMethods.appleEmail ?? 'Apple'})`
                          : 'Not Linked'}
                      </Badge>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Active Sessions */}
            <Card variant="default">
              <CardHeader>
                <CardTitle level={2}>Active Sessions</CardTitle>
                <CardDescription>
                  Desktop client and web instances currently authenticated with your account.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="sessions-list" data-testid="sessions-list">
                  {sessions.length === 0 ? (
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                      No active sessions found.
                    </div>
                  ) : (
                    sessions.map(s => (
                      <div
                        key={s.sessionId}
                        className={`session-item ${s.isCurrentSession ? 'current' : ''}`}
                        data-testid={`session-item-${s.sessionId}`}
                      >
                        <div className="session-meta">
                          <div className="session-device">
                            <span>{s.deviceInfo ?? 'Desktop Client'}</span>
                            {s.isCurrentSession && (
                              <Badge variant="success" dot>
                                Current Session
                              </Badge>
                            )}
                          </div>
                          <div className="session-details">
                            Last Used: {new Date(s.lastUsedAt).toLocaleString()} • Created: {new Date(s.createdAt).toLocaleDateString()}
                          </div>
                        </div>
                        {!s.isCurrentSession && (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => void handleRevokeSession(s.sessionId)}
                            data-testid={`btn-revoke-${s.sessionId}`}
                          >
                            Revoke
                          </Button>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Danger Zone */}
            <Card variant="default" className="danger-zone-card">
              <CardHeader>
                <CardTitle level={2} className="danger-zone-title">
                  Danger Zone
                </CardTitle>
                <CardDescription>
                  Irreversible account termination. Once deleted, all active sessions and user data are purged permanently.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleDeleteAccount} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {deleteError && (
                    <div className="settings-alert settings-alert-danger" data-testid="delete-feedback">
                      {deleteError}
                    </div>
                  )}

                  <div className="setting-row">
                    <div className="setting-info">
                      <label htmlFor="input-delete-confirm" className="setting-label">
                        Type DELETE to confirm
                      </label>
                      <span className="setting-desc">Please confirm this action cannot be undone.</span>
                    </div>
                    <div className="setting-action">
                      <input
                        id="input-delete-confirm"
                        data-testid="input-delete-confirm"
                        className="settings-input"
                        type="text"
                        placeholder="DELETE"
                        value={deleteConfirmation}
                        onChange={e => setDeleteConfirmation(e.target.value)}
                        required
                      />
                    </div>
                  </div>

                  {authMethods?.hasPassword && (
                    <div className="setting-row">
                      <div className="setting-info">
                        <label htmlFor="input-delete-password" className="setting-label">
                          Current Password
                        </label>
                        <span className="setting-desc">Verify your credential before deleting.</span>
                      </div>
                      <div className="setting-action">
                        <input
                          id="input-delete-password"
                          data-testid="input-delete-password"
                          className="settings-input"
                          type="password"
                          value={deletePassword}
                          onChange={e => setDeletePassword(e.target.value)}
                          required
                        />
                      </div>
                    </div>
                  )}

                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
                    <Button
                      type="submit"
                      variant="danger"
                      size="sm"
                      loading={isDeletingAccount}
                      disabled={deleteConfirmation !== 'DELETE'}
                      data-testid="btn-delete-account"
                    >
                      Permanently Delete Account
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          </div>
        )}

        {/* ==================== 3. APPEARANCE TAB ==================== */}
        {activeTab === 'appearance' && (
          <div className="setting-section" data-testid="settings-appearance-pane">
            <Card variant="default">
              <CardHeader>
                <CardTitle level={2}>Appearance & Interface</CardTitle>
                <CardDescription>
                  Customize the desktop application visual theme, layout density, and time format.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <div className="setting-row">
                    <div className="setting-info">
                      <label htmlFor="select-theme" className="setting-label">
                        Color Theme
                      </label>
                      <span className="setting-desc">Choose between dark, light, or automatic system matching.</span>
                    </div>
                    <div className="setting-action">
                      <select
                        id="select-theme"
                        data-testid="select-theme"
                        className="settings-select"
                        value={preferences?.theme ?? 'system'}
                        onChange={e => void handleSelectPref('theme', e.target.value as ThemePreference)}
                      >
                        <option value="system">System Default</option>
                        <option value="dark">Dark Mode</option>
                        <option value="light">Light Mode</option>
                      </select>
                    </div>
                  </div>

                  <div className="setting-row">
                    <div className="setting-info">
                      <label htmlFor="select-density" className="setting-label">
                        UI Density
                      </label>
                      <span className="setting-desc">Adjust padding and vertical compacting for workspace views.</span>
                    </div>
                    <div className="setting-action">
                      <select
                        id="select-density"
                        data-testid="select-density"
                        className="settings-select"
                        value={preferences?.density ?? 'comfortable'}
                        onChange={e => void handleSelectPref('density', e.target.value as DensityPreference)}
                      >
                        <option value="compact">Compact</option>
                        <option value="comfortable">Comfortable</option>
                      </select>
                    </div>
                  </div>

                  <div className="setting-row">
                    <div className="setting-info">
                      <label htmlFor="select-time-format" className="setting-label">
                        Time Format
                      </label>
                      <span className="setting-desc">Display timestamps in 12-hour (AM/PM) or 24-hour military format.</span>
                    </div>
                    <div className="setting-action">
                      <select
                        id="select-time-format"
                        data-testid="select-time-format"
                        className="settings-select"
                        value={preferences?.timeFormat ?? '12h'}
                        onChange={e => void handleSelectPref('timeFormat', e.target.value as TimeFormatPreference)}
                      >
                        <option value="12h">12-Hour (1:30 PM)</option>
                        <option value="24h">24-Hour (13:30)</option>
                      </select>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* ==================== 4. PREFERENCES TAB ==================== */}
        {activeTab === 'preferences' && (
          <div className="setting-section" data-testid="settings-preferences-pane">
            <Card variant="default">
              <CardHeader>
                <CardTitle level={2}>Execution & Safety Preferences</CardTitle>
                <CardDescription>
                  Guardrails and browser defaults for autonomous test execution.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {/* Production Safe Mode */}
                  <div className="setting-row">
                    <div className="setting-info">
                      <span className="setting-label" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        Production Safe Mode
                        <Badge variant={preferences?.productionSafeMode ? 'success' : 'danger'}>
                          {preferences?.productionSafeMode ? 'Active (Protected)' : 'Disabled (High Risk)'}
                        </Badge>
                      </span>
                      <span className="setting-desc">
                        Strictly prevents automated test executions, mutations, and destructive actions against production hostnames and environments. Default is ON.
                      </span>
                    </div>
                    <div className="setting-action">
                      <label className="toggle-switch" aria-label="Production Safe Mode">
                        <input
                          type="checkbox"
                          data-testid="toggle-safe-mode"
                          checked={preferences?.productionSafeMode ?? true}
                          onChange={e => void handleTogglePref('productionSafeMode', e.target.checked)}
                        />
                        <span className="toggle-slider" />
                      </label>
                    </div>
                  </div>

                  {/* Default Browser */}
                  <div className="setting-row">
                    <div className="setting-info">
                      <label htmlFor="select-default-browser" className="setting-label">
                        Default Test Execution Browser
                      </label>
                      <span className="setting-desc">Preferred Playwright browser engine for test runs and exploratory crawls.</span>
                    </div>
                    <div className="setting-action">
                      <select
                        id="select-default-browser"
                        data-testid="select-default-browser"
                        className="settings-select"
                        value={preferences?.defaultBrowser ?? 'chromium'}
                        onChange={e => void handleSelectPref('defaultBrowser', e.target.value as BrowserPreference)}
                      >
                        <option value="chromium">Chromium</option>
                        <option value="firefox">Firefox</option>
                        <option value="webkit">WebKit (Safari)</option>
                      </select>
                    </div>
                  </div>

                  {/* Confirm Destructive Actions */}
                  <div className="setting-row">
                    <div className="setting-info">
                      <span className="setting-label">Confirm Destructive Actions</span>
                      <span className="setting-desc">Prompt confirmation modals before archiving projects or deleting test suites.</span>
                    </div>
                    <div className="setting-action">
                      <label className="toggle-switch" aria-label="Confirm Destructive Actions">
                        <input
                          type="checkbox"
                          data-testid="toggle-confirm-destructive"
                          checked={preferences?.confirmDestructiveActions ?? true}
                          onChange={e => void handleTogglePref('confirmDestructiveActions', e.target.checked)}
                        />
                        <span className="toggle-slider" />
                      </label>
                    </div>
                  </div>

                  {/* Open External Links Safely */}
                  <div className="setting-row">
                    <div className="setting-info">
                      <span className="setting-label">Safe External Link Handling</span>
                      <span className="setting-desc">Confirm destination domain before opening links in default OS web browser.</span>
                    </div>
                    <div className="setting-action">
                      <label className="toggle-switch" aria-label="Safe External Link Handling">
                        <input
                          type="checkbox"
                          data-testid="toggle-safe-links"
                          checked={preferences?.openExternalLinksSafely ?? true}
                          onChange={e => void handleTogglePref('openExternalLinksSafely', e.target.checked)}
                        />
                        <span className="toggle-slider" />
                      </label>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* ==================== 5. NOTIFICATIONS TAB ==================== */}
        {activeTab === 'notifications' && (
          <div className="setting-section" data-testid="settings-notifications-pane">
            <Card variant="default">
              <CardHeader>
                <CardTitle level={2}>Desktop & System Notifications</CardTitle>
                <CardDescription>
                  Configure desktop alerts for long-running autonomous test tasks and triage findings.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <div className="setting-row">
                    <div className="setting-info">
                      <span className="setting-label">Desktop Notifications</span>
                      <span className="setting-desc">Master switch for native OS system notifications.</span>
                    </div>
                    <div className="setting-action">
                      <label className="toggle-switch" aria-label="Desktop Notifications">
                        <input
                          type="checkbox"
                          data-testid="toggle-desktop-notifications"
                          checked={preferences?.desktopNotifications ?? true}
                          onChange={e => void handleTogglePref('desktopNotifications', e.target.checked)}
                        />
                        <span className="toggle-slider" />
                      </label>
                    </div>
                  </div>

                  <div className="setting-row">
                    <div className="setting-info">
                      <span className="setting-label">Test Run Completed</span>
                      <span className="setting-desc">Notify when batch test runs, smokes, or regressions finish.</span>
                    </div>
                    <div className="setting-action">
                      <label className="toggle-switch" aria-label="Test Run Completed">
                        <input
                          type="checkbox"
                          data-testid="toggle-notify-test-complete"
                          disabled={!preferences?.desktopNotifications}
                          checked={preferences?.notifyTestRunComplete ?? true}
                          onChange={e => void handleTogglePref('notifyTestRunComplete', e.target.checked)}
                        />
                        <span className="toggle-slider" />
                      </label>
                    </div>
                  </div>

                  <div className="setting-row">
                    <div className="setting-info">
                      <span className="setting-label">Critical Defect Discovered</span>
                      <span className="setting-desc">Immediate alert when blocker/critical severity defects are classified.</span>
                    </div>
                    <div className="setting-action">
                      <label className="toggle-switch" aria-label="Critical Defect Discovered">
                        <input
                          type="checkbox"
                          data-testid="toggle-notify-critical-defect"
                          disabled={!preferences?.desktopNotifications}
                          checked={preferences?.notifyCriticalDefect ?? true}
                          onChange={e => void handleTogglePref('notifyCriticalDefect', e.target.checked)}
                        />
                        <span className="toggle-slider" />
                      </label>
                    </div>
                  </div>

                  <div className="setting-row">
                    <div className="setting-info">
                      <span className="setting-label">Repair Approval Required</span>
                      <span className="setting-desc">Alert when a sandboxed fix proposal requires engineer review.</span>
                    </div>
                    <div className="setting-action">
                      <label className="toggle-switch" aria-label="Repair Approval Required">
                        <input
                          type="checkbox"
                          data-testid="toggle-notify-repair-approval"
                          disabled={!preferences?.desktopNotifications}
                          checked={preferences?.notifyRepairApproval ?? true}
                          onChange={e => void handleTogglePref('notifyRepairApproval', e.target.checked)}
                        />
                        <span className="toggle-slider" />
                      </label>
                    </div>
                  </div>

                  <div className="setting-row">
                    <div className="setting-info">
                      <span className="setting-label">Release Readiness Change</span>
                      <span className="setting-desc">Notify when quality gates transition release candidate status.</span>
                    </div>
                    <div className="setting-action">
                      <label className="toggle-switch" aria-label="Release Readiness Change">
                        <input
                          type="checkbox"
                          data-testid="toggle-notify-release-readiness"
                          disabled={!preferences?.desktopNotifications}
                          checked={preferences?.notifyReleaseReadiness ?? true}
                          onChange={e => void handleTogglePref('notifyReleaseReadiness', e.target.checked)}
                        />
                        <span className="toggle-slider" />
                      </label>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card variant="default">
              <CardHeader>
                <CardTitle level={2}>Email Notification Digests</CardTitle>
                <CardDescription>
                  Configure email summaries and urgent notifications to your registered email address.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <div className="setting-row">
                    <div className="setting-info">
                      <span className="setting-label">Email Notifications</span>
                      <span className="setting-desc">Master switch for outbound email notifications.</span>
                    </div>
                    <div className="setting-action">
                      <label className="toggle-switch" aria-label="Email Notifications">
                        <input
                          type="checkbox"
                          data-testid="toggle-email-notifications"
                          checked={preferences?.emailNotifications ?? false}
                          onChange={e => void handleTogglePref('emailNotifications', e.target.checked)}
                        />
                        <span className="toggle-slider" />
                      </label>
                    </div>
                  </div>

                  <div className="setting-row">
                    <div className="setting-info">
                      <span className="setting-label">Email on Critical Defect</span>
                      <span className="setting-desc">Send immediate email dispatch for high-priority regression issues.</span>
                    </div>
                    <div className="setting-action">
                      <label className="toggle-switch" aria-label="Email on Critical Defect">
                        <input
                          type="checkbox"
                          data-testid="toggle-email-critical-defect"
                          disabled={!preferences?.emailNotifications}
                          checked={preferences?.emailCriticalDefect ?? true}
                          onChange={e => void handleTogglePref('emailCriticalDefect', e.target.checked)}
                        />
                        <span className="toggle-slider" />
                      </label>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* ==================== 6. PRIVACY & DATA TAB ==================== */}
        {activeTab === 'privacy' && (
          <div className="setting-section" data-testid="settings-privacy-pane">
            <AiPrivacySettingsCard projectId={selectedProjectId} />

            <Card variant="default">
              <CardHeader>
                <CardTitle level={2}>Telemetry & Diagnostics</CardTitle>
                <CardDescription>
                  Control telemetry reporting, anonymous metrics, and error diagnostics.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <div className="setting-row">
                    <div className="setting-info">
                      <span className="setting-label">Anonymous Platform Telemetry</span>
                      <span className="setting-desc">
                        Help improve test generation accuracy by sending anonymized usage statistics. Never sends project code, requirements, or test inputs.
                      </span>
                    </div>
                    <div className="setting-action">
                      <label className="toggle-switch" aria-label="Anonymous Platform Telemetry">
                        <input
                          type="checkbox"
                          data-testid="toggle-telemetry"
                          checked={preferences?.telemetryEnabled ?? false}
                          onChange={e => void handleTogglePref('telemetryEnabled', e.target.checked)}
                        />
                        <span className="toggle-slider" />
                      </label>
                    </div>
                  </div>

                  <div className="setting-row">
                    <div className="setting-info">
                      <span className="setting-label">Automated Crash Reporting</span>
                      <span className="setting-desc">
                        Automatically send sanitized stack traces when unexpected renderer or main process crashes occur.
                      </span>
                    </div>
                    <div className="setting-action">
                      <label className="toggle-switch" aria-label="Automated Crash Reporting">
                        <input
                          type="checkbox"
                          data-testid="toggle-crash-reports"
                          checked={preferences?.crashReportsEnabled ?? false}
                          onChange={e => void handleTogglePref('crashReportsEnabled', e.target.checked)}
                        />
                        <span className="toggle-slider" />
                      </label>
                    </div>
                  </div>

                  <div className="setting-row">
                    <div className="setting-info">
                      <span className="setting-label">Clear Local Cache</span>
                      <span className="setting-desc">Reset local storage caches, UI layout history, and temporary preview buffers.</span>
                    </div>
                    <div className="setting-action">
                      <Button
                        variant="secondary"
                        size="sm"
                        data-testid="btn-clear-cache"
                        onClick={() => {
                          try {
                            localStorage.clear();
                            setPrefSaveMsg('Cache Cleared');
                            setTimeout(() => setPrefSaveMsg(null), 2000);
                          } catch {
                            // Ignored
                          }
                        }}
                      >
                        Clear Cache
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* ==================== 7. INFRASTRUCTURE TAB ==================== */}
        {activeTab === 'infrastructure' && (
          <div className="setting-section" data-testid="settings-infrastructure-pane">
            <Card variant="default">
              <CardHeader>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <CardTitle level={2}>PostgreSQL Infrastructure & pgvector</CardTitle>
                    <CardDescription>
                      Process-level database connection pool and vector extension status.
                    </CardDescription>
                  </div>
                  <Badge
                    variant={dbStatus?.status === 'connected' ? 'success' : 'danger'}
                    dot={dbStatus?.status === 'connected'}
                  >
                    {dbStatus?.status === 'connected' ? 'Database Connected' : 'Database Unavailable'}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', fontSize: '0.85rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '0.5rem' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Status:</span>
                    <span style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{dbStatus?.status || 'Unknown'}</span>
                  </div>
                  {dbStatus?.databaseName && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '0.5rem' }}>
                      <span style={{ color: 'var(--text-secondary)' }}>Database:</span>
                      <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-accent)' }}>{dbStatus.databaseName}</span>
                    </div>
                  )}
                  {dbStatus?.serverVersion && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '0.5rem' }}>
                      <span style={{ color: 'var(--text-secondary)' }}>Server Version:</span>
                      <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>{dbStatus.serverVersion}</span>
                    </div>
                  )}
                  {dbStatus?.latencyMs !== undefined && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '0.5rem' }}>
                      <span style={{ color: 'var(--text-secondary)' }}>Query Latency:</span>
                      <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-success)' }}>{dbStatus.latencyMs} ms</span>
                    </div>
                  )}
                </div>
              </CardContent>
              <CardFooter>
                <Button
                  variant="secondary"
                  size="sm"
                  loading={isLoadingDb}
                  onClick={() => void fetchDatabaseStatus()}
                >
                  Check Connection
                </Button>
              </CardFooter>
            </Card>

            <Card variant="default">
              <CardHeader>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <CardTitle level={2}>AI Provider Gateway & Embedding Foundation</CardTitle>
                    <CardDescription>
                      AI LLM provider configuration, vector embedding models, and retrieval state.
                    </CardDescription>
                  </div>
                  {configuredProvider && (
                    <Badge
                      variant={configuredProvider.status === 'READY' ? 'success' : 'neutral'}
                      dot={configuredProvider.status === 'READY'}
                    >
                      {configuredProvider.providerId} ({configuredProvider.status})
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', fontSize: '0.85rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '0.5rem' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Default Provider:</span>
                    <span style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{configuredProvider?.providerId || 'None'}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '0.5rem' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Embedding Support:</span>
                    <span style={{ fontWeight: 500, color: 'var(--color-success)' }}>
                      {configuredProvider?.capabilities?.embeddings ? 'Enabled (1536 dims)' : 'Disabled'}
                    </span>
                  </div>
                  {embeddingStatus && (
                    <>
                      <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '0.5rem' }}>
                        <span style={{ color: 'var(--text-secondary)' }}>Current Project Vectors:</span>
                        <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-accent)' }}>
                          {embeddingStatus.totalIndexed} active ({embeddingStatus.totalStale} stale)
                        </span>
                      </div>
                      {embeddingStatus.lastIndexedAt && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '0.5rem' }}>
                          <span style={{ color: 'var(--text-secondary)' }}>Last Indexed At:</span>
                          <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
                            {new Date(embeddingStatus.lastIndexedAt).toLocaleString()}
                          </span>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </CardContent>
              <CardFooter>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <Button
                    variant="secondary"
                    size="sm"
                    loading={isLoadingAi}
                    onClick={() => void fetchAiAndEmbeddingStatus()}
                  >
                    Refresh Status
                  </Button>
                  {selectedProjectId && (
                    <Button
                      variant="primary"
                      size="sm"
                      loading={isIndexing}
                      onClick={() => void handleIndexRequirements()}
                    >
                      Index Requirements
                    </Button>
                  )}
                </div>
              </CardFooter>
            </Card>

            <OllamaSettingsCard projectId={selectedProjectId} />

            <InstalledModelsCard projectId={selectedProjectId} />

            <LocalGenerationPlaygroundCard projectId={selectedProjectId} />

            <AiFallbackSettingsCard projectId={selectedProjectId} />

            <AiRuntimeRecoveryCard projectId={selectedProjectId} />

            <Card>
              <CardHeader>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <CardTitle level={2}>RAG & Requirement Context Retrieval Engine</CardTitle>
                    <CardDescription>
                      Multi-source grounded context assembly, authority tier ranking, and token budgeting.
                    </CardDescription>
                  </div>
                  <Badge variant="success" dot={true}>
                    requirement-rag-v1
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', fontSize: '0.85rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '0.5rem' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Context Budget Limits:</span>
                    <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>8,000 tokens / 32,000 chars / max 25 items</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '0.5rem' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Authority Hierarchy:</span>
                    <span style={{ fontWeight: 500, color: 'var(--text-accent)' }}>
                      Tiers 1–5 Deterministic & Confirmed &rarr; Tier 6 Vector Similarity &rarr; Tier 7 Candidates
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '0.5rem' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Security Isolation:</span>
                    <span style={{ fontWeight: 500, color: 'var(--color-success)' }}>
                      Strict Project Isolation & Untrusted Content Delimitation
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <JiraIntegrationSettingsCard projectId={selectedProjectId} />
          </div>
        )}

        {/* ==================== 8. ABOUT TAB ==================== */}
        {activeTab === 'about' && (
          <div className="setting-section" data-testid="settings-about-pane">
            <Card variant="default">
              <CardHeader>
                <CardTitle level={2}>About AI Quality Platform</CardTitle>
                <CardDescription>
                  Application version, architecture runtime, and platform licensing information.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', fontSize: '0.85rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '0.5rem' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Application Name:</span>
                    <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                      {appInfo?.name ?? 'AI-Driven Software Quality Engineering Platform'}
                    </span>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '0.5rem' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Version:</span>
                    <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent-primary)' }}>
                      {appInfo?.version ?? '1.0.0'}
                    </span>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '0.5rem' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Environment Phase:</span>
                    <span style={{ fontWeight: 500, color: 'var(--color-success)' }}>
                      V8 Phase 116 — User Profile, Account Settings & Preferences
                    </span>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '0.5rem' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Electron Runtime:</span>
                    <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
                      {appInfo?.electronVersion ?? 'Sandboxed Process'}
                    </span>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '0.5rem' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Chromium Engine:</span>
                    <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
                      {appInfo?.chromeVersion ?? 'Embedded'}
                    </span>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '0.5rem' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Node.js:</span>
                    <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
                      {appInfo?.nodeVersion ?? 'Embedded Engine'}
                    </span>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '0.5rem' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Platform / Arch:</span>
                    <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                      {appInfo?.platform ?? 'macOS'} ({appInfo?.arch ?? 'arm64'})
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
