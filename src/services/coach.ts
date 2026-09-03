/**
 * PACE — o serviço do assistente.
 *
 * Duas responsabilidades, e nenhuma delas é decidir o que dizer:
 *
 * 1. **Montar o contexto** a partir das autorizações. Uma categoria desligada
 *    não chega ao motor vazia por acaso — chega vazia por construção, e é por
 *    isso que a resposta consegue dizer honestamente que não sabe.
 * 2. **Aplicar o que o utilizador aceitar.** Nenhuma ação corre sozinha: cada
 *    uma vem de um toque num botão que mostra exatamente o que vai acontecer.
 */

import { createId } from '../core/utils/id';
import { todayKey } from '../core/utils/date';
import { age } from '../domain/metrics';
import type {
  AiDataCategory, AiSettings, CoachMessage, Habit, RunPlan, RunSessionFeedback,
  UserPreferences,
} from '../core/types';
import type {
  CoachContext, CoachTurn, HabitDraft, RunPlanDraft, ScheduleDraft, WorkoutDraft,
} from '../domain/coach/types';
import type { CoachIntent } from '../domain/coach/intent';
import type { CoachAction } from '../domain/coach/types';
import { adapt, applyAdaptation } from '../domain/coach/running';
import type { Platform } from '../platform/types';
import type { Repositories } from '../data/repositories';

const EMPTY_CONTEXT_SLICES = {
  goals: [], workouts: [], exercises: [], sessions: [], activities: [],
  habits: [], habitEntries: [], meals: [], foods: [], water: [],
};

export function aiSettings(repos: Repositories): AiSettings {
  return repos.settings.get().ai;
}

export function setEnabled(repos: Repositories, enabled: boolean): AiSettings {
  const current = repos.settings.get();
  const ai: AiSettings = {
    ...current.ai,
    enabled,
    acceptedAt: enabled ? new Date().toISOString() : current.ai.acceptedAt,
  };
  repos.settings.updateAi(ai);
  return ai;
}

export function setCategory(
  repos: Repositories,
  category: AiDataCategory,
  value: boolean,
): AiSettings {
  const current = repos.settings.get().ai;
  const ai: AiSettings = {
    ...current,
    categories: { ...current.categories, [category]: value },
  };
  repos.settings.updateAi(ai);
  return ai;
}

/**
 * O retrato que o motor vai ler.
 *
 * Cada fatia é entregue só se a categoria estiver ligada. É deliberadamente
 * chato de escrever: assim vê-se, linha a linha, o que é que cada autorização
 * abre.
 */
export function buildContext(
  repos: Repositories,
  preferences: UserPreferences,
  today = todayKey(),
): CoachContext {
  const settings = aiSettings(repos);
  const can = (category: AiDataCategory): boolean =>
    settings.enabled && settings.categories[category];

  const user = repos.user.get();

  return {
    today,
    settings,
    preferences,
    profile: can('profile') && user
      ? {
        name: user.name,
        ageYears: age(user.birthDate),
        gender: user.gender,
        heightCm: user.body.heightCm,
        weightKg: user.body.weightKg,
      }
      : null,
    ...EMPTY_CONTEXT_SLICES,
    goals: can('goals') ? repos.goals.all() : [],
    workouts: can('training') ? repos.workouts.all() : [],
    exercises: can('training') ? repos.exercises.all() : [],
    sessions: can('training') ? repos.workoutSessions.all() : [],
    activities: can('activity') ? repos.activitySessions.all() : [],
    habits: can('habits') ? repos.habits.all() : [],
    habitEntries: can('habits') ? repos.habitEntries.all() : [],
    meals: can('nutrition') ? repos.meals.all() : [],
    foods: can('nutrition') ? repos.foods.all() : [],
    water: can('nutrition') ? repos.waterEntries.all() : [],
    runPlan: can('activity') ? activePlan(repos) : null,
    sleep: null,
  };
}

export function activePlan(repos: Repositories): RunPlan | null {
  return repos.runPlans.where((plan) => plan.active)[0] ?? null;
}

/* --- A conversa ------------------------------------------------------------------ */

export function history(repos: Repositories): CoachMessage[] {
  return repos.coachMessages
    .all()
    .slice()
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export function clearHistory(repos: Repositories): void {
  for (const message of repos.coachMessages.all()) repos.coachMessages.remove(message.id);
}

/** Quantas mensagens acompanham o pedido. Chega para a conversa fazer sentido. */
const HISTORY_TURNS = 8;
const HISTORY_CHARS = 1200;

/**
 * A conversa, reduzida ao que vale a pena enviar.
 *
 * Só o texto: as respostas do assistente viram a soma dos seus blocos de texto,
 * e tudo o que exceda o limite é cortado. Nada de contexto, nada de rascunhos
 * de ações, nada do snapshot — isso já viaja no `context`, e só com o que foi
 * autorizado.
 */
export function compactHistory(
  messages: CoachMessage[],
  turns = HISTORY_TURNS,
): Array<{ role: 'user' | 'assistant'; text: string }> {
  return messages
    .slice(-turns)
    .map((message) => {
      const text = message.role === 'user'
        ? message.text
        : textOf(message.turn as CoachTurn | null);
      return {
        role: message.role === 'user' ? ('user' as const) : ('assistant' as const),
        text: text.slice(0, HISTORY_CHARS),
      };
    })
    .filter((entry) => entry.text.trim() !== '');
}

function textOf(turn: CoachTurn | null): string {
  if (!turn) return '';
  return turn.blocks
    .map((block) => {
      if (block.kind === 'text' || block.kind === 'notice' || block.kind === 'caveat') {
        return block.text;
      }
      if (block.kind === 'list') return block.items.join(' · ');
      return '';
    })
    .filter((line) => line !== '')
    .join('\n');
}

export interface AskResult {
  turn: CoachTurn;
  /** Quem respondeu: o motor local ou o backend. */
  engine: string;
  /** Verdadeiro quando o remoto falhou e a resposta veio do motor local. */
  fallback: boolean;
}

export async function ask(
  repos: Repositories,
  platform: Platform,
  preferences: UserPreferences,
  message: string,
): Promise<AskResult> {
  const previousMessages = history(repos);

  // A intenção da última resposta viaja com o pedido: é o que permite que uma
  // correção — "mas só de superiores" — se cole ao que foi pedido antes.
  const previous = previousMessages
    .filter((entry) => entry.role === 'coach')
    .map((entry) => (entry.turn as CoachTurn | null)?.intent as CoachIntent | undefined)
    .filter((intent): intent is CoachIntent => intent != null)
    .pop() ?? null;

  repos.coachMessages.create({ role: 'user', text: message.trim(), turn: null });

  const context = buildContext(repos, preferences);
  const reply = await platform.assistant.respond({
    message,
    context,
    previousIntent: previous,
    history: compactHistory(previousMessages),
  });

  repos.coachMessages.create({ role: 'coach', text: '', turn: reply.turn });
  return {
    turn: reply.turn,
    engine: reply.engine ?? platform.assistant.engine,
    fallback: reply.fallback === true,
  };
}

/* --- Aplicar o que foi aceite ----------------------------------------------------- */

export interface ApplyResult {
  ok: boolean;
  message: string;
  /** Para onde levar o utilizador a ver o que acabou de acontecer. */
  path: string | null;
}

export function applyAction(repos: Repositories, action: CoachAction): ApplyResult {
  switch (action.kind) {
    case 'create_workout': return createWorkout(repos, action.draft);
    case 'create_habits': return createHabits(repos, action.drafts);
    case 'create_run_plan': return createRunPlan(repos, action.draft);
    case 'apply_schedule': return applySchedule(repos, action.draft);
    case 'move_workout': return moveWorkout(repos, action.workoutId, action.from, action.to);
    case 'open': return { ok: true, message: '', path: action.path };
    default: return { ok: false, message: 'Ação desconhecida.', path: null };
  }
}

function createWorkout(repos: Repositories, draft: WorkoutDraft): ApplyResult {
  const workout = repos.workouts.create({
    title: draft.title,
    type: draft.type,
    weekdays: draft.weekdays,
    estimatedMin: draft.estimatedMin,
    tags: ['Proposto pelo assistente'],
    blocks: draft.blocks.map((block) => ({
      id: createId(),
      section: block.section,
      // Reutiliza o exercício se ele já existir: o histórico de cargas é do
      // movimento, e um duplicado partia-o em dois.
      exerciseId: resolveExercise(repos, block.exerciseName, block.muscleGroups, block.isBodyweight),
      sets: block.sets,
      reps: block.reps,
      loadKg: null,
      durationSec: block.durationSec,
      restSec: block.restSec,
      note: block.note,
    })),
  });
  return { ok: true, message: `"${workout.title}" adicionado aos treinos.`, path: '/treino' };
}

function resolveExercise(
  repos: Repositories,
  name: string,
  muscleGroups: WorkoutDraft['blocks'][number]['muscleGroups'],
  isBodyweight: boolean,
): string {
  const existing = repos.exercises
    .all()
    .find((exercise) => exercise.name.toLowerCase() === name.toLowerCase());
  if (existing) return existing.id;
  return repos.exercises.create({ name, muscleGroups, isBodyweight }).id;
}

function createHabits(repos: Repositories, drafts: HabitDraft[]): ApplyResult {
  const created: Habit[] = drafts.map((draft) => repos.habits.create({
    title: draft.title,
    description: draft.rationale,
    kind: draft.kind,
    frequency: draft.frequency,
    weekdays: draft.weekdays,
    target: draft.target,
    unit: draft.unit,
    timeOfDay: draft.timeOfDay,
    durationMin: draft.durationMin,
    essential: draft.essential,
    startDate: todayKey(),
  }));
  return {
    ok: true,
    message: created.length === 1
      ? `"${created[0]!.title}" está na agenda.`
      : `${created.length} hábitos na agenda.`,
    path: '/agenda',
  };
}

function createRunPlan(repos: Repositories, draft: RunPlanDraft): ApplyResult {
  // Um plano de cada vez: dois planos ativos seriam duas progressões a
  // contradizerem-se.
  for (const plan of repos.runPlans.where((candidate) => candidate.active)) {
    repos.runPlans.update(plan.id, { active: false });
  }

  const plan = repos.runPlans.create({
    title: draft.title,
    goalDistanceM: draft.goalDistanceM,
    startDate: draft.startDate,
    weekdays: draft.weekdays,
    active: true,
    adjustments: [],
    sessions: draft.sessions.map((session, index) => ({
      id: createId(),
      index: index + 1,
      weekIndex: session.weekIndex,
      date: session.date,
      kind: session.kind,
      segments: session.segments,
      targetDistanceM: session.targetDistanceM,
      targetDurationSec: session.targetDurationSec,
      note: session.note,
      status: 'planned' as const,
      feedback: null,
      activityId: null,
    })),
  });
  return { ok: true, message: `Plano "${plan.title}" criado.`, path: '/ia/corrida' };
}

/**
 * Aplica a proposta de semana.
 *
 * Cada tipo entra no sítio onde a aplicação já o sabe mostrar: os treinos vão
 * para o plano de treino existente (dias e hora), o resto vira hábitos com dia
 * e hora marcados. Nada é apagado e nada é movido — o que já estava fica onde
 * estava, e o que entra ocupa só o espaço que a proposta encontrou livre.
 */
function applySchedule(repos: Repositories, draft: ScheduleDraft): ApplyResult {
  const criados: string[] = [];

  const treinos = draft.items.filter((item) => item.kind === 'workout');
  if (treinos.length > 0) {
    const dias = [...new Set(treinos.map((item) => item.weekday))];
    const hora = treinos.find((item) => item.time)?.time ?? null;
    const plano = repos.workouts.where((workout) => !workout.archived)[0];

    if (plano) {
      // Junta-se aos dias que o plano já tinha: tirar um dia sem o utilizador
      // pedir seria mexer no que já estava.
      repos.workouts.update(plano.id, {
        weekdays: [...new Set([...plano.weekdays, ...dias])].sort(),
        timeOfDay: plano.timeOfDay ?? hora,
      });
      criados.push(`${treinos.length} ${treinos.length === 1 ? 'treino' : 'treinos'}`);
    } else {
      // Sem plano nenhum, marca-se o compromisso como hábito: a hora fica na
      // agenda e o conteúdo do treino fica para quem o quiser escrever.
      repos.habits.create({
        title: treinos[0]?.label ?? 'Treino',
        kind: 'check',
        frequency: 'custom',
        weekdays: dias,
        target: 1,
        timeOfDay: hora,
        durationMin: treinos[0]?.durationMin ?? 60,
        startDate: todayKey(),
      });
      criados.push(`${treinos.length} ${treinos.length === 1 ? 'treino' : 'treinos'}`);
    }
  }

  const corridas = draft.items.filter((item) => item.kind === 'run');
  if (corridas.length > 0) {
    repos.habits.create({
      title: 'Correr',
      kind: 'check',
      frequency: 'custom',
      weekdays: [...new Set(corridas.map((item) => item.weekday))],
      target: 1,
      timeOfDay: corridas[0]?.time ?? null,
      durationMin: corridas[0]?.durationMin ?? 40,
      startDate: todayKey(),
    });
    criados.push(`${corridas.length} ${corridas.length === 1 ? 'corrida' : 'corridas'}`);
  }

  const caminhadas = draft.items.filter((item) => item.kind === 'walk');
  if (caminhadas.length > 0) {
    const todosOsDias = caminhadas.length >= 7;
    repos.habits.create({
      title: 'Caminhar',
      kind: 'duration',
      frequency: todosOsDias ? 'daily' : 'custom',
      weekdays: todosOsDias ? [] : [...new Set(caminhadas.map((item) => item.weekday))],
      target: caminhadas[0]?.durationMin ?? 30,
      unit: 'min',
      timeOfDay: caminhadas[0]?.time ?? null,
      durationMin: caminhadas[0]?.durationMin ?? 30,
      startDate: todayKey(),
    });
    criados.push(`${caminhadas.length} ${caminhadas.length === 1 ? 'caminhada' : 'caminhadas'}`);
  }

  if (draft.items.some((item) => item.kind === 'water')) {
    repos.habits.create({
      title: 'Beber água',
      kind: 'count',
      frequency: 'daily',
      weekdays: [],
      target: 8,
      unit: 'copos',
      timeOfDay: null,
      startDate: todayKey(),
    });
    criados.push('hábito de água');
  }

  return {
    ok: criados.length > 0,
    message: criados.length > 0
      ? `Semana organizada: ${criados.join(', ')}.`
      : 'Não havia nada para adicionar.',
    path: '/agenda',
  };
}

/**
 * Passa um treino de um dia para outro.
 *
 * Troca o dia, e mais nada: os outros dias do plano ficam como estavam, e o
 * conteúdo do treino não é tocado.
 */
function moveWorkout(
  repos: Repositories,
  workoutId: string,
  from: number,
  to: number,
): ApplyResult {
  const workout = repos.workouts.byId(workoutId);
  if (!workout) return { ok: false, message: 'Já não encontro esse treino.', path: null };

  const weekdays = [...new Set(
    workout.weekdays.filter((day) => day !== from).concat(to),
  )].sort();
  repos.workouts.update(workoutId, { weekdays });

  return { ok: true, message: `"${workout.title}" mudou de dia.`, path: '/treino' };
}

/* --- O plano de corrida, sessão a sessão ------------------------------------------- */

export interface RunPlanView {
  plan: RunPlan;
  next: RunPlan['sessions'][number] | null;
  doneCount: number;
  total: number;
  /** Última decisão de ajuste, para o ecrã poder explicá-la. */
  lastAdjustment: RunPlan['adjustments'][number] | null;
}

export function runPlanView(repos: Repositories): RunPlanView | null {
  const plan = activePlan(repos);
  if (!plan) return null;
  const pending = plan.sessions.filter((session) => session.status === 'planned');
  return {
    plan,
    next: pending[0] ?? null,
    doneCount: plan.sessions.filter((session) => session.status === 'done').length,
    total: plan.sessions.length,
    lastAdjustment: plan.adjustments[plan.adjustments.length - 1] ?? null,
  };
}

/**
 * Fecha uma sessão com o que a pessoa sentiu, e adapta o que vem a seguir.
 *
 * A adaptação nunca é imediata a uma sessão isolada — precisa de duas no mesmo
 * sentido. E quando sobe, sobe pelo mesmo travão de 10% do resto do plano.
 */
export function completeRunSession(
  repos: Repositories,
  sessionId: string,
  feedback: Omit<RunSessionFeedback, 'at'>,
  activityId: string | null = null,
): RunPlanView | null {
  const plan = activePlan(repos);
  if (!plan) return null;

  const index = plan.sessions.findIndex((session) => session.id === sessionId);
  if (index === -1) return runPlanView(repos);

  const sessions = plan.sessions.map((session, position) => (
    position === index
      ? {
        ...session,
        status: 'done' as const,
        activityId,
        feedback: { ...feedback, at: new Date().toISOString() },
      }
      : session
  ));

  const recent = sessions
    .slice(0, index + 1)
    .filter((session) => session.feedback != null)
    .map((session) => ({
      difficulty: session.feedback!.difficulty,
      rpe: session.feedback!.rpe,
    }));

  const adaptation = adapt(recent);
  const adapted = adaptation.direction === 'hold'
    ? sessions
    : applyAdaptation(sessions, adaptation, index + 1);

  repos.runPlans.update(plan.id, {
    sessions: adapted,
    adjustments: adaptation.direction === 'hold'
      ? plan.adjustments
      : [...plan.adjustments, {
        at: new Date().toISOString(),
        direction: adaptation.direction,
        reason: adaptation.reason,
        fromSessionIndex: index + 1,
      }],
  });
  return runPlanView(repos);
}

export function skipRunSession(repos: Repositories, sessionId: string): RunPlanView | null {
  const plan = activePlan(repos);
  if (!plan) return null;
  repos.runPlans.update(plan.id, {
    sessions: plan.sessions.map((session) => (
      session.id === sessionId ? { ...session, status: 'skipped' as const } : session
    )),
  });
  return runPlanView(repos);
}

export function endRunPlan(repos: Repositories): void {
  const plan = activePlan(repos);
  if (plan) repos.runPlans.update(plan.id, { active: false });
}
