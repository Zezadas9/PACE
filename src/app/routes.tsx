/**
 * Route table.
 *
 * Hash routing on purpose: it needs no server rewrite rules and it behaves
 * identically under capacitor://localhost, https://localhost and file://, which
 * is the set of origins this bundle has to survive.
 */

import { useMemo, type ReactElement, type ReactNode } from 'react';
import { HashRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { DEFAULT_PATH, ONBOARDING_PATH, SUBSCRIPTION_PATH } from '../core/constants';
import { AppFrame } from './AppFrame';
import { useApp, useStoreVersion, useUser } from './providers/appContext';
import { accessOf, accountStart } from '../services/subscription';
import { SubscriptionScreen } from '../features/subscription/SubscriptionScreen';
import { OnboardingScreen } from '../features/onboarding/OnboardingScreen';
import { TodayScreen } from '../features/today/TodayScreen';
import { AgendaScreen } from '../features/agenda/AgendaScreen';
import { WorkoutScreen } from '../features/workout/WorkoutScreen';
import { SessionScreen } from '../features/workout/SessionScreen';
import { ActivitySessionScreen } from '../features/activity/ActivitySessionScreen';
import { ActivityScreen } from '../features/activity/ActivityScreen';
import { ActivityPrepareScreen } from '../features/activity/ActivityPrepareScreen';
import { ActivityDetailScreen } from '../features/activity/ActivityDetailScreen';
import { ActivityHistoryScreen } from '../features/activity/ActivityHistoryScreen';
import { SleepScreen } from '../features/sleep/SleepScreen';
import { NutritionScreen } from '../features/nutrition/NutritionScreen';
import { ProfileScreen } from '../features/profile/ProfileScreen';
import { AssistantScreen } from '../features/assistant/AssistantScreen';
import { ConsentScreen } from '../features/assistant/ConsentScreen';
import { RunPlanScreen } from '../features/assistant/RunPlanScreen';

/** Nobody reaches the app before the profile exists. */
function RequireOnboarding({ children }: { children: ReactNode }): ReactElement {
  const user = useUser();
  if (!user?.onboardingCompleted) return <Navigate to={ONBOARDING_PATH} replace />;
  return <>{children}</>;
}

/**
 * Sem acesso, so o ecra da assinatura.
 *
 * `unknown` — ainda nao se falou com o servidor — deixa passar: bloquear quem
 * acabou de instalar sem rede era comecar mal. E `services/subscription.ts`
 * que fecha essa porta ao fim da semana, mesmo sem servidor nenhum.
 */
function RequireAccess({ children }: { children: ReactNode }): ReactElement {
  const { repos } = useApp();
  const version = useStoreVersion();
  const access = useMemo(
    () => accessOf(repos.settings.get().licence, accountStart(repos)),
    [repos, version],
  );
  if (access === 'blocked') return <Navigate to={SUBSCRIPTION_PATH} replace />;
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
            <Route path={SUBSCRIPTION_PATH} element={<SubscriptionScreen />} />
            <Route
              element={
                <RequireAccess>
                  <Outlet />
                </RequireAccess>
              }
            >
              <Route path="/hoje" element={<TodayScreen />} />
            <Route path="/agenda" element={<AgendaScreen />} />
            <Route path="/treino" element={<WorkoutScreen />} />
            {/* Full-screen: mid-set is the worst moment to tap a tab by accident. */}
            <Route path="/treino/sessao" element={<SessionScreen />} />
            <Route path="/atividade" element={<ActivityScreen />} />
            {/* Full-screen: a live activity should not lose a tap to the tab bar. */}
            <Route path="/atividade/sessao" element={<ActivitySessionScreen />} />
            <Route path="/atividade/preparar/:type" element={<ActivityPrepareScreen />} />
            <Route path="/atividade/detalhe/:id" element={<ActivityDetailScreen />} />
            <Route path="/atividade/historico" element={<ActivityHistoryScreen />} />
            <Route path="/alimentacao" element={<NutritionScreen />} />
            {/* O sono nao tem separador proprio: chega-se la pelo cartao do Hoje. */}
            <Route path="/sono" element={<SleepScreen />} />
            <Route path="/ia" element={<AssistantScreen />} />
            <Route path="/ia/dados" element={<ConsentScreen />} />
            {/* O plano corre-se na Atividade. O endereco antigo continua a
                funcionar: ha conversas guardadas e respostas do modelo que
                apontam para ele. */}
            <Route path="/atividade/plano" element={<RunPlanScreen />} />
            <Route path="/ia/corrida" element={<Navigate to="/atividade/plano" replace />} />
              <Route path="/perfil" element={<ProfileScreen />} />
            </Route>
          </Route>
          <Route path="*" element={<Navigate to={DEFAULT_PATH} replace />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}
