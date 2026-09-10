/**
 * A sequência.
 *
 * É a peça que faz voltar amanhã, por isso é a única do ecrã com direito a
 * protagonismo: a chama cresce com os dias, os últimos sete estão à vista, e a
 * frase por baixo diz sempre a coisa mais útil que há para dizer — quanto falta
 * para o recorde, para o próximo marco, ou para fechar o dia de hoje.
 *
 * E tem de dar gosto. A chama arde e solta faúlhas, mais quanto mais quente
 * está a sequência; o número salta com um "+1" no momento em que sobe; os dias
 * perfeitos seguidos ficam presos por uma corrente; e há uma escada com as oito
 * chamas, para se ver o que já se ganhou e o que ainda falta ganhar.
 *
 * O que ela não faz: pressão. Sem contagens decrescentes, sem vermelho, sem
 * "vais perder tudo". Um aviso discreto quando falta um essencial, e mais nada.
 */

import {
  useEffect, useRef, useState, type CSSProperties, type ReactElement,
} from 'react';
import { WEEKDAYS_SHORT } from '../../core/utils/date';
import { percent } from '../../core/utils/format';
import {
  milestoneProgress, streakHeat, type StreakDetail,
} from '../../domain/streak';
import { BrandIcon, STREAK_STEPS, streakIcon } from '../../ui/BrandIcon';
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

/**
 * As faúlhas que sobem da chama. Posições fixas, e não aleatórias: um número
 * sorteado a cada render fazia-as saltar de sítio sempre que o ecrã mudava.
 */
const EMBERS: ReadonlyArray<{ dx: number; delay: number; duration: number; size: number }> = [
  { dx: -10, delay: 0, duration: 2.4, size: 4 },
  { dx: 9, delay: 0.7, duration: 2.8, size: 3 },
  { dx: -3, delay: 1.3, duration: 2.2, size: 3 },
  { dx: 13, delay: 1.9, duration: 3.0, size: 4 },
  { dx: -15, delay: 2.4, duration: 2.6, size: 2 },
  { dx: 4, delay: 0.4, duration: 3.2, size: 2 },
];

/**
 * Um contador que avança quando o valor sobe.
 *
 * Serve de `key` às animações do "+1": uma chave nova recomeça-as. Na primeira
 * montagem não conta — abrir a aplicação com sete dias não é subir para sete.
 */
function useRise(value: number): number {
  const previous = useRef(value);
  const [rises, setRises] = useState(0);
  useEffect(() => {
    if (value > previous.current) setRises((count) => count + 1);
    previous.current = value;
  }, [value]);
  return rises;
}

export function StreakCard({ stats }: { stats: StreakDetail }): ReactElement {
  const current = useCountUpInt(stats.current);
  const rises = useRise(stats.current);
  const heat = streakHeat(stats.current);
  const hot = stats.current > 0;
  // Mais quente, mais faúlhas: duas ao primeiro dia, seis ao fim de um mês.
  const embers = EMBERS.slice(0, Math.round(2 + heat * 4));

  return (
    <div className="streak" style={{ '--heat': heat } as CSSProperties}>
      <div className="streak-head">
        <div className="streak-hero" data-hot={String(hot)}>
          <span className="streak-glow" aria-hidden="true" />
          <BrandIcon
            name={streakIcon(stats.current)}
            size={56}
            className="streak-flame"
            key={streakIcon(stats.current)}
          />
          {hot ? (
            <span className="streak-embers" aria-hidden="true">
              {embers.map((ember, index) => (
                <i
                  key={index}
                  style={{
                    '--dx': `${ember.dx}px`,
                    '--size': `${ember.size}px`,
                    animationDelay: `${ember.delay}s`,
                    animationDuration: `${ember.duration}s`,
                  } as CSSProperties}
                />
              ))}
            </span>
          ) : null}
        </div>
        <div className="grow">
          <div className="streak-count-wrap">
            <p className={rises > 0 ? 'streak-count is-rising' : 'streak-count'} key={rises}>
              {current}
              <span>{stats.current === 1 ? ' dia' : ' dias'}</span>
            </p>
            {rises > 0 ? (
              <span className="streak-plus" key={`mais-${rises}`} aria-hidden="true">+1</span>
            ) : null}
          </div>
          <p className="streak-line">{streakLine(stats)}</p>
        </div>
      </div>

      <WeekStrip stats={stats} />
      <MilestoneTrack stats={stats} />

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
 * O próximo marco, e a escada de todos.
 *
 * A escada conta com o recorde e não com a sequência atual: uma chama que já
 * se ganhou não se perde por um dia falhado. A de agora distingue-se das
 * outras por estar maior.
 */
function MilestoneTrack({ stats }: { stats: StreakDetail }): ReactElement {
  const progress = milestoneProgress(stats.current, stats.nextMilestone);
  const currentIcon = stats.current > 0 ? streakIcon(stats.current) : null;

  return (
    <div className="streak-track">
      {progress ? (
        <div className="streak-next">
          <div className="row row-between">
            <span className="t-sm">
              Próximo marco: <strong>{progress.to} dias</strong>
            </span>
            <span className="t-sm muted">
              {progress.left === 1 ? 'falta 1' : `faltam ${progress.left}`}
            </span>
          </div>
          <div
            className="streak-next-bar"
            role="progressbar"
            aria-label="Caminho até ao próximo marco"
            aria-valuemin={progress.from}
            aria-valuemax={progress.to}
            aria-valuenow={stats.current}
          >
            <span style={{ width: `${Math.max(4, progress.ratio * 100)}%` }} />
          </div>
        </div>
      ) : null}

      <ol className="streak-ladder" aria-label="Marcos da sequência">
        {STREAK_STEPS.map((step, index) => {
          const reached = stats.best >= step.days;
          return (
            <li
              key={step.days}
              className="streak-rung"
              data-reached={String(reached)}
              data-current={String(step.icon === currentIcon)}
              style={{ '--i': index } as CSSProperties}
              aria-label={`${step.days} ${step.days === 1 ? 'dia' : 'dias'}${
                reached ? ', alcançado' : ''
              }`}
            >
              <span className="rung-art" aria-hidden="true">
                <BrandIcon name={step.icon} size={20} />
              </span>
              <span className="rung-days" aria-hidden="true">{step.days}</span>
            </li>
          );
        })}
      </ol>
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
      {stats.recent.map((day, index) => {
        // Dois dias perfeitos seguidos ficam presos por uma corrente: é a
        // sequência a ver-se, e não só a contar-se.
        const linked = day.perfect && stats.recent[index - 1]?.perfect === true;
        return (
          <div
            key={day.date}
            role="listitem"
            className="streak-day"
            data-state={day.perfect ? 'perfect' : day.neutral ? 'neutral' : 'open'}
            data-today={String(day.isToday)}
            style={{ '--i': index } as CSSProperties}
            aria-label={`${WEEKDAYS_SHORT[day.weekday]}: ${
              day.perfect ? 'dia perfeito' : day.neutral ? 'sem essenciais' : 'por fechar'
            }`}
          >
            <span className="mark-slot">
              {linked ? <i className="streak-chain" aria-hidden="true" /> : null}
              <span className="mark" aria-hidden="true">
                {day.perfect
                  ? <BrandIcon name="sequencia" size={22} />
                  : <i className={day.neutral ? 'dash' : 'ring'} />}
              </span>
            </span>
            <span className="weekday">{WEEKDAYS_SHORT[day.weekday]}</span>
          </div>
        );
      })}
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
