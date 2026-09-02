/**
 * PACE — o plano de corrida, sessão a sessão.
 *
 * Depois de cada sessão a pergunta é sempre a mesma: como correu? É daí que
 * sai o ajuste. Duas sessões difíceis seguidas e o plano baixa; duas fáceis e
 * sobe — e sobe dentro do mesmo travão de 10% com que foi construído.
 */

import { useCallback, useMemo, useState, type ReactElement } from 'react';
import { useNavigate } from 'react-router-dom';
import type { RunPlanSession, SessionDifficulty } from '../../core/types';
import { mediumDate, todayKey } from '../../core/utils/date';
import * as format from '../../core/utils/format';
import { completeRunSession, endRunPlan, runPlanView, skipRunSession } from '../../services/coach';
import {
  useApp, useFeedback, usePreferences, useStoreVersion,
} from '../../app/providers/appContext';
import { useUi } from '../../app/providers/uiContext';
import { Screen } from '../../app/navigation/Screen';
import { PageHeader } from '../../ui/page';
import { Button, Card, Chip, SectionHeader } from '../../ui/primitives';
import { EmptyState, ProgressBar, Row, Rows } from '../../ui/data';
import { Sheet } from '../../ui/Sheet';
import { Field, Input } from '../../ui/form';

function describeSession(session: RunPlanSession, unit: 'km' | 'mi'): string {
  if (session.kind === 'walk_run') {
    const first = session.segments[0];
    if (!first) return 'Corrida e caminhada';
    return `${first.repeats}× (${Math.round(first.runSec / 60)} min a correr / `
      + `${Math.round(first.walkSec / 60)} min a caminhar)`;
  }
  if (session.targetDistanceM == null) return 'Descanso';
  return format.distance(session.targetDistanceM, unit);
}

export function RunPlanScreen(): ReactElement {
  const { repos } = useApp();
  const preferences = usePreferences();
  const feedback = useFeedback();
  const { confirm, toast } = useUi();
  const navigate = useNavigate();
  const version = useStoreVersion();

  const view = useMemo(() => runPlanView(repos), [repos, version]);
  const [feedbackFor, setFeedbackFor] = useState<RunPlanSession | null>(null);

  const finish = useCallback((
    session: RunPlanSession,
    difficulty: SessionDifficulty,
    rpe: number | null,
    note: string | null,
  ) => {
    const result = completeRunSession(repos, session.id, { difficulty, rpe, note });
    feedback.play('complete');
    setFeedbackFor(null);
    const adjustment = result?.lastAdjustment;
    toast(adjustment && adjustment.fromSessionIndex === session.index + 1
      ? adjustment.reason
      : 'Sessão registada.');
  }, [repos, feedback, toast]);

  if (!view) {
    return (
      <Screen>
        <PageHeader eyebrow="Assistente" title="Plano de corrida" />
        <EmptyState
          brand="corrida"
          title="Sem plano ativo"
          body="Diz-me a distância que queres alcançar e eu monto a progressão."
          actionLabel="Falar com o assistente"
          onAction={() => navigate('/ia')}
        />
      </Screen>
    );
  }

  const { plan, next, doneCount, total } = view;
  const today = todayKey();
  const unit = preferences.distanceUnit;
  const upcoming = plan.sessions.filter((session) => session.status === 'planned').slice(0, 8);
  const past = plan.sessions.filter((session) => session.status !== 'planned').slice(-6).reverse();

  return (
    <>
      <Screen>
        <PageHeader
          eyebrow="Assistente"
          title={plan.title}
          subtitle={`${doneCount} de ${total} sessões concluídas`}
        />

        <Card>
          <ProgressBar ratio={total > 0 ? doneCount / total : 0} />
          {next ? (
            <div style={{ marginTop: '1rem' }}>
              <p className="t-eyebrow">
                {next.date === today ? 'Hoje' : mediumDate(next.date)}
              </p>
              <p className="t-h1" style={{ marginTop: '0.25rem' }}>
                {describeSession(next, unit)}
              </p>
              {next.note ? <p className="t-sm muted">{next.note}</p> : null}
              <div className="row" style={{ gap: 'var(--s-2)', marginTop: '1rem' }}>
                <Button variant="primary" label="Correu bem" onClick={() => setFeedbackFor(next)} />
                <Button
                  variant="outline"
                  label="Saltar"
                  onClick={() => void (async () => {
                    const ok = await confirm({
                      title: 'Saltar esta sessão?',
                      body: 'Fica marcada como não feita e o plano segue em frente.',
                      confirmLabel: 'Saltar',
                    });
                    if (ok) skipRunSession(repos, next.id);
                  })()}
                />
              </div>
            </div>
          ) : (
            <p className="t-sm muted" style={{ marginTop: '1rem' }}>
              Plano concluído. Se quiseres uma distância maior, é só pedires.
            </p>
          )}
        </Card>

        {view.lastAdjustment ? (
          <Card variant="quiet">
            <p className="t-eyebrow">Último ajuste</p>
            <p className="t-sm" style={{ marginTop: '0.35rem' }}>{view.lastAdjustment.reason}</p>
          </Card>
        ) : null}

        <section>
          <SectionHeader title="A seguir" />
          <Card variant="flush">
            <Rows>
              {upcoming.map((session) => (
                <Row
                  key={session.id}
                  icon="run"
                  title={describeSession(session, unit)}
                  sub={`Semana ${session.weekIndex + 1} · ${mediumDate(session.date)}`}
                  trail={session.kind === 'long_run' ? 'longa' : undefined}
                />
              ))}
            </Rows>
          </Card>
        </section>

        {past.length > 0 ? (
          <section>
            <SectionHeader title="Feito" />
            <Card variant="flush">
              <Rows>
                {past.map((session) => (
                  <Row
                    key={session.id}
                    icon={session.status === 'done' ? 'check' : 'close'}
                    title={describeSession(session, unit)}
                    sub={mediumDate(session.date)}
                    trail={session.feedback
                      ? { easy: 'fácil', right: 'no ponto', hard: 'difícil' }[session.feedback.difficulty]
                      : 'saltada'}
                  />
                ))}
              </Rows>
            </Card>
          </section>
        ) : null}

        <Button
          variant="outline"
          block
          label="Terminar plano"
          onClick={() => void (async () => {
            const ok = await confirm({
              title: 'Terminar o plano?',
              body: 'Deixa de aparecer, e o histórico das sessões fica.',
              confirmLabel: 'Terminar',
              danger: true,
            });
            if (ok) { endRunPlan(repos); navigate('/ia'); }
          })()}
        />
      </Screen>

      {feedbackFor ? (
        <FeedbackSheet
          session={feedbackFor}
          unit={unit}
          onClose={() => setFeedbackFor(null)}
          onSave={(difficulty, rpe, note) => finish(feedbackFor, difficulty, rpe, note)}
        />
      ) : null}
    </>
  );
}

/** A pergunta do fim: dificuldade primeiro, o resto é opcional. */
function FeedbackSheet({
  session, unit, onSave, onClose,
}: {
  session: RunPlanSession;
  unit: 'km' | 'mi';
  onSave: (difficulty: SessionDifficulty, rpe: number | null, note: string | null) => void;
  onClose: () => void;
}): ReactElement {
  const [difficulty, setDifficulty] = useState<SessionDifficulty>('right');
  const [rpe, setRpe] = useState<number | null>(null);
  const [note, setNote] = useState('');

  return (
    <Sheet
      title="Como correu?"
      subtitle={describeSession(session, unit)}
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" label="Cancelar" onClick={onClose} />
          <Button
            variant="primary"
            label="Guardar"
            onClick={() => onSave(difficulty, rpe, note.trim() || null)}
          />
        </>
      }
    >
      <div className="stack stack-5">
        <Field label="Dificuldade">
          <div className="chips">
            {([
              ['easy', 'Fácil'], ['right', 'No ponto'], ['hard', 'Difícil'],
            ] as Array<[SessionDifficulty, string]>).map(([id, label]) => (
              <Chip
                key={id}
                label={label}
                pressed={difficulty === id}
                onClick={() => setDifficulty(id)}
              />
            ))}
          </div>
        </Field>

        <Field label="Esforço (1 a 10)" hint="Opcional. É o que dá para medir a carga.">
          <Input
            type="number"
            inputMode="numeric"
            min={1}
            max={10}
            value={rpe ?? ''}
            onChange={(value) => {
              const parsed = Number(value);
              setRpe(Number.isFinite(parsed) && parsed >= 1 && parsed <= 10 ? parsed : null);
            }}
          />
        </Field>

        <Field label="Nota">
          <Input
            value={note}
            placeholder="Opcional"
            maxLength={160}
            onChange={setNote}
          />
        </Field>
      </div>
    </Sheet>
  );
}
