/**
 * A sequência.
 *
 * É a peça que faz voltar amanhã, por isso é a única do ecrã com direito a
 * protagonismo: a chama cresce com os dias, os últimos sete estão à vista, e a
 * frase por baixo diz sempre a coisa mais útil que há para dizer — quanto falta
 * para o recorde, para o próximo marco, ou para fechar o dia de hoje.
 *
 * O que ela não faz: pressão. Sem contagens decrescentes, sem vermelho, sem
 * "vais perder tudo". Um aviso discreto quando falta um essencial, e mais nada.
 */

import type { ReactElement } from 'react';
import { WEEKDAYS_SHORT } from '../../core/utils/date';
import { percent } from '../../core/utils/format';
import type { StreakDetail } from '../../domain/streak';
import { BrandIcon, streakIcon } from '../../ui/BrandIcon';
import { useCountUpInt } from '../../ui/useCountUp';

/** A frase por baixo do número. Uma só, a mais útil das que se aplicam. */
export function streakLine(stats: StreakDetail): string {
  if (stats.current === 0) {
    return stats.remainingToday > 0
      ? 'Fecha os essenciais de hoje e começa uma sequência.'
      : 'Marca um item como essencial para a sequência começar a contar.';
  }
  if (stats.remainingToday > 0) {
    return stats.remainingToday === 1
      ? 'Falta 1 essencial para manteres a tua sequência.'
      : `Faltam ${stats.remainingToday} essenciais para manteres a tua sequência.`;
  }
  if (stats.toRecord != null) {
    return stats.toRecord === 1
      ? 'Mais 1 dia para bateres o teu recorde.'
      : `Mais ${stats.toRecord} dias para bateres o teu recorde.`;
  }
  if (stats.current >= 30) return 'Estás numa sequência incrível.';
  if (stats.nextMilestone) {
    const left = stats.nextMilestone - stats.current;
    return left === 1
      ? `Mais 1 dia e chegas aos ${stats.nextMilestone}.`
      : `Mais ${left} dias e chegas aos ${stats.nextMilestone}.`;
  }
  return 'Sequência mantida.';
}

export function StreakCard({ stats }: { stats: StreakDetail }): ReactElement {
  const current = useCountUpInt(stats.current);

  return (
    <div className="streak">
      <div className="streak-head">
        <BrandIcon
          name={streakIcon(stats.current)}
          size={56}
          float={stats.current > 0}
          className="streak-flame"
          key={streakIcon(stats.current)}
        />
        <div className="grow">
          <p className="streak-count">
            {current}
            <span>{stats.current === 1 ? ' dia' : ' dias'}</span>
          </p>
          <p className="streak-line">{streakLine(stats)}</p>
        </div>
      </div>

      <WeekStrip stats={stats} />

      <div className="streak-stats">
        <Stat icon="melhor-sequencia" label="Melhor" value={String(stats.best)} />
        <Stat icon="dias-perfeitos" label="Perfeitos" value={String(stats.perfectDays)} />
        <Stat
          icon="consistencia"
          label="Consistência"
          value={stats.qualifyingDays === 0 ? '—' : percent(stats.consistency)}
        />
      </div>
    </div>
  );
}

/**
 * Os últimos sete dias.
 *
 * Um dia sem essenciais marcados fica com um traço em vez de um círculo vazio:
 * não foi falhado, simplesmente não contava.
 */
function WeekStrip({ stats }: { stats: StreakDetail }): ReactElement {
  return (
    <div className="streak-week" role="list">
      {stats.recent.map((day) => (
        <div
          key={day.date}
          role="listitem"
          className="streak-day"
          data-state={day.perfect ? 'perfect' : day.neutral ? 'neutral' : 'open'}
          data-today={String(day.isToday)}
          aria-label={`${WEEKDAYS_SHORT[day.weekday]}: ${
            day.perfect ? 'dia perfeito' : day.neutral ? 'sem essenciais' : 'por fechar'
          }`}
        >
          <span className="mark" aria-hidden="true">
            {day.perfect
              ? <BrandIcon name="sequencia" size={22} />
              : <i className={day.neutral ? 'dash' : 'ring'} />}
          </span>
          <span className="weekday">{WEEKDAYS_SHORT[day.weekday]}</span>
        </div>
      ))}
    </div>
  );
}

function Stat({
  icon, label, value,
}: {
  icon: 'melhor-sequencia' | 'dias-perfeitos' | 'consistencia';
  label: string;
  value: string;
}): ReactElement {
  return (
    <div className="streak-stat">
      <BrandIcon name={icon} size={22} />
      <span>
        <span className="value">{value}</span>
        <span className="label">{label}</span>
      </span>
    </div>
  );
}
