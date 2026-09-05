import { beforeEach, describe, expect, it } from 'vitest';
import { createRepositories, type Repositories } from '../data/repositories';
import { Store } from '../data/store';
import type { StoragePort } from '../platform/types';
import { APP } from '../core/constants';
import {
  backupFilename, backupState, exportBackup, inspectBackup, restoreBackup,
} from './backup';

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

let store: Store;
let repos: Repositories;

beforeEach(async () => {
  store = new Store(memoryStorage());
  await store.load();
  repos = createRepositories(store);
});

describe('guardar uma cópia', () => {
  it('leva os registos todos', () => {
    repos.habits.create({ title: 'Água', kind: 'count', target: 8 });
    repos.tasks.create({ title: 'Comprar pão' });

    const backup = exportBackup(store, repos);
    const parsed = JSON.parse(backup.json);
    expect(parsed.habits).toHaveLength(1);
    expect(parsed.tasks).toHaveLength(1);
    expect(parsed.schemaVersion).toBe(APP.schemaVersion);
  });

  it('regista quando foi feita', () => {
    expect(backupState(store, repos).lastAt).toBeNull();
    exportBackup(store, repos);
    expect(backupState(store, repos).lastAt).not.toBeNull();
    expect(backupState(store, repos).daysSince).toBe(0);
  });

  it('conta os registos que a cópia levaria', () => {
    repos.habits.create({ title: 'Água', kind: 'count', target: 8 });
    repos.habits.create({ title: 'Ler', kind: 'check', target: 1 });
    expect(backupState(store, repos).records).toBe(2);
  });

  it('dá um nome com a data, para duas cópias não se sobreporem', () => {
    expect(backupFilename(new Date('2026-09-05T10:00:00Z'))).toBe('pace-2026-09-05.json');
  });
});

describe('ler uma cópia antes de a aplicar', () => {
  it('recusa um ficheiro que não é JSON', () => {
    const result = inspectBackup('isto não é json');
    expect(result.ok).toBe(false);
    expect(!result.ok && result.problem).toBe('unreadable');
  });

  it('recusa um JSON que não é da PACE', () => {
    const result = inspectBackup('{"qualquer":"coisa"}');
    expect(!result.ok && result.problem).toBe('not_pace');
  });

  /**
   * As migrações só andam para a frente. Um ficheiro de uma versão futura tem
   * campos que esta versão não sabe ler, e aceitá-lo seria perder o que lá
   * está sem dizer nada.
   */
  it('recusa uma cópia de uma versão mais recente', () => {
    const result = inspectBackup(JSON.stringify({
      schemaVersion: APP.schemaVersion + 1, settings: {},
    }));
    expect(!result.ok && result.problem).toBe('too_new');
  });

  it('diz o que a cópia traz, para a confirmação poder ser específica', () => {
    repos.habits.create({ title: 'Água', kind: 'count', target: 8 });
    repos.user.set({ ...repos.user.get()!, name: 'Ana' });
    const backup = exportBackup(store, repos);

    const preview = inspectBackup(backup.json);
    expect(preview.ok).toBe(true);
    expect(preview.ok && preview.records).toBe(1);
    expect(preview.ok && preview.name).toBe('Ana');
  });
});

describe('restaurar', () => {
  it('substitui o que lá estava', async () => {
    repos.habits.create({ title: 'Água', kind: 'count', target: 8 });
    const backup = exportBackup(store, repos);

    repos.habits.create({ title: 'Outro hábito', kind: 'check', target: 1 });
    expect(repos.habits.all()).toHaveLength(2);

    await restoreBackup(store, backup.json);
    expect(repos.habits.all()).toHaveLength(1);
    expect(repos.habits.all()[0]?.title).toBe('Água');
  });

  it('não deixa um ficheiro estragado partir a aplicação', async () => {
    repos.habits.create({ title: 'Água', kind: 'count', target: 8 });
    expect(await restoreBackup(store, '{{{')).toBe(false);
    expect(repos.habits.all()).toHaveLength(1);
  });
});
