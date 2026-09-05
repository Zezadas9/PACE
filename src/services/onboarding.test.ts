import { beforeEach, describe, expect, it } from 'vitest';
import { createRepositories, type Repositories } from '../data/repositories';
import { Store } from '../data/store';
import type { StoragePort } from '../platform/types';
import { completeOnboarding } from './profile';

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

describe('quem chega de novo', () => {
  /**
   * A aplicação já entregou hábitos, tarefas, treinos, refeições e uma
   * atividade a quem acabava de entrar — dados de demonstração escritos no fim
   * do onboarding. Parecia uma aplicação já usada por outra pessoa, e apagar
   * aquilo tudo era o primeiro trabalho de quem a instalava.
   */
  it('não recebe dados que não criou', () => {
    completeOnboarding(repos, {
      name: 'Ana',
      theme: 'dark',
      birthDate: '2000-01-10',
      gender: 'undisclosed',
      weightUnit: 'kg',
      distanceUnit: 'km',
      heightCm: 170,
      weightKg: 70,
      goalTypes: ['improve_fitness'],
      customGoal: '',
    });

    expect(repos.habits.all()).toHaveLength(0);
    expect(repos.tasks.all()).toHaveLength(0);
    expect(repos.workouts.all()).toHaveLength(0);
    expect(repos.exercises.all()).toHaveLength(0);
    expect(repos.workoutSessions.all()).toHaveLength(0);
    expect(repos.activitySessions.all()).toHaveLength(0);
    expect(repos.activityGoals.all()).toHaveLength(0);
    expect(repos.meals.all()).toHaveLength(0);
    expect(repos.foods.all()).toHaveLength(0);
    expect(repos.waterEntries.all()).toHaveLength(0);
    expect(repos.nutritionGoals.all()).toHaveLength(0);
    expect(repos.events.all()).toHaveLength(0);
  });

  it('fica com o perfil que escreveu, e só com isso', () => {
    completeOnboarding(repos, {
      name: 'Ana',
      theme: 'dark',
      birthDate: '2000-01-10',
      gender: 'undisclosed',
      weightUnit: 'kg',
      distanceUnit: 'km',
      heightCm: 170,
      weightKg: 70,
      goalTypes: ['improve_fitness'],
      customGoal: '',
    });

    const user = repos.user.get();
    expect(user?.name).toBe('Ana');
    expect(user?.body.heightCm).toBe(170);
    expect(user?.onboardingCompleted).toBe(true);
  });
});
