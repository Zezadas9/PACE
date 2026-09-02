/**
 * O avatar.
 *
 * Três formas de aparecer, e nenhuma delas depende da rede: as iniciais, um
 * desenho da galeria, ou a fotografia do utilizador. A galeria é feita em SVG
 * aqui mesmo — nada de ficheiros, nada de serviços externos, e segue a paleta
 * da PACE em vez de trazer um estilo de fora.
 */

import type { ReactElement } from 'react';
import type { Avatar as AvatarChoice } from '../core/types';
import { initials } from '../core/utils/format';

export interface AvatarPreset {
  id: string;
  label: string;
  /** Duas cores: o fundo e a figura. */
  background: string;
  ink: string;
  shape: 'person' | 'ring' | 'peak' | 'wave' | 'spark' | 'bolt';
}

/**
 * Oito, não mais.
 *
 * Uma galeria grande obriga a escolher; uma pequena deixa escolher. As cores
 * são as categorias que a aplicação já usa, por isso um avatar nunca destoa do
 * resto do ecrã.
 */
export const AVATAR_PRESETS: ReadonlyArray<AvatarPreset> = [
  { id: 'ink', label: 'Tinta', background: '#111114', ink: '#FFFFFF', shape: 'person' },
  { id: 'paper', label: 'Papel', background: '#F1EFEA', ink: '#111114', shape: 'person' },
  { id: 'ember', label: 'Brasa', background: '#C2410C', ink: '#FFF7ED', shape: 'spark' },
  { id: 'ocean', label: 'Oceano', background: '#0E7490', ink: '#ECFEFF', shape: 'wave' },
  { id: 'forest', label: 'Floresta', background: '#166534', ink: '#ECFDF5', shape: 'peak' },
  { id: 'plum', label: 'Ameixa', background: '#6B21A8', ink: '#FAF5FF', shape: 'ring' },
  { id: 'clay', label: 'Barro', background: '#9A3412', ink: '#FFF7ED', shape: 'bolt' },
  { id: 'steel', label: 'Aço', background: '#334155', ink: '#F8FAFC', shape: 'ring' },
];

function shapePath(shape: AvatarPreset['shape']): ReactElement {
  switch (shape) {
    case 'person':
      return (
        <>
          <circle cx="24" cy="19" r="7.5" />
          <path d="M10.5 39c1.6-7 7-11 13.5-11s11.9 4 13.5 11z" />
        </>
      );
    case 'ring':
      return <path d="M24 10a14 14 0 1 0 0 28 14 14 0 1 0 0-28zm0 7a7 7 0 1 1 0 14 7 7 0 0 1 0-14z" />;
    case 'peak':
      return <path d="M10 34l9-14 6 8 4-5 9 11z" />;
    case 'wave':
      return <path d="M10 27c4-6 8-6 12 0s8 6 12 0v6c-4 6-8 6-12 0s-8-6-12 0z" />;
    case 'spark':
      return <path d="M24 9l3.6 9.4L37 22l-9.4 3.6L24 35l-3.6-9.4L11 22l9.4-3.6z" />;
    case 'bolt':
    default:
      return <path d="M26 9l-11 16h7l-4 14 12-17h-7z" />;
  }
}

export function PresetAvatar({
  preset, size,
}: {
  preset: AvatarPreset;
  size: number;
}): ReactElement {
  return (
    <svg
      viewBox="0 0 48 48"
      width={size}
      height={size}
      role="img"
      aria-label={`Avatar ${preset.label}`}
      className="avatar-art"
    >
      <rect width="48" height="48" rx="24" fill={preset.background} />
      <g fill={preset.ink}>{shapePath(preset.shape)}</g>
    </svg>
  );
}

export function presetById(id: string | null): AvatarPreset | undefined {
  return AVATAR_PRESETS.find((preset) => preset.id === id);
}

export function Avatar({
  name, avatar, size = 40, className,
}: {
  name: string;
  avatar?: AvatarChoice | null;
  size?: number;
  className?: string;
}): ReactElement {
  const classes = ['avatar', className].filter(Boolean).join(' ');
  const style = { width: size, height: size };

  if (avatar?.kind === 'photo' && avatar.photo) {
    return (
      <span className={classes} style={style}>
        <img src={avatar.photo} alt={name ? `Fotografia de ${name}` : 'Fotografia de perfil'} />
      </span>
    );
  }

  const preset = avatar?.kind === 'preset' ? presetById(avatar.presetId) : undefined;
  if (preset) {
    return (
      <span className={classes} style={style}>
        <PresetAvatar preset={preset} size={size} />
      </span>
    );
  }

  return (
    <span className={classes} style={style} aria-hidden="true">
      <span className="avatar-initials" style={{ fontSize: size * 0.36 }}>{initials(name)}</span>
    </span>
  );
}
