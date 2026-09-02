/** As sete perguntas do onboarding, um componente para cada uma. */

import { useEffect, type ReactElement } from 'react';
import {
  DISTANCE_UNIT_OPTIONS, GENDER_OPTIONS, GOAL_CATALOG, THEME_OPTIONS, WEIGHT_UNIT_OPTIONS,
} from '../../core/constants';
import { ageFromBirthDate } from '../../core/utils/date';
import * as format from '../../core/utils/format';
import { heightUnitFor, length, mass } from '../../core/utils/units';
import { bmi, bmiBand } from '../../domain/metrics';
import { DateField } from '../../ui/DateField';
import { Field, Input, Segmented } from '../../ui/form';
import { Metric } from '../../ui/data';
import { Card, Chip, Tag } from '../../ui/primitives';
import { PaceLogo } from '../../ui/Logo';
import type { OnboardingForm } from './useOnboardingForm';

function toNumber(raw: string): number | null {
  if (raw.trim() === '') return null;
  const value = Number(raw.replace(',', '.'));
  return Number.isFinite(value) ? value : null;
}

export function WelcomeStep(): ReactElement {
  return (
    <div className="ob-hero">
      <PaceLogo size={84} animated />
      <p className="claim balance">Organiza o teu ritmo — hábitos, treino e movimento num só sítio.</p>
      <div className="pillars">
        <Tag label="Hábitos" />
        <Tag label="Treino" />
        <Tag label="Atividade" />
        <Tag label="Alimentação" />
      </div>
    </div>
  );
}

export function NameStep({ form }: { form: OnboardingForm }): ReactElement {
  return (
    <Field htmlFor="ob-name" error={form.errors.name} hint="Usamos apenas dentro da aplicação.">
      <Input
        id="ob-name"
        value={form.draft.name}
        placeholder="O teu nome"
        autoComplete="given-name"
        maxLength={60}
        invalid={!!form.errors.name}
        onChange={(value) => form.patch({ name: value }, ['name'])}
      />
    </Field>
  );
}

export function AboutStep({ form }: { form: OnboardingForm }): ReactElement {
  const age = ageFromBirthDate(form.draft.birthDate);
  return (
    <div className="stack stack-6">
      <Field
        htmlFor="ob-birth"
        label="Data de nascimento"
        error={form.errors.birthDate}
        hint={age != null ? `${age} anos` : undefined}
      >
        <DateField
          idPrefix="ob-birth"
          value={form.draft.birthDate}
          invalid={!!form.errors.birthDate}
          onChange={(value) => form.patch({ birthDate: value }, ['birthDate'])}
        />
      </Field>
      <Field label="Género">
        <div className="chips">
          {GENDER_OPTIONS.map((option) => (
            <Chip
              key={option.id}
              label={option.label}
              pressed={form.draft.gender === option.id}
              onClick={() => form.patch({ gender: option.id })}
            />
          ))}
        </div>
      </Field>
    </div>
  );
}

export function UnitsStep({ form }: { form: OnboardingForm }): ReactElement {
  return (
    <div className="stack stack-6">
      <Field label="Peso">
        <Segmented
          ariaLabel="Unidade de peso"
          options={WEIGHT_UNIT_OPTIONS}
          value={form.draft.weightUnit}
          onChange={(id) => form.patch({ weightUnit: id })}
        />
      </Field>
      <Field label="Distância">
        <Segmented
          ariaLabel="Unidade de distância"
          options={DISTANCE_UNIT_OPTIONS}
          value={form.draft.distanceUnit}
          onChange={(id) => form.patch({ distanceUnit: id })}
        />
      </Field>
      <p className="t-sm muted-2">
        {form.draft.weightUnit === 'lb'
          ? 'A altura será pedida em pés e polegadas.'
          : 'A altura será pedida em centímetros.'}
      </p>
    </div>
  );
}

export function BodyStep({ form }: { form: OnboardingForm }): ReactElement {
  const { draft } = form;
  const imperial = draft.weightUnit === 'lb';

  const setImperialHeight = (feet: number | null, inches: number | null): void => {
    const heightCm =
      feet == null && inches == null ? null : length.ftInToCm(feet ?? 0, inches ?? 0);
    form.patch({ heightFeet: feet, heightInches: inches, heightCm }, ['height']);
  };

  return (
    <div className="stack stack-6">
      <Field htmlFor="ob-height" label="Altura" error={form.errors.height}>
        {imperial ? (
          <div className="grid-2">
            <Input
              id="ob-height"
              type="number"
              inputMode="numeric"
              unit="ft"
              value={draft.heightFeet ?? ''}
              min={3}
              max={8}
              step={1}
              invalid={!!form.errors.height}
              onChange={(value) => setImperialHeight(toNumber(value), draft.heightInches)}
            />
            <Input
              type="number"
              inputMode="numeric"
              unit="in"
              value={draft.heightInches ?? ''}
              min={0}
              max={11}
              step={1}
              invalid={!!form.errors.height}
              onChange={(value) => setImperialHeight(draft.heightFeet, toNumber(value))}
            />
          </div>
        ) : (
          <Input
            id="ob-height"
            type="number"
            inputMode="decimal"
            unit="cm"
            value={draft.heightCm ?? ''}
            placeholder="175"
            min={80}
            max={260}
            step={1}
            invalid={!!form.errors.height}
            onChange={(value) => form.patch({ heightCm: toNumber(value) }, ['height'])}
          />
        )}
      </Field>

      <Field htmlFor="ob-weight" label="Peso" error={form.errors.weight}>
        <Input
          id="ob-weight"
          type="number"
          inputMode="decimal"
          unit={draft.weightUnit}
          value={draft.weightKg == null ? '' : mass.fromKg(draft.weightKg, draft.weightUnit) ?? ''}
          placeholder={imperial ? '160' : '72'}
          min={0}
          step={0.1}
          invalid={!!form.errors.weight}
          onChange={(value) => {
            const typed = toNumber(value);
            form.patch(
              { weightKg: typed == null ? null : mass.toKg(typed, draft.weightUnit) },
              ['weight'],
            );
          }}
        />
      </Field>
    </div>
  );
}

export function GoalsStep({ form }: { form: OnboardingForm }): ReactElement {
  const wantsOther = form.draft.goalTypes.includes('other');
  return (
    <div className="stack stack-4">
      <div className="chips">
        {GOAL_CATALOG.map((goal) => (
          <Chip
            key={goal.id}
            label={goal.label}
            pressed={form.draft.goalTypes.includes(goal.id)}
            onClick={() => form.toggleGoal(goal.id)}
          />
        ))}
      </div>
      {wantsOther ? (
        <Field htmlFor="ob-custom-goal" label="Descreve o teu objetivo">
          <Input
            id="ob-custom-goal"
            value={form.draft.customGoal}
            placeholder="Ex.: preparar uma meia maratona"
            maxLength={80}
            onChange={(value) => form.patch({ customGoal: value })}
          />
        </Field>
      ) : null}
      {form.errors.goals ? (
        <p className="t-sm" style={{ color: 'var(--c-danger)' }}>{form.errors.goals}</p>
      ) : null}
    </div>
  );
}

export function SummaryStep({ form }: { form: OnboardingForm }): ReactElement {
  const { draft } = form;
  const value = bmi(draft.weightKg, draft.heightCm);
  const band = bmiBand(value);
  const age = ageFromBirthDate(draft.birthDate);

  return (
    <div className="stack stack-4">
      <Card variant="accent-card">
        <p className="t-eyebrow">Índice de massa corporal</p>
        <div className="row" style={{ alignItems: 'baseline', marginTop: '0.5rem' }}>
          <span className="t-display">{value == null ? '—' : format.number(value, 1)}</span>
          {band ? <span className="t-h2 muted">{band.label}</span> : null}
        </div>
        <p className="t-sm muted" style={{ marginTop: '0.75rem' }}>
          Valor estimado, calculado a partir da altura e do peso. Não é um
          diagnóstico médico nem considera composição corporal.
        </p>
      </Card>
      <div className="grid-2">
        <Metric
          label="Peso"
          value={format.weight(draft.weightKg, draft.weightUnit, false)}
          suffix={draft.weightUnit}
        />
        <Metric
          label="Altura"
          value={format.height(draft.heightCm, heightUnitFor(draft.weightUnit))}
        />
        <Metric label="Idade" value={age == null ? '—' : String(age)} suffix="anos" />
        <Metric
          label="Objetivos"
          value={String(draft.goalTypes.length)}
          suffix={draft.goalTypes.length === 1 ? 'ativo' : 'ativos'}
        />
      </div>
    </div>
  );
}

/**
 * O tema, perguntado uma vez e aplicado logo.
 *
 * Aplicar ao vivo é metade da pergunta: ninguém escolhe um tema por um rótulo,
 * escolhe por ver a aplicação mudar à frente.
 */
export function ThemeStep({ form }: { form: OnboardingForm }): ReactElement {
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', form.draft.theme);
  }, [form.draft.theme]);

  return (
    <div className="stack stack-6">
      <div className="theme-picker">
        {THEME_OPTIONS.map((option) => (
          <button
            key={option.id}
            type="button"
            className="theme-card"
            data-theme-preview={option.id}
            aria-pressed={form.draft.theme === option.id}
            onClick={() => form.patch({ theme: option.id })}
          >
            <span className="theme-preview" aria-hidden="true">
              <i className="bar" />
              <i className="bar short" />
              <i className="dot" />
            </span>
            <span className="label">{option.id === 'light' ? '☀︎ Claro' : '☾ Escuro'}</span>
          </button>
        ))}
      </div>
      <p className="t-sm muted-2">
        Podes trocar quando quiseres, no perfil.
      </p>
    </div>
  );
}
