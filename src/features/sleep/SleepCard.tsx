/**
 * O sono, no Hoje.
 *
 * A pergunta é feita uma vez por dia e no sítio onde a pessoa já vai estar de
 * manhã. Um separador próprio para o sono seria um sítio onde ninguém entra —
 * o que faz um diário funcionar é a pergunta aparecer sozinha.
 *
 * Depois de registada, o cartão deixa de perguntar e passa a dizer: a noite,
 * e a média da semana quando já há semana que chegue.
 */

import type { ReactElement } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp, useStoreVersion } from '../../app/providers/appContext';
import { todayKey } from '../../core/utils/date';
import * as format from '../../core/utils/format';
import { RECOMMENDED_MIN, durationOf } from '../../domain/sleep';
import { overview } from '../../services/sleep';
import { Card, SectionHeader } from '../../ui/primitives';
import { Metric } from '../../ui/data';
import { BrandIcon } from '../../ui/BrandIcon';

export function SleepCard(): ReactElement {
  const { repos } = useApp();
  const navigate = useNavigate();
  const version = useStoreVersion();
  const model = overview(repos, todayKey());
  void version;

  const noite = model.today;
  const minutos = noite ? durationOf(noite) : null;

  return (
    <section>
      <SectionHeader
        title="Sono"
        actionLabel={model.recent.length > 0 ? 'Ver tudo' : undefined}
        onAction={model.recent.length > 0 ? () => navigate('/sono') : undefined}
      />

      {noite == null ? (
        <Card onClick={() => navigate('/sono')}>
          <div className="row">
            <BrandIcon name="sono" size={34} />
            <div className="grow" style={{ marginLeft: 'var(--s-3)' }}>
              <p className="t-h3">Como dormiste?</p>
              <p className="t-sm muted" style={{ marginTop: '0.2rem' }}>
                {model.previous
                  ? 'Trinta segundos, e ao fim de uma semana já dá para ver um padrão.'
                  : 'Regista a primeira noite.'}
              </p>
            </div>
            <span className="today-cta">Registar</span>
          </div>
        </Card>
      ) : (
        <Card variant="quiet" onClick={() => navigate('/sono')}>
          <div className="grid-2">
            <Metric
              label="Esta noite"
              value={minutos == null ? '—' : format.duration(minutos * 60)}
            />
            <Metric
              label="Média da semana"
              value={model.week.averageMin == null
                ? '—'
                : format.duration(model.week.averageMin * 60)}
            />
          </div>
          {minutos != null ? (
            <p className="t-sm muted-2" style={{ marginTop: 'var(--s-3)' }}>
              {minutos >= RECOMMENDED_MIN
                ? 'Dormiste o recomendado para um adulto.'
                : `Ficaste a ${format.duration((RECOMMENDED_MIN - minutos) * 60)} das sete horas.`}
            </p>
          ) : null}
        </Card>
      )}
    </section>
  );
}
