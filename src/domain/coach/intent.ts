/**
 * PACE — ler o que foi pedido.
 *
 * Sem modelo de linguagem: uma leitura por padrões, em português, que devolve
 * uma intenção e os números que vierem com ela. É honesta sobre o que não
 * percebeu — devolve `unknown` em vez de arriscar uma ação errada, porque uma
 * intenção mal adivinhada aqui acaba num treino que ninguém pediu.
 *
 * Quando um modelo entrar (ver `AssistantPort`), passa a ser ele a produzir
 * este mesmo objeto, e tudo o resto continua igual.
 */

import type { MuscleGroup } from '../../core/types';

export type CoachIntentKind =
  | 'create_workout'
  | 'evaluate_workout'
  | 'run_plan'
  | 'performance'
  | 'nutrition'
  | 'habits'
  | 'organize_week'
  | 'capabilities'
  | 'unknown';

export interface CoachIntent {
  kind: CoachIntentKind;
  /** Minutos pedidos para a sessão. */
  minutes: number | null;
  /** Metros pedidos, já convertidos. */
  distanceM: number | null;
  muscles: MuscleGroup[];
  /** "treinar 4 vezes por semana" → 4. */
  perWeek: { workouts: number | null; runs: number | null; walksDaily: boolean };
  raw: string;
}

const MUSCLE_TERMS: Array<[MuscleGroup, string[]]> = [
  ['legs', ['pernas', 'perna', 'quadriceps', 'quadríceps', 'gluteos', 'glúteos', 'inferior']],
  ['chest', ['peito', 'peitoral']],
  ['back', ['costas', 'dorsais', 'dorsal']],
  ['shoulders', ['ombros', 'ombro', 'deltoides']],
  ['arms', ['bracos', 'braços', 'biceps', 'bíceps', 'triceps', 'tríceps']],
  ['core', ['core', 'abdominal', 'abdominais', 'abdomen', 'abdómen', 'tronco']],
  ['full_body', ['corpo inteiro', 'corpo todo', 'full body', 'geral']],
];

function normalize(message: string): string {
  return message.toLowerCase().replace(/\s+/g, ' ').trim();
}

function has(text: string, ...terms: string[]): boolean {
  return terms.some((term) => text.includes(term));
}

/** "45 minutos", "45min", "1 hora", "1h30". */
function readMinutes(text: string): number | null {
  const hoursAndMinutes = text.match(/(\d+)\s*h\s*(\d{1,2})/);
  if (hoursAndMinutes) {
    return Number(hoursAndMinutes[1]) * 60 + Number(hoursAndMinutes[2]);
  }
  const hours = text.match(/(\d+(?:[.,]\d+)?)\s*(?:h\b|horas?\b)/);
  if (hours?.[1]) return Math.round(Number(hours[1].replace(',', '.')) * 60);

  const minutes = text.match(/(\d+)\s*(?:min\b|minutos?\b|'\s)/);
  if (minutes) return Number(minutes[1]);
  return null;
}

/** "10 km", "5km", "1500 m", "meia maratona". */
function readDistance(text: string): number | null {
  if (has(text, 'meia maratona')) return 21097;
  if (has(text, 'maratona')) return 42195;

  const km = text.match(/(\d+(?:[.,]\d+)?)\s*(?:km\b|quil[oó]metros?\b|k\b)/);
  if (km?.[1]) return Math.round(Number(km[1].replace(',', '.')) * 1000);

  const meters = text.match(/(\d{3,5})\s*(?:m\b|metros\b)/);
  if (meters) return Number(meters[1]);
  return null;
}

/**
 * "treinar 4 vezes por semana, correr 2 vezes e caminhar todos os dias".
 *
 * Lê oração a oração: um número solto não diz a que atividade pertence, e a
 * frase inteira de uma vez atribuía as corridas aos treinos.
 */
function readPerWeek(text: string): CoachIntent['perWeek'] {
  const clauses = text.split(/,| e | mais /);
  let workouts: number | null = null;
  let runs: number | null = null;
  let walksDaily = false;

  for (const clause of clauses) {
    const count = clause.match(/(\d+)\s*(?:x\b|vezes?\b)/);
    const value = count?.[1] ? Number(count[1]) : null;
    const isRun = has(clause, 'corr');
    const isWalk = has(clause, 'caminh', 'andar', 'passear');

    if (isWalk && has(clause, 'todos os dias', 'diariamente', 'todo o dia')) walksDaily = true;
    if (value == null) continue;
    if (isRun) runs = value;
    else if (isWalk) walksDaily = value >= 7;
    else if (has(clause, 'trein', 'ginasio', 'ginásio', 'muscula')) workouts = value;
    else if (workouts == null) workouts = value;
  }

  return { workouts, runs, walksDaily };
}

function readMuscles(text: string): MuscleGroup[] {
  const found: MuscleGroup[] = [];
  for (const [group, terms] of MUSCLE_TERMS) {
    if (has(text, ...terms)) found.push(group);
  }
  return found;
}

export function parseIntent(message: string): CoachIntent {
  const text = normalize(message);
  const base = {
    minutes: readMinutes(text),
    distanceM: readDistance(text),
    muscles: readMuscles(text),
    perWeek: readPerWeek(text),
    raw: message.trim(),
  };

  const kind = ((): CoachIntentKind => {
    if (has(text, 'o que sabes', 'o que podes', 'como funcionas', 'ajuda', 'que dados')) {
      return 'capabilities';
    }

    // A organização da semana vem antes de tudo: fala de treinos e de corridas
    // ao mesmo tempo, e seria lida como qualquer uma das duas.
    const mentionsSpread = base.perWeek.workouts != null
      || base.perWeek.runs != null
      || base.perWeek.walksDaily;
    if (mentionsSpread && has(text, 'semana', 'organiz', 'distribu')) return 'organize_week';

    if (has(text, 'equilibrad', 'avalia', 'analisa', 'está bom', 'esta bom', 'faz sentido')
      && has(text, 'treino', 'plano de treino', 'rotina')) {
      return 'evaluate_workout';
    }
    if (has(text, 'cria', 'monta', 'faz-me', 'faz me', 'prepara', 'sugere', 'quero')
      && has(text, 'treino', 'sessao de treino', 'sessão de treino')) {
      return 'create_workout';
    }
    if (has(text, 'correr', 'corrida', 'maratona', '5k', '10k') && !has(text, 'ontem', 'hoje corri')) {
      return 'run_plan';
    }
    if (has(text, 'habito', 'hábito', 'rotina', 'condicao fisica', 'condição física',
      'sono', 'dormir')) {
      return 'habits';
    }
    // "melhorar" sozinho não chega: aparece em metade dos pedidos.
    if (has(text, 'evolu', 'progress', 'performance', 'estagn', 'tendencia', 'tendência',
      'como estou', 'estou a melhorar', 'tenho melhorado')) {
      return 'performance';
    }
    if (has(text, 'proteina', 'proteína', 'aliment', 'calorias', 'como', 'dieta',
      'hidratos', 'gordura', 'agua', 'água')) {
      return 'nutrition';
    }

    if (has(text, 'treino', 'treinar')) return 'create_workout';
    return 'unknown';
  })();

  return { kind, ...base };
}
