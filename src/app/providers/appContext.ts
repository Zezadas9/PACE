/**
 * The application context and its hooks.
 *
 * Kept separate from the provider component so that a file exports either
 * components or hooks, never both — which is what keeps Fast Refresh working.
 */

import { createContext, useContext, useMemo, useSyncExternalStore } from 'react';
import type { Repositories } from '../../data/repositories';
import type { Store } from '../../data/store';
import type { Platform } from '../../platform/types';
import type { FeedbackService } from '../../services/feedback';
import type { User, UserPreferences } from '../../core/types';
import { createUser } from '../../core/factories';

export interface AppContextValue {
  platform: Platform;
  feedback: FeedbackService;
  store: Store;
  repos: Repositories;
}

export const AppContext = createContext<AppContextValue | null>(null);

export function useApp(): AppContextValue {
  const value = useContext(AppContext);
  if (!value) throw new Error('useApp must be used inside <AppProvider>');
  return value;
}

export function usePlatform(): Platform {
  return useApp().platform;
}

export function useRepos(): Repositories {
  return useApp().repos;
}

/** Sound and haptics, paired. Prefer this over calling the device port directly. */
export function useFeedback(): FeedbackService {
  return useApp().feedback;
}

/**
 * Subscribes the component to store mutations.
 *
 * The store exposes a monotonic version number, which is exactly the cheap,
 * stable value `useSyncExternalStore` wants. Screens use the returned version
 * as a `useMemo` dependency to recompute their view-model.
 */
export function useStoreVersion(): number {
  const { store } = useApp();
  return useSyncExternalStore(store.subscribe, store.getVersion, store.getVersion);
}

export function useUser(): User | null {
  const { repos } = useApp();
  const version = useStoreVersion();
  return useMemo(() => repos.user.get(), [repos, version]);
}

const FALLBACK_PREFERENCES = createUser().preferences;

/** Preferences always resolve, even before onboarding has run. */
export function usePreferences(): UserPreferences {
  const user = useUser();
  return user?.preferences ?? FALLBACK_PREFERENCES;
}
