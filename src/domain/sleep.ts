/**
 * PACE — o que as noites registadas dizem.
 *
 * A regra desta secção é a mesma do resto da aplicação, e aqui custa mais a
 * cumprir: **o que não foi registado não se deduz**. Uma noite sem horas não
 * tem duração; uma semana com duas noites registadas não tem média semanal.
 * Preencher os buracos daria gráficos mais bonitos e conclusões erradas.
 *
 * O sono é ainda o único sítio da PACE onde o dado é inteiramente escrito à
 * mão. Não há aqui medição nenhuma, e nada finge que há.
 */

import type { DayKey, SleepEntry } from '../core/types';
import { addDaysToKey, todayKey } from '../core/utils/date';

/** Uma noite bem dormida, segundo o consenso da AASM para adultos. */
export const RECOMMENDED_MIN = 7 * 60;

/**
 * Minutos entre deitar e acordar.
 *
 * Quase todas as noites atravessam a meia-noite, e é por isso que isto não é
 * uma subtração: deitar às 23:30 e acordar às 07:00 dá sete horas e meia, não
 * menos dezasseis e meia.
 */
export function minutesBetween(bedtime: string | null, wakeTime: string | null): number | null {
  if (!bedtime || !wakeTime) return null;
  const parse = (clock: string): number | null => {
    const match = /^(\d{2}):(\d{2})$/.exec(clock);
    if (!match) return null;
    return Number(match[1]) * 60 + Number(match[2]);
  };
  const from = parse(bedtime);
  const to = parse(wakeTime);
  if (from == null || to == null) return null;
  const minutes = (to - from + 24 * 60) % (24 * 60);
  // Mais de dezasseis horas na cama é quase de certeza um engano a escrever.
  return minutes > 16 * 60 ? null : minutes;
}

/** A duração de uma noite: a escrita, ou a que sai das horas. */
export function durationOf(entry: SleepEntry): number | null {
  return entry.durationMin ?? minutesBetween(entry.bedtime, entry.wakeTime);
}

export function entryFor(entries: SleepEntry[], date: DayKey): SleepEntry | null {
  return entries.find((entry) => entry.date === date) ?? null;
}

/** As noites de um intervalo, da mais recente para a mais antiga. */
export function inWindow(entries: SleepEntry[], days: number, today: DayKey = todayKey()): SleepEntry[] {
  const from = addDaysToKey(today, -(days - 1));
  return entries
    .filter((entry) => entry.date >= from && entry.date <= today)
    .sort((a, b) => b.date.localeCompare(a.date));
}

export interface SleepStats {
  /** Quantas noites foram registadas na janela. */
  nights: number;
  /** Média de minutos, só das noites com duração conhecida. */
  averageMin: number | null;
  /** Quantas noites tiveram duração conhecida — o denominador da média. */
  measured: number;
  /** Média da qualidade, de 1 a 5. */
  averageQuality: number | null;
  /** Noites em que dormiu o recomendado ou mais. */
  goodNights: number;
  /**
   * Variação da hora de deitar, em minutos.
   *
   * A regularidade conta tanto como o total, e é a parte que se controla. Null
   * enquanto não houver três noites com hora — duas noites não têm variação,
   * têm uma diferença.
   */
  bedtimeSpreadMin: number | null;
}

export function stats(entries: SleepEntry[]): SleepStats {
  const durations = entries
    .map(durationOf)
    .filter((value): value is number => value != null);

  const qualities = entries
    .map((entry) => entry.quality)
    .filter((value): value is number => value != null);

  const bedtimes = entries
    .map((entry) => entry.bedtime)
    .filter((value): value is string => value != null)
    .map((clock) => {
      const [h = 0, m = 0] = clock.split(':').map(Number);
      // As horas depois da meia-noite contam como uma noite tardia, e não como
      // uma manhã: 01:00 é mais tarde do que 23:00, não dezoito horas antes.
      const minutes = h * 60 + m;
      return minutes < 12 * 60 ? minutes + 24 * 60 : minutes;
    });

  const mean = (values: number[]): number =>
    values.reduce((sum, value) => sum + value, 0) / values.length;

  return {
    nights: entries.length,
    averageMin: durations.length > 0 ? Math.round(mean(durations)) : null,
    measured: durations.length,
    averageQuality: qualities.length > 0 ? Math.round(mean(qualities) * 10) / 10 : null,
    goodNights: durations.filter((value) => value >= RECOMMENDED_MIN).length,
    bedtimeSpreadMin: bedtimes.length >= 3
      ? Math.round(Math.max(...bedtimes) - Math.min(...bedtimes))
      : null,
  };
}
