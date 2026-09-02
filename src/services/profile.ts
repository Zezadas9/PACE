/**
 * PACE — Profile service.
 *
 * Business rules around the user record: building it from the onboarding
 * answers, editing it later, and turning it into presentable metrics. Screens
 * call this; they never assemble a User themselves.
 */

import { GOAL_CATALOG, APP } from '../core/constants';
import { createUser } from '../core/factories';
import type {
  DayKey, DistanceUnit, Gender, Goal, GoalType, ThemePreference, User, WeightUnit,
} from '../core/types';
import { heightUnitFor } from '../core/utils/units';
import { profileMetrics, type ProfileMetrics } from '../domain/metrics';
import type { Repositories } from '../data/repositories';

export interface OnboardingDraft {
  name: string;
  /** Escolhido no onboarding: a PACE nunca pergunta o tema duas vezes. */
  theme: ThemePreference;
  birthDate: DayKey | null;
  gender: Gender;
  weightUnit: WeightUnit;
  distanceUnit: DistanceUnit;
  heightCm: number | null;
  weightKg: number | null;
  goalTypes: GoalType[];
  customGoal: string;
}

function resolveTimezone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? null;
  } catch {
    return null;
  }
}

function labelFor(type: GoalType, customGoal: string): string {
  if (type === 'other' && customGoal.trim()) return customGoal.trim();
  return GOAL_CATALOG.find((entry) => entry.id === type)?.label ?? type;
}

/** Turn the onboarding draft into a persisted User plus its Goal records. */
export function completeOnboarding(repos: Repositories, draft: OnboardingDraft): User {
  const goals = draft.goalTypes.map((type) =>
    repos.goals.create({ type, label: labelFor(type, draft.customGoal), active: true }),
  );

  const user = createUser({
    name: draft.name.trim(),
    birthDate: draft.birthDate,
    gender: draft.gender,
    body: {
      heightCm: draft.heightCm,
      weightKg: draft.weightKg,
      measuredAt: new Date().toISOString(),
    },
    preferences: {
      weightUnit: draft.weightUnit,
      distanceUnit: draft.distanceUnit,
      heightUnit: heightUnitFor(draft.weightUnit),
      locale: APP.locale,
      theme: draft.theme,
      timezone: resolveTimezone(),
    },
    goalIds: goals.map((goal) => goal.id),
    onboardingCompleted: true,
    onboardingCompletedAt: new Date().toISOString(),
  });

  return repos.user.set(user);
}

export function updateBody(
  repos: Repositories,
  patch: Partial<{ heightCm: number; weightKg: number }>,
): User | null {
  const user = repos.user.get();
  if (!user) return null;
  return repos.user.update({
    body: { ...user.body, ...patch, measuredAt: new Date().toISOString() },
  });
}

/** Guarda a cara escolhida: iniciais, avatar da galeria ou fotografia. */
export function setAvatar(repos: Repositories, avatar: User['avatar']): User | null {
  const user = repos.user.get();
  if (!user) return null;
  return repos.user.update({ avatar });
}

export function updatePreferences(
  repos: Repositories,
  patch: Partial<User['preferences']>,
): User | null {
  const user = repos.user.get();
  if (!user) return null;
  const preferences = { ...user.preferences, ...patch };
  // Height display follows the weight system, so the two never disagree.
  if (patch.weightUnit) preferences.heightUnit = heightUnitFor(patch.weightUnit);
  return repos.user.update({ preferences });
}

/** The user goals, resolved from ids to records. */
export function goalsOf(repos: Repositories): Goal[] {
  const user = repos.user.get();
  if (!user) return [];
  return user.goalIds
    .map((id) => repos.goals.byId(id))
    .filter((goal): goal is Goal => goal !== null);
}

export function setGoals(
  repos: Repositories,
  goalTypes: GoalType[],
  customGoal = '',
): User | null {
  const user = repos.user.get();
  if (!user) return null;
  // Replace rather than diff: goals are few, and this leaves no orphans.
  for (const id of user.goalIds) repos.goals.remove(id);
  const goals = goalTypes.map((type) =>
    repos.goals.create({ type, label: labelFor(type, customGoal), active: true }),
  );
  return repos.user.update({ goalIds: goals.map((goal) => goal.id) });
}

export interface ProfileSummary {
  user: User;
  metrics: ProfileMetrics;
  goals: Goal[];
}

export function summary(repos: Repositories): ProfileSummary | null {
  const user = repos.user.get();
  if (!user) return null;
  const metrics = profileMetrics(user);
  if (!metrics) return null;
  return { user, metrics, goals: goalsOf(repos) };
}
