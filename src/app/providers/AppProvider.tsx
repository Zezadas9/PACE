/**
 * Boots the application: resolve the platform, open the store, build the
 * repositories, then render.
 *
 * The boot is asynchronous because native storage always is. Everything below
 * this component can assume the store is loaded.
 */

import { useEffect, useState, type ReactNode } from 'react';
import { createPlatform } from '../../platform';
import { Store } from '../../data/store';
import { createRepositories } from '../../data/repositories';
import { FeedbackService } from '../../services/feedback';
import { AppContext, type AppContextValue } from './appContext';
import { BootScreen } from '../BootScreen';

export function AppProvider({ children }: { children: ReactNode }): ReactNode {
  const [value, setValue] = useState<AppContextValue | null>(null);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function boot(): Promise<void> {
      const platform = await createPlatform();
      const store = new Store(platform.storage);
      await store.load();
      const repos = createRepositories(store);
      const feedback = new FeedbackService(platform);
      const prefs = store.snapshot.settings.feedback;
      feedback.setPreferences(prefs.sound, prefs.haptics);
      if (cancelled) return;
      // Flags the stylesheet reads to drop the desktop framing on device.
      const root = document.documentElement;
      root.dataset.platform = platform.info.platform;
      root.dataset.native = String(platform.info.isNative);
      root.dataset.standalone = String(platform.info.isStandalone);

      setValue({ platform, store, repos, feedback });
      // The native splash stays up until the first screen can paint.
      await platform.device.hideSplashScreen();
    }

    boot().catch((cause: unknown) => {
      if (!cancelled) setError(cause instanceof Error ? cause : new Error(String(cause)));
    });

    return () => {
      cancelled = true;
    };
  }, []);

  if (error) return <BootScreen error={error} />;
  if (!value) return <BootScreen />;

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
