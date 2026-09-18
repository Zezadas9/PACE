/**
 * Que desporto é este treino.
 *
 * Um treino não tem um campo "desporto": tem um tipo — musculação, desportivo,
 * mobilidade — e um título escrito por quem o criou ou pela IA. "Basquetebol —
 * Técnica + Físico" é basquetebol para qualquer pessoa que o leia, e é disso
 * que o ícone precisa para deixar de ser um haltere igual para tudo.
 *
 * Por isso a leitura é do título, com o tipo como rede por baixo. As palavras
 * são comparadas sem acentos e sem maiúsculas, porque "Ténis", "tenis" e
 * "TÉNIS" são a mesma coisa, e a ordem da lista importa: "ténis de mesa" tem
 * de ser lido antes de "ténis".
 *
 * Aqui só se decide o desporto. Que desenho lhe corresponde é assunto da
 * camada de cima — o mesmo ténis pode ser uma raquete hoje e outra coisa
 * amanhã sem que esta lista mude.
 */

import type { WorkoutType } from '../core/types';

export type SportId =
  | 'basketball' | 'football' | 'tennis' | 'tabletennis' | 'volleyball'
  | 'handball' | 'swimming' | 'cycling' | 'running' | 'walking' | 'dance'
  | 'boxing' | 'martialarts' | 'gymnastics' | 'golf' | 'surf' | 'skate'
  | 'climbing' | 'hockey' | 'rugby' | 'baseball' | 'badminton' | 'skating'
  | 'ski' | 'rowing' | 'yoga'
  | 'strength' | 'functional' | 'calisthenics' | 'hiit' | 'mobility'
  | 'pilates' | 'generic';

/** Sem acentos, sem maiúsculas, e com tudo o que não é letra virado espaço. */
export function plain(text: string): string {
  return ` ${text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()} `;
}

/**
 * As palavras de cada desporto, pela ordem em que são procuradas.
 *
 * Cada entrada é um pedaço de palavra: "basquete" apanha "basquetebol" e
 * "basquete" sem precisar das duas. O que vem primeiro ganha — é isso que faz
 * "ténis de mesa" não ser ténis, e "hoquei em patins" não ser patinagem.
 */
const RULES: ReadonlyArray<{ id: SportId; words: ReadonlyArray<string> }> = [
  { id: 'tabletennis', words: ['tenis de mesa', 'ping pong', 'pingue pongue'] },
  { id: 'hockey', words: ['hoquei', 'hockey'] },
  { id: 'basketball', words: ['basquete', 'basket', 'nba'] },
  { id: 'football', words: ['futebol', 'futsal', 'football', 'soccer', 'bola na rua'] },
  { id: 'tennis', words: ['tenis', 'tennis', 'padel', 'padle', 'squash'] },
  { id: 'volleyball', words: ['voleibol', 'volei', 'volley'] },
  { id: 'handball', words: ['andebol', 'handball'] },
  { id: 'swimming', words: ['natacao', 'nadar', 'piscina', 'swim'] },
  { id: 'cycling', words: ['ciclismo', 'bicicleta', 'bike', 'btt', 'spinning', 'pedal'] },
  { id: 'dance', words: ['danca', 'dance', 'ballet', 'balet', 'hip hop', 'zumba', 'kizomba', 'salsa'] },
  { id: 'boxing', words: ['boxe', 'boxing', 'kickboxing', 'muay thai'] },
  { id: 'martialarts', words: ['karate', 'judo', 'taekwondo', 'jiu jitsu', 'jiujitsu', 'artes marciais', 'mma', 'luta'] },
  { id: 'gymnastics', words: ['ginastica', 'acrobac', 'trampolim'] },
  { id: 'golf', words: ['golfe', 'golf'] },
  { id: 'surf', words: ['surf', 'bodyboard', 'kitesurf'] },
  { id: 'skate', words: ['skate', 'trotinete'] },
  { id: 'climbing', words: ['escalada', 'boulder', 'climb'] },
  { id: 'rugby', words: ['rugby', 'raguebi'] },
  { id: 'baseball', words: ['basebol', 'baseball'] },
  { id: 'badminton', words: ['badminton'] },
  { id: 'skating', words: ['patinagem', 'patins', 'skating'] },
  { id: 'ski', words: ['esqui', 'ski', 'snowboard'] },
  { id: 'rowing', words: ['remo', 'rowing', 'kayak', 'caiaque', 'canoagem'] },
  { id: 'yoga', words: ['ioga', 'yoga'] },
  { id: 'running', words: ['corrida', 'correr', 'running', 'atletismo', 'sprint', 'trail'] },
  { id: 'walking', words: ['caminhada', 'caminhar', 'marcha'] },
];

/** O desporto que o tipo de treino já implica, quando o título não diz nada. */
const BY_TYPE: Record<WorkoutType, SportId> = {
  strength: 'strength',
  functional: 'functional',
  calisthenics: 'calisthenics',
  hiit: 'hiit',
  mobility: 'mobility',
  pilates: 'pilates',
  sport: 'generic',
  other: 'generic',
};

export function sportOf(
  workout: { title: string; type: WorkoutType; tags?: ReadonlyArray<string> },
): SportId {
  const text = plain([workout.title, ...(workout.tags ?? [])].join(' '));
  for (const rule of RULES) {
    if (rule.words.some((word) => text.includes(word))) return rule.id;
  }
  return BY_TYPE[workout.type];
}
