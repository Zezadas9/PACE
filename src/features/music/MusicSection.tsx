/**
 * Música, no perfil.
 *
 * Onde se ouve (decide para onde abrem as músicas das listas da IA), qual é a
 * playlist das corridas, e as playlists guardadas.
 */

import { useMemo, useState, type ReactElement } from 'react';
import { appOfLink } from '../../domain/music';
import {
  musicApp, playlists, setMusicApp, setRunPlaylist,
} from '../../services/music';
import { useApp, useStoreVersion } from '../../app/providers/appContext';
import { Card, SectionHeader } from '../../ui/primitives';
import { Field, Segmented } from '../../ui/form';
import { Row, Rows } from '../../ui/data';
import { PlaylistField } from './PlaylistField';
import { MUSIC_APP_OPTIONS, PlaylistSheet } from './PlaylistSheet';

export function MusicSection(): ReactElement {
  const { repos } = useApp();
  const version = useStoreVersion();
  const list = useMemo(() => playlists(repos), [repos, version]);
  const app = useMemo(() => musicApp(repos), [repos, version]);
  const runId = useMemo(() => repos.settings.get().music.runPlaylistId, [repos, version]);
  const [open, setOpen] = useState<string | null>(null);

  return (
    <section>
      <SectionHeader title="Música" />
      <Card>
        <div className="stack stack-5">
          <Field label="Onde ouves música" hint="As músicas sugeridas pela IA abrem aqui.">
            <Segmented
              ariaLabel="App de música"
              value={app}
              options={MUSIC_APP_OPTIONS}
              onChange={(next) => setMusicApp(repos, next)}
            />
          </Field>
          <PlaylistField
            label="Playlist das corridas e caminhadas"
            value={runId}
            onChange={(id) => setRunPlaylist(repos, id)}
          />
        </div>
      </Card>

      {list.length > 0 ? (
        <div style={{ marginTop: 'var(--s-3)' }}>
          <Card variant="flush">
            <Rows>
              {list.map((playlist) => (
                <Row
                  key={playlist.id}
                  icon="music"
                  title={playlist.title}
                  sub={[
                    playlist.tracks.length > 0 ? `${playlist.tracks.length} músicas` : null,
                    playlist.url ? appOfLink(playlist.url) : null,
                    playlist.source === 'ai' ? 'da IA' : null,
                  ].filter(Boolean).join(' · ')}
                  chevron
                  onClick={() => setOpen(playlist.id)}
                />
              ))}
            </Rows>
          </Card>
        </div>
      ) : null}

      {open ? <PlaylistSheet playlistId={open} onClose={() => setOpen(null)} /> : null}
    </section>
  );
}
