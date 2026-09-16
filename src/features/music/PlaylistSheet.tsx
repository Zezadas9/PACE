/**
 * Uma playlist, aberta.
 *
 * Com link, é um botão que a abre na app de música. Sem link — a lista que a
 * IA sugeriu — é uma lista de músicas, cada uma a abrir na app de quem ouve. E
 * há sempre sítio para colar o link, que é o que transforma uma lista de
 * sugestões numa playlist a sério, com um toque.
 */

import { useMemo, useState, type ReactElement } from 'react';
import type { MusicApp } from '../../core/types';
import { MUSIC_APPS, appOfLink, trackSearchLink } from '../../domain/music';
import {
  deletePlaylist, musicApp, playlistOf, setMusicApp, setPlaylistLink,
} from '../../services/music';
import { useApp, useStoreVersion } from '../../app/providers/appContext';
import { useUi } from '../../app/providers/uiContext';
import { Sheet } from '../../ui/Sheet';
import { Button } from '../../ui/primitives';
import { Field, Input, Segmented } from '../../ui/form';
import { Icon } from '../../ui/Icon';

export const MUSIC_APP_OPTIONS: Array<{ id: MusicApp; label: string }> = [
  { id: 'spotify', label: MUSIC_APPS.spotify.label },
  { id: 'apple', label: MUSIC_APPS.apple.label },
  { id: 'youtube', label: MUSIC_APPS.youtube.label },
];

export function openMusicLink(url: string): void {
  if (!window.open(url, '_blank', 'noopener')) window.location.href = url;
}

export function PlaylistSheet({
  playlistId, onClose,
}: {
  playlistId: string;
  onClose: () => void;
}): ReactElement | null {
  const { repos } = useApp();
  const version = useStoreVersion();
  const { confirm, toast } = useUi();

  const playlist = useMemo(() => playlistOf(repos, playlistId), [repos, playlistId, version]);
  const app = useMemo(() => musicApp(repos), [repos, version]);
  const [link, setLink] = useState(playlist?.url ?? '');
  const [error, setError] = useState<string | null>(null);

  if (!playlist) return null;

  const saveLink = (): void => {
    const result = setPlaylistLink(repos, playlist.id, link);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setError(null);
    toast(link.trim() ? 'Link guardado.' : 'Link tirado.');
  };

  const remove = (): void => {
    void (async () => {
      const ok = await confirm({
        title: 'Apagar a playlist?',
        body: 'Sai também dos treinos onde estava. A playlist na tua app de música fica.',
        confirmLabel: 'Apagar',
        danger: true,
      });
      if (!ok) return;
      deletePlaylist(repos, playlist.id);
      onClose();
    })();
  };

  const count = playlist.tracks.length;

  return (
    <Sheet
      title={playlist.title}
      subtitle={[
        count > 0 ? `${count} ${count === 1 ? 'música' : 'músicas'}` : null,
        playlist.source === 'ai' ? 'sugerida pela IA' : null,
        playlist.url ? appOfLink(playlist.url) : null,
      ].filter(Boolean).join(' · ') || undefined}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" label="Apagar" onClick={remove} />
          {playlist.url ? (
            <Button
              variant="primary"
              icon="play"
              label={`Abrir no ${appOfLink(playlist.url)}`}
              onClick={() => openMusicLink(playlist.url as string)}
            />
          ) : (
            <Button variant="primary" label="Fechar" onClick={onClose} />
          )}
        </>
      }
    >
      <div className="stack stack-5">
        {playlist.note ? <p className="t-sm muted">{playlist.note}</p> : null}

        {count > 0 ? (
          <>
            <Field label="Onde ouves música">
              <Segmented
                ariaLabel="App de música"
                value={app}
                options={MUSIC_APP_OPTIONS}
                onChange={(next) => setMusicApp(repos, next)}
              />
            </Field>

            <p className="t-sm muted">
              Toca numa música para a abrires no {MUSIC_APPS[app].label}. Para ficares com
              a playlist lá, cria-a na app, junta estas músicas e cola o link em baixo —
              a partir daí, abre com um toque.
            </p>

            <ol className="playlist-tracks">
              {playlist.tracks.map((track, index) => (
                <li key={`${track.title}-${track.artist}`}>
                  <a
                    className="playlist-track"
                    href={trackSearchLink(app, track)}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <span className="playlist-n t-num">{index + 1}</span>
                    <span className="grow">
                      <span className="playlist-title">{track.title}</span>
                      <span className="playlist-artist">{track.artist}</span>
                    </span>
                    <Icon name="play" size={16} />
                  </a>
                </li>
              ))}
            </ol>
          </>
        ) : null}

        <Field
          label="Link da playlist"
          error={error ?? undefined}
          hint={error ? undefined : 'Na app de música: Partilhar › Copiar link.'}
        >
          <div className="row" style={{ gap: 'var(--s-2)' }}>
            <div className="grow">
              <Input
                value={link}
                placeholder="https://open.spotify.com/playlist/…"
                maxLength={400}
                invalid={!!error}
                onChange={(next) => { setLink(next); setError(null); }}
              />
            </div>
            <Button
              variant="outline"
              label="Guardar"
              disabled={link.trim() === (playlist.url ?? '')}
              onClick={saveLink}
            />
          </div>
        </Field>
      </div>
    </Sheet>
  );
}
