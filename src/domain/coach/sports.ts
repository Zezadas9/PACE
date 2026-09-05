/**
 * PACE — sessões de desporto.
 *
 * Um treino de futebol não é um treino de ginásio com outro nome. Tem duas
 * metades e as duas contam: o trabalho **com bola**, que é técnica, e o
 * trabalho **sem bola**, que é a força e a condição física que sustentam a
 * técnica quando o jogo já vai longo.
 *
 * O que está aqui são exercícios comuns, do tipo que qualquer treinador manda
 * fazer e que se explicam numa linha. Não há aqui prescrição de rendimento:
 * quem treina a sério tem quem lhe monte a época, e isto não substitui isso —
 * serve para quem treina sozinho ter uma sessão com pés e cabeça.
 */

import type { MuscleGroup } from '../../core/types';

export type SportId = 'football' | 'basketball' | 'racket' | 'volleyball' | 'general';

export interface SportDrill {
  name: string;
  /** Com bola (ou raquete), ou sem. É a distinção que organiza a sessão. */
  withBall: boolean;
  muscleGroups: MuscleGroup[];
  /** Segundos por série. */
  workSec: number;
  restSec: number;
  sets: number;
  note: string;
}

export interface SportProfile {
  id: SportId;
  /** Como se escreve no título. */
  label: string;
  /** As palavras que o trazem, já sem acentos. */
  terms: string[];
  drills: SportDrill[];
}

/** O aquecimento é o mesmo em qualquer modalidade de campo. */
export const SPORT_WARMUP: SportDrill[] = [
  {
    name: 'Corrida leve',
    withBall: false,
    muscleGroups: ['full_body'],
    workSec: 300,
    restSec: 0,
    sets: 1,
    note: 'Ritmo de conversa, para subir a temperatura.',
  },
  {
    name: 'Mobilidade de ancas e tornozelos',
    withBall: false,
    muscleGroups: ['legs'],
    workSec: 240,
    restSec: 0,
    sets: 1,
    note: 'Círculos de anca, tornozelo e joelho, sem forçar.',
  },
  {
    name: 'Corridas progressivas',
    withBall: false,
    muscleGroups: ['legs'],
    workSec: 40,
    restSec: 40,
    sets: 4,
    note: 'Acelera até 80% ao longo de 30 m e desacelera.',
  },
];

/** O fim é sempre o mesmo: baixar as pulsações e alongar o que trabalhou. */
export const SPORT_COOLDOWN: SportDrill[] = [
  {
    name: 'Corrida muito leve',
    withBall: false,
    muscleGroups: ['full_body'],
    workSec: 300,
    restSec: 0,
    sets: 1,
    note: 'Cinco minutos a descer o ritmo.',
  },
  {
    name: 'Alongamentos de pernas e ancas',
    withBall: false,
    muscleGroups: ['legs'],
    workSec: 300,
    restSec: 0,
    sets: 1,
    note: 'Isquiotibiais, quadricípite, gémeos e glúteos, 30 s cada.',
  },
];

const FOOTBALL: SportDrill[] = [
  // Com bola
  {
    name: 'Passe contra a parede',
    withBall: true,
    muscleGroups: ['legs'],
    workSec: 180,
    restSec: 45,
    sets: 3,
    note: 'Alterna pé direito, esquerdo e passe em primeira. Varia a distância.',
  },
  {
    name: 'Condução em slalom',
    withBall: true,
    muscleGroups: ['legs', 'core'],
    workSec: 120,
    restSec: 60,
    sets: 4,
    note: 'Cones a dois metros. Bola perto do pé, cabeça levantada.',
  },
  {
    name: 'Controlo orientado',
    withBall: true,
    muscleGroups: ['legs', 'core'],
    workSec: 120,
    restSec: 45,
    sets: 3,
    note: 'Recebe e sai já com a bola na direção do próximo passe.',
  },
  {
    name: 'Remate após condução',
    withBall: true,
    muscleGroups: ['legs'],
    workSec: 150,
    restSec: 60,
    sets: 4,
    note: 'Precisão antes de potência. Frontal, meia-lua e ângulo.',
  },
  {
    name: 'Jogo de cabeça',
    withBall: true,
    muscleGroups: ['core', 'shoulders'],
    workSec: 90,
    restSec: 45,
    sets: 3,
    note: 'Contra a parede ou com alguém. Testa em direção ao alvo.',
  },
  // Sem bola
  {
    name: 'Mudanças de direção',
    withBall: false,
    muscleGroups: ['legs'],
    workSec: 30,
    restSec: 60,
    sets: 6,
    note: 'Cinco metros, trava e volta. É onde nascem as lesões — trava a sério.',
  },
  {
    name: 'Sprints curtos',
    withBall: false,
    muscleGroups: ['legs'],
    workSec: 20,
    restSec: 90,
    sets: 8,
    note: '20 a 30 m à máxima. Recupera por inteiro entre cada.',
  },
  {
    name: 'Agachamento búlgaro',
    withBall: false,
    muscleGroups: ['legs'],
    workSec: 60,
    restSec: 60,
    sets: 3,
    note: 'Uma perna de cada vez, que é como se joga.',
  },
  {
    name: 'Ponte de glúteo a uma perna',
    withBall: false,
    muscleGroups: ['legs', 'core'],
    workSec: 45,
    restSec: 45,
    sets: 3,
    note: 'Para os isquiotibiais aguentarem os sprints.',
  },
  {
    name: 'Prancha lateral',
    withBall: false,
    muscleGroups: ['core'],
    workSec: 40,
    restSec: 30,
    sets: 3,
    note: 'Cada lado. O tronco é o que segura a mudança de direção.',
  },
];

const BASKETBALL: SportDrill[] = [
  {
    name: 'Drible estacionário',
    withBall: true,
    muscleGroups: ['arms', 'core'],
    workSec: 120,
    restSec: 40,
    sets: 3,
    note: 'Mão direita, esquerda e troca. Bola abaixo da cintura, olhos em frente.',
  },
  {
    name: 'Drible em movimento',
    withBall: true,
    muscleGroups: ['legs', 'arms'],
    workSec: 120,
    restSec: 60,
    sets: 3,
    note: 'Slalom entre cones com mudanças de mão.',
  },
  {
    name: 'Lançamento na passada',
    withBall: true,
    muscleGroups: ['legs', 'arms'],
    workSec: 150,
    restSec: 60,
    sets: 4,
    note: 'Dos dois lados. O passo antes do lançamento é o que conta.',
  },
  {
    name: 'Lançamento de posição',
    withBall: true,
    muscleGroups: ['arms', 'shoulders'],
    workSec: 180,
    restSec: 45,
    sets: 4,
    note: 'Cinco posições, dez lançamentos em cada.',
  },
  {
    name: 'Deslocamento defensivo',
    withBall: false,
    muscleGroups: ['legs'],
    workSec: 30,
    restSec: 60,
    sets: 6,
    note: 'Passo lateral em posição baixa, sem cruzar os pés.',
  },
  {
    name: 'Saltos verticais',
    withBall: false,
    muscleGroups: ['legs'],
    workSec: 30,
    restSec: 90,
    sets: 5,
    note: 'Aterra suave, com o joelho alinhado com o pé.',
  },
  {
    name: 'Agachamento',
    withBall: false,
    muscleGroups: ['legs'],
    workSec: 60,
    restSec: 60,
    sets: 3,
    note: 'A base de tudo o que salta.',
  },
  {
    name: 'Prancha',
    withBall: false,
    muscleGroups: ['core'],
    workSec: 45,
    restSec: 30,
    sets: 3,
    note: 'Corpo em linha, sem deixar a anca cair.',
  },
];

const RACKET: SportDrill[] = [
  {
    name: 'Direita contra a parede',
    withBall: true,
    muscleGroups: ['arms', 'core'],
    workSec: 180,
    restSec: 45,
    sets: 3,
    note: 'Ritmo constante. Prepara a raquete antes de a bola chegar.',
  },
  {
    name: 'Esquerda contra a parede',
    withBall: true,
    muscleGroups: ['arms', 'core'],
    workSec: 180,
    restSec: 45,
    sets: 3,
    note: 'O lado que se treina menos é o que falha no jogo.',
  },
  {
    name: 'Serviço',
    withBall: true,
    muscleGroups: ['shoulders', 'core'],
    workSec: 240,
    restSec: 60,
    sets: 3,
    note: 'Vinte serviços por série. Colocação antes de força.',
  },
  {
    name: 'Voleio junto à rede',
    withBall: true,
    muscleGroups: ['arms', 'shoulders'],
    workSec: 120,
    restSec: 45,
    sets: 3,
    note: 'Punho firme, movimento curto.',
  },
  {
    name: 'Deslocamento lateral',
    withBall: false,
    muscleGroups: ['legs'],
    workSec: 30,
    restSec: 60,
    sets: 6,
    note: 'Passo de recuperação depois de cada batida.',
  },
  {
    name: 'Rotação de tronco com elástico',
    withBall: false,
    muscleGroups: ['core'],
    workSec: 45,
    restSec: 45,
    sets: 3,
    note: 'De onde vem a força da batida, mais do que do braço.',
  },
  {
    name: 'Afundo',
    withBall: false,
    muscleGroups: ['legs'],
    workSec: 60,
    restSec: 60,
    sets: 3,
    note: 'Para chegar à bola baixa sem perder o equilíbrio.',
  },
];

const VOLLEYBALL: SportDrill[] = [
  {
    name: 'Passe por cima contra a parede',
    withBall: true,
    muscleGroups: ['arms', 'shoulders'],
    workSec: 150,
    restSec: 45,
    sets: 3,
    note: 'Mãos em forma de triângulo, bola a sair dos dedos.',
  },
  {
    name: 'Manchete',
    withBall: true,
    muscleGroups: ['arms', 'legs'],
    workSec: 150,
    restSec: 45,
    sets: 3,
    note: 'Braços firmes, a força vem das pernas.',
  },
  {
    name: 'Serviço',
    withBall: true,
    muscleGroups: ['shoulders', 'core'],
    workSec: 180,
    restSec: 60,
    sets: 3,
    note: 'Dez serviços por série, sempre à mesma zona.',
  },
  {
    name: 'Salto de bloco',
    withBall: false,
    muscleGroups: ['legs'],
    workSec: 30,
    restSec: 90,
    sets: 5,
    note: 'Junto à parede. Aterra com os dois pés.',
  },
  {
    name: 'Agachamento com salto',
    withBall: false,
    muscleGroups: ['legs'],
    workSec: 40,
    restSec: 80,
    sets: 4,
    note: 'Potência para o ataque e para o bloco.',
  },
  {
    name: 'Prancha',
    withBall: false,
    muscleGroups: ['core'],
    workSec: 45,
    restSec: 30,
    sets: 3,
    note: 'O tronco é o que segura o braço no ar.',
  },
];

/** Quando o desporto não é nenhum dos conhecidos, fica o que serve a todos. */
const GENERAL: SportDrill[] = [
  {
    name: 'Trabalho técnico da modalidade',
    withBall: true,
    muscleGroups: ['full_body'],
    workSec: 600,
    restSec: 120,
    sets: 2,
    note: 'O gesto que mais repetes em jogo, feito devagar e depois a ritmo.',
  },
  {
    name: 'Mudanças de direção',
    withBall: false,
    muscleGroups: ['legs'],
    workSec: 30,
    restSec: 60,
    sets: 6,
    note: 'Cinco metros, trava e volta.',
  },
  {
    name: 'Sprints curtos',
    withBall: false,
    muscleGroups: ['legs'],
    workSec: 20,
    restSec: 90,
    sets: 6,
    note: 'À máxima, com recuperação inteira.',
  },
  {
    name: 'Agachamento',
    withBall: false,
    muscleGroups: ['legs'],
    workSec: 60,
    restSec: 60,
    sets: 3,
    note: 'A base de quase tudo o que o desporto pede às pernas.',
  },
  {
    name: 'Prancha',
    withBall: false,
    muscleGroups: ['core'],
    workSec: 45,
    restSec: 30,
    sets: 3,
    note: 'Corpo em linha.',
  },
];

export const SPORTS: ReadonlyArray<SportProfile> = [
  {
    id: 'football',
    label: 'Futebol',
    terms: ['futebol', 'bola', 'futsal'],
    drills: FOOTBALL,
  },
  {
    id: 'basketball',
    label: 'Basquetebol',
    terms: ['basquete', 'basquetebol', 'basket'],
    drills: BASKETBALL,
  },
  {
    id: 'racket',
    label: 'Raquete',
    terms: ['tenis', 'ténis', 'padel', 'padle', 'squash', 'badminton'],
    drills: RACKET,
  },
  {
    id: 'volleyball',
    label: 'Voleibol',
    terms: ['voleibol', 'volei', 'vólei'],
    drills: VOLLEYBALL,
  },
  {
    id: 'general',
    label: 'Desporto',
    terms: [],
    drills: GENERAL,
  },
];

/** Qual das modalidades a mensagem pede. Sem nenhuma reconhecida, a geral. */
export function sportFor(text: string): SportProfile {
  const found = SPORTS.find((sport) => sport.terms.some((term) => text.includes(term)));
  return found ?? SPORTS[SPORTS.length - 1]!;
}

/* --- Montar a sessão -------------------------------------------------------------- */

export interface SportSession {
  sport: SportProfile;
  /** Aquecimento, com bola, sem bola, retorno à calma — por esta ordem. */
  blocks: Array<SportDrill & { section: 'warmup' | 'main' | 'cardio' }>;
  minutes: number;
  withBallMin: number;
  withoutBallMin: number;
}

const secondsOf = (drill: SportDrill): number =>
  drill.sets * drill.workSec + Math.max(0, drill.sets - 1) * drill.restSec;

/**
 * Uma sessão do tamanho pedido.
 *
 * O aquecimento e o retorno à calma não encolhem abaixo do que servem para
 * alguma coisa — são a parte que se corta primeiro e a que menos se devia
 * cortar. O que sobra reparte-se entre a bola e o resto, e a bola leva a maior
 * parte: é a técnica que faz falta e é a que ninguém treina sozinho.
 *
 * `want` decide o que entra. Quem pede só a parte física não recebe exercícios
 * com bola, e quem pede só a bola não recebe agachamentos.
 */
export function buildSportSession(
  text: string,
  minutes: number,
  want: { ball: boolean; physical: boolean } = { ball: true, physical: true },
): SportSession {
  const sport = sportFor(text);
  const total = Math.max(20, Math.min(180, minutes)) * 60;

  const warmup = SPORT_WARMUP.map((drill) => ({ ...drill, section: 'warmup' as const }));
  const cooldown = SPORT_COOLDOWN.map((drill) => ({ ...drill, section: 'cardio' as const }));
  const fixed = [...warmup, ...cooldown].reduce((sum, drill) => sum + secondsOf(drill), 0);

  let budget = Math.max(0, total - fixed);
  const ballShare = want.ball && want.physical ? 0.6 : want.ball ? 1 : 0;

  const withBall = sport.drills.filter((drill) => drill.withBall);
  const without = sport.drills.filter((drill) => !drill.withBall);

  const take = (drills: SportDrill[], seconds: number): SportDrill[] => {
    const chosen: SportDrill[] = [];
    let used = 0;
    for (const drill of drills) {
      const cost = secondsOf(drill);
      if (used + cost > seconds && chosen.length > 0) break;
      chosen.push({ ...drill });
      used += cost;
    }
    return chosen;
  };

  const ballBlocks = want.ball ? take(withBall, budget * ballShare) : [];
  budget -= ballBlocks.reduce((sum, drill) => sum + secondsOf(drill), 0);
  const physicalBlocks = want.physical ? take(without, budget) : [];
  budget -= physicalBlocks.reduce((sum, drill) => sum + secondsOf(drill), 0);

  /*
   * O tempo que sobra vai para mais séries do que já lá está.
   *
   * A biblioteca de cada modalidade é curta, e para uma sessão de duas horas
   * acaba antes do relógio. Um treinador não inventa exercícios novos para
   * encher: manda repetir. Aqui é o mesmo — as séries crescem à vez, uma em
   * cada exercício, para nenhum ficar com o dobro dos outros.
   */
  const escolhidos = [...ballBlocks, ...physicalBlocks];
  for (let volta = 0; volta < 4 && budget > 120 && escolhidos.length > 0; volta += 1) {
    for (const drill of escolhidos) {
      const custo = drill.workSec + drill.restSec;
      if (custo > budget) continue;
      drill.sets += 1;
      budget -= custo;
    }
  }

  const blocks = [
    ...warmup,
    ...ballBlocks.map((drill) => ({ ...drill, section: 'main' as const })),
    ...physicalBlocks.map((drill) => ({ ...drill, section: 'main' as const })),
    ...cooldown,
  ];

  const seconds = (list: SportDrill[]): number =>
    list.reduce((sum, drill) => sum + secondsOf(drill), 0);

  return {
    sport,
    blocks,
    minutes: Math.round(blocks.reduce((sum, drill) => sum + secondsOf(drill), 0) / 60),
    withBallMin: Math.round(seconds(ballBlocks) / 60),
    withoutBallMin: Math.round(seconds(physicalBlocks) / 60),
  };
}

/** O que a mensagem pede: só com bola, só sem bola, ou as duas coisas. */
export function ballPreference(text: string): { ball: boolean; physical: boolean } {
  const semBola = /sem bola|sem a bola|so fisic|só físic|apenas fisic/.test(text);
  const comBola = /com bola|com a bola|so tecnic|só técnic|apenas tecnic/.test(text);
  if (semBola && !comBola) return { ball: false, physical: true };
  if (comBola && !semBola) return { ball: true, physical: false };
  return { ball: true, physical: true };
}
