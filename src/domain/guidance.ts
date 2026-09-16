/**
 * PACE — o que a voz diz durante uma sessão, e quando.
 *
 * Uma corrida do plano é uma sequência de fases: aquecer, correr, recuperar,
 * correr outra vez, arrefecer. Cada fase tem uma frase para o seu início, e
 * algumas têm mais uma perto do fim. Este ficheiro constrói essa sequência e
 * responde a duas perguntas: "em que fase estou?" e "o que há para dizer entre
 * o segundo X e o segundo Y?".
 *
 * Puro de propósito. Não sabe o que é uma voz, um relógio ou um ecrã — por isso
 * testa-se sem nenhum dos três, e é o mesmo no browser e na versão nativa.
 *
 * As frases são curtas e dizem o que fazer, não o que está a acontecer: quem
 * está a correr não quer ouvir "entraste na fase dois", quer ouvir "corre".
 */

import type { RunPlanSession } from '../core/types';

export type PhaseKind = 'warmup' | 'run' | 'walk' | 'cooldown' | 'free';

export interface GuidePhase {
  kind: PhaseKind;
  /** Segundos; null numa fase aberta — correr uma distância ao próprio ritmo. */
  durationSec: number | null;
  /** A série em que se está, e quantas há. Null fora das séries. */
  series: number | null;
  seriesTotal: number | null;
  /** O que o ecrã mostra. */
  label: string;
  /** O que a voz diz quando a fase começa. */
  cue: string;
  /** Uma frase perto do fim, a `secondsBeforeEnd` segundos de acabar. */
  reminder?: { secondsBeforeEnd: number; text: string } | null;
}

export const WARMUP_SEC = 5 * 60;
export const COOLDOWN_SEC = 5 * 60;

/** Aviso de fim de fase: dez segundos antes, e só em fases que o justifiquem. */
const COUNTDOWN_SEC = 10;
const COUNTDOWN_MIN_PHASE = 45;

export const RUN_DONE_CUE = 'Sessão feita. Muito bem! Carrega em terminar para a guardar.';
export const WORKOUT_DONE_CUE = 'Treino completo. Bom trabalho!';

/* --- Números ditos em voz alta ---------------------------------------------------- */

const decimal = (value: number): string =>
  String(Math.round(value * 10) / 10).replace('.', ',');

/**
 * Uma duração como se diz, e não como se escreve.
 *
 * "1 minuto e meio" e não "90 segundos", nem "1:30": é assim que um treinador
 * fala, e é o que se percebe a meio de uma corrida com o coração a 160.
 */
export function spokenDuration(totalSec: number): string {
  const sec = Math.max(0, Math.round(totalSec));
  const min = Math.floor(sec / 60);
  const rest = sec % 60;
  const minutos = (n: number): string => (n === 1 ? '1 minuto' : `${n} minutos`);

  if (min === 0) return rest === 1 ? '1 segundo' : `${rest} segundos`;
  if (rest === 0) return minutos(min);
  if (rest === 30) return `${minutos(min)} e meio`;
  return `${minutos(min)} e ${rest} segundos`;
}

export function spokenDistance(metres: number, unit: 'km' | 'mi'): string {
  const value = metres / (unit === 'mi' ? 1609.344 : 1000);
  const rounded = Math.round(value * 10) / 10;
  if (unit === 'mi') return rounded === 1 ? '1 milha' : `${decimal(rounded)} milhas`;
  return rounded === 1 ? '1 quilómetro' : `${decimal(rounded)} quilómetros`;
}

/* --- A corrida -------------------------------------------------------------------- */

type PlanSessionLike = Pick<RunPlanSession, 'kind' | 'segments' | 'targetDistanceM'>;

/**
 * As fases de uma sessão do plano de corrida.
 *
 * Nas sessões por intervalos, o aquecimento já diz quantas séries vêm e de que
 * são feitas — e repete-o um minuto antes de acabar, que é quando a pessoa
 * precisa de se lembrar. Depois da última série não há recuperação: o
 * arrefecimento é essa recuperação, e duas caminhadas seguidas com nomes
 * diferentes só baralhavam.
 *
 * Nas sessões por distância, a corrida é uma fase aberta. O que a fecha é a
 * distância, e isso só o GPS sabe — ver `distanceCues`.
 */
export function runGuide(session: PlanSessionLike, unit: 'km' | 'mi' = 'km'): GuidePhase[] {
  if (session.kind === 'rest') return [];
  const segment = session.segments[0];

  if (session.kind === 'walk_run' && segment && segment.repeats > 0) {
    const { runSec, walkSec, repeats } = segment;
    const correr = spokenDuration(runSec);
    const caminhar = spokenDuration(walkSec);
    const series = repeats === 1 ? '1 série' : `${repeats} séries`;

    const phases: GuidePhase[] = [{
      kind: 'warmup',
      durationSec: WARMUP_SEC,
      series: null,
      seriesTotal: repeats,
      label: 'Aquecimento',
      cue: `Vamos aquecer: ${spokenDuration(WARMUP_SEC)} a caminhar, sem correr. `
        + `Hoje vais fazer ${series}. Cada série é ${correr} a correr e ${caminhar} a caminhar.`,
      reminder: {
        secondsBeforeEnd: 60,
        text: `Falta 1 minuto de aquecimento. A seguir vêm ${series}: ${correr} a correr, ${caminhar} a caminhar.`,
      },
    }];

    for (let serie = 1; serie <= repeats; serie += 1) {
      phases.push({
        kind: 'run',
        durationSec: runSec,
        series: serie,
        seriesTotal: repeats,
        label: 'A correr',
        cue: `Série ${serie} de ${repeats}. Corre durante ${correr}.`,
      });
      if (serie < repeats) {
        phases.push({
          kind: 'walk',
          durationSec: walkSec,
          series: serie,
          seriesTotal: repeats,
          label: 'A recuperar',
          cue: `Abranda. Caminha durante ${caminhar}.`,
        });
      }
    }

    phases.push({
      kind: 'cooldown',
      durationSec: COOLDOWN_SEC,
      series: null,
      seriesTotal: repeats,
      label: 'Arrefecimento',
      cue: `Última série feita! Agora ${spokenDuration(COOLDOWN_SEC)} a caminhar para arrefecer.`,
    });
    return phases;
  }

  const distancia = session.targetDistanceM != null
    ? spokenDistance(session.targetDistanceM, unit)
    : null;

  return [
    {
      kind: 'warmup',
      durationSec: WARMUP_SEC,
      series: null,
      seriesTotal: null,
      label: 'Aquecimento',
      cue: `Vamos aquecer: ${spokenDuration(WARMUP_SEC)} a caminhar.`
        + (distancia ? ` Depois vais correr ${distancia}, a um ritmo em que consigas falar.` : ''),
      reminder: { secondsBeforeEnd: 60, text: 'Falta 1 minuto de aquecimento.' },
    },
    {
      kind: 'free',
      durationSec: null,
      series: null,
      seriesTotal: null,
      label: 'A correr',
      cue: distancia
        ? `Começa a correr. São ${distancia}, ao teu ritmo.`
        : 'Começa a correr, ao teu ritmo.',
    },
  ];
}

export interface GuideState {
  index: number;
  phase: GuidePhase;
  next: GuidePhase | null;
  elapsedInPhase: number;
  /** Null numa fase aberta. */
  remainingInPhase: number | null;
  /** Todas as fases com tempo marcado acabaram. */
  done: boolean;
}

/** Em que fase se está, ao fim de `elapsed` segundos. */
export function stateAt(phases: GuidePhase[], elapsed: number): GuideState | null {
  if (phases.length === 0) return null;

  let start = 0;
  for (let index = 0; index < phases.length; index += 1) {
    const phase = phases[index]!;
    if (phase.durationSec == null || elapsed < start + phase.durationSec) {
      return {
        index,
        phase,
        next: phases[index + 1] ?? null,
        elapsedInPhase: Math.max(0, elapsed - start),
        remainingInPhase: phase.durationSec == null ? null : start + phase.durationSec - elapsed,
        done: false,
      };
    }
    start += phase.durationSec;
  }

  const last = phases[phases.length - 1]!;
  return {
    index: phases.length - 1,
    phase: last,
    next: null,
    elapsedInPhase: last.durationSec ?? 0,
    remainingInPhase: 0,
    done: true,
  };
}

/**
 * O que há para dizer entre o segundo `before` (exclusive) e `after` (inclusive).
 *
 * Por ordem. Quem chama decide o que fazer quando há muitas — o que acontece
 * quando a aplicação volta de segundo plano e o relógio saltou minutos.
 * Para ouvir a primeira frase de todas, chama-se com `before` a -1.
 */
export function cuesBetween(phases: GuidePhase[], before: number, after: number): string[] {
  const cues: string[] = [];
  let start = 0;

  for (const phase of phases) {
    if (start > before && start <= after) cues.push(phase.cue);
    if (phase.durationSec == null) return cues;

    const end = start + phase.durationSec;
    if (phase.reminder) {
      const at = end - phase.reminder.secondsBeforeEnd;
      if (at > start && at > before && at <= after) cues.push(phase.reminder.text);
    } else if (phase.durationSec >= COUNTDOWN_MIN_PHASE) {
      const at = end - COUNTDOWN_SEC;
      if (at > before && at <= after) cues.push('10 segundos.');
    }
    start = end;
  }

  if (phases.length > 0 && start > before && start <= after) cues.push(RUN_DONE_CUE);
  return cues;
}

/**
 * O que dizer quando a distância muda — só com distância medida.
 *
 * Cada quilómetro (ou milha) inteiro, a metade, e a chegada. Nunca uma
 * distância calculada a partir do tempo: se o GPS não mediu, a voz não diz.
 */
export function distanceCues(
  beforeM: number,
  afterM: number,
  targetM: number | null,
  unit: 'km' | 'mi',
): string[] {
  if (afterM <= beforeM) return [];
  const step = unit === 'mi' ? 1609.344 : 1000;
  const cues: string[] = [];
  const arrived = targetM != null && beforeM < targetM && afterM >= targetM;

  const wholeBefore = Math.floor(beforeM / step);
  const wholeAfter = Math.floor(afterM / step);
  if (wholeAfter > wholeBefore && !arrived) cues.push(`${spokenDistance(wholeAfter * step, unit)}.`);

  if (targetM != null && !arrived && beforeM < targetM / 2 && afterM >= targetM / 2) {
    cues.push('Metade feita.');
  }

  if (arrived && targetM != null) {
    cues.push(`Chegaste aos ${spokenDistance(targetM, unit)}! `
      + `Agora ${spokenDuration(COOLDOWN_SEC)} a caminhar para arrefecer, e depois carrega em terminar.`);
  }
  return cues;
}

/* --- O treino --------------------------------------------------------------------- */

export interface SetInfo {
  exercise: string;
  section: string | null;
  /** Começa em 0, como nos registos. */
  setIndex: number;
  setsTotal: number;
  reps: number | null;
  durationSec: number | null;
  loadKg: number | null;
}

/** "Agachamento. Série 1 de 3: 12 repetições com 20 quilos." */
export function setCue(info: SetInfo): string {
  const alvo = info.reps != null
    ? (info.reps === 1 ? '1 repetição' : `${info.reps} repetições`)
    : info.durationSec != null
      ? spokenDuration(info.durationSec)
      : null;
  const carga = info.loadKg ? ` com ${decimal(info.loadKg)} quilos` : '';
  const secao = info.section ? `${info.section}. ` : '';
  return `${secao}${info.exercise}. Série ${info.setIndex + 1} de ${info.setsTotal}`
    + `${alvo ? `: ${alvo}${carga}` : ''}.`;
}

export function restCue(seconds: number): string {
  return `Descansa ${spokenDuration(seconds)}.`;
}

export function afterRestCue(next: SetInfo): string {
  return `Descanso feito. ${setCue(next)}`;
}
