/**
 * Onboarding.
 *
 * Six questions, one per screen, so it never reads as a form. The chrome
 * (progress rail, back button, footer action) is constant; only the body and
 * the copy change.
 */

import { useCallback, type ReactElement } from 'react';
import { useNavigate } from 'react-router-dom';
import { DEFAULT_PATH } from '../../core/constants';
import { firstName } from '../../core/utils/format';
import { seed } from '../../data/seed';
import { completeOnboarding } from '../../services/profile';
import { useApp, useFeedback } from '../../app/providers/appContext';
import { useUi } from '../../app/providers/uiContext';
import { Button, IconButton } from '../../ui/primitives';
import {
  AboutStep, BodyStep, GoalsStep, NameStep, SummaryStep, ThemeStep, UnitsStep, WelcomeStep,
} from './steps';
import { STEP_COUNT, useOnboardingForm, type OnboardingForm } from './useOnboardingForm';

interface StepCopy {
  eyebrow?: string;
  title?: string;
  subtitle?: string;
  action: string;
  hint?: string;
}

const COPY: StepCopy[] = [
  { action: 'Começar', hint: 'Demora menos de um minuto.' },
  { eyebrow: 'Passo 1 de 7', title: 'Como te chamamos?', action: 'Continuar' },
  {
    eyebrow: 'Passo 2 de 7',
    title: 'Um pouco sobre ti',
    subtitle: 'A idade ajuda a contextualizar as tuas métricas.',
    action: 'Continuar',
  },
  {
    eyebrow: 'Passo 3 de 7',
    title: 'Que unidades preferes?',
    subtitle: 'Podes mudar a qualquer momento no perfil.',
    action: 'Continuar',
  },
  {
    eyebrow: 'Passo 4 de 7',
    title: 'Altura e peso',
    subtitle: 'Só para estimar as tuas métricas iniciais.',
    action: 'Continuar',
  },
  {
    eyebrow: 'Passo 5 de 7',
    title: 'O que queres alcançar?',
    subtitle: 'Escolhe tudo o que se aplica.',
    action: 'Continuar',
  },
  {
    eyebrow: 'Passo 6 de 7',
    title: 'Como preferes usar a PACE?',
    subtitle: 'Escolhe o tema. Fica assim até tu quereres outra coisa.',
    action: 'Continuar',
  },
  { eyebrow: 'Passo 7 de 7', title: 'As tuas métricas iniciais', action: 'Entrar na PACE' },
];

function StepBody({ step, form }: { step: number; form: OnboardingForm }): ReactElement {
  switch (step) {
    case 0: return <WelcomeStep />;
    case 1: return <NameStep form={form} />;
    case 2: return <AboutStep form={form} />;
    case 3: return <UnitsStep form={form} />;
    case 4: return <BodyStep form={form} />;
    case 5: return <GoalsStep form={form} />;
    case 6: return <ThemeStep form={form} />;
    default: return <SummaryStep form={form} />;
  }
}

export function OnboardingScreen(): ReactElement {
  const form = useOnboardingForm();
  const { repos, store } = useApp();
  const feedback = useFeedback();
  const { toast } = useUi();
  const navigate = useNavigate();

  const finish = useCallback(async () => {
    const { heightFeet: _feet, heightInches: _inches, ...draft } = form.draft;
    completeOnboarding(repos, draft);
    seed(repos);
    await store.flush();
    feedback.play('success');
    navigate(DEFAULT_PATH, { replace: true });
    toast(`Bem-vindo à PACE, ${firstName(draft.name)}.`);
  }, [form.draft, repos, store, feedback, navigate, toast]);

  const copy = COPY[form.step]!;
  const isLast = form.step === STEP_COUNT;

  return (
    <div className="screen" data-state="entering">
      <div className="ob">
        <div className="ob-top" style={{ visibility: form.step === 0 ? 'hidden' : 'visible' }}>
          <IconButton icon="chevronLeft" label="Voltar" onClick={form.back} />
          <div className="ob-progress">
            <i style={{ width: `${Math.round(form.progress * 100)}%` }} />
          </div>
        </div>

        <div className="ob-step">
          <div className="ob-lede">
            {copy.eyebrow ? <p className="t-eyebrow">{copy.eyebrow}</p> : null}
            {copy.title ? <h1 className="t-title balance">{copy.title}</h1> : null}
            {copy.subtitle ? <p>{copy.subtitle}</p> : null}
          </div>
          {/* Keyed so each step animates in rather than swapping silently. */}
          <div className="ob-body stagger" key={form.step}>
            <StepBody step={form.step} form={form} />
          </div>
        </div>

        <div className="ob-foot">
          <Button
            variant="primary"
            block
            label={copy.action}
            onClick={isLast ? () => void finish() : form.next}
          />
          {copy.hint ? <p className="t-sm muted-2 center">{copy.hint}</p> : null}
        </div>
      </div>
    </div>
  );
}
