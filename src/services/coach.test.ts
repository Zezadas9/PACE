import { beforeEach, describe, expect, it } from 'vitest';
import { createRepositories, type Repositories } from '../data/repositories';
import { Store } from '../data/store';
import type { StoragePort } from '../platform/types';
import { aiSettings, applyAction, grantAll, grantedCount, setCategory, setEnabled } from './coach';

function memoryStorage(): StoragePort {
  const map = new Map<string, unknown>();
  return {
    name: 'memory',
    isAvailable: async () => true,
    get: async <T,>(key: string) => (map.get(key) as T) ?? null,
    set: async (key, value) => { map.set(key, value); },
    remove: async (key) => { map.delete(key); },
    keys: async () => [...map.keys()],
  };
}

let repos: Repositories;

beforeEach(async () => {
  const store = new Store(memoryStorage());
  await store.load();
  repos = createRepositories(store);
});

describe('grantAll', () => {
  it('parte de tudo desligado', () => {
    const counts = grantedCount(aiSettings(repos));
    expect(counts.on).toBe(0);
    expect(counts.total).toBeGreaterThan(0);
  });

  it('liga o assistente e todas as categorias com dados', () => {
    const settings = grantAll(repos);
    expect(settings.enabled).toBe(true);
    const counts = grantedCount(settings);
    expect(counts.on).toBe(counts.total);
  });

  it('deixa o sono de fora, porque não há dados de sono', () => {
    expect(grantAll(repos).categories.sleep).toBe(false);
  });

  it('regista quando foi aceite', () => {
    expect(grantAll(repos).acceptedAt).not.toBeNull();
  });

  it('não impede desligar uma categoria a seguir', () => {
    grantAll(repos);
    setCategory(repos, 'nutrition', false);
    expect(aiSettings(repos).categories.nutrition).toBe(false);
    expect(aiSettings(repos).categories.training).toBe(true);
  });

  it('não conta categorias enquanto o assistente estiver desligado', () => {
    grantAll(repos);
    setEnabled(repos, false);
    expect(grantedCount(aiSettings(repos)).on).toBe(0);
  });
});

describe('applyAction — a última barreira antes de escrever', () => {
  it('recusa um treino sem exercícios', () => {
    const result = applyAction(repos, {
      kind: 'create_workout',
      label: 'Criar treino',
      draft: { title: 'Pernas', type: 'strength', estimatedMin: 45, weekdays: [], blocks: [] },
    });
    expect(result.ok).toBe(false);
    expect(repos.workouts.all()).toHaveLength(0);
  });

  it('recusa um exercício sem nome', () => {
    const result = applyAction(repos, {
      kind: 'create_workout',
      label: 'Criar treino',
      draft: {
        title: 'Pernas',
        type: 'strength',
        estimatedMin: 45,
        weekdays: [],
        blocks: [{
          section: 'main', exerciseName: '', muscleGroups: ['legs'], isBodyweight: false,
          sets: 3, reps: 10, durationSec: null, restSec: 60, note: null,
        }],
      },
    });
    expect(result.ok).toBe(false);
  });

  it('aceita um treino completo e escreve-o', () => {
    const result = applyAction(repos, {
      kind: 'create_workout',
      label: 'Criar treino',
      draft: {
        title: 'Pernas',
        type: 'strength',
        estimatedMin: 45,
        weekdays: [1, 4],
        blocks: [{
          section: 'main', exerciseName: 'Agachamento', muscleGroups: ['legs'],
          isBodyweight: false, sets: 4, reps: 8, durationSec: null, restSec: 90, note: null,
        }],
      },
    });
    expect(result.ok).toBe(true);
    expect(repos.workouts.all()).toHaveLength(1);
    expect(repos.exercises.all()[0]?.name).toBe('Agachamento');
  });

  it('reutiliza um exercício que já existe em vez de o duplicar', () => {
    const existing = repos.exercises.create({
      name: 'Agachamento', muscleGroups: ['legs'], isBodyweight: false,
    });
    applyAction(repos, {
      kind: 'create_workout',
      label: 'Criar treino',
      draft: {
        title: 'Pernas', type: 'strength', estimatedMin: 45, weekdays: [],
        blocks: [{
          section: 'main', exerciseName: 'agachamento', muscleGroups: ['legs'],
          isBodyweight: false, sets: 3, reps: 10, durationSec: null, restSec: 60, note: null,
        }],
      },
    });
    expect(repos.exercises.all()).toHaveLength(1);
    expect(repos.workouts.all()[0]?.blocks[0]?.exerciseId).toBe(existing.id);
  });

  it('recusa uma lista de hábitos vazia', () => {
    expect(applyAction(repos, { kind: 'create_habits', label: 'Criar', drafts: [] }).ok)
      .toBe(false);
  });

  it('recusa um plano de corrida sem sessões', () => {
    const result = applyAction(repos, {
      kind: 'create_run_plan',
      label: 'Criar plano',
      draft: {
        title: '10 km', goalDistanceM: 10000, weeks: 8, weekdays: [2, 5],
        startDate: '2026-09-07', sessions: [],
      },
    });
    expect(result.ok).toBe(false);
  });
});

describe('registar uma refeição a partir de uma proposta', () => {
  const refeicao = {
    kind: 'log_meal' as const,
    label: 'Registar almoço',
    draft: {
      date: '2026-09-05',
      type: 'lunch' as const,
      time: '13:00',
      notes: null,
      items: [{
        foodName: 'Arroz cozido',
        quantity: 150,
        unit: 'g' as const,
        food: {
          name: 'Arroz cozido', brand: null, kcalPer100g: 130, proteinPer100g: 2.7,
          carbsPer100g: 28, fatPer100g: 0.3, fiberPer100g: 0.4,
          gramsPerUnit: null, gramsPerMl: null,
        },
      }],
    },
  };

  it('cria a refeição e o alimento', () => {
    const result = applyAction(repos, refeicao);
    expect(result.ok).toBe(true);
    expect(repos.meals.all()).toHaveLength(1);
    expect(repos.foods.all()).toHaveLength(1);
  });

  it('marca os valores como estimativa, e não como medição', () => {
    applyAction(repos, refeicao);
    expect(repos.foods.all()[0]?.source).toBe('ai_estimate');
    expect(repos.foods.all()[0]?.kcalPer100g).toBe(130);
  });

  it('reutiliza um alimento que já existe em vez de o duplicar', () => {
    applyAction(repos, refeicao);
    applyAction(repos, refeicao);
    expect(repos.foods.all()).toHaveLength(1);
    expect(repos.meals.all()).toHaveLength(2);
  });

  it('não escreve por cima dos valores que o utilizador já tinha', () => {
    const meu = repos.foods.create({
      name: 'Arroz cozido', brand: null, kcalPer100g: 111, proteinPer100g: null,
      carbsPer100g: null, fatPer100g: null, fiberPer100g: null, gramsPerMl: null,
      gramsPerUnit: null, barcode: null, source: 'manual',
    });
    applyAction(repos, refeicao);
    expect(repos.foods.byId(meu.id)?.kcalPer100g).toBe(111);
    expect(repos.foods.byId(meu.id)?.source).toBe('manual');
  });

  it('preenche um alimento que estava sem valores', () => {
    const vazio = repos.foods.create({
      name: 'Arroz cozido', brand: null, kcalPer100g: null, proteinPer100g: null,
      carbsPer100g: null, fatPer100g: null, fiberPer100g: null, gramsPerMl: null,
      gramsPerUnit: null, barcode: null, source: 'manual',
    });
    applyAction(repos, refeicao);
    expect(repos.foods.byId(vazio.id)?.kcalPer100g).toBe(130);
    expect(repos.foods.byId(vazio.id)?.source).toBe('ai_estimate');
  });

  it('recusa uma refeição sem alimentos', () => {
    const vazia = { ...refeicao, draft: { ...refeicao.draft, items: [] } };
    expect(applyAction(repos, vazia).ok).toBe(false);
    expect(repos.meals.all()).toHaveLength(0);
  });
});
