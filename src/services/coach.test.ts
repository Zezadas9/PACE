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
