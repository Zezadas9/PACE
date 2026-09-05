/**
 * PACE — o catálogo de exercícios que o assistente conhece.
 *
 * Uma lista curta e comum de propósito: exercícios que qualquer ginásio tem e
 * que se explicam sozinhos. O assistente não inventa nomes nem prescreve
 * variantes exóticas — se o utilizador quiser outra coisa, edita o treino, que
 * é dele a partir do momento em que o adiciona.
 *
 * `tier` ordena a escolha: primeiro os multiarticulares, depois o acessório.
 * É a ordem que a posição da ACSM descreve para uma sessão (acsm-2009).
 */

import type { MuscleGroup } from '../../core/types';

export interface CoachExercise {
  name: string;
  muscleGroups: MuscleGroup[];
  isBodyweight: boolean;
  /** 1 = multiarticular principal · 2 = secundário · 3 = isolamento. */
  tier: 1 | 2 | 3;
  /** Segundos por série, para a conta do tempo. */
  workSec: number;
}

export const STRENGTH_LIBRARY: ReadonlyArray<CoachExercise> = [
  // Pernas
  { name: 'Agachamento', muscleGroups: ['legs'], isBodyweight: false, tier: 1, workSec: 45 },
  { name: 'Peso morto romeno', muscleGroups: ['legs', 'back'], isBodyweight: false, tier: 1, workSec: 45 },
  { name: 'Prensa de pernas', muscleGroups: ['legs'], isBodyweight: false, tier: 2, workSec: 45 },
  { name: 'Afundo', muscleGroups: ['legs'], isBodyweight: false, tier: 2, workSec: 50 },
  { name: 'Extensão de pernas', muscleGroups: ['legs'], isBodyweight: false, tier: 3, workSec: 40 },
  { name: 'Flexão de pernas', muscleGroups: ['legs'], isBodyweight: false, tier: 3, workSec: 40 },
  { name: 'Elevação de gémeos', muscleGroups: ['legs'], isBodyweight: false, tier: 3, workSec: 35 },

  // Peito
  { name: 'Supino plano', muscleGroups: ['chest', 'arms'], isBodyweight: false, tier: 1, workSec: 45 },
  { name: 'Supino inclinado com halteres', muscleGroups: ['chest', 'shoulders'], isBodyweight: false, tier: 2, workSec: 45 },
  { name: 'Flexões', muscleGroups: ['chest', 'arms', 'core'], isBodyweight: true, tier: 2, workSec: 40 },
  { name: 'Cruzamento no cabo', muscleGroups: ['chest'], isBodyweight: false, tier: 3, workSec: 40 },

  // Costas
  { name: 'Remada curvada', muscleGroups: ['back', 'arms'], isBodyweight: false, tier: 1, workSec: 45 },
  { name: 'Elevações na barra', muscleGroups: ['back', 'arms'], isBodyweight: true, tier: 1, workSec: 40 },
  { name: 'Puxada na polia alta', muscleGroups: ['back', 'arms'], isBodyweight: false, tier: 2, workSec: 45 },
  { name: 'Remada baixa', muscleGroups: ['back'], isBodyweight: false, tier: 2, workSec: 45 },

  // Ombros
  { name: 'Desenvolvimento de ombros', muscleGroups: ['shoulders', 'arms'], isBodyweight: false, tier: 1, workSec: 45 },
  { name: 'Elevações laterais', muscleGroups: ['shoulders'], isBodyweight: false, tier: 3, workSec: 35 },
  { name: 'Face pull', muscleGroups: ['shoulders', 'back'], isBodyweight: false, tier: 3, workSec: 35 },

  // Braços
  { name: 'Curl com halteres', muscleGroups: ['arms'], isBodyweight: false, tier: 3, workSec: 35 },
  { name: 'Curl martelo', muscleGroups: ['arms'], isBodyweight: false, tier: 3, workSec: 35 },
  { name: 'Tríceps na polia', muscleGroups: ['arms'], isBodyweight: false, tier: 3, workSec: 35 },
  { name: 'Fundos entre bancos', muscleGroups: ['arms', 'chest'], isBodyweight: true, tier: 2, workSec: 40 },

  // Core
  { name: 'Prancha', muscleGroups: ['core'], isBodyweight: true, tier: 2, workSec: 40 },
  { name: 'Prancha lateral', muscleGroups: ['core'], isBodyweight: true, tier: 3, workSec: 40 },
  { name: 'Elevação de pernas', muscleGroups: ['core'], isBodyweight: true, tier: 3, workSec: 40 },
  { name: 'Dead bug', muscleGroups: ['core'], isBodyweight: true, tier: 3, workSec: 40 },
];

/** Aquecimento: geral primeiro, depois específico do que vem a seguir. */
export const WARMUP_LIBRARY: ReadonlyArray<CoachExercise & { forGroups: MuscleGroup[] }> = [
  { name: 'Bicicleta ou passadeira, ritmo fácil', muscleGroups: ['full_body'], isBodyweight: false, tier: 1, workSec: 300, forGroups: ['full_body', 'legs', 'chest', 'back', 'shoulders', 'arms', 'core'] },
  { name: 'Mobilidade de anca', muscleGroups: ['legs'], isBodyweight: true, tier: 2, workSec: 40, forGroups: ['legs', 'full_body'] },
  { name: 'Agachamento sem carga', muscleGroups: ['legs'], isBodyweight: true, tier: 2, workSec: 40, forGroups: ['legs', 'full_body'] },
  { name: 'Rotação torácica', muscleGroups: ['back'], isBodyweight: true, tier: 2, workSec: 40, forGroups: ['back', 'chest', 'shoulders', 'full_body'] },
  { name: 'Band pull-apart', muscleGroups: ['shoulders', 'back'], isBodyweight: false, tier: 2, workSec: 40, forGroups: ['shoulders', 'chest', 'back', 'arms'] },
];

export const CARDIO_LIBRARY: ReadonlyArray<CoachExercise> = [
  { name: 'Passadeira, ritmo confortável', muscleGroups: ['full_body'], isBodyweight: false, tier: 1, workSec: 600 },
  { name: 'Bicicleta estática', muscleGroups: ['full_body'], isBodyweight: false, tier: 1, workSec: 600 },
  { name: 'Remo (ergómetro)', muscleGroups: ['full_body', 'back'], isBodyweight: false, tier: 1, workSec: 480 },
];

/**
 * Mobilidade e alongamentos.
 *
 * Cinco posições davam para uma sessão de dez minutos e mais nada — quem
 * pedisse vinte recebia onze. A lista está ordenada de cima para baixo do
 * corpo, que é a ordem por que uma sessão se faz, e cada posição tem o tempo
 * que precisa para valer a pena: trinta segundos é o mínimo de um alongamento
 * estático, e é por isso que nenhum aqui está abaixo disso.
 */
export const MOBILITY_LIBRARY: ReadonlyArray<CoachExercise> = [
  // Coluna e tronco
  { name: 'Gato-camelo', muscleGroups: ['back', 'core'], isBodyweight: true, tier: 2, workSec: 45 },
  { name: 'Rotação torácica deitado', muscleGroups: ['back'], isBodyweight: true, tier: 2, workSec: 60 },
  { name: 'Postura da criança', muscleGroups: ['back'], isBodyweight: true, tier: 2, workSec: 45 },
  { name: 'Torção sentada', muscleGroups: ['back', 'core'], isBodyweight: true, tier: 3, workSec: 60 },
  { name: 'Cobra', muscleGroups: ['back', 'core'], isBodyweight: true, tier: 3, workSec: 45 },

  // Ancas e pernas
  { name: 'Abertura de anca', muscleGroups: ['legs'], isBodyweight: true, tier: 2, workSec: 60 },
  { name: 'Alongamento de isquiotibiais', muscleGroups: ['legs'], isBodyweight: true, tier: 2, workSec: 60 },
  { name: 'Alongamento de quadricípite em pé', muscleGroups: ['legs'], isBodyweight: true, tier: 2, workSec: 60 },
  { name: 'Afundo com alongamento do psoas', muscleGroups: ['legs'], isBodyweight: true, tier: 2, workSec: 60 },
  { name: 'Figura de quatro deitado', muscleGroups: ['legs'], isBodyweight: true, tier: 3, workSec: 60 },
  { name: 'Alongamento de adutores sentado', muscleGroups: ['legs'], isBodyweight: true, tier: 3, workSec: 60 },
  { name: 'Alongamento de gémeos na parede', muscleGroups: ['legs'], isBodyweight: true, tier: 3, workSec: 60 },

  // Peito, ombros e pescoço
  { name: 'Alongamento de peito à porta', muscleGroups: ['chest', 'shoulders'], isBodyweight: true, tier: 2, workSec: 60 },
  { name: 'Alongamento de ombro cruzado', muscleGroups: ['shoulders'], isBodyweight: true, tier: 3, workSec: 60 },
  { name: 'Alongamento de tricípite acima da cabeça', muscleGroups: ['arms'], isBodyweight: true, tier: 3, workSec: 60 },
  { name: 'Alongamento de pescoço', muscleGroups: ['shoulders'], isBodyweight: true, tier: 3, workSec: 45 },
];

export const MUSCLE_LABELS: Record<MuscleGroup, string> = {
  chest: 'peito',
  back: 'costas',
  legs: 'pernas',
  shoulders: 'ombros',
  arms: 'braços',
  core: 'core',
  full_body: 'corpo inteiro',
};

/** Os grupos que um treino de corpo inteiro cobre, pela ordem de execução. */
export const FULL_BODY_ORDER: MuscleGroup[] = ['legs', 'back', 'chest', 'shoulders', 'arms', 'core'];

/** Circuito: pouco material, muito tempo debaixo de esforço. */
export const CIRCUIT_LIBRARY: ReadonlyArray<CoachExercise> = [
  { name: 'Burpees', muscleGroups: ['full_body'], isBodyweight: true, tier: 1, workSec: 40 },
  { name: 'Agachamento com salto', muscleGroups: ['legs'], isBodyweight: true, tier: 1, workSec: 40 },
  { name: 'Mountain climbers', muscleGroups: ['core', 'full_body'], isBodyweight: true, tier: 2, workSec: 40 },
  { name: 'Flexões', muscleGroups: ['chest', 'arms'], isBodyweight: true, tier: 2, workSec: 40 },
  { name: 'Afundo alternado', muscleGroups: ['legs'], isBodyweight: true, tier: 2, workSec: 40 },
  { name: 'Prancha com toque no ombro', muscleGroups: ['core'], isBodyweight: true, tier: 3, workSec: 40 },
  { name: 'Corda ou corrida no sítio', muscleGroups: ['full_body'], isBodyweight: true, tier: 3, workSec: 40 },
];

/** Pilates de solo: controlo e core, sem material. */
export const PILATES_LIBRARY: ReadonlyArray<CoachExercise> = [
  { name: 'The hundred', muscleGroups: ['core'], isBodyweight: true, tier: 1, workSec: 60 },
  { name: 'Roll up', muscleGroups: ['core'], isBodyweight: true, tier: 2, workSec: 50 },
  { name: 'Ponte de anca', muscleGroups: ['legs', 'core'], isBodyweight: true, tier: 2, workSec: 50 },
  { name: 'Single leg stretch', muscleGroups: ['core'], isBodyweight: true, tier: 2, workSec: 50 },
  { name: 'Swimming', muscleGroups: ['back', 'core'], isBodyweight: true, tier: 3, workSec: 45 },
  { name: 'Side kick series', muscleGroups: ['legs'], isBodyweight: true, tier: 3, workSec: 50 },
];
