/**
 * PACE — o serviço do sono.
 *
 * Uma noite por dia: registar duas vezes o mesmo dia substitui, não duplica.
 * Quem acorda, escreve como dormiu e volta a corrigir uma hora depois espera
 * ter corrigido, não ter criado uma segunda noite.
 */

import type { DayKey, SleepEntry } from '../core/types';
import { todayKey } from '../core/utils/date';
import * as sleep from '../domain/sleep';
import type { Repositories } from '../data/repositories';

export interface SleepDraft {
  date: DayKey;
  bedtime: string | null;
  wakeTime: string | null;
  durationMin: number | null;
  quality: number | null;
  awakenings: number | null;
  notes: string | null;
}

export function emptyDraft(date: DayKey = todayKey()): SleepDraft {
  return {
    date,
    bedtime: null,
    wakeTime: null,
    durationMin: null,
    quality: null,
    awakenings: null,
    notes: null,
  };
}

export function draftFor(repos: Repositories, date: DayKey): SleepDraft {
  const entry = sleep.entryFor(repos.sleepEntries.all(), date);
  if (!entry) return emptyDraft(date);
  return {
    date: entry.date,
    bedtime: entry.bedtime,
    wakeTime: entry.wakeTime,
    durationMin: entry.durationMin,
    quality: entry.quality,
    awakenings: entry.awakenings,
    notes: entry.notes,
  };
}

/** Vale a pena guardar? Uma noite sem nada escrito não é uma noite registada. */
export function hasAnything(draft: SleepDraft): boolean {
  return draft.bedtime != null
    || draft.wakeTime != null
    || draft.durationMin != null
    || draft.quality != null;
}

export function saveNight(repos: Repositories, draft: SleepDraft): SleepEntry | null {
  if (!hasAnything(draft)) return null;

  const existing = sleep.entryFor(repos.sleepEntries.all(), draft.date);
  const payload = {
    date: draft.date,
    bedtime: draft.bedtime,
    wakeTime: draft.wakeTime,
    // A duração escrita à mão só se guarda quando não sai das horas: guardar as
    // duas deixaria duas verdades a divergir na primeira correção.
    durationMin: draft.bedtime && draft.wakeTime ? null : draft.durationMin,
    quality: draft.quality,
    awakenings: draft.awakenings,
    notes: draft.notes,
    source: 'manual' as const,
  };

  if (existing) return repos.sleepEntries.update(existing.id, payload) ?? existing;
  return repos.sleepEntries.create(payload);
}

export function deleteNight(repos: Repositories, date: DayKey): void {
  const existing = sleep.entryFor(repos.sleepEntries.all(), date);
  if (existing) repos.sleepEntries.remove(existing.id);
}

export interface SleepOverview {
  today: SleepEntry | null;
  /** A noite anterior, para o cartão poder falar quando a de hoje falta. */
  previous: SleepEntry | null;
  recent: SleepEntry[];
  week: sleep.SleepStats;
  month: sleep.SleepStats;
}

export function overview(repos: Repositories, date: DayKey = todayKey()): SleepOverview {
  const all = repos.sleepEntries.all();
  const recent = sleep.inWindow(all, 30, date);

  return {
    today: sleep.entryFor(all, date),
    previous: recent.find((entry) => entry.date < date) ?? null,
    recent,
    week: sleep.stats(sleep.inWindow(all, 7, date)),
    month: sleep.stats(recent),
  };
}
