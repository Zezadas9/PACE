/**
 * Escolher a música de um treino (ou das corridas).
 *
 * As playlists guardadas aparecem como opções; uma nova entra colando o link
 * que a app de música dá em "Partilhar". Não há ligação à conta de ninguém —
 * ver `domain/music.ts` —, por isso o link é a ponte.
 */

import { useMemo, useState, type ReactElement } from 'react';
import { playlistFromLink, playlists } from '../../services/music';
import { useApp, useStoreVersion } from '../../app/providers/appContext';
import { Button, Chip } from '../../ui/primitives';
import { Field, Input } from '../../ui/form';

export function PlaylistField({
  value, onChange, label = 'Música',
}: {
  value: string | null;
  onChange: (playlistId: string | null) => void;
  label?: string;
}): ReactElement {
  const { repos } = useApp();
  const version = useStoreVersion();
  const list = useMemo(() => playlists(repos), [repos, version]);
  const [link, setLink] = useState('');
  const [error, setError] = useState<string | null>(null);

  const add = (): void => {
    const result = playlistFromLink(repos, link);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setError(null);
    setLink('');
    onChange(result.playlist.id);
  };

  return (
    <Field label={label}>
      <div className="stack stack-3">
        <div className="chips">
          <Chip label="Sem música" pressed={value == null} onClick={() => onChange(null)} />
          {list.map((playlist) => (
            <Chip
              key={playlist.id}
              label={playlist.title}
              pressed={value === playlist.id}
              onClick={() => onChange(playlist.id)}
            />
          ))}
        </div>
        <Field
          error={error ?? undefined}
          hint={error ? undefined : 'Na app de música: Partilhar › Copiar link, e cola aqui.'}
        >
          <div className="row" style={{ gap: 'var(--s-2)' }}>
            <div className="grow">
              <Input
                value={link}
                placeholder="Link da playlist"
                maxLength={400}
                invalid={!!error}
                onChange={(next) => { setLink(next); setError(null); }}
              />
            </div>
            <Button variant="outline" label="Juntar" disabled={link.trim() === ''} onClick={add} />
          </div>
        </Field>
      </div>
    </Field>
  );
}
