/**
 * Escolher a cara do perfil.
 *
 * Galeria, câmara, ficheiro, ou voltar às iniciais. A fotografia é reduzida
 * antes de ser guardada — uma foto de telemóvel são vários megabytes, e o
 * snapshot da aplicação não é sítio para isso.
 */

import { useCallback, useRef, useState, type ReactElement } from 'react';
import type { Avatar as AvatarChoice } from '../../core/types';
import { AVATAR_PRESETS, PresetAvatar } from '../../ui/Avatar';
import { Sheet } from '../../ui/Sheet';
import { Button } from '../../ui/primitives';
import { Icon } from '../../ui/Icon';

/** Lado máximo da imagem guardada. Chega para qualquer sítio onde apareça. */
const MAX_SIDE = 320;

/**
 * Reduz e corta ao centro, em quadrado.
 *
 * Corta antes de guardar em vez de deixar o CSS cortar: assim a imagem guardada
 * é exatamente a que se vê, e não uma fotografia inteira escondida por trás de
 * um círculo.
 */
async function toSquareDataUrl(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = MAX_SIDE;
  canvas.height = MAX_SIDE;

  const context = canvas.getContext('2d');
  if (!context) throw new Error('sem canvas');
  context.drawImage(
    bitmap,
    (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side,
    0, 0, MAX_SIDE, MAX_SIDE,
  );
  bitmap.close?.();
  return canvas.toDataURL('image/jpeg', 0.82);
}

export function AvatarSheet({
  current, onChoose, onClose,
}: {
  current: AvatarChoice;
  onChoose: (avatar: AvatarChoice) => void;
  onClose: () => void;
}): ReactElement {
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const pick = useCallback(async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const photo = await toSquareDataUrl(file);
      onChoose({ kind: 'photo', presetId: current.presetId, photo });
    } catch {
      // Um formato que o browser não abre, ou permissão negada: dizer, e não
      // deixar o ecrã num estado meio feito.
      setError('Não consegui usar essa imagem. Tenta outra.');
    } finally {
      setBusy(false);
    }
  }, [current.presetId, onChoose]);

  return (
    <Sheet
      title="Foto de perfil"
      subtitle="Escolhe um avatar ou usa uma fotografia tua."
      onClose={onClose}
      footer={<Button variant="outline" block label="Fechar" onClick={onClose} />}
    >
      <div className="stack stack-5">
        <div className="avatar-gallery" role="radiogroup" aria-label="Avatares">
          {AVATAR_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              role="radio"
              aria-checked={current.kind === 'preset' && current.presetId === preset.id}
              aria-label={preset.label}
              className="avatar-option"
              onClick={() => onChoose({ kind: 'preset', presetId: preset.id, photo: current.photo })}
            >
              <PresetAvatar preset={preset} size={56} />
            </button>
          ))}
        </div>

        <div className="stack stack-2">
          <Button
            variant="outline"
            block
            icon="camera"
            label={busy ? 'A preparar…' : 'Usar câmara'}
            disabled={busy}
            onClick={() => cameraRef.current?.click()}
          />
          <Button
            variant="outline"
            block
            icon="image"
            label="Escolher da galeria"
            disabled={busy}
            onClick={() => galleryRef.current?.click()}
          />
          {current.kind === 'photo' || current.kind === 'preset' ? (
            <Button
              variant="ghost"
              block
              label="Voltar às iniciais"
              onClick={() => onChoose({ kind: 'initials', presetId: null, photo: null })}
            />
          ) : null}
        </div>

        {error ? (
          <p className="t-sm" style={{ color: 'var(--c-danger, var(--c-ember))' }}>
            <Icon name="close" /> {error}
          </p>
        ) : null}

        <p className="t-sm muted-2">
          A imagem fica guardada só neste dispositivo, como o resto dos teus dados.
        </p>

        {/* Dois campos: um pede a câmara ao sistema, o outro a galeria. Em
            computador ambos abrem o seletor de ficheiros, que é o esperado. */}
        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="user"
          hidden
          onChange={(event) => void pick(event.target.files?.[0])}
        />
        <input
          ref={galleryRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(event) => void pick(event.target.files?.[0])}
        />
      </div>
    </Sheet>
  );
}
