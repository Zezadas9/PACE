/**
 * Keeps the OS notification queue in step with the data.
 *
 * Debounced, because a burst of edits (ticking four habits in a row) should
 * produce one reschedule, not four. Runs on every store change and once when
 * the app returns to the foreground, since a phone can sit in the background
 * long enough for the whole horizon to expire.
 */

import { useEffect, useRef } from 'react';
import { syncReminders } from '../services/notifications';
import { useApp, useStoreVersion } from './providers/appContext';

const DEBOUNCE_MS = 800;

export function useReminderSync(): void {
  const { repos, platform, store } = useApp();
  const version = useStoreVersion();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      void syncReminders(repos, platform).catch(() => {
        // A refused or unavailable notification service is not an app failure.
      });
    }, DEBOUNCE_MS);

    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [repos, platform, version]);

  useEffect(() => {
    return platform.device.onAppStateChange((state) => {
      if (state === 'active') void syncReminders(repos, platform).catch(() => {});
    });
  }, [repos, platform, store]);
}
