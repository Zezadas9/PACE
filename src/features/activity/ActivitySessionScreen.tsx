/**
 * The live activity.
 *
 * Full screen, no tab bar, three numbers and two buttons. This is read at a
 * glance while moving, sometimes in sunlight, sometimes at a run — so the
 * primary metric is enormous and the controls are thumb-sized.
 *
 * Location arrives through the platform port. On the web that is the browser
 * API, which stops when the screen sleeps; on device it becomes the native one
 * with background permission, and nothing on this screen changes.
 *
 * Quando a corrida é uma sessão do plano, há mais uma coisa por cima dos
 * números: a fase em que se está, o tempo que falta, e uma voz que diz o que
 * fazer. É para ser seguida sem olhar para o telemóvel.
 */

import { useCallback, useEffect, useMemo, useState, type ReactElement } from 'react';
import { useNavigate } from 'react-router-dom';
import { ACTIVITY_LABELS } from '../../core/constants';
import * as format from '../../core/utils/format';
import * as activity from '../../domain/activity';
import { runGuide } from '../../domain/guidance';
import {
  activeSession, finishSession, pauseSession, resumeSession, trackSession,
} from '../../services/activity';
import { completeRunSession, runPlanView } from '../../services/coach';
import {
  useApp, useFeedback, usePreferences, useStoreVersion,
} from '../../app/providers/appContext';
import { useUi } from '../../app/providers/uiContext';
import { clock, useTicker } from '../workout/useTicker';
import { Icon } from '../../ui/Icon';
import { Button } from '../../ui/primitives';
import { ActivitySummarySheet } from './ActivitySummarySheet';
import { RunGuideCard, useDistanceGuide, useRunGuide } from '../guidance/RunGuide';
import { useVoice } from '../guidance/useVoice';
import { useWakeLock } from '../guidance/useWakeLock';

export function ActivitySessionScreen(): ReactElement {
  const { repos, platform } = useApp();
  const feedback = useFeedback();
  const preferences = usePreferences();
  const { confirm } = useUi();
  const navigate = useNavigate();
  const version = useStoreVersion();
  const voice = useVoice();

  const [finishing, setFinishing] = useState(false);
  const [gps, setGps] = useState<'waiting' | 'live' | 'off'>('waiting');

  const session = useMemo(() => activeSession(repos), [repos, version]);
  const paused = session?.pausedAt != null;
  const now = useTicker(!!session && !paused && !finishing);
  const unit = preferences.distanceUnit;

  useWakeLock(!!session && !finishing);

  // The GPS watch lives exactly as long as this screen does.
  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    void platform.geolocation.isAvailable().then((can) => {
      if (!cancelled) setGps(can ? 'live' : 'off');
    });
    const stop = trackSession(repos, platform, session.id);
    return () => { cancelled = true; stop(); };
  }, [repos, platform, session?.id]);

  const metrics = useMemo(
    () => (session ? activity.metricsOf(session, now) : null),
    [session, now, version],
  );

  // A sessão do plano que esta corrida cumpre, quando há uma.
  const planSession = useMemo(() => {
    if (!session?.planSessionId) return null;
    return runPlanView(repos)?.plan.sessions.find((item) => item.id === session.planSessionId) ?? null;
  }, [repos, session?.planSessionId, version]);

  const phases = useMemo(
    () => (planSession ? runGuide(planSession, unit) : []),
    [planSession, unit],
  );

  const elapsed = session ? Math.floor(activity.elapsedSec(session, now)) : 0;
  const running = !!session && !paused && !finishing;
  const guide = useRunGuide(phases, elapsed, running, voice.say);

  // Só distância medida, e só depois do aquecimento.
  useDistanceGuide(
    metrics?.distanceM ?? null,
    planSession?.targetDistanceM ?? null,
    unit,
    running && gps === 'live' && guide?.phase.kind === 'free',
    voice.say,
  );

  const leave = useCallback(async () => {
    if (!session) { navigate('/atividade', { replace: true }); return; }
    const ok = await confirm({
      title: 'Descartar atividade?',
      body: 'O que já foi registado é apagado.',
      confirmLabel: 'Descartar',
      danger: true,
    });
    if (!ok) return;
    platform.voice.cancel();
    repos.activitySessions.remove(session.id);
    navigate('/atividade', { replace: true });
  }, [confirm, navigate, repos, platform, session]);

  if (!session || !metrics) {
    return (
      <div className="screen session-screen">
        <div className="day-empty">
          <p className="t-h2">Nenhuma atividade a decorrer</p>
          <Button variant="outline" label="Voltar" onClick={() => navigate('/atividade')} />
        </div>
      </div>
    );
  }

  const showPace = metrics.paceMode === 'pace';
  const primary = showPace
    ? format.pace(metrics.paceSecPerKm, unit)
    : `${format.number(metrics.speedKmh, 1)}`;

  return (
    <div className="screen session-screen" data-state="entering">
      <header className="session-top">
        <button type="button" className="btn-icon" aria-label="Descartar" onClick={() => void leave()}>
          <Icon name="close" />
        </button>
        <div className="session-title">
          <span className="t-eyebrow">{ACTIVITY_LABELS[session.type]}</span>
          <span className="t-h2">{paused ? 'Em pausa' : 'A decorrer'}</span>
        </div>
        <span className={`gps-badge gps-${gps}`}>
          <Icon name="pin" />
          <span>{gps === 'live' ? 'GPS' : gps === 'off' ? 'Sem GPS' : '…'}</span>
        </span>
      </header>

      {guide ? <RunGuideCard state={guide} voice={voice} /> : null}

      <div className="live-primary">
        <span className="live-value t-num">{clock(metrics.durationSec)}</span>
        <span className="live-label">Tempo</span>
      </div>

      <div className="live-grid">
        <div className="live-cell">
          <span className="value t-num">
            {format.number(
              metrics.distanceM == null ? 0 : metrics.distanceM / (unit === 'mi' ? 1609.344 : 1000),
              2,
            )}
          </span>
          <span className="label">{unit}</span>
        </div>
        <div className="live-cell">
          <span className="value t-num">{primary}</span>
          <span className="label">{showPace ? `min/${unit}` : `${unit}/h`}</span>
        </div>
        <div className="live-cell">
          <span className="value t-num">
            {metrics.elevationGainM == null ? '—' : format.number(metrics.elevationGainM, 0)}
          </span>
          <span className="label">m subida</span>
        </div>
      </div>

      {gps === 'off' ? (
        <p className="t-sm muted-2 center">
          Sem localização. O tempo continua a contar; a distância terá de ser
          escrita no fim.
        </p>
      ) : null}

      <div className="live-actions">
        {paused ? (
          <Button
            variant="accent"
            block
            icon="play"
            label="Retomar"
            onClick={() => {
              resumeSession(repos, session.id);
              feedback.touch('medium');
              if (guide) voice.say('Vamos continuar.', true);
            }}
          />
        ) : (
          <Button
            variant="outline"
            block
            icon="pause"
            label="Pausa"
            onClick={() => {
              pauseSession(repos, session.id);
              feedback.touch('medium');
              if (guide) voice.say('Pausa.', true);
            }}
          />
        )}
        <Button variant="primary" block icon="stop" label="Terminar" onClick={() => setFinishing(true)} />
      </div>

      {finishing ? (
        <ActivitySummarySheet
          session={session}
          onClose={() => setFinishing(false)}
          onDone={(input) => {
            platform.voice.cancel();
            finishSession(repos, session.id, input);
            // Uma corrida do plano fecha a sessão do plano: é daqui que o plano
            // aprende se deve abrandar ou subir.
            if (session.planSessionId) {
              completeRunSession(repos, session.planSessionId, {
                difficulty: input.difficulty ?? 'right',
                rpe: input.perceivedEffort ?? null,
                note: input.notes ?? null,
              }, session.id);
            }
            feedback.play('workout');
            navigate(session.planSessionId ? '/atividade/plano' : '/atividade', { replace: true });
          }}
        />
      ) : null}
    </div>
  );
}
