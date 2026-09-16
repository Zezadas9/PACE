/**
 * "Preparado?" — o ecrã antes de a atividade começar.
 *
 * Serve três coisas, por esta ordem de importância: dizer se o GPS vai estar
 * disponível *antes* de a pessoa sair de casa, mostrar o que está em aberto
 * para hoje, e só depois começar. Descobrir a meio de uma corrida que a
 * localização estava negada é tarde de mais.
 */

import { useCallback, useEffect, useMemo, useState, type ReactElement } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ACTIVITY_LABELS, ACTIVITY_TYPE_OPTIONS } from '../../core/constants';
import type { ActivityType } from '../../core/types';
import * as format from '../../core/utils/format';
import { goalProgress, startSession } from '../../services/activity';
import { runPlanView } from '../../services/coach';
import { describeSession } from '../assistant/RunPlanScreen';
import { useVoice } from '../guidance/useVoice';
import { useApp, useFeedback, usePreferences, useStoreVersion } from '../../app/providers/appContext';
import { Screen } from '../../app/navigation/Screen';
import { Button, Card } from '../../ui/primitives';
import { Icon } from '../../ui/Icon';
import { BrandIcon } from '../../ui/BrandIcon';
import { ProgressBar } from '../../ui/data';
import { PageHeader } from '../../ui/page';
import { brandIconFor, iconFor } from './ActivityScreen';
import { describeGoal } from './ActivityGoalForm';

type GpsState = 'checking' | 'ready' | 'ask' | 'denied' | 'unsupported';

const GPS_COPY: Record<GpsState, { label: string; body: string }> = {
  checking: { label: 'A verificar…', body: 'A ver se a localização está disponível.' },
  ready: { label: 'GPS pronto', body: 'A distância e o percurso vão ser registados.' },
  ask: {
    label: 'GPS por autorizar',
    body: 'A localização vai ser pedida ao começar. Sem ela, o tempo conta na mesma.',
  },
  denied: {
    label: 'Sem GPS',
    body: 'A localização está bloqueada nas definições do sistema. O tempo conta na mesma e a distância pode ser escrita no fim.',
  },
  unsupported: {
    label: 'Sem GPS',
    body: 'Este aparelho não dá localização. O tempo conta na mesma e a distância pode ser escrita no fim.',
  },
};

export function ActivityPrepareScreen(): ReactElement {
  const { repos, platform } = useApp();
  const feedback = useFeedback();
  const preferences = usePreferences();
  const navigate = useNavigate();
  const version = useStoreVersion();
  const params = useParams<{ type: string }>();
  const [search] = useSearchParams();
  const voice = useVoice();

  // Vem do plano de corrida: a sessão que esta corrida vai cumprir.
  const planSessionId = search.get('plano');
  const planSession = useMemo(() => {
    if (!planSessionId) return null;
    return runPlanView(repos)?.plan.sessions.find((item) => item.id === planSessionId) ?? null;
  }, [repos, planSessionId, version]);

  const type = (ACTIVITY_TYPE_OPTIONS.find((option) => option.id === params.type)?.id
    ?? 'run') as ActivityType;

  const [gps, setGps] = useState<GpsState>('checking');

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const available = await platform.geolocation.isAvailable();
      if (cancelled) return;
      if (!available) { setGps('unsupported'); return; }
      const state = await platform.geolocation.checkPermission();
      if (cancelled) return;
      setGps(state === 'granted' ? 'ready' : state === 'denied' ? 'denied' : 'ask');
    })();
    return () => { cancelled = true; };
  }, [platform]);

  // Só os objetivos que esta atividade pode cumprir. Um objetivo de bicicleta
  // não tem nada que estar à frente de quem vai correr.
  const goals = useMemo(
    () => goalProgress(repos).filter(
      (progress) => !progress.goal.activityType || progress.goal.activityType === type,
    ),
    [repos, type, version],
  );

  const begin = useCallback(() => {
    // Este toque é o que deixa a voz falar no iPhone — tem de ser aqui, e não
    // já no ecrã seguinte, onde a primeira frase sai sem toque nenhum.
    if (voice.on) platform.voice.unlock();
    startSession(repos, type, undefined, planSession?.id ?? null);
    feedback.touch('medium');
    navigate('/atividade/sessao', { replace: true });
  }, [repos, platform, type, planSession, voice.on, feedback, navigate]);

  const brand = brandIconFor(type);
  const copy = GPS_COPY[gps];

  return (
    <Screen>
      <PageHeader
        eyebrow="Preparado?"
        title={ACTIVITY_LABELS[type]}
        subtitle="Confirma antes de começar."
      />

      <Card>
        <div className="row">
          <span className="start-art">
            {brand ? <BrandIcon name={brand} size={44} float /> : <Icon name={iconFor(type)} />}
          </span>
          <div className="grow" style={{ marginLeft: '0.75rem' }}>
            <p className="t-eyebrow">Vais registar</p>
            <p className="t-h2">{ACTIVITY_LABELS[type]}</p>
          </div>
        </div>
      </Card>

      {planSession ? (
        <Card>
          <p className="t-eyebrow">Sessão do plano</p>
          <p className="t-h2" style={{ marginTop: '0.15rem' }}>
            {describeSession(planSession, preferences.distanceUnit)}
          </p>
          <p className="t-sm muted" style={{ marginTop: '0.35rem' }}>
            {voice.on
              ? 'Começa com 5 minutos a caminhar. Uma voz vai dizer-te o que fazer em cada momento — podes deixar o telemóvel no bolso.'
              : 'Começa com 5 minutos a caminhar. O ecrã mostra o que fazer em cada momento.'}
          </p>
        </Card>
      ) : null}

      <Card variant="quiet">
        <div className="row row-between">
          <div className="grow">
            <p className="t-eyebrow">Localização</p>
            <p className="t-h3" style={{ marginTop: '0.15rem' }}>{copy.label}</p>
            <p className="t-sm muted" style={{ marginTop: '0.35rem' }}>{copy.body}</p>
          </div>
          <span className={`gps-badge gps-${gpsTone(gps)}`}>
            <Icon name="pin" />
          </span>
        </div>
        {gps === 'ask' ? (
          <div style={{ marginTop: '0.75rem' }}>
            <Button
              variant="outline"
              block
              label="Autorizar localização"
              onClick={() => {
                void platform.geolocation.requestPermission().then((state) => {
                  setGps(state === 'granted' ? 'ready' : state === 'denied' ? 'denied' : 'ask');
                });
              }}
            />
          </div>
        ) : null}
      </Card>

      {goals.length > 0 ? (
        <section>
          <p className="t-eyebrow">Em aberto</p>
          <div className="stack stack-3" style={{ marginTop: '0.5rem' }}>
            {goals.slice(0, 3).map((progress) => (
              <Card key={progress.goal.id} variant="quiet">
                <div className="row row-between">
                  <span className="t-sm">
                    {progress.goal.title || describeGoal(progress.goal, preferences.distanceUnit)}
                  </span>
                  <span className="t-num t-sm">{Math.round(progress.ratio * 100)}%</span>
                </div>
                <ProgressBar ratio={progress.ratio} />
                <p className="t-sm muted-2" style={{ marginTop: '0.35rem' }}>
                  {progress.current == null
                    ? 'Ainda sem registos neste período.'
                    : progress.complete
                      ? 'Já está cumprido — o que fizeres hoje é a mais.'
                      : `Faltam ${remaining(progress.goal.metric, progress.remaining, preferences.distanceUnit)}.`}
                </p>
              </Card>
            ))}
          </div>
        </section>
      ) : null}

      <div className="live-actions">
        <Button variant="outline" block label="Voltar" onClick={() => navigate('/atividade')} />
        <Button variant="primary" block icon="play" label="Começar" onClick={begin} />
      </div>
    </Screen>
  );
}

function gpsTone(state: GpsState): string {
  if (state === 'ready') return 'live';
  if (state === 'checking') return 'waiting';
  return 'off';
}

function remaining(metric: string, value: number, unit: 'km' | 'mi'): string {
  if (metric === 'distance') return format.distance(value, unit);
  if (metric === 'duration') return format.duration(value);
  if (metric === 'pace') return `${format.duration(value)} por ${unit}`;
  if (metric === 'speed') return `${format.number(value / 10, 1)} ${unit}/h`;
  return `${value} ${value === 1 ? 'vez' : 'vezes'}`;
}
