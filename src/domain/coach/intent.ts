/**
 * PACE — ler o que foi pedido.
 *
 * Sem modelo de linguagem: uma leitura por padrões, em português, que devolve
 * uma intenção com tudo o que veio com ela — tema, músculos, tempo, distância,
 * equipamento, tipo de treino.
 *
 * Duas coisas aprendidas à força:
 *
 * 1. **Uma conversa não são mensagens soltas.** "Mas eu queria que fosse só de
 *    superiores" não tem verbo, não tem a palavra treino e não diz nada sozinha.
 *    Lida contra a intenção anterior, diz tudo. Por isso existe `refine`.
 * 2. **Nunca devolver um beco.** Se a leitura não chegar a lado nenhum, a
 *    resposta é a ajuda mais próxima do que foi escrito, não um "não percebi".
 */

import type { MuscleGroup, WorkoutType } from '../../core/types';
import { SPORTS } from './sports';

export type CoachIntentKind =
  | 'create_workout'
  | 'evaluate_workout'
  | 'run_plan'
  | 'activity_plan'
  | 'performance'
  | 'nutrition'
  | 'meal_ideas'
  | 'habits'
  | 'sleep'
  | 'stretching'
  | 'recovery'
  | 'today'
  | 'organize_week'
  | 'move_session'
  | 'block_day'
  | 'capabilities'
  | 'unknown';

/** Onde o treino acontece, que muda os exercícios possíveis. */
export type Equipment = 'gym' | 'home' | 'bodyweight' | null;

export interface CoachIntent {
  kind: CoachIntentKind;
  minutes: number | null;
  distanceM: number | null;
  muscles: MuscleGroup[];
  /** Grupos que o utilizador pediu para deixar de fora. */
  excluded: MuscleGroup[];
  workoutType: WorkoutType | null;
  equipment: Equipment;
  perWeek: {
    workouts: number | null;
    runs: number | null;
    walksDaily: boolean;
    /** "beber água regularmente" — um hábito sem hora marcada. */
    water: boolean;
  };
  /** "de manhã", "à tarde", "à noite" — a altura do dia preferida. */
  partOfDay: 'morning' | 'afternoon' | 'evening' | null;
  /** Dias que o utilizador disse que não pode. 0 = domingo. */
  excludedWeekdays: number[];
  /** "passa o treino de sexta para sábado". */
  move: { from: number; to: number } | null;
  /** Verdadeiro quando a mensagem só faz sentido contra a anterior. */
  isRefinement: boolean;
  raw: string;
}

const MUSCLE_TERMS: Array<[MuscleGroup, string[]]> = [
  ['legs', [
    'pernas', 'perna', 'quadriceps', 'quadríceps', 'gluteos', 'glúteos', 'gluteo',
    'inferiores', 'inferior', 'parte de baixo', 'membros inferiores', 'gemeos', 'gémeos',
    'panturrilha', 'isquiotibiais', 'femoral', 'agachamento',
  ]],
  ['chest', ['peito', 'peitoral', 'peitorais', 'supino']],
  ['back', ['costas', 'dorsais', 'dorsal', 'lombar', 'trapezio', 'trapézio', 'remada', 'puxar']],
  ['shoulders', ['ombros', 'ombro', 'deltoides', 'deltoide']],
  ['arms', [
    'bracos', 'braços', 'braco', 'braço', 'biceps', 'bíceps', 'triceps', 'tríceps',
    'antebraco', 'antebraço',
  ]],
  ['core', [
    'core', 'abdominal', 'abdominais', 'abdomen', 'abdómen', 'barriga', 'oblíquos',
    'obliquos', 'prancha',
  ]],
  ['full_body', ['corpo inteiro', 'corpo todo', 'full body', 'treino geral']],
];

/** "Superiores" é meio corpo, não um músculo. */
const UPPER: MuscleGroup[] = ['chest', 'back', 'shoulders', 'arms'];
const UPPER_TERMS = [
  'superiores', 'superior', 'parte de cima', 'tronco', 'membros superiores',
  'torso', 'upper',
];

const TYPE_TERMS: Array<[WorkoutType, string[]]> = [
  ['mobility', ['mobilidade', 'alongar', 'alongamento', 'alongamentos', 'flexibilidade', 'esticar']],
  ['hiit', ['hiit', 'intervalado', 'alta intensidade', 'tabata']],
  ['calisthenics', ['calistenia', 'peso do corpo', 'barras']],
  ['functional', ['funcional', 'crossfit', 'circuito']],
  ['pilates', ['pilates']],
  ['sport', ['desportivo', 'futebol', 'basquete', 'padel', 'ténis', 'tenis']],
  ['strength', ['musculacao', 'musculação', 'forca', 'força', 'pesos', 'ginasio', 'ginásio']],
];

function normalize(message: string): string {
  return message
    .toLowerCase()
    .normalize('NFC')
    .replace(/\s+/g, ' ')
    .trim();
}

function has(text: string, ...terms: string[]): boolean {
  return terms.some((term) => text.includes(term));
}

/** "45 minutos", "45min", "1 hora", "1h30", "meia hora". */
/**
 * Números escritos por extenso.
 *
 * "duas horas" é como as pessoas escrevem, e sem isto a duração pedida
 * desaparecia: o pedido caía no valor por omissão e a resposta trazia um treino
 * de 45 minutos a quem tinha pedido duas horas.
 */
const NUMBER_WORDS: Record<string, number> = {
  meia: 0.5, meio: 0.5, um: 1, uma: 1, dois: 2, duas: 2, tres: 3, 'três': 3,
  quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10,
  quinze: 15, vinte: 20, trinta: 30, quarenta: 40, cinquenta: 50, sessenta: 60,
  noventa: 90,
};

const WORD_PATTERN = Object.keys(NUMBER_WORDS).join('|');

function readMinutes(text: string): number | null {
  if (has(text, 'meia hora')) return 30;

  // Por extenso, antes dos algarismos: "duas horas e meia" tem de dar 150.
  const wordHours = new RegExp(`(${WORD_PATTERN})\\s+horas?(\\s+e\\s+meia)?`).exec(text);
  if (wordHours?.[1]) {
    const base = (NUMBER_WORDS[wordHours[1]] ?? 0) * 60;
    return Math.round(base + (wordHours[2] ? 30 : 0));
  }
  const wordMinutes = new RegExp(`(${WORD_PATTERN})\\s+minutos?`).exec(text);
  if (wordMinutes?.[1]) return Math.round(NUMBER_WORDS[wordMinutes[1]] ?? 0);

  const hoursAndMinutes = text.match(/(\d+)\s*h\s*(\d{1,2})/);
  if (hoursAndMinutes) {
    return Number(hoursAndMinutes[1]) * 60 + Number(hoursAndMinutes[2]);
  }
  const hours = text.match(/(\d+(?:[.,]\d+)?)\s*(?:h\b|horas?\b)/);
  if (hours?.[1]) return Math.round(Number(hours[1].replace(',', '.')) * 60);

  const minutes = text.match(/(\d+)\s*(?:min\b|minutos?\b)/);
  if (minutes?.[1]) return Number(minutes[1]);
  return null;
}

/** "10 km", "5km", "1500 m", "meia maratona". */
function readDistance(text: string): number | null {
  if (has(text, 'meia maratona')) return 21097;
  if (has(text, 'maratona')) return 42195;

  const km = text.match(/(\d+(?:[.,]\d+)?)\s*(?:km\b|quil[oó]metros?\b|k\b)/);
  if (km?.[1]) return Math.round(Number(km[1].replace(',', '.')) * 1000);

  const meters = text.match(/(\d{3,5})\s*(?:m\b|metros\b)/);
  if (meters?.[1]) return Number(meters[1]);
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
  let water = false;

  for (const clause of clauses) {
    // "correr 2" nao traz a palavra "vezes", e e assim que as pessoas
    // escrevem. Um numero solto na oracao conta — a nao ser que venha com
    // uma unidade de distancia, que e outra conversa.
    const temDistancia = /(?:km|quil|metros)/.test(clause);
    const count = clause.match(/(\d+)\s*(?:x\b|vezes?\b)/)
      ?? (temDistancia ? null : clause.match(/(\d+)/));
    const value = count?.[1] ? Number(count[1]) : null;
    const isRun = has(clause, 'corr');
    const isWalk = has(clause, 'caminh', 'andar', 'passear');

    if (isWalk && has(clause, 'todos os dias', 'diariamente', 'todo o dia')) walksDaily = true;
    if (has(clause, 'agua', 'água', 'hidrat', 'beber')) water = true;
    if (value == null) continue;
    if (isRun) runs = value;
    else if (isWalk) walksDaily = value >= 7;
    else if (has(clause, 'trein', 'ginasio', 'ginásio', 'muscula')) workouts = value;
    else if (workouts == null) workouts = value;
  }

  return { workouts, runs, walksDaily, water };
}

const WEEKDAY_TERMS: Array<[number, string[]]> = [
  [0, ['domingo']],
  [1, ['segunda', '2a feira', 'segunda-feira']],
  [2, ['terça', 'terca', '3a feira']],
  [3, ['quarta', '4a feira']],
  [4, ['quinta', '5a feira']],
  [5, ['sexta', '6a feira']],
  [6, ['sábado', 'sabado']],
];

function readWeekday(text: string): number | null {
  for (const [day, terms] of WEEKDAY_TERMS) {
    if (has(text, ...terms)) return day;
  }
  return null;
}

/** "de manhã", "à tarde", "ao fim do dia". */
function readPartOfDay(text: string): CoachIntent['partOfDay'] {
  if (has(text, 'de manha', 'de manhã', 'manha', 'manhã', 'cedo', 'antes do trabalho')) {
    return 'morning';
  }
  if (has(text, 'a tarde', 'à tarde', 'depois de almo', 'almoço', 'almoco')) return 'afternoon';
  if (has(text, 'a noite', 'à noite', 'fim do dia', 'depois do trabalho', 'ao jantar')) {
    return 'evening';
  }
  return null;
}

/**
 * "Não consigo treinar quarta-feira", "quarta não dá".
 *
 * Um dia excluído é uma restrição, não um pedido: entra na proposta como um
 * dia que não se toca, e não como um dia a esvaziar.
 */
function readExcludedWeekdays(text: string): number[] {
  const out: number[] = [];
  for (const [day, terms] of WEEKDAY_TERMS) {
    for (const term of terms) {
      const negado = new RegExp(
        `(?:nao|não|nunca|sem|evitar|tirando|exceto|excepto)[^.,;]{0,30}${term}`,
      ).test(text) || new RegExp(`${term}[^.,;]{0,20}(?:nao|não|nunca) (?:posso|consigo|da|dá)`).test(text);
      if (negado && !out.includes(day)) out.push(day);
    }
  }
  return out;
}

/** "passa o treino de sexta para sábado". */
function readMove(text: string): CoachIntent['move'] {
  const match = text.match(/(?:de|da|do|na|em)\s+([a-zçãáéíóêôõ-]+)[^.]{0,20}?\bpara\s+(?:a|o)?\s*([a-zçãáéíóêôõ-]+)/);
  if (!match) return null;
  const from = readWeekday(match[1] ?? '');
  const to = readWeekday(match[2] ?? '');
  if (from == null || to == null || from === to) return null;
  return { from, to };
}

function readMuscles(text: string): { muscles: MuscleGroup[]; excluded: MuscleGroup[] } {
  const muscles: MuscleGroup[] = [];
  const excluded: MuscleGroup[] = [];

  if (has(text, ...UPPER_TERMS)) muscles.push(...UPPER);
  for (const [group, terms] of MUSCLE_TERMS) {
    if (!has(text, ...terms)) continue;
    // "sem pernas", "menos pernas", "nada de pernas" tiram em vez de pôr.
    const negated = terms.some((term) => new RegExp(
      `(?:sem|menos|nada de|exceto|excepto|tirando|nao|não)\\s+(?:\\w+\\s+){0,2}${term}`,
    ).test(text));
    if (negated) excluded.push(group);
    else if (!muscles.includes(group)) muscles.push(group);
  }
  return { muscles: muscles.filter((group) => !excluded.includes(group)), excluded };
}

function readType(text: string): WorkoutType | null {
  for (const [type, terms] of TYPE_TERMS) {
    if (has(text, ...terms)) return type;
  }
  return null;
}

function readEquipment(text: string): Equipment {
  if (has(text, 'em casa', 'sem equipamento', 'sem material', 'sem pesos', 'sem maquinas',
    'sem máquinas', 'peso do corpo', 'peso corporal', 'calistenia')) {
    return has(text, 'em casa') ? 'home' : 'bodyweight';
  }
  if (has(text, 'ginasio', 'ginásio', 'maquinas', 'máquinas', 'barra', 'halteres')) return 'gym';
  return null;
}

/**
 * Uma correção ao que veio antes.
 *
 * Estas frases não se explicam sozinhas — "mas eu queria que fosse só de
 * superiores" só quer dizer alguma coisa contra o pedido anterior. Detetá-las é
 * o que separa uma conversa de uma sequência de perguntas isoladas.
 */
const REFINEMENT_STARTERS = [
  'mas ', 'e se', 'afinal', 'antes disso', 'em vez', 'prefiro', 'queria', 'quero antes',
  'podes', 'pode ser', 'muda', 'troca', 'altera', 'só ', 'so ', 'sem ', 'com ', 'mais ',
  'menos ', 'e ', 'faz antes', 'refaz', 'outra vez', 'igual mas',
];

/**
 * Verbos que abrem um pedido novo.
 *
 * "Podes" comeca tanto uma correcao ("podes tirar os agachamentos") como um
 * pedido inteiro ("podes criar-me um treino de futebol"). Sem esta lista, o
 * segundo era lido como correcao do primeiro: a resposta comecava por
 * "Ajustei" e o pedido novo perdia-se pelo caminho.
 */
const NEW_REQUEST = [
  'cria', 'criar', 'monta', 'montar', 'faz-me', 'faz me', 'fazer-me', 'prepara',
  'preparar', 'da-me', 'da me', 'dá-me', 'dá me', 'arranja', 'planeia', 'preciso de', 'quero um',
  'quero uma', 'gostava de um', 'gostava de uma', 'sugere', 'organiza',
];

export function looksLikeRefinement(message: string): boolean {
  const text = normalize(message);
  if (text.length > 120) return false;
  if (NEW_REQUEST.some((verb) => text.includes(verb))) return false;
  return REFINEMENT_STARTERS.some((starter) => text.startsWith(starter));
}

/** A mensagem nomeia uma modalidade que a PACE sabe montar? */
function namesSport(text: string): boolean {
  return SPORTS.some((sport) => sport.terms.some((term) => text.includes(term)));
}

function classify(text: string, parsed: Omit<CoachIntent, 'kind' | 'isRefinement'>): CoachIntentKind {
  if (has(text, 'o que sabes', 'o que podes', 'como funcionas', 'que dados', 'quem és',
    'quem es', 'para que serves')) {
    return 'capabilities';
  }

  // Mover uma sessão e bloquear um dia vêm antes de tudo: falam de treino e de
  // dias, e seriam lidas como um pedido de treino novo.
  if (parsed.move && has(text, 'passa', 'muda', 'troca', 'move', 'adia', 'antecipa')) {
    return 'move_session';
  }
  if (parsed.excludedWeekdays.length > 0
    && has(text, 'trein', 'corr', 'caminh', 'consigo', 'posso', 'da', 'dá')) {
    return 'block_day';
  }

  /*
   * Um substantivo explicito ganha a qualquer heuristica de contagem.
   *
   * "Cria-me uma rotina de alongamentos de 20 minutos" tem a palavra "rotina" e
   * um numero, e so por isso ia parar a organizacao da semana — vinte
   * alongamentos por semana. O que a frase diz e alongamentos, e e isso que
   * decide.
   */
  if (has(text, 'alongar', 'alongamento', 'flexibilidade', 'mobilidade', 'esticar')) {
    return 'stretching';
  }
  if (has(text, 'dorm', 'durm', 'sono', 'insonia', 'insónia', 'deitar', 'acordar')) {
    return 'sleep';
  }
  if (namesSport(text) && has(text, 'trein', 'rotina', 'sessao', 'sessão', 'plano')) {
    return 'create_workout';
  }

  // A semana inteira vem primeiro: fala de treinos e de corridas ao mesmo
  // tempo, e seria lida como qualquer uma das duas.
  const spread = parsed.perWeek.workouts != null || parsed.perWeek.runs != null
    || parsed.perWeek.walksDaily || parsed.perWeek.water;
  // Dois ou mais compromissos na mesma frase são um pedido de semana, mesmo
  // sem a palavra "semana": "treinar 4 vezes, correr 2 e caminhar todos os
  // dias" não é um pedido de treino, é um horário.
  const partes = [
    parsed.perWeek.workouts != null,
    parsed.perWeek.runs != null,
    parsed.perWeek.walksDaily,
    parsed.perWeek.water,
  ].filter(Boolean).length;
  if (spread && (partes >= 2 || has(text, 'semana', 'organiz', 'distribu', 'rotina', 'agenda'))) {
    return 'organize_week';
  }

  if (has(text, 'que faco hoje', 'que faço hoje', 'o que tenho hoje', 'o que faço agora',
    'que treino hoje', 'hoje faço', 'plano de hoje', 'o que fazer hoje')) {
    return 'today';
  }

  if (has(text, 'dorm', 'durm', 'sono', 'insonia', 'insónia', 'deitar', 'acordar',
    'descansar mal', 'noites')) {
    return 'sleep';
  }
  if (has(text, 'alongar', 'alongamento', 'flexibilidade', 'mobilidade', 'esticar',
    'rigidez', 'tenso')) {
    return 'stretching';
  }
  if (has(text, 'recupera', 'dor muscular', 'dores musculares', 'cansado', 'fadiga',
    'exausto', 'sem energia', 'descanso')) {
    return 'recovery';
  }

  if (has(text, 'equilibrad', 'avalia', 'analisa', 'esta bom', 'está bom', 'faz sentido',
    'critica', 'revê', 'reve')
    && has(text, 'treino', 'plano', 'rotina', 'semana')) {
    return 'evaluate_workout';
  }

  if (has(text, 'evolu', 'progress', 'performance', 'estagn', 'tendencia', 'tendência',
    'como estou', 'estou a melhorar', 'tenho melhorado', 'resultados')) {
    return 'performance';
  }

  if (has(text, 'comer', 'ementa', 'refeic', 'refeiç', 'receita', 'pequeno-almo',
    'almoc', 'almoç', 'jantar', 'lanche', 'snack')
    && has(text, 'sugere', 'ideias', 'o que', 'exemplos', 'sugest')) {
    return 'meal_ideas';
  }
  if (has(text, 'proteina', 'proteína', 'aliment', 'calorias', 'dieta', 'hidratos',
    'gordura', 'agua', 'água', 'hidrat', 'macros', 'fibra', 'como bem', 'comi')) {
    return 'nutrition';
  }

  if (has(text, 'habito', 'hábito', 'rotina', 'condicao fisica', 'condição física',
    'consistencia', 'consistência', 'motivac', 'motivaç')) {
    return 'habits';
  }

  // Corrida e caminhada: a distância ou o verbo chegam.
  if (has(text, 'corr', 'maratona', '5k', '10k') && !has(text, 'ja corri', 'já corri')) {
    return 'run_plan';
  }
  if (has(text, 'caminh', 'andar mais', 'passos', 'bicicleta', 'pedalar', 'passeio')) {
    return 'activity_plan';
  }

  if (has(text, 'trein', 'exerc', 'serie', 'série', 'repetic', 'repetiç', 'carga',
    'ginasio', 'ginásio', 'peito', 'costas', 'pernas', 'ombros', 'braco', 'braço',
    'abdominais', 'superiores', 'inferiores', 'musculo', 'músculo')) {
    return 'create_workout';
  }
  if (parsed.muscles.length > 0 || parsed.workoutType != null) return 'create_workout';
  if (parsed.distanceM != null) return 'run_plan';

  return 'unknown';
}

export function parseIntent(message: string): CoachIntent {
  const text = normalize(message);
  const { muscles, excluded } = readMuscles(text);
  const parsed = {
    minutes: readMinutes(text),
    distanceM: readDistance(text),
    muscles,
    excluded,
    workoutType: readType(text),
    equipment: readEquipment(text),
    perWeek: readPerWeek(text),
    partOfDay: readPartOfDay(text),
    excludedWeekdays: readExcludedWeekdays(text),
    move: readMove(text),
    raw: message.trim(),
  };

  return {
    ...parsed,
    kind: classify(text, parsed),
    isRefinement: looksLikeRefinement(message),
  };
}

/**
 * Junta uma correção ao pedido anterior.
 *
 * O que a nova mensagem traz ganha; o resto vem de trás. É assim que "só de
 * superiores" continua a ser um treino de 45 minutos — e é assim que uma
 * conversa se comporta como conversa.
 */
export function refine(previous: CoachIntent | null, next: CoachIntent): CoachIntent {
  if (!previous || !next.isRefinement) return next;

  const carriesNothing = next.muscles.length === 0
    && next.excluded.length === 0
    && next.minutes == null
    && next.distanceM == null
    && next.workoutType == null
    && next.equipment == null;
  // Uma correção que não traz nada de novo nem sequer é uma correção.
  if (carriesNothing && next.kind === 'unknown') return next;

  const muscles = next.muscles.length > 0
    ? next.muscles
    : previous.muscles.filter((group) => !next.excluded.includes(group));

  return {
    kind: next.kind === 'unknown' ? previous.kind : next.kind,
    minutes: next.minutes ?? previous.minutes,
    distanceM: next.distanceM ?? previous.distanceM,
    muscles,
    excluded: next.excluded,
    workoutType: next.workoutType ?? previous.workoutType,
    equipment: next.equipment ?? previous.equipment,
    perWeek: {
      workouts: next.perWeek.workouts ?? previous.perWeek.workouts,
      runs: next.perWeek.runs ?? previous.perWeek.runs,
      walksDaily: next.perWeek.walksDaily || previous.perWeek.walksDaily,
      water: next.perWeek.water || previous.perWeek.water,
    },
    partOfDay: next.partOfDay ?? previous.partOfDay,
    excludedWeekdays: next.excludedWeekdays.length > 0
      ? next.excludedWeekdays
      : previous.excludedWeekdays,
    move: next.move ?? null,
    isRefinement: true,
    raw: next.raw,
  };
}
