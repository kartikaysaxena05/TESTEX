/**
 * @file apps/desktop/src/renderer/context/PreferencesContext.tsx
 * Preferences Provider managing application preferences, theme resolution,
 * UI density, and production safe mode state for V8 Phase 116.
 */

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import type {
  UserPreferencesDto,
  UpdateUserPreferencesInputDto,
  ThemePreference,
} from '@ai-quality/contracts';

export interface PreferencesContextValue {
  readonly preferences: UserPreferencesDto | null;
  readonly isLoading: boolean;
  readonly error: string | null;
  readonly resolvedTheme: 'dark' | 'light';
  readonly updatePreferences: (
    input: UpdateUserPreferencesInputDto,
  ) => Promise<{ success: boolean; error?: string }>;
  readonly refreshPreferences: () => Promise<void>;
}

const PreferencesContext = createContext<PreferencesContextValue | null>(null);

const PREFERENCES_STORAGE_KEY = 'ai_quality_user_preferences';

const DEFAULT_PREFERENCES: UserPreferencesDto = {
  theme: 'system',
  density: 'comfortable',
  timeFormat: '12h',
  productionSafeMode: true,
  defaultBrowser: 'chromium',
  confirmDestructiveActions: true,
  openExternalLinksSafely: true,
  desktopNotifications: true,
  notifyTestRunComplete: true,
  notifyCriticalDefect: true,
  notifyRepairApproval: true,
  notifyReleaseReadiness: true,
  emailNotifications: false,
  emailCriticalDefect: true,
  emailReleaseReadiness: false,
  telemetryEnabled: false,
  crashReportsEnabled: false,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

export interface PreferencesProviderProps {
  readonly children: React.ReactNode;
  readonly initialPreferences?: UserPreferencesDto;
}

export function PreferencesProvider({
  children,
  initialPreferences,
}: PreferencesProviderProps): React.JSX.Element {
  const [preferences, setPreferences] = useState<UserPreferencesDto | null>(() => {
    if (initialPreferences) return initialPreferences;
    if (typeof window !== 'undefined') {
      try {
        const cached = localStorage.getItem(PREFERENCES_STORAGE_KEY);
        if (cached) {
          return JSON.parse(cached) as UserPreferencesDto;
        }
      } catch {
        // Fallback
      }
    }
    return DEFAULT_PREFERENCES;
  });

  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // System color scheme tracking
  const [systemPrefersDark, setSystemPrefersDark] = useState<boolean>(() => {
    if (typeof window !== 'undefined' && window.matchMedia) {
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    return true;
  });

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => {
      setSystemPrefersDark(e.matches);
    };

    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', handler);
      return () => mediaQuery.removeEventListener('change', handler);
    } else {
      mediaQuery.addListener(handler);
      return () => mediaQuery.removeListener(handler);
    }
  }, []);

  const resolvedTheme: 'dark' | 'light' = useMemo(() => {
    const prefTheme: ThemePreference = preferences?.theme ?? 'system';
    if (prefTheme === 'dark') return 'dark';
    if (prefTheme === 'light') return 'light';
    return systemPrefersDark ? 'dark' : 'light';
  }, [preferences?.theme, systemPrefersDark]);

  // Apply theme & density to document element
  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.documentElement.setAttribute('data-theme', resolvedTheme);
    if (preferences?.density) {
      document.documentElement.setAttribute('data-density', preferences.density);
    }
  }, [resolvedTheme, preferences?.density]);

  const refreshPreferences = useCallback(async (): Promise<void> => {
    if (typeof window === 'undefined' || !window.desktop?.settings?.getPreferences) {
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const res = await window.desktop.settings.getPreferences();
      if (res.ok) {
        setPreferences(res.data);
        try {
          localStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify(res.data));
        } catch {
          // Local storage write ignored
        }
      } else {
        setError(res.error.message);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to fetch preferences');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshPreferences();
  }, [refreshPreferences]);

  const updatePreferences = useCallback(
    async (
      input: UpdateUserPreferencesInputDto,
    ): Promise<{ success: boolean; error?: string }> => {
      if (typeof window === 'undefined' || !window.desktop?.settings?.updatePreferences) {
        // Optimistic local update for mock / browser environment
        setPreferences(prev => (prev ? { ...prev, ...input } : null));
        return { success: true };
      }

      setError(null);
      try {
        const res = await window.desktop.settings.updatePreferences(input);
        if (res.ok) {
          setPreferences(res.data);
          try {
            localStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify(res.data));
          } catch {
            // Local storage write ignored
          }
          return { success: true };
        } else {
          setError(res.error.message);
          return { success: false, error: res.error.message };
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Failed to update preferences';
        setError(msg);
        return { success: false, error: msg };
      }
    },
    [],
  );

  const value = useMemo(
    () => ({
      preferences,
      isLoading,
      error,
      resolvedTheme,
      updatePreferences,
      refreshPreferences,
    }),
    [preferences, isLoading, error, resolvedTheme, updatePreferences, refreshPreferences],
  );

  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}

export function usePreferences(): PreferencesContextValue {
  const ctx = useContext(PreferencesContext);
  if (!ctx) {
    throw new Error('usePreferences must be used within a PreferencesProvider');
  }
  return ctx;
}
