/**
 * The phone-shaped frame every route lives inside.
 *
 * Owns the app chrome (bottom navigation shown or hidden), the theme, the
 * hardware back button and the flush-on-background rule.
 */

import { useEffect, type ReactElement } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { ACTIVITY_SESSION_PATH, ONBOARDING_PATH, SESSION_PATH } from '../core/constants';
import { TabBar } from './navigation/TabBar';
import { useHardwareBack } from './navigation/useHardwareBack';
import {
  useApp, useFeedback, usePreferences, useStoreVersion,
} from './providers/appContext';
import { useUi } from './providers/uiContext';
import { useReminderSync } from './useReminderSync';

export function AppFrame(): ReactElement {
  const location = useLocation();
  // Onboarding and a running session both own the whole screen.
  const bare = location.pathname === ONBOARDING_PATH
    || location.pathname === SESSION_PATH
    || location.pathname === ACTIVITY_SESSION_PATH;

  useHardwareBack();
  useTheme();
  useAudioUnlock();
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

/**
 * Prepara o áudio no primeiro toque.
 *
 * Os browsers só deixam iniciar áudio dentro de um gesto do utilizador. Sem
 * isto, o primeiro som da aplicação — que é justamente o do dia perfeito, que
 * aparece sozinho — sairia mudo. Corre uma vez e desliga-se.
 */
function useAudioUnlock(): void {
  const feedback = useFeedback();

  useEffect(() => {
    const unlock = (): void => {
      feedback.unlock();
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, [feedback]);
}

/** Applies the theme preference and keeps the native status bar in step. */
function useTheme(): void {
  const { platform } = useApp();
  const preferences = usePreferences();

  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute('data-theme', preferences.theme);
    // Uma classe de transição só durante a troca: mudar o tema deve ser um
    // fundido, não um estalo — mas animar cores o tempo todo custa quadros.
    root.classList.add('theme-switching');
    const timer = window.setTimeout(() => root.classList.remove('theme-switching'), 320);

    void platform.device.setStatusBarStyle(preferences.theme === 'dark' ? 'dark' : 'light');
    return () => window.clearTimeout(timer);
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
