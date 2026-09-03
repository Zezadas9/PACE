/**
 * O contexto, resumido para o modelo.
 *
 * Não se envia o contexto em bruto por três razões, todas práticas: custa
 * tokens a sério, enche a janela com identificadores que não dizem nada, e
 * manda para fora mais do que é preciso para responder. O que sai daqui é um
 * resumo legível, com limites em tudo, feito só dos campos que o assistente
 * usa mesmo.
 *
 * O que não vier autorizado chega aqui vazio — o filtro de consentimento
 * acontece no cliente, antes do pedido — e um campo vazio vira uma linha a
 * dizer que não há dados, para o modelo poder ser honesto em vez de inventar.
 */

import type { CoachContextInput } from './schema';

const MAX_LINES_PER_SECTION = 8;

function str(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function bool(value: unknown): boolean {
  return value === true;
}

function field(record: unknown, key: string): unknown {
  return record && typeof record === 'object' ? (record as Record<string, unknown>)[key] : undefined;
}

/** Ordena por data descendente e corta: o recente é o que informa. */
function recent<T>(items: T[], dateOf: (item: T) => string | null, limit: number): T[] {
  return items
    .filter((item) => dateOf(item) != null)
    .sort((a, b) => (dateOf(b) ?? '').localeCompare(dateOf(a) ?? ''))
    .slice(0, limit);
}

function section(title: string, lines: string[]): string {
  if (lines.length === 0) return `${title}: sem dados.`;
  return `${title}:\n${lines.slice(0, MAX_LINES_PER_SECTION).map((line) => `- ${line}`).join('\n')}`;
}

export function summarizeContext(context: CoachContextInput): string {
  const parts: string[] = [`Data de hoje: ${context.today}.`];

  const profile = context.profile;
  parts.push(profile
    ? `Perfil: ${[
      profile.ageYears != null ? `${profile.ageYears} anos` : null,
      profile.gender && profile.gender !== 'undisclosed' ? profile.gender : null,
      profile.heightCm != null ? `${profile.heightCm} cm` : null,
      profile.weightKg != null ? `${profile.weightKg} kg` : null,
    ].filter(Boolean).join(', ') || 'sem dados'}.`
    : 'Perfil: não autorizado ou por preencher.');

  parts.push(section('Objetivos', context.goals
    .filter((goal) => bool(field(goal, 'active')))
    .map((goal) => str(field(goal, 'label')) ?? str(field(goal, 'type')) ?? '')
    .filter((label) => label !== '')));

  const exerciseNames = new Map<string, string>();
  for (const exercise of context.exercises) {
    const id = str(field(exercise, 'id'));
    const name = str(field(exercise, 'name'));
    if (id && name) exerciseNames.set(id, name);
  }

  const weekdayNames = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
  parts.push(section('Planos de treino', context.workouts
    .filter((workout) => !bool(field(workout, 'archived')))
    .map((workout) => {
      const blocks = field(workout, 'blocks');
      const list = Array.isArray(blocks) ? blocks : [];
      const days = field(workout, 'weekdays');
      const dayLabels = Array.isArray(days)
        ? days.map((day) => weekdayNames[Number(day)] ?? '').filter(Boolean).join(', ')
        : '';
      const names = list
        .map((block) => exerciseNames.get(str(field(block, 'exerciseId')) ?? '') ?? null)
        .filter((name): name is string => name != null)
        .slice(0, 6);
      return `${str(field(workout, 'title')) ?? 'Plano'} (${str(field(workout, 'type')) ?? 'treino'}`
        + `${dayLabels ? `, ${dayLabels}` : ''}): ${list.length} blocos`
        + `${names.length > 0 ? ` — ${names.join(', ')}` : ''}`;
    })));

  parts.push(section('Sessões de treino recentes', recent(
    context.sessions.filter((session) => bool(field(session, 'completed'))),
    (session) => str(field(session, 'date')),
    6,
  ).map((session) => {
    const duration = num(field(session, 'durationSec'));
    const rpe = num(field(session, 'perceivedEffort'));
    return `${str(field(session, 'date'))}: `
      + `${duration != null ? `${Math.round(duration / 60)} min` : 'duração por registar'}`
      + `${rpe != null ? `, RPE ${rpe}` : ', sem RPE'}`
      + `${str(field(session, 'difficulty')) ? `, ${str(field(session, 'difficulty'))}` : ''}`;
  })));

  parts.push(section('Atividades recentes', recent(
    context.activities.filter((activity) => field(activity, 'endedAt') != null),
    (activity) => str(field(activity, 'date')),
    6,
  ).map((activity) => {
    const distance = num(field(activity, 'distanceM'));
    const duration = num(field(activity, 'durationSec'));
    return `${str(field(activity, 'date'))}: ${str(field(activity, 'type')) ?? 'atividade'}`
      + `${distance != null ? `, ${(distance / 1000).toFixed(1)} km` : ''}`
      + `${duration != null ? `, ${Math.round(duration / 60)} min` : ''}`;
  })));

  parts.push(section('Hábitos', context.habits
    .filter((habit) => !bool(field(habit, 'archived')))
    .map((habit) => `${str(field(habit, 'title')) ?? 'Hábito'}`
      + ` (${str(field(habit, 'frequency')) ?? 'diário'}`
      + `${bool(field(habit, 'essential')) ? ', essencial' : ''})`)));

  // Alimentação: dias com registo e água, sem tentar recalcular nutrientes.
  // O cálculo honesto — com o que é desconhecido em vez de zero — vive no
  // domínio da aplicação, e não se duplica aqui.
  const mealDays = new Set(context.meals.map((meal) => str(field(meal, 'date'))).filter(Boolean));
  const waterToday = context.water
    .filter((entry) => str(field(entry, 'date')) === context.today)
    .reduce((sum, entry) => sum + (num(field(entry, 'ml')) ?? 0), 0);
  parts.push(context.meals.length === 0
    ? 'Alimentação: sem registos.'
    : `Alimentação: ${context.meals.length} refeições registadas em ${mealDays.size} dias; `
      + `água hoje: ${waterToday} ml.`);

  const plan = context.runPlan;
  if (plan) {
    const sessions = field(plan, 'sessions');
    const list = Array.isArray(sessions) ? sessions : [];
    const next = list.find((session) => str(field(session, 'status')) === 'planned');
    const goalM = num(field(plan, 'goalDistanceM'));
    parts.push(`Plano de corrida: ${str(field(plan, 'title')) ?? 'plano'}`
      + `${goalM != null ? `, meta ${(goalM / 1000).toFixed(0)} km` : ''}`
      + `, ${list.filter((s) => str(field(s, 'status')) === 'done').length}/${list.length} sessões feitas`
      + `${next ? `; próxima a ${str(field(next, 'date'))}` : ''}.`);
  } else {
    parts.push('Plano de corrida: nenhum ativo.');
  }

  return parts.join('\n\n');
}
