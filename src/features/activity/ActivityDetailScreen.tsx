/**
 * Uma atividade, por inteiro.
 *
 * É página e não folha: há aqui percurso, números, esforço, comparação e notas,
 * e uma folha a meia altura obrigava a rolar por cima do ecrã anterior. A
 * regra do costume aplica-se a cada número: o que não foi medido não aparece, e
 * o que foi estimado diz que é estimado.
 */

import { useMemo, type ReactElement } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ACTIVITY_LABELS } from '../../core/constants';
import { mediumDate } from '../../core/utils/date';
import * as format from '../../core/utils/format';
import { deleteSession, entryFromSession, saveManual, sessionDetail } from '../../services/activity';
import { useApp, usePreferences, useStoreVersion } from '../../app/providers/appContext';
import { useUi } from '../../app/providers/uiContext';
import { Screen } from '../../app/navigation/Screen';
import { Button, Card } from '../../ui/primitives';
import { Metric } from '../../ui/data';
import { PageHeader } from '../../ui/page';
import { RouteMap } from './RouteMap';
import { ActivityForm } from './ActivityForm';
import { useState } from 'react';

const EFFORT_WORDS: Record<number, string> = {
  1: 'muito leve', 2: 'muito leve', 3: 'leve', 4: 'moderado', 5: 'moderado',
  6: 'algo difícil', 7: 'difícil', 8: 'difícil', 9: 'muito difícil', 10: 'máximo',
};

const DIFFICULTY_WORDS = {
  easy: 'Correu fácil',
  right: 'Foi na medida certa',
  hard: 'Custou',
} as const;

export function ActivityDetailScreen(): ReactElement {
  const { repos } = useApp();
  const preferences = usePreferences();
  const { confirm, toast } = useUi();
  const navigate = useNavigate();
  const version = useStoreVersion();
  const params = useParams<{ id: string }>();
  const [editing, setEditing] = useState(false);

  const detail = useMemo(
    () => (params.id ? sessionDetail(repos, params.id) : null),
    [repos, params.id, version],
  );

  if (!detail) {
    return (
      <Screen>
        <PageHeader eyebrow="Atividade" title="Não encontrada" />
        <Card variant="quiet">
          <p className="t-sm muted">Esta atividade já não existe.</p>
        </Card>
        <Button variant="outline" block label="Voltar" onClick={() => navigate('/atividade')} />
      </Screen>
    );
  }

  const { session, metrics: m } = detail;
  const unit = preferences.distanceUnit;
  const showPace = m.paceMode === 'pace';

  const remove = (): void => {
    void (async () => {
      const ok = await confirm({
        title: 'Apagar atividade?', confirmLabel: 'Apagar', danger: true,
      });
      if (!ok) return;
      deleteSession(repos, session.id);
      navigate('/atividade', { replace: true });
    })();
  };

  return (
    <>
      <Screen>
        <PageHeader
          eyebrow={mediumDate(session.date)}
          title={ACTIVITY_LABELS[session.type]}
          subtitle={session.source === 'manual' ? 'Registo manual' : `Importado de ${session.source}`}
        />

        {session.track.length > 1 ? (
          <Card variant="flush"><RouteMap track={session.track} height={220} /></Card>
        ) : (
          <Card variant="quiet">
            <p className="t-sm muted-2">
              Sem percurso — a localização não esteve disponível nesta atividade.
            </p>
          </Card>
        )}

        <Card>
          <div className="grid-2">
            <Metric label="Tempo" value={format.duration(m.durationSec)} />
            <Metric
              label="Distância"
              value={m.distanceM ? format.distance(m.distanceM, unit) : '—'}
            />
            {m.paceMode !== 'none' ? (
              <Metric
                label={showPace ? 'Ritmo médio' : 'Velocidade média'}
                value={
                  m.distanceM
                    ? showPace
                      ? format.pace(m.paceSecPerKm, unit)
                      : `${format.number(m.speedKmh, 1)} ${unit}/h`
                    : '—'
                }
              />
            ) : null}
            <Metric
              label="Subida"
              value={m.elevationGainM == null ? '—' : format.number(m.elevationGainM, 0)}
              suffix={m.elevationGainM == null ? undefined : 'm'}
            />
            <Metric
              label="Freq. cardíaca"
              value={session.avgHeartRate == null ? 'Não disponível' : String(session.avgHeartRate)}
              suffix={session.avgHeartRate == null ? undefined : 'bpm'}
            />
            <Metric
              label={session.caloriesSource === 'estimated' ? 'Calorias (estimadas)' : 'Calorias'}
              value={session.calories == null ? 'Não disponível' : format.number(session.calories, 0)}
              suffix={session.calories == null ? undefined : 'kcal'}
            />
          </div>
          {session.caloriesSource === 'estimated' ? (
            <p className="t-sm muted-2" style={{ marginTop: 'var(--s-3)' }}>
              Valor estimado a partir do peso e da duração. Não foi medido.
            </p>
          ) : null}
          {session.steps != null ? (
            <p className="t-sm muted-2" style={{ marginTop: 'var(--s-2)' }}>
              {format.number(session.steps, 0)} passos.
            </p>
          ) : null}
        </Card>

        {session.perceivedEffort != null || session.difficulty != null ? (
          <Card variant="quiet">
            <p className="t-eyebrow">Esforço</p>
            {session.perceivedEffort != null ? (
              <p className="t-h3" style={{ marginTop: '0.25rem' }}>
                {session.perceivedEffort}/10 · {EFFORT_WORDS[session.perceivedEffort] ?? ''}
              </p>
            ) : null}
            {session.difficulty != null ? (
              <p className="t-sm muted" style={{ marginTop: '0.35rem' }}>
                {DIFFICULTY_WORDS[session.difficulty]}
              </p>
            ) : null}
            {session.discomfort ? (
              <p className="t-sm muted" style={{ marginTop: '0.35rem' }}>
                Desconforto registado: {session.discomfort}. Se persistir, fala com um
                profissional de saúde.
              </p>
            ) : null}
          </Card>
        ) : null}

        {detail.typicalPaceSecPerKm != null && m.paceSecPerKm != null ? (
          <Card variant="quiet">
            <p className="t-eyebrow">Comparação</p>
            <p className="t-sm" style={{ marginTop: '0.35rem' }}>
              {comparison(m.paceSecPerKm, detail.typicalPaceSecPerKm, unit)}
            </p>
            <p className="t-sm muted-2" style={{ marginTop: '0.25rem' }}>
              Média de {detail.comparedWith} {ACTIVITY_LABELS[session.type].toLowerCase()}
              {detail.comparedWith === 1 ? '' : 's'} anteriores.
            </p>
          </Card>
        ) : null}

        {session.notes ? (
          <Card variant="quiet">
            <p className="t-eyebrow">Notas</p>
            <p className="t-sm muted" style={{ marginTop: 'var(--s-2)' }}>{session.notes}</p>
          </Card>
        ) : null}

        <div className="live-actions">
          <Button variant="outline" block label="Apagar" onClick={remove} />
          <Button variant="primary" block label="Editar" onClick={() => setEditing(true)} />
        </div>
      </Screen>

      {editing ? (
        <ActivityForm
          date={session.date}
          existing={entryFromSession(session)}
          existingId={session.id}
          preferences={preferences}
          onClose={() => setEditing(false)}
          onSave={(entry) => {
            saveManual(repos, entry, session.id);
            setEditing(false);
            toast('Atividade atualizada.');
          }}
        />
      ) : null}
    </>
  );
}

/** Uma frase, e só quando a diferença é grande o suficiente para significar algo. */
function comparison(pace: number, typical: number, unit: 'km' | 'mi'): string {
  const delta = typical - pace;
  if (Math.abs(delta) < 5) return 'Praticamente no teu ritmo habitual.';
  return delta > 0
    ? `${gap(delta)} por ${unit} mais rápido do que o habitual.`
    : `${gap(-delta)} por ${unit} mais lento do que o habitual.`;
}

/**
 * Uma diferença de ritmo em minutos e segundos.
 *
 * "1m" arredondaria 62 segundos e 89 para a mesma coisa, e num ritmo essa
 * diferença é a que separa duas corridas distintas.
 */
function gap(seconds: number): string {
  const total = Math.round(seconds);
  if (total < 60) return `${total} s`;
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')} min`;
}
