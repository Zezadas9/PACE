/**
 * The phone-shaped frame every route lives inside.
 *
 * Owns the app chrome (bottom navigation shown or hidden), the theme, the
 * hardware back button and the flush-on-background rule.
 */

import { useEffect, type ReactElement } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { ONBOARDING_PATH, SESSION_PATH } from '../core/constants';
import { TabBar } from './navigation/TabBar';
import { useHardwareBack } from './navigation/useHardwareBack';
import { useApp, usePreferences, useStoreVersion } from './providers/appContext';
import { useUi } from './providers/uiContext';
import { useReminderSync } from './useReminderSync';

export function AppFrame(): ReactElement {
  const location = useLocation();
  // Onboarding and a running session both own the whole screen.
  const bare = location.pathname === ONBOARDING_PATH
    || location.pathname === SESSION_PATH;

  useHardwareBack();
  useTheme();
  useFlushOnBackground();
  useDegradedStorageWarning();
  useFeedbackPreferences();
  useReminderSync();

  return (
    <div className="app" data-chrome={bare ? 'bare' : 'full'}>
      <main className="screens">
        <Outlet />
      </main>
      <TabBar />
    </div>
  );
}

/** Applies the theme preference and keeps the native status bar in step. */
function useTheme(): void {
  const { platform } = useApp();
  const preferences = usePreferences();

  useEffect(() => {
    const root = document.documentElement;
    if (preferences.theme === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', preferences.theme);

    const dark =
      preferences.theme === 'dark' ||
      (preferences.theme === 'system' &&
        window.matchMedia('(prefers-color-scheme: dark)').matches);
    void platform.device.setStatusBarStyle(dark ? 'dark' : 'light');
  }, [platform, preferences.theme]);
}

/**
 * A phone can suspend the app without warning. The debounced write must be
 * forced out before that happens, or the last edit is lost.
 */
function useFlushOnBackground(): void {
  const { platform, store } = useApp();

  useEffect(() => {
    return platform.device.onAppStateChange((state) => {
      if (state === 'background') void store.flush();
    });
  }, [platform, store]);
}

/** Keeps the feedback service in step with the settings, and quiet in the background. */
function useFeedbackPreferences(): void {
  const { repos, feedback, platform } = useApp();
  const version = useStoreVersion();

  useEffect(() => {
    const prefs = repos.settings.get().feedback;
    feedback.setPreferences(prefs.sound, prefs.haptics);
  }, [repos, feedback, version]);

  useEffect(() => {
    return platform.device.onAppStateChange((state) => {
      if (state === 'background') feedback.suspend();
    });
  }, [platform, feedback]);
}

/** Say it once, plainly, rather than losing data quietly. */
function useDegradedStorageWarning(): void {
  const { store } = useApp();
  const { toast } = useUi();

  useEffect(() => {
    if (!store.degraded) return;
    const id = window.setTimeout(() => {
      toast('Armazenamento indisponível: os dados não vão persistir.', 4200);
    }, 800);
    return () => window.clearTimeout(id);
  }, [store, toast]);
}
