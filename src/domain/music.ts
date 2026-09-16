/**
 * PACE — a ponte para a app de música.
 *
 * A PACE não toca música. Abre a playlist na app onde a pessoa ouve — Spotify,
 * Apple Music, YouTube Music — e volta. A música continua a tocar por trás
 * enquanto a sessão decorre.
 *
 * Porque não mais do que isto: desde 2026 o Spotify só deixa uma aplicação nova
 * ligar-se à conta de cinco pessoas, e o acesso alargado é só para empresas
 * com 250 000 utilizadores por mês. Um botão "ligar ao Spotify" funcionaria
 * para quem fez a app e mais quatro, e falharia para todos os outros. Um link
 * funciona para toda a gente.
 */

import type { MusicApp, PlaylistTrack } from '../core/types';

export const MUSIC_APPS: Record<MusicApp, { label: string; search: (query: string) => string }> = {
  spotify: {
    label: 'Spotify',
    search: (query) => `https://open.spotify.com/search/${encodeURIComponent(query)}`,
  },
  apple: {
    label: 'Apple Music',
    search: (query) => `https://music.apple.com/search?term=${encodeURIComponent(query)}`,
  },
  youtube: {
    label: 'YouTube Music',
    search: (query) => `https://music.youtube.com/search?q=${encodeURIComponent(query)}`,
  },
};

/**
 * Os sítios de onde se aceita um link de playlist.
 *
 * Uma lista fechada, porque o link vira um botão que abre sozinho. Um link que
 * não é de música não tem lugar num botão chamado "Música".
 */
const HOSTS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /^open\.spotify\.com$/, label: 'Spotify' },
  { pattern: /^spotify\.link$/, label: 'Spotify' },
  { pattern: /^music\.apple\.com$/, label: 'Apple Music' },
  { pattern: /^music\.youtube\.com$/, label: 'YouTube Music' },
  { pattern: /^(www\.|m\.)?youtube\.com$/, label: 'YouTube' },
  { pattern: /^youtu\.be$/, label: 'YouTube' },
  { pattern: /^(www\.)?deezer\.com$/, label: 'Deezer' },
  { pattern: /^(link\.)?deezer\.page\.link$/, label: 'Deezer' },
  { pattern: /^(www\.|listen\.)?tidal\.com$/, label: 'Tidal' },
  { pattern: /^music\.amazon\.[a-z.]+$/, label: 'Amazon Music' },
  { pattern: /^(www\.|on\.)?soundcloud\.com$/, label: 'SoundCloud' },
];

function hostOf(input: string): { url: URL; label: string } | null {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'https:') return null;
  const host = url.hostname.toLowerCase();
  const found = HOSTS.find((entry) => entry.pattern.test(host));
  return found ? { url, label: found.label } : null;
}

/**
 * Um link de playlist limpo, ou null.
 *
 * Aceita o que a app de música dá ao partilhar — com ou sem "https://" à
 * frente, que é como muita gente o cola.
 */
export function cleanMusicLink(input: string): string | null {
  const text = input.trim();
  if (text === '') return null;
  const withScheme = /^https?:\/\//i.test(text) ? text : `https://${text}`;
  const found = hostOf(withScheme.replace(/^http:\/\//i, 'https://'));
  return found ? found.url.toString() : null;
}

/** "Spotify", "Apple Music" — de onde é um link, para o botão o poder dizer. */
export function appOfLink(url: string): string {
  return hostOf(url)?.label ?? 'Música';
}

/** Onde abrir uma música na app de quem ouve. */
export function trackSearchLink(app: MusicApp, track: PlaylistTrack): string {
  return MUSIC_APPS[app].search(`${track.title} ${track.artist}`);
}

/**
 * As músicas, arrumadas: sem vazias, sem repetidas, no máximo cinquenta.
 *
 * Uma lista feita por um modelo repete-se às vezes com outra capitalização —
 * "Eye of the Tiger" e "Eye Of The Tiger" são a mesma música.
 */
export function normalizeTracks(tracks: PlaylistTrack[]): PlaylistTrack[] {
  const seen = new Set<string>();
  const out: PlaylistTrack[] = [];
  for (const track of tracks) {
    const title = (track.title ?? '').trim();
    const artist = (track.artist ?? '').trim();
    if (title === '' || artist === '') continue;
    const key = `${title.toLowerCase()}|${artist.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ title, artist });
    if (out.length === 50) break;
  }
  return out;
}
