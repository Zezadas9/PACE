/**
 * Onboarding state machine.
 *
 * The draft lives in memory until the final step, where profileService turns it
 * into a User plus its Goal records. Validation is per step, and a message
 * clears the moment its own field changes.
 */

import { useCallback, useMemo, useState } from 'react';
import type { GoalType } from '../../core/types';
import { MAX_AGE, MIN_AGE } from '../../core/constants';
import { ageFromBirthDate, isValidKey, todayKey } from '../../core/utils/date';
import { LIMITS } from '../../domain/metrics';
import type { OnboardingDraft } from '../../services/profile';

export const STEP_COUNT = 7;

export type ErrorKey = 'name' | 'birthDate' | 'height' | 'weight' | 'goals';
export type Errors = Partial<Record<ErrorKey, string>>;

/** Imperial height is captured as two fields but stored as one. */
export interface Draft extends OnboardingDraft {
  heightFeet: number | null;
  heightInches: number | null;
}

const INITIAL: Draft = {
  name: '',
  // O tema arranca escuro e muda ao vivo no passo que o pergunta.
  theme: 'dark',
  birthDate: null,
  gender: 'undisclosed',
  weightUnit: 'kg',
  distanceUnit: 'km',
  heightCm: null,
  weightKg: null,
  heightFeet: null,
  heightInches: null,
  goalTypes: [],
  customGoal: '',
};

export function validateStep(step: number, draft: Draft): Errors {
  const errors: Errors = {};

  if (step === 1 && !draft.name.trim()) {
    errors.name = 'Escreve o teu nome para continuarmos.';
  }

  if (step === 2) {
    const age = ageFromBirthDate(draft.birthDate);
    if (!draft.birthDate || !isValidKey(draft.birthDate)) {
      errors.birthDate = 'Indica o dia, o mês e o ano.';
    } else if (draft.birthDate > todayKey()) {
      errors.birthDate = 'A data de nascimento está no futuro.';
    } else if (age == null || age < MIN_AGE || age > MAX_AGE) {
      errors.birthDate = `A idade tem de estar entre ${MIN_AGE} e ${MAX_AGE} anos.`;
    }
  }

  if (step === 4) {
    const { heightCm, weightKg } = draft;
    if (heightCm == null || heightCm < LIMITS.MIN_HEIGHT_CM || heightCm > LIMITS.MAX_HEIGHT_CM) {
      errors.height = 'Altura fora do intervalo esperado.';
    }
    if (weightKg == null || weightKg < LIMITS.MIN_WEIGHT_KG || weightKg > LIMITS.MAX_WEIGHT_KG) {
      errors.weight = 'Peso fora do intervalo esperado.';
    }
  }

  if (step === 5 && draft.goalTypes.length === 0) {
    errors.goals = 'Escolhe pelo menos um objetivo.';
  }

  return errors;
}

export interface OnboardingForm {
  step: number;
  draft: Draft;
  errors: Errors;
  progress: number;
  patch: (changes: Partial<Draft>, clears?: ErrorKey[]) => void;
  toggleGoal: (goal: GoalType) => void;
  next: () => void;
  back: () => void;
}

export function useOnboardingForm(): OnboardingForm {
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<Draft>(INITIAL);
  const [errors, setErrors] = useState<Errors>({});

  const patch = useCallback((changes: Partial<Draft>, clears: ErrorKey[] = []) => {
    setDraft((current) => ({ ...current, ...changes }));
    if (clears.length > 0) {
      setErrors((current) => {
        const next = { ...current };
        for (const key of clears) delete next[key];
        return next;
      });
    }
  }, []);

  const toggleGoal = useCallback((goal: GoalType) => {
    setDraft((current) => {
      const selected = current.goalTypes.includes(goal);
      return {
        ...current,
        goalTypes: selected
          ? current.goalTypes.filter((candidate) => candidate !== goal)
          : [...current.goalTypes, goal],
      };
    });
    setErrors((current) => {
      const next = { ...current };
      delete next.goals;
      return next;
    });
  }, []);

  const next = useCallback(() => {
    const found = validateStep(step, draft);
    if (Object.keys(found).length > 0) {
      setErrors(found);
      return;
    }
    setErrors({});
    setStep((current) => Math.min(current + 1, STEP_COUNT));
  }, [step, draft]);

  const back = useCallback(() => {
    setErrors({});
    setStep((current) => Math.max(current - 1, 0));
  }, []);

  const progress = useMemo(() => Math.max(0, step) / STEP_COUNT, [step]);

  return { step, draft, errors, progress, patch, toggleGoal, next, back };
}
