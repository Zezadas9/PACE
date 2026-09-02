/**
 * Perfil — the user record made visible and editable.
 *
 * Body edits commit on blur rather than on every keystroke, so a half-typed
 * "1" never lands in storage as a height of one centimetre.
 */

import { useMemo, useState, type ReactElement } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  DISTANCE_UNIT_OPTIONS, GENDER_OPTIONS, GOAL_CATALOG, ONBOARDING_PATH, APP,
} from '../../core/constants';
import type { GoalType } from '../../core/types';
import * as format from '../../core/utils/format';
import { length, mass } from '../../core/utils/units';
import {
  setAvatar, setGoals, summary as profileSummary, updateBody, updatePreferences,
  type ProfileSummary,
} from '../../services/profile';
import { useApp, useFeedback, useStoreVersion } from '../../app/providers/appContext';
import { useUi } from '../../app/providers/uiContext';
import { Screen } from '../../app/navigation/Screen';
import { Card, Chip, SectionHeader } from '../../ui/primitives';
import { Avatar } from '../../ui/Avatar';
import { Icon } from '../../ui/Icon';
import { AvatarSheet } from './AvatarSheet';
import { EmptyState, Metric, Row, Rows } from '../../ui/data';
import { BrandIcon } from '../../ui/BrandIcon';
import { Field, Input, Segmented } from '../../ui/form';
import { AppearanceSection } from './AppearanceSection';
import { FeedbackSection } from './FeedbackSection';
import { IdentitySection } from './IdentitySection';
import { NotificationsSection } from './NotificationsSection';
import type { Repositories } from '../../data/repositories';

function toNumber(raw: string): number | null {
  if (raw.trim() === '') return null;
  const value = Number(raw.replace(',', '.'));
  return Number.isFinite(value) ? value : null;
}

export function ProfileScreen(): ReactElement {
  const { repos } = useApp();
  const version = useStoreVersion();
  const summary = useMemo(() => profileSummary(repos), [repos, version]);

  if (!summary) {
    return (
      <Screen>
        <EmptyState
          brand="perfil"
          title="Sem perfil"
          body="Conclui o onboarding para criar o teu perfil."
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <ProfileHead summary={summary} />
      <IdentitySection user={summary.user} />
      <MetricsSection summary={summary} />
      <BodySection summary={summary} repos={repos} />
      <AppearanceSection />
      <UnitsSection summary={summary} repos={repos} />
      <GoalsSection summary={summary} repos={repos} />
      <NotificationsSection />
      <FeedbackSection />
      <DataSection />
    </Screen>
  );
}

function ProfileHead({ summary }: { summary: ProfileSummary }): ReactElement {
  const { repos } = useApp();
  const feedback = useFeedback();
  const { toast } = useUi();
  const [picking, setPicking] = useState(false);
  const { user, metrics } = summary;
  const genderLabel = GENDER_OPTIONS.find((option) => option.id === user.gender)?.label;
  const subtitle = [
    metrics.ageYears != null ? `${metrics.ageYears} anos` : null,
    genderLabel && user.gender !== 'undisclosed' ? genderLabel : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <>
      <header className="profile-head">
        <button
          type="button"
          className="avatar-button"
          aria-label="Mudar a foto de perfil"
          onClick={() => setPicking(true)}
        >
          <Avatar name={user.name} avatar={user.avatar} size={72} />
          <span className="avatar-edit" aria-hidden="true"><Icon name="camera" /></span>
        </button>
        <div>
          <h1 className="t-title">{user.name || 'Sem nome'}</h1>
          <p className="t-sm muted-2" style={{ marginTop: '0.25rem' }}>
            {subtitle || 'Perfil pessoal'}
          </p>
        </div>
      </header>

      {picking ? (
        <AvatarSheet
          current={user.avatar}
          onClose={() => setPicking(false)}
          onChoose={(avatar) => {
            setAvatar(repos, avatar);
            feedback.touch();
            setPicking(false);
            toast(avatar.kind === 'initials' ? 'Voltaste às iniciais.' : 'Foto de perfil atualizada.');
          }}
        />
      ) : null}
    </>
  );
}

/**
 * O coração do IMC muda de cor com a faixa.
 *
 * Azul, verde e vermelho são as três faixas da folha de ícones, e não um juízo
 * sobre ninguém: o cartão continua a dizer, por baixo, que isto é uma
 * estimativa e não um diagnóstico.
 */
function bmiIcon(value: number | null): 'saude' | 'imc-baixo' | 'imc-normal' | 'imc-alto' {
  if (value == null) return 'saude';
  if (value < 18.5) return 'imc-baixo';
  if (value < 25) return 'imc-normal';
  return 'imc-alto';
}

function MetricsSection({ summary }: { summary: ProfileSummary }): ReactElement {
  const { metrics, user } = summary;
  const preferences = user.preferences;

  return (
    <section>
      <SectionHeader title="Métricas" />
      <div className="stack stack-3">
        <div className="grid-2">
          <Metric
            label="Peso"
            value={format.weight(metrics.weightKg, preferences.weightUnit, false)}
            suffix={preferences.weightUnit}
          />
          <Metric label="Altura" value={format.height(metrics.heightCm, preferences.heightUnit)} />
          <Metric
            label="Idade"
            value={metrics.ageYears == null ? '—' : String(metrics.ageYears)}
            suffix="anos"
          />
          <Metric
            label="IMC"
            value={metrics.bmi == null ? '—' : format.number(metrics.bmi, 1)}
          />
        </div>
        <Card className="bmi-card">
          <div className="row row-between">
            <div>
              <p className="t-eyebrow">Índice de massa corporal</p>
              <p className="t-h1" style={{ marginTop: '0.35rem' }}>
                {metrics.bmiLabel ?? 'Sem dados suficientes'}
              </p>
            </div>
            <BrandIcon name={bmiIcon(metrics.bmi)} size={44} float />
          </div>
          <div className="scale" aria-hidden="true">
            {metrics.bmiScalePosition != null ? (
              <span
                className="knob"
                style={{ left: `${metrics.bmiScalePosition * 100}%` }}
              />
            ) : null}
          </div>
          <div className="scale-legend">
            <span>15</span>
            <span>25</span>
            <span>40</span>
          </div>
          {metrics.healthyWeightRangeKg ? (
            <p className="t-sm muted" style={{ marginTop: '0.75rem' }}>
              Intervalo de referência para a tua altura:{' '}
              {format.weight(metrics.healthyWeightRangeKg.minKg, preferences.weightUnit, false)} a{' '}
              {format.weight(metrics.healthyWeightRangeKg.maxKg, preferences.weightUnit)}
            </p>
          ) : null}
          <p className="disclaimer" style={{ marginTop: '0.5rem' }}>
            O IMC é uma métrica estimada, calculada a partir da altura e do peso.
            Não é um diagnóstico médico, não considera composição corporal e não
            substitui aconselhamento profissional.
          </p>
        </Card>
      </div>
    </section>
  );
}

function BodySection({
  summary, repos,
}: {
  summary: ProfileSummary;
  repos: Repositories;
}): ReactElement {
  const { toast } = useUi();
  const preferences = summary.user.preferences;
  const heightCm = summary.metrics.heightCm;
  const weightKg = summary.metrics.weightKg;
  const imperial = preferences.heightUnit === 'ft_in';
  const feetInches = heightCm != null ? length.cmToFtIn(heightCm) : { feet: 0, inches: 0 };

  // These fields commit on blur, so they are uncontrolled: React must not own
  // the value while the user is mid-edit. The key remounts them when the stored
  // value or the display unit changes underneath.
  const heightKey = `h-${preferences.heightUnit}-${heightCm ?? 'x'}`;
  const weightKey = `w-${preferences.weightUnit}-${weightKg ?? 'x'}`;

  const commitHeight = (feet: number | null, inches: number | null): void => {
    if (feet == null && inches == null) return;
    updateBody(repos, { heightCm: length.ftInToCm(feet ?? 0, inches ?? 0) });
  };

  return (
    <section>
      <SectionHeader title="Corpo" />
      <Card>
        <div className="stack stack-5">
          <Field label="Altura">
            {imperial ? (
              <div className="grid-2">
                <Input
                  key={`${heightKey}-ft`}
                  type="number"
                  inputMode="numeric"
                  unit="ft"
                  defaultValue={heightCm == null ? '' : feetInches.feet}
                  min={3}
                  max={8}
                  step={1}
                  onBlur={(value) => commitHeight(toNumber(value), feetInches.inches)}
                />
                <Input
                  key={`${heightKey}-in`}
                  type="number"
                  inputMode="numeric"
                  unit="in"
                  defaultValue={heightCm == null ? '' : feetInches.inches}
                  min={0}
                  max={11}
                  step={1}
                  onBlur={(value) => commitHeight(feetInches.feet, toNumber(value))}
                />
              </div>
            ) : (
              <Input
                key={heightKey}
                type="number"
                inputMode="decimal"
                unit="cm"
                defaultValue={heightCm ?? ''}
                min={80}
                max={260}
                step={1}
                onBlur={(value) => {
                  const cm = toNumber(value);
                  if (cm != null) updateBody(repos, { heightCm: cm });
                }}
              />
            )}
          </Field>
          <Field label="Peso">
            <Input
              key={weightKey}
              type="number"
              inputMode="decimal"
              unit={preferences.weightUnit}
              defaultValue={
                weightKg == null ? '' : mass.fromKg(weightKg, preferences.weightUnit) ?? ''
              }
              min={0}
              step={0.1}
              onBlur={(value) => {
                const typed = toNumber(value);
                if (typed == null) return;
                const next = mass.toKg(typed, preferences.weightUnit);
                if (next == null || next === weightKg) return;
                updateBody(repos, { weightKg: next });
                toast('Peso atualizado.');
              }}
            />
          </Field>
        </div>
      </Card>
    </section>
  );
}

function UnitsSection({
  summary, repos,
}: {
  summary: ProfileSummary;
  repos: Repositories;
}): ReactElement {
  const preferences = summary.user.preferences;
  return (
    <section>
      <SectionHeader title="Unidades" />
      <Card>
        <div className="stack stack-5">
          <Field label="Peso e altura">
            <Segmented
              ariaLabel="Unidade de peso"
              value={preferences.weightUnit}
              options={[
                { id: 'kg', label: 'kg / cm' },
                { id: 'lb', label: 'lb / ft' },
              ]}
              onChange={(id) => updatePreferences(repos, { weightUnit: id })}
            />
          </Field>
          <Field label="Distância">
            <Segmented
              ariaLabel="Unidade de distância"
              value={preferences.distanceUnit}
              options={DISTANCE_UNIT_OPTIONS.map((option) => ({
                id: option.id,
                label: option.id,
              }))}
              onChange={(id) => updatePreferences(repos, { distanceUnit: id })}
            />
          </Field>
        </div>
      </Card>
    </section>
  );
}

function GoalsSection({
  summary, repos,
}: {
  summary: ProfileSummary;
  repos: Repositories;
}): ReactElement {
  const selected = summary.goals.map((goal) => goal.type);
  const custom = summary.goals.find((goal) => goal.type === 'other')?.label ?? '';

  const toggle = (goal: GoalType): void => {
    const next = selected.includes(goal)
      ? selected.filter((candidate) => candidate !== goal)
      : [...selected, goal];
    setGoals(repos, next, custom);
  };

  return (
    <section>
      <SectionHeader title="Objetivos" />
      <Card>
        <div className="stack stack-4">
          <div className="chips">
            {GOAL_CATALOG.map((goal) => (
              <Chip
                key={goal.id}
                label={goal.label}
                pressed={selected.includes(goal.id)}
                onClick={() => toggle(goal.id)}
              />
            ))}
          </div>
          <p className="t-sm muted-2">
            {selected.length > 0
              ? 'Estes objetivos vão orientar as sugestões numa fase futura.'
              : 'Escolhe pelo menos um objetivo.'}
          </p>
        </div>
      </Card>
    </section>
  );
}

function DataSection(): ReactElement {
  const { store, platform } = useApp();
  const { confirm } = useUi();
  const navigate = useNavigate();

  const reset = async (): Promise<void> => {
    const ok = await confirm({
      title: 'Repor a aplicação?',
      body: 'Apaga o perfil e todos os registos guardados neste dispositivo. Não é reversível.',
      confirmLabel: 'Apagar tudo',
      danger: true,
    });
    if (!ok) return;
    await store.reset();
    navigate(ONBOARDING_PATH, { replace: true });
  };

  return (
    <section>
      <SectionHeader title="Dados" />
      <Card variant="flush">
        <Rows>
          <Row
            icon="lock"
            title="Guardados neste dispositivo"
            sub={
              store.degraded
                ? 'Armazenamento indisponível — os dados não persistem'
                : `Via ${platform.storage.name}. Nada é enviado para servidores nesta fase.`
            }
          />
          <Row
            brand="caixote"
            title="Repor aplicação"
            sub="Apaga o perfil e todos os registos locais"
            chevron
            onClick={() => void reset()}
          />
        </Rows>
      </Card>
      <p className="t-sm muted-2" style={{ marginTop: '0.75rem' }}>
        PACE {APP.version} · {platform.info.platform}
        {platform.info.isNative ? ' (nativo)' : ''}
      </p>
    </section>
  );
}
