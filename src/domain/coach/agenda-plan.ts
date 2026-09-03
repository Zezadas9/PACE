/**
 * PACE — organizar a semana à volta do que já lá está.
 *
 * A regra que manda em tudo o resto: **o que já está marcado não se toca.** Os
 * compromissos existentes entram aqui como espaço ocupado, e a proposta nasce
 * do que sobra. Nada é apagado, nada é movido — e quando não há espaço, a
 * resposta é dizer que não há, não empurrar seja o que for.
 *
 * O resto são escolhas de treinador, todas conservadoras: espaçar os treinos de
 * força, não pôr corrida no mesmo dia de pernas quando há alternativa, deixar
 * pelo menos um dia livre, e preferir a altura do dia que a pessoa pediu.
 */

import type { CalendarEvent, Habit, Task, Workout } from '../../core/types';
import type { CoachIntent } from './intent';

/** O dia útil de uma pessoa: nada é proposto fora desta janela. */
export const DAY_START_MIN = 6 * 60;
export const DAY_END_MIN = 22 * 60;

export const WEEKDAY_NAMES = [
  'domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado',
];

export interface Commitment {
  weekday: number;
  startMin: number;
  endMin: number;
  label: string;
  kind: 'event' | 'habit' | 'workout' | 'task';
}

export interface DayWindow {
  weekday: number;
  free: Array<{ startMin: number; endMin: number }>;
}

export type SlotKind = 'workout' | 'run' | 'walk' | 'water';

export interface ScheduleItem {
  weekday: number;
  /** Minutos desde a meia-noite; null para hábitos sem hora (a água). */
  startMin: number | null;
  durationMin: number | null;
  kind: SlotKind;
  label: string;
}

export interface SchedulePlan {
  items: ScheduleItem[];
  /** O que já estava marcado e continua exatamente igual. */
  untouched: Commitment[];
  /** O que não coube, e porquê. */
  unplaced: string[];
  /** As janelas livres que a proposta encontrou, para as poder mostrar. */
  windows: DayWindow[];
}

export function formatMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
}

export function parseClock(value: string | null): number | null {
  if (!value) return null;
  const match = value.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

/* --- O que já está marcado ------------------------------------------------------ */

interface CommitmentSources {
  habits: Habit[];
  workouts: Workout[];
  events: CalendarEvent[];
  tasks: Task[];
}

function habitAppliesTo(habit: Habit, weekday: number): boolean {
  if (habit.frequency === 'daily') return true;
  if (habit.frequency === 'weekdays') return weekday >= 1 && weekday <= 5;
  return habit.weekdays.includes(weekday);
}

/**
 * Tudo o que ocupa espaço na semana.
 *
 * Os eventos com data são lidos pelo dia da semana em que caem: para efeitos de
 * "a que horas é que esta pessoa está livre à terça", um evento de terça que se
 * repete e um que acontece uma vez ocupam o mesmo lugar.
 */
export function readCommitments(sources: CommitmentSources): Commitment[] {
  const out: Commitment[] = [];

  for (const habit of sources.habits) {
    if (habit.archived) continue;
    const start = parseClock(habit.timeOfDay);
    if (start == null) continue;
    for (let weekday = 0; weekday < 7; weekday += 1) {
      if (!habitAppliesTo(habit, weekday)) continue;
      out.push({
        weekday,
        startMin: start,
        endMin: start + (habit.durationMin ?? 20),
        label: habit.title,
        kind: 'habit',
      });
    }
  }

  for (const workout of sources.workouts) {
    if (workout.archived) continue;
    const start = parseClock(workout.timeOfDay);
    for (const weekday of workout.weekdays) {
      out.push({
        weekday,
        // Um plano sem hora ocupa o dia, não uma faixa: entra como o bloco da
        // tarde para não se propor outro treino por cima.
        startMin: start ?? 18 * 60,
        endMin: (start ?? 18 * 60) + (workout.estimatedMin ?? 60),
        label: workout.title,
        kind: 'workout',
      });
    }
  }

  for (const event of sources.events) {
    // Um evento de dia inteiro não ocupa uma faixa de horas: ocupa o dia como
    // contexto, e não impede que se marque nada.
    if (event.allDay) continue;
    const start = parseClock(event.startTime);
    if (start == null) continue;
    const weekday = new Date(`${event.date}T12:00:00`).getDay();
    out.push({
      weekday,
      startMin: start,
      endMin: parseClock(event.endTime) ?? start + 60,
      label: event.title,
      kind: 'event',
    });
  }

  for (const task of sources.tasks) {
    const start = parseClock(task.time);
    if (start == null || !task.date) continue;
    const weekday = new Date(`${task.date}T12:00:00`).getDay();
    out.push({
      weekday,
      startMin: start,
      endMin: start + 30,
      label: task.title,
      kind: 'task',
    });
  }

  return out.sort((a, b) => a.weekday - b.weekday || a.startMin - b.startMin);
}

/** As janelas livres de cada dia, já com o que está ocupado descontado. */
export function freeWindows(commitments: Commitment[]): DayWindow[] {
  const days: DayWindow[] = [];

  for (let weekday = 0; weekday < 7; weekday += 1) {
    const busy = commitments
      .filter((item) => item.weekday === weekday)
      .sort((a, b) => a.startMin - b.startMin);

    const free: DayWindow['free'] = [];
    let cursor = DAY_START_MIN;
    for (const item of busy) {
      if (item.startMin > cursor) {
        free.push({ startMin: cursor, endMin: Math.min(item.startMin, DAY_END_MIN) });
      }
      cursor = Math.max(cursor, item.endMin);
    }
    if (cursor < DAY_END_MIN) free.push({ startMin: cursor, endMin: DAY_END_MIN });

    days.push({ weekday, free: free.filter((window) => window.endMin > window.startMin) });
  }
  return days;
}

/* --- A proposta ------------------------------------------------------------------ */

/** Onde cada coisa gosta de cair, quando o utilizador não diz nada. */
const DEFAULT_TIME: Record<SlotKind, number> = {
  workout: 18 * 60,
  run: 7 * 60 + 30,
  walk: 13 * 60,
  water: 0,
};

const DURATION: Record<SlotKind, number | null> = {
  workout: 60,
  run: 40,
  walk: 30,
  water: null,
};

const PART_OF_DAY: Record<'morning' | 'afternoon' | 'evening', number> = {
  morning: 7 * 60,
  afternoon: 13 * 60,
  evening: 18 * 60,
};

/**
 * Os dias em que assentam N sessões por semana.
 *
 * Espalhadas de propósito: quatro treinos ficam segunda, quarta, sexta e
 * domingo, e não quatro dias seguidos. O descanso entre sessões do mesmo tipo é
 * parte do treino, não o que sobra dele.
 */
export function spreadDays(count: number, excluded: number[] = []): number[] {
  const wanted = Math.max(0, Math.min(7, count));
  if (wanted === 0) return [];

  const order = [1, 2, 3, 4, 5, 6, 0].filter((day) => !excluded.includes(day));
  if (order.length === 0) return [];
  if (wanted >= order.length) return order;

  const chosen: number[] = [];
  for (let i = 0; i < wanted; i += 1) {
    const index = Math.round((i * order.length) / wanted) % order.length;
    const day = order[index];
    if (day != null && !chosen.includes(day)) chosen.push(day);
  }

  // Onde o arredondamento repetiu um dia, preenche-se com o que estiver mais
  // longe do que já foi escolhido.
  for (const day of order) {
    if (chosen.length >= wanted) break;
    if (!chosen.includes(day)) chosen.push(day);
  }
  return chosen.sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
}

/** A primeira janela do dia onde cabe `durationMin`, a partir da hora preferida. */
function findSlot(
  day: DayWindow | undefined,
  preferredMin: number,
  durationMin: number,
): number | null {
  if (!day) return null;

  // Primeiro à hora pedida, se lá couber inteiro.
  for (const window of day.free) {
    if (preferredMin >= window.startMin && preferredMin + durationMin <= window.endMin) {
      return preferredMin;
    }
  }
  // Depois, a janela mais próxima da hora pedida que aguente a duração.
  const candidates = day.free
    .filter((window) => window.endMin - window.startMin >= durationMin)
    .map((window) => {
      const start = Math.min(
        Math.max(preferredMin, window.startMin),
        window.endMin - durationMin,
      );
      return { start, distance: Math.abs(start - preferredMin) };
    })
    .sort((a, b) => a.distance - b.distance);

  return candidates[0]?.start ?? null;
}

function occupy(day: DayWindow, startMin: number, durationMin: number): void {
  const endMin = startMin + durationMin;
  day.free = day.free.flatMap((window) => {
    if (endMin <= window.startMin || startMin >= window.endMin) return [window];
    const pieces: DayWindow['free'] = [];
    if (startMin > window.startMin) pieces.push({ startMin: window.startMin, endMin: startMin });
    if (endMin < window.endMin) pieces.push({ startMin: endMin, endMin: window.endMin });
    return pieces;
  });
}

export interface PlanRequest {
  workouts: number;
  runs: number;
  walksDaily: boolean;
  water: boolean;
  partOfDay: CoachIntent['partOfDay'];
  excludedWeekdays: number[];
  /** Como se chama o treino que vai ser marcado. */
  workoutLabel: string;
}

export function requestFromIntent(intent: CoachIntent, workoutLabel = 'Musculação'): PlanRequest {
  return {
    workouts: intent.perWeek.workouts ?? 0,
    runs: intent.perWeek.runs ?? 0,
    walksDaily: intent.perWeek.walksDaily,
    water: intent.perWeek.water,
    partOfDay: intent.partOfDay,
    excludedWeekdays: intent.excludedWeekdays,
    workoutLabel,
  };
}

/**
 * A proposta da semana.
 *
 * Por ordem: primeiro os treinos, que são os que precisam de mais espaço e de
 * mais descanso entre si; depois as corridas, que fogem dos dias de treino
 * quando há para onde; depois as caminhadas, curtas e diárias; e por fim a
 * água, que não ocupa hora nenhuma.
 *
 * Nada disto mexe no que já está marcado: as janelas livres já vêm descontadas
 * dos compromissos, e o que não couber é dito em vez de encaixado à força.
 */
export function planWeek(request: PlanRequest, commitments: Commitment[]): SchedulePlan {
  const windows = freeWindows(commitments);
  const byDay = new Map(windows.map((day) => [day.weekday, {
    weekday: day.weekday,
    free: day.free.map((window) => ({ ...window })),
  }]));

  const items: ScheduleItem[] = [];
  const unplaced: string[] = [];
  const preferred = request.partOfDay ? PART_OF_DAY[request.partOfDay] : null;

  const place = (weekday: number, kind: SlotKind, label: string, when: number): boolean => {
    const day = byDay.get(weekday);
    const duration = DURATION[kind] ?? 30;
    const slot = findSlot(day, when, duration);
    if (slot == null || !day) return false;
    occupy(day, slot, duration);
    items.push({ weekday, startMin: slot, durationMin: duration, kind, label });
    return true;
  };

  const workoutDays = spreadDays(request.workouts, request.excludedWeekdays);
  for (const weekday of workoutDays) {
    const when = preferred ?? DEFAULT_TIME.workout;
    if (!place(weekday, 'workout', request.workoutLabel, when)) {
      unplaced.push(`${request.workoutLabel} de ${WEEKDAY_NAMES[weekday]}`);
    }
  }

  // As corridas evitam os dias de treino: dois esforços grandes no mesmo dia é
  // o caminho mais curto para não se fazer nenhum dos dois.
  const runExcluded = [...request.excludedWeekdays, ...workoutDays];
  let runDays = spreadDays(request.runs, runExcluded);
  if (runDays.length < request.runs) {
    // Não sobraram dias livres: aceita partilhar o dia, mas noutra altura.
    const extra = spreadDays(request.runs, request.excludedWeekdays)
      .filter((day) => !runDays.includes(day));
    runDays = [...runDays, ...extra].slice(0, request.runs);
  }
  for (const weekday of runDays) {
    const when = preferred ?? DEFAULT_TIME.run;
    if (!place(weekday, 'run', 'Corrida', when)) {
      unplaced.push(`Corrida de ${WEEKDAY_NAMES[weekday]}`);
    }
  }

  if (request.walksDaily) {
    for (const weekday of [1, 2, 3, 4, 5, 6, 0]) {
      if (request.excludedWeekdays.includes(weekday)) continue;
      if (!place(weekday, 'walk', 'Caminhada', DEFAULT_TIME.walk)) {
        unplaced.push(`Caminhada de ${WEEKDAY_NAMES[weekday]}`);
      }
    }
  }

  if (request.water) {
    // A água não tem hora: é um hábito contado ao longo do dia.
    items.push({
      weekday: -1,
      startMin: null,
      durationMin: null,
      kind: 'water',
      label: 'Beber água',
    });
  }

  return {
    items: items.sort((a, b) => weekOrder(a.weekday) - weekOrder(b.weekday)
      || (a.startMin ?? 0) - (b.startMin ?? 0)),
    untouched: commitments,
    unplaced,
    windows,
  };
}

/** Segunda primeiro, domingo no fim — a semana como as pessoas a leem. */
function weekOrder(weekday: number): number {
  return weekday < 0 ? 99 : (weekday + 6) % 7;
}

/** Um resumo curto do que a proposta acrescenta, para a confirmação. */
export function summarize(plan: SchedulePlan): string[] {
  const counts = new Map<SlotKind, number>();
  for (const item of plan.items) counts.set(item.kind, (counts.get(item.kind) ?? 0) + 1);

  const label: Record<SlotKind, [string, string]> = {
    workout: ['treino', 'treinos'],
    run: ['corrida', 'corridas'],
    walk: ['caminhada', 'caminhadas'],
    water: ['hábito de água', 'hábitos de água'],
  };

  // Ordem fixa, e não a ordem em que calharam: treinos, corridas, caminhadas,
  // água. É assim que a pessoa pensa a semana.
  const ordem: SlotKind[] = ['workout', 'run', 'walk', 'water'];
  return ordem
    .filter((kind) => (counts.get(kind) ?? 0) > 0)
    .map((kind) => {
      const count = counts.get(kind) ?? 0;
      const [one, many] = label[kind];
      return `${count} ${count === 1 ? one : many}`;
    });
}

/* --- O que já está coberto -------------------------------------------------------- */

export interface ExistingCover {
  /** Dias de treino já marcados nos planos. */
  workoutDays: number[];
  /** Dias em que já há um hábito de corrida. */
  runDays: number[];
  walksDaily: boolean;
  water: boolean;
  /** O que foi encontrado, em palavras, para a resposta o poder dizer. */
  labels: string[];
}

const RUN_WORDS = /corr/i;
const WALK_WORDS = /caminh|andar|passe/i;
const WATER_WORDS = /água|agua|hidrat|beber/i;

/**
 * O que a pessoa já tem, para não lhe propor o que já faz.
 *
 * Sem isto, quem já caminha todos os dias às 18:00 recebe uma proposta de
 * caminhar todos os dias às 13:00 — e fica com duas. Um assistente que não olha
 * para o que já existe não está a organizar nada, está a acrescentar.
 */
export function readExisting(habits: Habit[], workouts: Workout[]): ExistingCover {
  const ativos = habits.filter((habit) => !habit.archived);
  const cover: ExistingCover = {
    workoutDays: [...new Set(
      workouts.filter((workout) => !workout.archived).flatMap((workout) => workout.weekdays),
    )],
    runDays: [],
    walksDaily: false,
    water: false,
    labels: [],
  };

  for (const habit of ativos) {
    const diario = habit.frequency === 'daily' || habit.frequency === 'weekdays';
    const dias = diario ? [0, 1, 2, 3, 4, 5, 6] : habit.weekdays;

    if (RUN_WORDS.test(habit.title)) {
      cover.runDays.push(...dias);
      cover.labels.push(`${habit.title}${habit.timeOfDay ? `, ${habit.timeOfDay}` : ''}`);
    } else if (WALK_WORDS.test(habit.title) && diario) {
      cover.walksDaily = true;
      cover.labels.push(`${habit.title}${habit.timeOfDay ? `, ${habit.timeOfDay}` : ''}`);
    } else if (WATER_WORDS.test(habit.title)) {
      cover.water = true;
      cover.labels.push(habit.title);
    }
  }

  if (cover.workoutDays.length > 0) {
    cover.labels.push(
      `${cover.workoutDays.length} ${cover.workoutDays.length === 1 ? 'dia' : 'dias'} de treino já marcados`,
    );
  }
  cover.runDays = [...new Set(cover.runDays)];
  return cover;
}

/**
 * Desconta do pedido o que já está feito.
 *
 * O que sobra é o que falta — e é só isso que a proposta vai acrescentar.
 */
export function subtractExisting(request: PlanRequest, cover: ExistingCover): PlanRequest {
  return {
    ...request,
    workouts: Math.max(0, request.workouts - cover.workoutDays.length),
    runs: Math.max(0, request.runs - cover.runDays.length),
    walksDaily: request.walksDaily && !cover.walksDaily,
    water: request.water && !cover.water,
    // Os dias já ocupados por treino não recebem outro.
    excludedWeekdays: [...new Set([...request.excludedWeekdays, ...cover.workoutDays])],
  };
}
