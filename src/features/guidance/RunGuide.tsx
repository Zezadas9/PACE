/**
 * A corrida guiada: o que dizer, e o cartão que mostra onde se está.
 *
 * As frases vêm de `domain/guidance.ts`. Aqui decide-se só *quando* as dizer,
 * a partir do tempo que a sessão já leva — que exclui as pausas, e por isso
 * uma pausa congela a guia no sítio certo.
 */

import { useEffect, useMemo, useRef, type ReactElement } from 'react';
import {
  cuesBetween, distanceCues, stateAt, type GuidePhase, type GuideState,
} from '../../domain/guidance';
import { clock } from '../workout/useTicker';
import { Icon } from '../../ui/Icon';
import type { Voice } from './useVoice';

/**
 * Diz as frases das fases à medida que o tempo passa.
 *
 * Duas situações pedem cuidado. Ao entrar num ecrã com a sessão já a meio —
 * por exemplo, depois de ir ver outra coisa — não se diz nada: frases velhas a
 * sair do nada assustam mais do que ajudam. E quando o relógio salta, porque a
 * aplicação esteve em segundo plano, diz-se só a última frase, a que descreve
 * o que fazer agora.
 */
export function useRunGuide(
  phases: GuidePhase[],
  elapsed: number,
  running: boolean,
  say: Voice['say'],
): GuideState | null {
  const last = useRef<number | null>(null);

  useEffect(() => {
    if (!running || phases.length === 0) return;
    const before = last.current;
    last.current = elapsed;

    if (before == null) {
      if (elapsed <= 2) for (const cue of cuesBetween(phases, -1, elapsed)) say(cue);
      return;
    }
    if (elapsed <= before) return;

    const cues = cuesBetween(phases, before, elapsed);
    if (cues.length === 0) return;
    if (elapsed - before > 3) {
      say(cues[cues.length - 1]!, true);
      return;
    }
    for (const cue of cues) say(cue);
  }, [phases, elapsed, running, say]);

  return useMemo(() => stateAt(phases, elapsed), [phases, elapsed]);
}

/**
 * Os quilómetros, contados a partir do fim do aquecimento.
 *
 * A caminhada do aquecimento não faz parte da distância do plano — contá-la
 * era anunciar a chegada quatrocentos metros antes de ela acontecer.
 */
export function useDistanceGuide(
  distanceM: number | null,
  targetM: number | null,
  unit: 'km' | 'mi',
  active: boolean,
  say: Voice['say'],
): void {
  const offset = useRef<number | null>(null);
  const last = useRef<number | null>(null);

  useEffect(() => {
    if (!active || distanceM == null) return;
    if (offset.current == null) offset.current = distanceM;
    const covered = distanceM - offset.current;
    const before = last.current;
    last.current = covered;
    if (before == null) return;
    for (const cue of distanceCues(before, covered, targetM, unit)) say(cue);
  }, [distanceM, targetM, unit, active, say]);
}

export function RunGuideCard({
  state, voice,
}: {
  state: GuideState;
  voice: Voice;
}): ReactElement {
  const { phase, next, remainingInPhase, done } = state;
  const ratio = phase.durationSec && remainingInPhase != null
    ? 1 - remainingInPhase / phase.durationSec
    : null;

  const eyebrow = done
    ? 'Plano de hoje'
    : phase.series != null
      ? `Série ${phase.series} de ${phase.seriesTotal}`
      : phase.seriesTotal
        ? `${phase.seriesTotal} séries hoje`
        : 'Plano de hoje';

  const after = done
    ? 'Carrega em terminar para a guardar.'
    : next
      ? `A seguir: ${next.label.toLowerCase()}${next.durationSec ? ` · ${clock(next.durationSec)}` : ''}`
      : phase.kind === 'free'
        ? 'Acaba quando chegares à distância.'
        : 'Última fase.';

  return (
    <section className="guide-card" data-kind={done ? 'done' : phase.kind}>
      <div className="row row-between">
        <span className="t-eyebrow">{eyebrow}</span>
        {voice.supported ? (
          <button
            type="button"
            className="btn-icon"
            aria-label={voice.on ? 'Desligar a voz' : 'Ligar a voz'}
            aria-pressed={voice.on}
            onClick={voice.toggle}
          >
            <Icon name={voice.on ? 'volume' : 'volumeOff'} />
          </button>
        ) : null}
      </div>
      {/* Só a fase é anunciada aos leitores de ecrã: o relógio mudava a cada segundo. */}
      <p className="guide-phase" aria-live="polite">{done ? 'Sessão feita' : phase.label}</p>
      <p className="guide-clock t-num">
        {done ? '—' : remainingInPhase == null ? 'ao teu ritmo' : clock(remainingInPhase)}
      </p>
      {ratio != null && !done ? (
        <div className="guide-bar" aria-hidden="true">
          <span style={{ width: `${Math.round(ratio * 100)}%` }} />
        </div>
      ) : null}
      <p className="t-sm muted">{after}</p>
    </section>
  );
}
