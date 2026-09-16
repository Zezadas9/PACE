/**
 * PACE — as playlists.
 *
 * Guardar, ligar a um treino ou às corridas, apagar. E a porta por onde entra
 * a playlist que a IA faz: ela sugere as músicas, e é aqui que a lista fica
 * guardada e ligada ao sítio certo.
 *
 * Apagar uma playlist desliga-a de tudo onde estava. Um treino a apontar para
 * uma playlist que já não existe mostrava um botão de música que não abria nada.
 */

import type { MusicApp, Playlist, PlaylistTrack } from '../core/types';
import type { PlaylistDraft } from '../domain/coach/types';
import { cleanMusicLink, normalizeTracks } from '../domain/music';
import type { Repositories } from '../data/repositories';

export function playlists(repos: Repositories): Playlist[] {
  return repos.playlists
    .all()
    .slice()
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function playlistOf(repos: Repositories, id: string | null | undefined): Playlist | null {
  return id ? repos.playlists.byId(id) ?? null : null;
}

export function musicApp(repos: Repositories): MusicApp {
  return repos.settings.get().music.app;
}

export function setMusicApp(repos: Repositories, app: MusicApp): void {
  repos.settings.updateMusic({ app });
}

/** A playlist das corridas e caminhadas. */
export function runPlaylist(repos: Repositories): Playlist | null {
  return playlistOf(repos, repos.settings.get().music.runPlaylistId);
}

export function setRunPlaylist(repos: Repositories, playlistId: string | null): void {
  repos.settings.updateMusic({ runPlaylistId: playlistId });
}

export function setWorkoutPlaylist(
  repos: Repositories,
  workoutId: string,
  playlistId: string | null,
): void {
  repos.workouts.update(workoutId, { playlistId });
}

export type LinkOutcome = { ok: true; playlist: Playlist } | { ok: false; error: string };

/**
 * Uma playlist a partir de um link colado.
 *
 * O nome vem de quem a cola, ou é "Playlist" — o link não diz o nome, e ir
 * buscá-lo à app de música exigia a ligação que o Spotify limita.
 */
export function playlistFromLink(repos: Repositories, link: string, title = ''): LinkOutcome {
  const url = cleanMusicLink(link);
  if (!url) return { ok: false, error: 'Esse link não parece de uma app de música.' };

  const existing = repos.playlists.all().find((playlist) => playlist.url === url);
  if (existing) return { ok: true, playlist: existing };

  const playlist = repos.playlists.create({
    title: title.trim() || 'Playlist',
    url,
    tracks: [],
    source: 'manual',
    note: null,
  });
  return { ok: true, playlist };
}

/** Dá (ou tira) o link a uma playlist que já existe — a da IA, por exemplo. */
export function setPlaylistLink(repos: Repositories, playlistId: string, link: string): LinkOutcome {
  const playlist = repos.playlists.byId(playlistId);
  if (!playlist) return { ok: false, error: 'Essa playlist já não existe.' };
  if (link.trim() === '') {
    return { ok: true, playlist: repos.playlists.update(playlistId, { url: null }) ?? playlist };
  }
  const url = cleanMusicLink(link);
  if (!url) return { ok: false, error: 'Esse link não parece de uma app de música.' };
  return { ok: true, playlist: repos.playlists.update(playlistId, { url }) ?? playlist };
}

export function renamePlaylist(repos: Repositories, playlistId: string, title: string): void {
  const clean = title.trim();
  if (clean) repos.playlists.update(playlistId, { title: clean.slice(0, 80) });
}

export function deletePlaylist(repos: Repositories, playlistId: string): void {
  for (const workout of repos.workouts.where((item) => item.playlistId === playlistId)) {
    repos.workouts.update(workout.id, { playlistId: null });
  }
  if (repos.settings.get().music.runPlaylistId === playlistId) {
    repos.settings.updateMusic({ runPlaylistId: null });
  }
  repos.playlists.remove(playlistId);
}

export interface CreatedPlaylist {
  playlist: Playlist;
  /** Onde ficou ligada: o título do treino, "corridas", ou null. */
  attachedTo: string | null;
}

/**
 * Guarda a playlist que a IA fez, e liga-a ao sítio para que foi pedida.
 *
 * O treino é encontrado pelo título, sem ligar a maiúsculas. Um título que não
 * existe não cria treino nenhum: a playlist fica guardada, solta, e pode ser
 * ligada depois.
 */
export function createPlaylistFromDraft(repos: Repositories, draft: PlaylistDraft): CreatedPlaylist {
  const tracks: PlaylistTrack[] = normalizeTracks(draft.tracks);
  const playlist = repos.playlists.create({
    title: draft.title.trim().slice(0, 80) || 'Playlist',
    url: null,
    tracks,
    source: 'ai',
    note: draft.note?.trim() || null,
  });

  if (draft.forRun) {
    setRunPlaylist(repos, playlist.id);
    return { playlist, attachedTo: 'corridas' };
  }

  const wanted = draft.forWorkout?.trim().toLowerCase();
  if (wanted) {
    const workout = repos.workouts
      .where((item) => !item.archived)
      .find((item) => item.title.trim().toLowerCase() === wanted);
    if (workout) {
      setWorkoutPlaylist(repos, workout.id, playlist.id);
      return { playlist, attachedTo: workout.title };
    }
  }

  return { playlist, attachedTo: null };
}
