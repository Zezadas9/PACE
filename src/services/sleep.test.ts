import { beforeEach, describe, expect, it } from 'vitest';
import { createRepositories, type Repositories } from '../data/repositories';
import { Store } from '../data/store';
import type { StoragePort } from '../platform/types';
import { deleteNight, draftFor, emptyDraft, hasAnything, overview, saveNight } from './sleep';

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

describe('registar uma noite', () => {
  it('não guarda uma noite vazia', () => {
    expect(hasAnything(emptyDraft('2026-09-05'))).toBe(false);
    expect(saveNight(repos, emptyDraft('2026-09-05'))).toBeNull();
    expect(repos.sleepEntries.all()).toHaveLength(0);
  });

  it('guarda uma noite com só a qualidade', () => {
    saveNight(repos, { ...emptyDraft('2026-09-05'), quality: 2 });
    expect(repos.sleepEntries.all()).toHaveLength(1);
  });

  /**
   * Registar duas vezes o mesmo dia é corrigir, não duplicar. Quem acorda,
   * escreve depressa e volta a mexer uma hora depois espera ter corrigido.
   */
  it('substitui em vez de duplicar', () => {
    saveNight(repos, { ...emptyDraft('2026-09-05'), quality: 2 });
    saveNight(repos, { ...emptyDraft('2026-09-05'), quality: 4, bedtime: '23:00', wakeTime: '07:00' });

    expect(repos.sleepEntries.all()).toHaveLength(1);
    expect(repos.sleepEntries.all()[0]?.quality).toBe(4);
  });

  /**
   * Guardar as horas e a duração deixaria duas verdades a divergir: corrigir
   * a hora de acordar não mexeria na duração, e a partir daí não se saberia
   * qual das duas está certa.
   */
  it('não guarda a duração escrita quando as horas a dão', () => {
    saveNight(repos, {
      ...emptyDraft('2026-09-05'), bedtime: '23:00', wakeTime: '07:00', durationMin: 300,
    });
    expect(repos.sleepEntries.all()[0]?.durationMin).toBeNull();
  });

  it('guarda a duração escrita quando não há horas', () => {
    saveNight(repos, { ...emptyDraft('2026-09-05'), durationMin: 420 });
    expect(repos.sleepEntries.all()[0]?.durationMin).toBe(420);
  });

  it('devolve o rascunho de uma noite já registada', () => {
    saveNight(repos, { ...emptyDraft('2026-09-05'), bedtime: '23:30', quality: 3 });
    const draft = draftFor(repos, '2026-09-05');
    expect(draft.bedtime).toBe('23:30');
    expect(draft.quality).toBe(3);
  });

  it('apaga a noite de um dia', () => {
    saveNight(repos, { ...emptyDraft('2026-09-05'), quality: 3 });
    deleteNight(repos, '2026-09-05');
    expect(repos.sleepEntries.all()).toHaveLength(0);
  });
});

describe('o resumo', () => {
  it('está vazio antes de haver noites', () => {
    const model = overview(repos, '2026-09-05');
    expect(model.today).toBeNull();
    expect(model.previous).toBeNull();
    expect(model.week.averageMin).toBeNull();
  });

  it('separa a noite de hoje da anterior', () => {
    saveNight(repos, { ...emptyDraft('2026-09-05'), durationMin: 480 });
    saveNight(repos, { ...emptyDraft('2026-09-04'), durationMin: 420 });

    const model = overview(repos, '2026-09-05');
    expect(model.today?.durationMin).toBe(480);
    expect(model.previous?.durationMin).toBe(420);
    expect(model.week.averageMin).toBe(450);
  });
});
