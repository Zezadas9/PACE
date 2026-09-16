/**
 * A música, a um toque, dentro de uma sessão.
 *
 * Com link, abre a playlist na app de música — e quem volta à PACE encontra a
 * sessão onde a deixou, com a música a tocar por trás. Sem link, abre a lista
 * de músicas. Sem playlist nenhuma, deixa escolher uma ali mesmo, sem sair do
 * treino.
 */

import { useMemo, useState, type ReactElement } from 'react';
import { appOfLink } from '../../domain/music';
import { playlistOf } from '../../services/music';
import { useApp, useStoreVersion } from '../../app/providers/appContext';
import { Sheet } from '../../ui/Sheet';
import { Button } from '../../ui/primitives';
import { Icon } from '../../ui/Icon';
import { PlaylistField } from './PlaylistField';
import { PlaylistSheet, openMusicLink } from './PlaylistSheet';

export function MusicButton({
  playlistId, onAttach, pickTitle,
}: {
  playlistId: string | null;
  onAttach: (playlistId: string | null) => void;
  /** O título da folha de escolha: "Música do treino", "Música para correr". */
  pickTitle: string;
}): ReactElement {
  const { repos } = useApp();
  const version = useStoreVersion();
  const playlist = useMemo(() => playlistOf(repos, playlistId), [repos, playlistId, version]);
  const [open, setOpen] = useState<'view' | 'pick' | null>(null);

  const tap = (): void => {
    if (playlist?.url) {
      openMusicLink(playlist.url);
      return;
    }
    setOpen(playlist ? 'view' : 'pick');
  };

  return (
    <div className="music-bar">
      <button type="button" className="music-pill" onClick={tap}>
        <span className="music-glyph" aria-hidden="true"><Icon name="music" size={18} /></span>
        <span className="grow">
          <span className="music-title">{playlist ? playlist.title : 'Pôr música'}</span>
          <span className="music-sub">
            {playlist?.url
              ? `Abre no ${appOfLink(playlist.url)} · volta aqui, a música continua`
              : playlist
                ? `${playlist.tracks.length} músicas para abrir na tua app`
                : 'Escolhe uma playlist para esta sessão'}
          </span>
        </span>
        <Icon name={playlist?.url ? 'play' : 'chevron'} size={18} />
      </button>
      {playlist ? (
        <button type="button" className="music-change link t-sm" onClick={() => setOpen('pick')}>
          Trocar
        </button>
      ) : null}

      {open === 'view' && playlist ? (
        <PlaylistSheet playlistId={playlist.id} onClose={() => setOpen(null)} />
      ) : null}

      {open === 'pick' ? (
        <Sheet
          title={pickTitle}
          onClose={() => setOpen(null)}
          footer={<Button variant="primary" label="Feito" onClick={() => setOpen(null)} />}
        >
          <PlaylistField value={playlistId} onChange={onAttach} label="Playlist" />
        </Sheet>
      ) : null}
    </div>
  );
}
