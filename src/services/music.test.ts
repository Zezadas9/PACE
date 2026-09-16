import { beforeEach, describe, expect, it } from 'vitest';
import { createRepositories, type Repositories } from '../data/repositories';
import { Store } from '../data/store';
import type { StoragePort } from '../platform/types';
import {
  createPlaylistFromDraft, deletePlaylist, playlistFromLink, runPlaylist, setPlaylistLink,
  setWorkoutPlaylist,
} from './music';

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

const faixas = [
  { title: 'Eye of the Tiger', artist: 'Survivor' },
  { title: 'Lose Yourself', artist: 'Eminem' },
  { title: 'Stronger', artist: 'Kanye West' },
];

describe('a playlist da IA', () => {
  it('fica ligada ao treino pedido, encontrado pelo título', () => {
    const treino = repos.workouts.create({ title: 'Força A' });
    const { playlist, attachedTo } = createPlaylistFromDraft(repos, {
      title: 'Força total', forWorkout: 'força a', forRun: false, tracks: faixas, note: null,
    });
    expect(attachedTo).toBe('Força A');
    expect(playlist.source).toBe('ai');
    expect(playlist.url).toBeNull();
    expect(repos.workouts.byId(treino.id)?.playlistId).toBe(playlist.id);
  });

  it('ou às corridas', () => {
    const { playlist, attachedTo } = createPlaylistFromDraft(repos, {
      title: 'Correr a 170', forWorkout: null, forRun: true, tracks: faixas, note: null,
    });
    expect(attachedTo).toBe('corridas');
    expect(runPlaylist(repos)?.id).toBe(playlist.id);
  });

  it('um treino que não existe não é criado: a playlist fica solta', () => {
    const { attachedTo } = createPlaylistFromDraft(repos, {
      title: 'X', forWorkout: 'Treino fantasma', forRun: false, tracks: faixas, note: null,
    });
    expect(attachedTo).toBeNull();
    expect(repos.workouts.all()).toHaveLength(0);
    expect(repos.playlists.all()).toHaveLength(1);
  });

  it('ganha um link quando a pessoa a cria na app e o cola', () => {
    const { playlist } = createPlaylistFromDraft(repos, {
      title: 'X', forWorkout: null, forRun: false, tracks: faixas, note: null,
    });
    expect(setPlaylistLink(repos, playlist.id, 'open.spotify.com/playlist/9').ok).toBe(true);
    expect(repos.playlists.byId(playlist.id)?.url).toBe('https://open.spotify.com/playlist/9');
    expect(setPlaylistLink(repos, playlist.id, 'https://example.com').ok).toBe(false);
  });
});

describe('links colados', () => {
  it('um link de música vira playlist, e o mesmo link não se duplica', () => {
    const primeiro = playlistFromLink(repos, 'https://open.spotify.com/playlist/1', 'Corrida');
    const segundo = playlistFromLink(repos, 'open.spotify.com/playlist/1');
    expect(primeiro.ok && segundo.ok && primeiro.playlist.id === segundo.playlist.id).toBe(true);
    expect(repos.playlists.all()).toHaveLength(1);
  });

  it('um link que não é de música é recusado, com o motivo', () => {
    const resultado = playlistFromLink(repos, 'https://example.com/x');
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(resultado.error).toContain('música');
  });
});

describe('apagar', () => {
  it('desliga a playlist de tudo onde estava', () => {
    const treino = repos.workouts.create({ title: 'Força A' });
    const { playlist } = createPlaylistFromDraft(repos, {
      title: 'X', forWorkout: null, forRun: true, tracks: faixas, note: null,
    });
    setWorkoutPlaylist(repos, treino.id, playlist.id);

    deletePlaylist(repos, playlist.id);
    expect(repos.workouts.byId(treino.id)?.playlistId).toBeNull();
    expect(runPlaylist(repos)).toBeNull();
    expect(repos.playlists.all()).toHaveLength(0);
  });
});
