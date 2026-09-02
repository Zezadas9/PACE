/**
 * PACE — ler o diário alimentar sem inventar o que lá não está.
 *
 * O módulo de nutrição já distingue "zero" de "desconhecido"; aqui essa
 * distinção passa a palavras. Uma média de proteína calculada sobre dias em que
 * metade dos alimentos não tem rótulo não é uma média — é um palpite com casas
 * decimais, e é dito assim.
 */

import type { DayKey, Food, Meal, WaterEntry } from '../../core/types';
import { addDaysToKey } from '../../core/utils/date';
import { dayTotals, waterOn } from '../nutrition';
import type { Finding } from './evaluate-workout';

export interface NutritionReading {
  daysTracked: number;
  daysLogged: number;
  /** Médias só dos dias com registo, e null quando não são fiáveis. */
  avgKcal: number | null;
  avgProteinG: number | null;
  avgWaterMl: number | null;
  /** Proporção de itens sem valores nutricionais no período. */
  unknownShare: number;
  proteinPerKg: number | null;
  findings: Finding[];
}

const WINDOW_DAYS = 14;

export function readNutrition(
  meals: Meal[],
  foods: Food[],
  water: WaterEntry[],
  weightKg: number | null,
  today: DayKey,
): NutritionReading {
  const days: DayKey[] = [];
  for (let i = WINDOW_DAYS - 1; i >= 0; i -= 1) days.push(addDaysToKey(today, -i));

  const perDay = days.map((date) => ({
    date,
    totals: dayTotals(meals, foods, date),
    waterMl: waterOn(water, date),
  }));

  const logged = perDay.filter((day) => day.totals.itemCount > 0);
  const kcals = logged
    .map((day) => day.totals.values.kcal)
    .filter((value): value is number => value != null);
  const proteins = logged
    .map((day) => day.totals.values.protein)
    .filter((value): value is number => value != null);
  const waters = perDay.map((day) => day.waterMl).filter((value) => value > 0);

  const items = logged.reduce((sum, day) => sum + day.totals.itemCount, 0);
  const unknown = logged.reduce((sum, day) => sum + day.totals.unknown.kcal, 0);
  const unknownShare = items > 0 ? unknown / items : 0;

  const avgProtein = proteins.length >= 3 ? mean(proteins) : null;
  const reading: NutritionReading = {
    daysTracked: WINDOW_DAYS,
    daysLogged: logged.length,
    avgKcal: kcals.length >= 3 ? Math.round(mean(kcals)) : null,
    avgProteinG: avgProtein == null ? null : Math.round(avgProtein),
    avgWaterMl: waters.length >= 3 ? Math.round(mean(waters)) : null,
    unknownShare,
    proteinPerKg: avgProtein != null && weightKg
      ? Math.round((avgProtein / weightKg) * 100) / 100
      : null,
    findings: [],
  };
  reading.findings = findingsFor(reading);
  return reading;
}

function mean(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function findingsFor(reading: NutritionReading): Finding[] {
  const findings: Finding[] = [];

  if (reading.daysLogged < 3) {
    return [{
      tone: 'unknown',
      title: 'Poucos dias registados',
      detail: `${reading.daysLogged} ${reading.daysLogged === 1 ? 'dia' : 'dias'} com `
        + `refeições nos últimos ${reading.daysTracked}. `
        + 'Com isto não dá para falar de médias — só do que aconteceu nesses dias.',
      referenceIds: [],
    }];
  }

  // O aviso mais importante da secção: metade dos alimentos sem rótulo torna
  // qualquer média decorativa.
  if (reading.unknownShare > 0.25) {
    findings.push({
      tone: 'unknown',
      title: 'A estimativa não chega',
      detail:
        `${Math.round(reading.unknownShare * 100)}% dos alimentos registados não têm valores `
        + 'nutricionais, por isso as médias abaixo ficam por baixo do que comeste de facto. '
        + 'Preenche os valores dos alimentos que repetes mais e isto passa a valer alguma coisa.',
      referenceIds: [],
    });
  }

  if (reading.proteinPerKg != null) {
    const perKg = reading.proteinPerKg;
    if (perKg < 1.2) {
      findings.push({
        tone: 'gap',
        title: `Proteína a rondar ${perKg} g por kg de peso`,
        detail:
          'Em quem treina força, a meta-análise de Morton (2018) aponta benefícios até cerca '
          + 'de 1,6 g/kg/dia. Estás abaixo — e lembra-te que o que falta registar também '
          + 'conta para este número.',
        referenceIds: ['morton-2018'],
      });
    } else if (perKg <= 2.2) {
      findings.push({
        tone: 'good',
        title: `Proteína a rondar ${perKg} g por kg`,
        detail: 'Dentro do intervalo em que a literatura deixa de mostrar ganhos adicionais.',
        referenceIds: ['morton-2018'],
      });
    } else {
      findings.push({
        tone: 'watch',
        title: `Proteína alta: ${perKg} g por kg`,
        detail: 'Acima do ponto em que há benefício demonstrado para treino de força. '
          + 'Não é uma recomendação clínica — é só o que a evidência de performance mostra.',
        referenceIds: ['morton-2018'],
      });
    }
  } else {
    findings.push({
      tone: 'unknown',
      title: 'Proteína por kg indisponível',
      detail: reading.avgProteinG == null
        ? 'Faltam valores de proteína nos alimentos registados.'
        : 'Falta o teu peso para converter gramas em g/kg — está no perfil.',
      referenceIds: ['morton-2018'],
    });
  }

  if (reading.avgWaterMl != null) {
    findings.push({
      tone: reading.avgWaterMl >= 1500 ? 'good' : 'watch',
      title: `Água: ${reading.avgWaterMl} ml por dia, em média`,
      detail:
        'A EFSA aponta uma ingestão adequada de cerca de 2,0 L (mulheres) a 2,5 L (homens) '
        + 'por dia, contando a água dos alimentos — por isso o que bebes é só parte da conta.',
      referenceIds: ['efsa-2010'],
    });
  }

  if (reading.avgKcal != null) {
    findings.push({
      tone: 'good',
      title: `Média de ${reading.avgKcal} kcal nos dias registados`,
      detail:
        'É uma média do que foi registado, não do que foi comido: os dias em branco e os '
        + 'alimentos sem valores ficam de fora.',
      referenceIds: [],
    });
  }

  return findings;
}
