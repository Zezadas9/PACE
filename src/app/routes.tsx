/**
 * Route table.
 *
 * Hash routing on purpose: it needs no server rewrite rules and it behaves
 * identically under capacitor://localhost, https://localhost and file://, which
 * is the set of origins this bundle has to survive.
 */

import type { ReactElement, ReactNode } from 'react';
import { HashRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { DEFAULT_PATH, ONBOARDING_PATH } from '../core/constants';
import { AppFrame } from './AppFrame';
import { useUser } from './providers/appContext';
import { OnboardingScreen } from '../features/onboarding/OnboardingScreen';
import { TodayScreen } from '../features/today/TodayScreen';
import { AgendaScreen } from '../features/agenda/AgendaScreen';
import { WorkoutScreen } from '../features/workout/WorkoutScreen';
import { SessionScreen } from '../features/workout/SessionScreen';
import { ActivityScreen } from '../features/activity/ActivityScreen';
import { NutritionScreen } from '../features/nutrition/NutritionScreen';
import { ProfileScreen } from '../features/profile/ProfileScreen';

/** Nobody reaches the app before the profile exists. */
function RequireOnboarding({ children }: { children: ReactNode }): ReactElement {
  const user = useUser();
  if (!user?.onboardingCompleted) return <Navigate to={ONBOARDING_PATH} replace />;
  return <>{children}</>;
}

/** And nobody goes back to onboarding once it is done. */
function RequireNoProfile({ children }: { children: ReactNode }): ReactElement {
  const user = useUser();
  if (user?.onboardingCompleted) return <Navigate to={DEFAULT_PATH} replace />;
  return <>{children}</>;
}

export function AppRoutes(): ReactElement {
  return (
    <HashRouter>
      <Routes>
        <Route element={<AppFrame />}>
          <Route
            path={ONBOARDING_PATH}
            element={
              <RequireNoProfile>
                <OnboardingScreen />
              </RequireNoProfile>
            }
          />
          <Route
            element={
              <RequireOnboarding>
                <Outlet />
              </RequireOnboarding>
            }
          >
            <Route path="/hoje" element={<TodayScreen />} />
            <Route path="/agenda" element={<AgendaScreen />} />
            <Route path="/treino" element={<WorkoutScreen />} />
            {/* Full-screen: mid-set is the worst moment to tap a tab by accident. */}
            <Route path="/treino/sessao" element={<SessionScreen />} />
            <Route path="/atividade" element={<ActivityScreen />} />
            <Route path="/alimentacao" element={<NutritionScreen />} />
            <Route path="/perfil" element={<ProfileScreen />} />
          </Route>
          <Route path="*" element={<Navigate to={DEFAULT_PATH} replace />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}
