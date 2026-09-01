/** One past activity: the route, the numbers, the notes. */

import type { ReactElement } from 'react';
import { ACTIVITY_LABELS } from '../../core/constants';
import type { ActivitySession } from '../../core/types';
import { mediumDate } from '../../core/utils/date';
import * as format from '../../core/utils/format';
import * as activity from '../../domain/activity';
import { usePreferences } from '../../app/providers/appContext';
import { Sheet } from '../../ui/Sheet';
import { Button } from '../../ui/primitives';
import { Metric } from '../../ui/data';
import { RouteMap } from './RouteMap';

export function DetailSheet({
  session, onClose, onEdit,
}: {
  session: ActivitySession;
  onClose: () => void;
  onEdit: () => void;
}): ReactElement {
  const preferences = usePreferences();
  const unit = preferences.distanceUnit;
  const m = activity.metricsOf(session);
  const showPace = m.paceMode === 'pace';

  return (
    <Sheet
      title={ACTIVITY_LABELS[session.type]}
      subtitle={mediumDate(session.date)}
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" label="Fechar" onClick={onClose} />
          <Button variant="primary" label="Editar" onClick={onEdit} />
        </>
      }
    >
      <div className="stack stack-5">
        {session.track.length > 1 ? <RouteMap track={session.track} /> : null}

        <div className="grid-2">
          <Metric label="Tempo" value={format.duration(m.durationSec)} />
          <Metric label="Distância" value={format.distance(m.distanceM, unit)} />
          {m.paceMode !== 'none' ? (
            <Metric
              label={showPace ? 'Ritmo médio' : 'Velocidade média'}
              value={
                showPace
                  ? format.pace(m.paceSecPerKm, unit)
                  : `${format.number(m.speedKmh, 1)} ${unit}/h`
              }
            />
          ) : null}
          {m.elevationGainM != null ? (
            <Metric label="Subida" value={format.number(m.elevationGainM, 0)} suffix="m" />
          ) : null}
          {m.avgHeartRate != null ? (
            <Metric label="Freq. cardíaca" value={String(m.avgHeartRate)} suffix="bpm" />
          ) : null}
          {m.calories != null ? (
            <Metric label="Calorias" value={format.number(m.calories, 0)} suffix="kcal" />
          ) : null}
        </div>

        {session.notes ? (
          <div>
            <p className="t-eyebrow">Notas</p>
            <p className="t-sm muted" style={{ marginTop: 'var(--s-2)' }}>{session.notes}</p>
          </div>
        ) : null}

        <p className="t-sm muted-2">
          {session.source === 'manual' ? 'Registo manual' : `Importado de ${session.source}`}
        </p>
      </div>
    </Sheet>
  );
}
