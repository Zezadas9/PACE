import { describe, expect, it } from 'vitest';
import {
  createGoal, createHabit, createSettings, createUser, createWorkout,
} from '../../core/factories';
import type { AiSettings, Workout } from '../../core/types';
import { buildWorkout, setsByGroup } from './build-workout';
import { evaluateWeek, findingsFor } from './evaluate-workout';
import { suggestHabits } from './habits';
import { looksLikeRefinement, parseIntent, refine } from './intent';
import { referencesByIds, REFERENCES } from './references';
import {
  adapt, applyAdaptation, baselineFrom, buildRunPlan, cappedIncrease, progression,
} from './running';
import { screen } from './safety';
import { respond } from './index';
import type { CoachContext } from './types';

const TODAY = '2026-09-07';

function settings(overrides: Partial<AiSettings> = {}): AiSettings {
  const base = createSettings().ai;
  return {
    ...base,
    enabled: true,
    categories: {
      profile: true, goals: true, training: true, activity: true,
      nutrition: true, habits: true, sleep: true, feedback: true,
    },
    ...overrides,
  };
}

function context(overrides: Partial<CoachContext> = {}): CoachContext {
  return {
    today: TODAY,
    settings: settings(),
    preferences: createUser().preferences,
    profile: { name: 'Teste', ageYears: 30, gender: 'undisclosed', heightCm: 178, weightKg: 72 },
    goals: [], workouts: [], exercises: [], sessions: [], activities: [],
    habits: [], habitEntries: [], meals: [], foods: [], water: [],
    runPlan: null, sleep: null,
    ...overrides,
  };
}

describe('screen', () => {
  it('encaminha para urgência sinais graves', () => {
    const verdict = screen('Tenho dor no peito quando corro');
    expect(verdict.level).toBe('emergency');
    expect(verdict.message).toContain('112');
  });

  it('encaminha sintomas e lesões para um profissional', () => {
    expect(screen('Torci o tornozelo, que treino faço?').level).toBe('clinical');
    expect(screen('Estou grávida, posso treinar?').level).toBe('clinical');
  });

  it('deixa passar uma pergunta normal', () => {
    expect(screen('Cria-me um treino de pernas de 45 minutos').level).toBe('none');
  });
});

describe('parseIntent', () => {
  it('lê o exemplo do treino, com músculo e duração', () => {
    const intent = parseIntent('Cria-me um treino de pernas de 45 minutos.');
    expect(intent.kind).toBe('create_workout');
    expect(intent.minutes).toBe(45);
    expect(intent.muscles).toEqual(['legs']);
  });

  it('lê "este treino está equilibrado?"', () => {
    expect(parseIntent('Este treino está equilibrado?').kind).toBe('evaluate_workout');
  });

  it('lê a distância de um objetivo de corrida', () => {
    const intent = parseIntent('Quero conseguir correr 10 km');
    expect(intent.kind).toBe('run_plan');
    expect(intent.distanceM).toBe(10000);
  });

  it('lê horas como minutos', () => {
    expect(parseIntent('treino de 1h30')?.minutes).toBe(90);
    expect(parseIntent('treino de 1 hora')?.minutes).toBe(60);
  });

  it('lê a organização da semana', () => {
    const intent = parseIntent(
      'Quero treinar 4 vezes por semana, correr 2 vezes e caminhar todos os dias',
    );
    expect(intent.kind).toBe('organize_week');
    expect(intent.perWeek.workouts).toBe(4);
    expect(intent.perWeek.runs).toBe(2);
    expect(intent.perWeek.walksDaily).toBe(true);
  });

  it('admite que não percebeu', () => {
    expect(parseIntent('olá tudo bem').kind).toBe('unknown');
  });
});

describe('referências', () => {
  it('não devolve citações inexistentes', () => {
    expect(referencesByIds(['who-2020', 'inventada-2030'])).toHaveLength(1);
  });

  it('tem fonte verificável em todas as entradas', () => {
    for (const reference of REFERENCES) {
      expect(reference.url).toMatch(/^https?:\/\//);
      expect(reference.supports.length).toBeGreaterThan(20);
    }
  });
});

describe('buildWorkout', () => {
  it('cabe no tempo pedido', () => {
    const draft = buildWorkout({
      minutes: 45, muscles: ['legs'], type: 'strength', goal: 'general', weekdays: [],
    });
    expect(draft.estimatedMin).toBeLessThanOrEqual(45);
    expect(draft.estimatedMin).toBeGreaterThan(20);
  });

  it('começa sempre por aquecimento', () => {
    const draft = buildWorkout({
      minutes: 45, muscles: ['chest'], type: 'strength', goal: 'gain_muscle', weekdays: [],
    });
    expect(draft.blocks[0]?.section).toBe('warmup');
  });

  it('treina o que foi pedido', () => {
    const draft = buildWorkout({
      minutes: 45, muscles: ['legs'], type: 'strength', goal: 'general', weekdays: [],
    });
    const groups = setsByGroup(draft).map((entry) => entry.group);
    expect(groups).toContain('legs');
    expect(groups).not.toContain('chest');
  });

  it('cobre o corpo todo quando não se pede um grupo', () => {
    const draft = buildWorkout({
      minutes: 60, muscles: [], type: 'strength', goal: 'general', weekdays: [],
    });
    expect(setsByGroup(draft).length).toBeGreaterThanOrEqual(4);
  });

  it('numa sessão curta corta exercícios em vez de estourar o tempo', () => {
    const short = buildWorkout({
      minutes: 20, muscles: [], type: 'strength', goal: 'general', weekdays: [],
    });
    const long = buildWorkout({
      minutes: 60, muscles: [], type: 'strength', goal: 'general', weekdays: [],
    });
    expect(short.blocks.length).toBeLessThan(long.blocks.length);
    expect(short.estimatedMin).toBeLessThanOrEqual(20);
  });
});

describe('evaluateWeek', () => {
  const legDay = (weekdays: number[]): Workout => createWorkout({
    id: `w-${weekdays.join('')}`,
    title: 'Pernas',
    weekdays,
    blocks: [
      { id: 'b1', section: 'main', exerciseId: 'ex-squat', sets: 4, reps: 8, loadKg: 60, durationSec: null, restSec: 120, note: null },
      { id: 'b2', section: 'main', exerciseId: 'ex-press', sets: 3, reps: 10, loadKg: 80, durationSec: null, restSec: 90, note: null },
    ],
  });
  const groups = new Map([
    ['ex-squat', ['legs' as const]],
    ['ex-press', ['legs' as const]],
  ]);

  it('conta as séries semanais pelos dias marcados', () => {
    const evaluation = evaluateWeek([legDay([1, 4])], groups, [], TODAY);
    expect(evaluation.weeklySets[0]).toEqual({ group: 'legs', sets: 14, days: 2 });
  });

  it('diz que não sabe quando não há nada marcado', () => {
    const findings = findingsFor(evaluateWeek([], groups, [], TODAY));
    expect(findings[0]?.tone).toBe('unknown');
  });

  it('assinala os grupos sem trabalho dirigido', () => {
    const findings = findingsFor(evaluateWeek([legDay([1, 4])], groups, [], TODAY));
    const gap = findings.find((finding) => finding.title.includes('Sem trabalho dirigido'));
    expect(gap?.detail).toContain('peito');
  });

  it('não fala de intensidade sem RPE', () => {
    const findings = findingsFor(evaluateWeek([legDay([1, 4])], groups, [], TODAY));
    expect(findings.some((finding) => finding.title.includes('Sem RPE'))).toBe(true);
  });
});

describe('progressão de corrida', () => {
  it('nunca sobe mais de 10% de uma semana para a outra', () => {
    const weeks = progression(10000, {
      hasHistory: true, longestRunM: 5000, weeklyVolumeM: 12000, sessionsPerWeek: 3,
    });
    // A comparação é com o ponto mais alto até aí: uma semana leve baixa de
    // propósito, e voltar ao nível anterior não é subir.
    let peak = 5000;
    for (const week of weeks) {
      if (week.longestM <= 0 || week.deload) continue;
      expect(week.longestM).toBeLessThanOrEqual(peak * 1.1 + 400);
      peak = Math.max(peak, week.longestM);
    }
  });

  it('trava um pedido absurdo', () => {
    expect(cappedIncrease(5000, 30000)).toBeLessThanOrEqual(5900);
  });

  it('mete uma semana mais leve a cada quatro', () => {
    const weeks = progression(10000, {
      hasHistory: true, longestRunM: 5000, weeklyVolumeM: 12000, sessionsPerWeek: 3,
    });
    expect(weeks.some((week) => week.deload)).toBe(true);
  });

  it('quem nunca correu começa a andar e a correr', () => {
    const plan = buildRunPlan(10000, TODAY, {
      hasHistory: false, longestRunM: null, weeklyVolumeM: null, sessionsPerWeek: null,
    });
    expect(plan.sessions[0]?.kind).toBe('walk_run');
    expect(plan.sessions[0]?.segments[0]?.runSec).toBeGreaterThan(0);
  });

  it('lê o ponto de partida do histórico', () => {
    const baseline = baselineFrom([
      { date: '2026-09-01', type: 'run', distanceM: 6200 } as never,
      { date: '2026-08-20', type: 'run', distanceM: 4000 } as never,
    ], TODAY);
    expect(baseline.longestRunM).toBe(6200);
  });
});

describe('adapt', () => {
  it('não mexe com uma sessão só', () => {
    expect(adapt([{ difficulty: 'hard', rpe: 9 }]).direction).toBe('hold');
  });

  it('baixa depois de duas sessões difíceis', () => {
    const adaptation = adapt([
      { difficulty: 'hard', rpe: 9 },
      { difficulty: 'hard', rpe: 9 },
    ]);
    expect(adaptation.direction).toBe('easier');
    expect(adaptation.factor).toBeLessThan(1);
  });

  it('sobe depois de duas fáceis, mas dentro do limite', () => {
    const adaptation = adapt([
      { difficulty: 'easy', rpe: 3 },
      { difficulty: 'easy', rpe: 2 },
    ]);
    expect(adaptation.direction).toBe('harder');
    expect(adaptation.factor).toBeLessThanOrEqual(1.1);
  });
});

describe('suggestHabits', () => {
  it('propõe pelo objetivo', () => {
    const drafts = suggestHabits([createGoal({ type: 'improve_fitness', active: true })], []);
    expect(drafts.length).toBeGreaterThan(0);
    expect(drafts.every((draft) => draft.rationale.length > 20)).toBe(true);
  });

  it('não repete um hábito que já existe', () => {
    const drafts = suggestHabits(
      [createGoal({ type: 'improve_fitness', active: true })],
      [createHabit({ title: 'Caminhar 30 minutos' })],
    );
    expect(drafts.some((draft) => draft.title === 'Caminhar 30 minutos')).toBe(false);
  });
});

describe('respond', () => {
  it('põe a segurança à frente de tudo', () => {
    const turn = respond(context(), 'Tenho dor no joelho, cria-me um treino de pernas');
    expect(turn.blocks[0]).toMatchObject({ kind: 'notice', tone: 'medical' });
    expect(turn.actions).toHaveLength(0);
  });

  it('não lê nada com o assistente desligado', () => {
    const turn = respond(
      context({ settings: settings({ enabled: false }) }),
      'Como está a minha evolução?',
    );
    expect(turn.actions[0]).toMatchObject({ kind: 'open' });
  });

  it('pede autorização em falta em vez de responder à toa', () => {
    const turn = respond(
      context({
        settings: settings({
          categories: {
            profile: true, goals: true, training: false, activity: true,
            nutrition: true, habits: true, sleep: true, feedback: true,
          },
        }),
      }),
      'Este treino está equilibrado?',
    );
    expect(turn.blocks[0]).toMatchObject({ kind: 'notice' });
    expect(turn.actions[0]?.kind).toBe('open');
  });

  it('propõe um treino com a ação de o adicionar', () => {
    const turn = respond(context(), 'Cria-me um treino de pernas de 45 minutos');
    const action = turn.actions.find((candidate) => candidate.kind === 'create_workout');
    expect(action).toBeDefined();
    expect(turn.blocks.some((block) => block.kind === 'references')).toBe(true);
  });

  it('avisa que a regra dos 10% não é uma garantia', () => {
    const turn = respond(context(), 'Quero conseguir correr 10 km');
    expect(turn.blocks.some((block) => block.kind === 'caveat')).toBe(true);
  });

  it('diz que não percebeu em vez de agir', () => {
    const turn = respond(context(), 'blá blá blá');
    expect(turn.actions).toHaveLength(0);
    expect(turn.followUps.length).toBeGreaterThan(0);
  });

  it('não inventa tendências sem dados', () => {
    const turn = respond(context(), 'Como está a minha evolução?');
    const said = JSON.stringify(turn.blocks);
    expect(said).toContain('Sem sessões registadas');
  });
});

describe('applyAdaptation', () => {
  const sessions = [
    { targetDistanceM: null, segments: [{ runSec: 60, walkSec: 120, repeats: 8 }] },
    { targetDistanceM: 5000, segments: [] },
    { targetDistanceM: null, segments: [] },
  ];

  it('baixa também as sessões de intervalos', () => {
    const eased = applyAdaptation(sessions, adapt([
      { difficulty: 'hard', rpe: null }, { difficulty: 'hard', rpe: null },
    ]), 0);
    expect(eased[0]?.segments[0]?.repeats).toBeLessThan(8);
    expect(eased[1]?.targetDistanceM).toBeLessThan(5000);
  });

  it('não mexe no que já passou', () => {
    const eased = applyAdaptation(sessions, adapt([
      { difficulty: 'hard', rpe: null }, { difficulty: 'hard', rpe: null },
    ]), 2);
    expect(eased[0]?.segments[0]?.repeats).toBe(8);
    expect(eased[1]?.targetDistanceM).toBe(5000);
  });

  it('nunca deixa uma sessão a menos de três repetições', () => {
    const tiny = [{ targetDistanceM: null, segments: [{ runSec: 60, walkSec: 120, repeats: 3 }] }];
    const eased = applyAdaptation(tiny, adapt([
      { difficulty: 'hard', rpe: null }, { difficulty: 'hard', rpe: null },
    ]), 0);
    expect(eased[0]?.segments[0]?.repeats).toBe(3);
  });
});

describe('intenções que se parecem umas com as outras', () => {
  it('separa "melhorar a condição física" de um pedido de evolução', () => {
    expect(parseIntent('Sugere hábitos para melhorar a condição física').kind).toBe('habits');
    expect(parseIntent('Como está a minha evolução?').kind).toBe('performance');
  });
});

describe('conversa com seguimento', () => {
  it('lê "superiores" como meio corpo', () => {
    const intent = parseIntent('Quero um treino só de superiores');
    expect(intent.muscles).toEqual(['chest', 'back', 'shoulders', 'arms']);
  });

  it('lê "inferiores" como pernas', () => {
    expect(parseIntent('treino de inferiores').muscles).toContain('legs');
  });

  it('reconhece uma correção ao pedido anterior', () => {
    expect(looksLikeRefinement('Mas eu queria que fosse só de superiores')).toBe(true);
    expect(looksLikeRefinement('Cria-me um treino de pernas')).toBe(false);
  });

  it('mantém o tempo do pedido anterior ao corrigir os músculos', () => {
    const first = parseIntent('Cria-me um treino de pernas de 45 minutos');
    const merged = refine(first, parseIntent('Mas eu queria que fosse só de superiores'));
    expect(merged.kind).toBe('create_workout');
    expect(merged.minutes).toBe(45);
    expect(merged.muscles).toEqual(['chest', 'back', 'shoulders', 'arms']);
  });

  it('responde à correção com um treino, e não com um beco', () => {
    const first = respond(context(), 'Cria-me um treino de pernas de 45 minutos');
    const second = respond(
      context(),
      'Mas eu queria que fosse só de superiores',
      first.intent as never,
    );
    const action = second.actions.find((candidate) => candidate.kind === 'create_workout');
    expect(action).toBeDefined();
    if (action?.kind === 'create_workout') {
      const groups = action.draft.blocks
        .filter((block) => block.section === 'main')
        .flatMap((block) => block.muscleGroups);
      expect(groups).not.toContain('legs');
      expect(action.draft.estimatedMin).toBeLessThanOrEqual(45);
    }
  });

  it('tira um grupo quando o utilizador o exclui', () => {
    const intent = parseIntent('treino de corpo inteiro sem pernas');
    expect(intent.excluded).toContain('legs');
  });
});

describe('os outros temas da PACE', () => {
  const kinds = (message: string): string => parseIntent(message).kind;

  it('reconhece sono, alongamentos, recuperação, caminhada e o dia', () => {
    expect(kinds('Como durmo melhor?')).toBe('sleep');
    expect(kinds('Quero alongar mais')).toBe('stretching');
    expect(kinds('Sinto-me cansado, o que faço?')).toBe('recovery');
    expect(kinds('Quero caminhar mais')).toBe('activity_plan');
    expect(kinds('O que faço hoje?')).toBe('today');
    expect(kinds('Sugere ideias de refeições')).toBe('meal_ideas');
  });

  it('reconhece tipos de treino e falta de equipamento', () => {
    expect(parseIntent('quero um HIIT de 20 minutos').workoutType).toBe('hiit');
    expect(parseIntent('treino de pilates').workoutType).toBe('pilates');
    expect(parseIntent('um treino em casa sem equipamento').equipment).toBe('home');
  });

  it('responde a cada tema com alguma coisa útil', () => {
    for (const message of [
      'Como durmo melhor?',
      'Quero alongar mais',
      'Sinto-me cansado, o que faço?',
      'Quero caminhar mais',
      'O que faço hoje?',
      'Sugere ideias de refeições',
    ]) {
      const turn = respond(context(), message);
      expect(turn.blocks.length).toBeGreaterThan(0);
      expect(JSON.stringify(turn.blocks)).not.toContain('Não apanhei o pedido');
    }
  });

  it('não inventa valores nutricionais nas ideias de refeições', () => {
    const said = JSON.stringify(respond(context(), 'Sugere ideias de refeições').blocks);
    expect(said).toContain('não invento valores');
    expect(said).not.toMatch(/\d+\s?kcal/);
  });

  it('diz que ainda não mede sono', () => {
    expect(JSON.stringify(respond(context(), 'Durmo mal, ajuda').blocks))
      .toContain('ainda não regista sono');
  });

  it('mesmo sem perceber, oferece caminhos', () => {
    const turn = respond(context(), 'xpto qwerty');
    expect(turn.followUps.length).toBeGreaterThanOrEqual(3);
  });
});

describe('o título diz o que lá está', () => {
  it('não promete um grupo que ficou de fora por falta de tempo', () => {
    const draft = buildWorkout({
      minutes: 30,
      muscles: ['chest', 'back', 'shoulders', 'arms'],
      type: 'strength',
      goal: 'gain_muscle',
      weekdays: [],
    });
    const trained = new Set(setsByGroup(draft).map((entry) => entry.group));
    for (const word of ['peito', 'costas', 'ombros', 'braços']) {
      const group = { peito: 'chest', costas: 'back', ombros: 'shoulders', 'braços': 'arms' }[word];
      if (draft.title.includes(word)) expect(trained.has(group as never)).toBe(true);
    }
  });
});

describe('a IA e a agenda', () => {
  it('lê o pedido do exemplo inteiro', () => {
    const intent = parseIntent(
      'Quero treinar musculação 4 vezes por semana, correr 2 vezes, caminhar todos os dias '
      + 'e beber água regularmente.',
    );
    expect(intent.kind).toBe('organize_week');
    expect(intent.perWeek).toMatchObject({ workouts: 4, runs: 2, walksDaily: true, water: true });
  });

  it('lê a altura do dia', () => {
    expect(parseIntent('Quero correr de manhã').partOfDay).toBe('morning');
    expect(parseIntent('Prefiro treinar à noite').partOfDay).toBe('evening');
  });

  it('lê um dia que a pessoa não pode', () => {
    const intent = parseIntent('Não consigo treinar quarta-feira');
    expect(intent.kind).toBe('block_day');
    expect(intent.excludedWeekdays).toEqual([3]);
  });

  it('lê uma mudança de dia', () => {
    const intent = parseIntent('Passa o treino de sexta para sábado');
    expect(intent.kind).toBe('move_session');
    expect(intent.move).toEqual({ from: 5, to: 6 });
  });

  it('propõe a semana com horas e não escreve nada sozinha', () => {
    const turn = respond(
      context(),
      'Quero treinar 4 vezes por semana, correr 2 e caminhar todos os dias',
    );
    const said = JSON.stringify(turn.blocks);
    expect(said).toContain('Encontrei estes horários disponíveis');
    const action = turn.actions.find((candidate) => candidate.kind === 'apply_schedule');
    expect(action).toBeDefined();
    if (action?.kind === 'apply_schedule') {
      expect(action.draft.summary).toEqual(['4 treinos', '2 corridas', '7 caminhadas']);
      // Cada linha traz dia e hora: é uma proposta, não uma intenção vaga.
      const comHora = action.draft.items.filter((item) => item.time != null);
      expect(comHora.length).toBe(action.draft.items.length);
    }
  });

  it('não propõe mexer no que já está marcado', () => {
    const turn = respond(context(), 'Organiza a minha semana com 3 treinos');
    for (const action of turn.actions) {
      expect(action.kind).not.toBe('move_workout');
    }
  });

  it('mover um treino é uma proposta, não um facto', () => {
    const comTreino = context({
      workouts: [createWorkout({ id: 'w1', title: 'Corpo inteiro', weekdays: [5] })],
    });
    const turn = respond(comTreino, 'Passa o treino de sexta para sábado');
    const action = turn.actions[0];
    expect(action).toMatchObject({ kind: 'move_workout', from: 5, to: 6, workoutId: 'w1' });
    expect(JSON.stringify(turn.blocks)).toContain('confirmares');
  });

  it('bloquear um dia não apaga nada', () => {
    const comTreino = context({
      workouts: [createWorkout({ id: 'w1', title: 'Corpo inteiro', weekdays: [3] })],
    });
    const turn = respond(comTreino, 'Não consigo treinar à quarta');
    expect(turn.actions[0]?.kind).toBe('move_workout');
    expect(JSON.stringify(turn.blocks)).toContain('Nada muda sem tu confirmares');
  });
});

describe('um pedido novo não é uma correção', () => {
  it('"Podes criar-me um treino de futebol" abre um pedido, não corrige o anterior', () => {
    expect(looksLikeRefinement('Podes criar me um treino de futebol individual de duas horas?'))
      .toBe(false);
  });

  it('"Podes tirar os agachamentos" continua a ser uma correção', () => {
    expect(looksLikeRefinement('Podes tirar os agachamentos?')).toBe(true);
  });

  it('"mas só de superiores" continua a ser uma correção', () => {
    expect(looksLikeRefinement('mas só de superiores')).toBe(true);
  });

  it('"Cria-me um plano de corrida" abre um pedido', () => {
    expect(looksLikeRefinement('Cria-me um plano de corrida')).toBe(false);
  });
});

describe('desporto com bola', () => {
  /*
   * Este teste garantia o contrario: que a PACE avisava nao saber montar uma
   * sessao com bola. Passou a saber — ha uma biblioteca por modalidade — e o
   * teste passou a garantir que a usa.
   */
  it('monta uma sessão de futebol, e não um treino de ginásio', () => {
    const turn = respond(context(), 'Podes criar-me um treino de futebol de duas horas?');
    const accao = turn.actions.find((action) => action.kind === 'create_workout');
    const nomes = accao && 'draft' in accao
      ? accao.draft.blocks.map((block) => block.exerciseName)
      : [];
    expect(nomes).toContain('Passe contra a parede');
    expect(nomes).toContain('Sprints curtos');
  });

  it('num treino de força não entra nada com bola', () => {
    const turn = respond(context(), 'Cria-me um treino de pernas de 45 minutos');
    const accao = turn.actions.find((action) => action.kind === 'create_workout');
    const notas = accao && 'draft' in accao
      ? accao.draft.blocks.map((block) => block.note ?? '')
      : [];
    expect(notas.some((nota) => nota.includes('Com bola'))).toBe(false);
  });
});

describe('a duração pedida é a duração entregue', () => {
  it('lê "duas horas" escrito por extenso', () => {
    expect(parseIntent('Cria-me um treino de duas horas').minutes).toBe(120);
  });

  it('lê "hora e meia"', () => {
    expect(parseIntent('Cria-me um treino de uma hora e meia').minutes).toBe(90);
  });

  it('continua a ler os algarismos', () => {
    expect(parseIntent('Cria-me um treino de 2 horas').minutes).toBe(120);
    expect(parseIntent('Cria-me um treino de 45 minutos').minutes).toBe(45);
  });

  it('entrega perto do tempo pedido quando há exercícios que cheguem', () => {
    const turn = respond(context(), 'Cria-me um treino de duas horas');
    const first = turn.blocks[0];
    expect(first?.kind).toBe('text');
    expect('text' in first! ? first.text : '').toContain('119 minutos');
  });

  it('avisa quando não consegue encher o tempo pedido', () => {
    const turn = respond(context(), 'Cria-me um treino de pernas de 75 minutos');
    const aviso = turn.blocks.find(
      (block) => block.kind === 'notice' && block.text.includes('Pediste 75 minutos'),
    );
    expect(aviso).toBeDefined();
  });
});
