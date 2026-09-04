import { beforeEach, describe, expect, it } from 'vitest';
import { createRepositories, type Repositories } from '../data/repositories';
import { Store } from '../data/store';
import type { StoragePort } from '../platform/types';
import { aiSettings, grantAll, grantedCount, setCategory, setEnabled } from './coach';

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
