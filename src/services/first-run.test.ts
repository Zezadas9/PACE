import { beforeEach, describe, expect, it } from 'vitest';
import { createRepositories, type Repositories } from '../data/repositories';
import { Store } from '../data/store';
import type { StoragePort } from '../platform/types';
import { isFirstRun } from './dashboard';
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

describe('o primeiro dia', () => {
  it('uma aplicação acabada de instalar está vazia', () => {
    expect(isFirstRun(repos)).toBe(true);
  });

  /**
   * Quem acabou o onboarding tem nome, idade e peso — e continua a não ter
   * nada seu na aplicação. O perfil não é conteúdo.
   */
  it('acabar o onboarding não conta como ter conteúdo', () => {
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
    expect(isFirstRun(repos)).toBe(true);
  });

  it('a primeira coisa criada acaba com o primeiro dia', () => {
    repos.habits.create({ title: 'Água', kind: 'count', target: 8 });
    expect(isFirstRun(repos)).toBe(false);
  });

  it('qualquer uma das secções conta', () => {
    const casos: Array<() => void> = [
      () => repos.tasks.create({ title: 'Comprar pão' }),
      () => repos.events.create({ title: 'Consulta' }),
      () => repos.workouts.create({ title: 'Pernas' }),
      () => repos.activitySessions.create({ type: 'run' }),
      () => repos.meals.create({ type: 'lunch' }),
      () => repos.sleepEntries.create({ quality: 4 }),
    ];

    for (const criar of casos) {
      const store = new Store(memoryStorage());
      void store.load();
      criar();
      expect(isFirstRun(repos)).toBe(false);
      // Limpa para o caso seguinte.
      for (const habit of repos.habits.all()) repos.habits.remove(habit.id);
      for (const task of repos.tasks.all()) repos.tasks.remove(task.id);
      for (const event of repos.events.all()) repos.events.remove(event.id);
      for (const workout of repos.workouts.all()) repos.workouts.remove(workout.id);
      for (const session of repos.activitySessions.all()) repos.activitySessions.remove(session.id);
      for (const meal of repos.meals.all()) repos.meals.remove(meal.id);
      for (const night of repos.sleepEntries.all()) repos.sleepEntries.remove(night.id);
      expect(isFirstRun(repos)).toBe(true);
    }
  });
});
