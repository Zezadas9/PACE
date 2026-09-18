/**
 * O desenho de cada desporto.
 *
 * Um haltere de linha igual para basquetebol, dança e natação não diz nada a
 * ninguém. Aqui cada desporto ganha a sua figura: a arte da casa onde ela
 * existe — o haltere da aba do treino, a corrida, a bicicleta, a caminhada —
 * e um emoji onde não existe. Os dois convivem porque são da mesma família
 * visual: os ícones da casa também são figuras cheias, com volume e cor.
 *
 * O emoji é desenhado pelo sistema, por isso é o do iPhone no iPhone e o do
 * Android no Android — sempre o que a pessoa já conhece, sem pesar um único
 * byte de transferência.
 */

import type { ReactElement } from 'react';
import type { SportId } from '../domain/sport';
import { sportOf } from '../domain/sport';
import type { WorkoutType } from '../core/types';
import { BrandIcon, type BrandIconName } from './BrandIcon';

/** Ou uma figura da casa, ou um emoji do sistema. Nunca as duas. */
export type Glyph = { brand: BrandIconName; emoji?: undefined }
  | { emoji: string; brand?: undefined };

const GLYPHS: Record<SportId, Glyph> = {
  // A arte da casa, onde já existe uma que é exatamente isto.
  strength: { brand: 'treinos' },
  running: { brand: 'corrida' },
  cycling: { brand: 'bicicleta' },
  walking: { brand: 'caminhada' },

  basketball: { emoji: '🏀' },
  football: { emoji: '⚽' },
  tennis: { emoji: '🎾' },
  tabletennis: { emoji: '🏓' },
  volleyball: { emoji: '🏐' },
  handball: { emoji: '🤾' },
  swimming: { emoji: '🏊' },
  dance: { emoji: '🕺' },
  boxing: { emoji: '🥊' },
  martialarts: { emoji: '🥋' },
  gymnastics: { emoji: '🤸' },
  golf: { emoji: '⛳' },
  surf: { emoji: '🏄' },
  skate: { emoji: '🛹' },
  climbing: { emoji: '🧗' },
  hockey: { emoji: '🏒' },
  rugby: { emoji: '🏉' },
  baseball: { emoji: '⚾' },
  badminton: { emoji: '🏸' },
  skating: { emoji: '⛸️' },
  ski: { emoji: '🎿' },
  rowing: { emoji: '🚣' },
  yoga: { emoji: '🧘' },

  functional: { emoji: '🏋️' },
  calisthenics: { emoji: '💪' },
  hiit: { emoji: '🔥' },
  mobility: { emoji: '🤸' },
  pilates: { emoji: '🧘' },
  generic: { emoji: '🏅' },
};

export function glyphOfSport(id: SportId): Glyph {
  return GLYPHS[id];
}

/** A figura de um treino, pronta a espalhar em `<Row {...workoutGlyph(w)} />`. */
export function workoutGlyph(
  workout: { title: string; type: WorkoutType; tags?: ReadonlyArray<string> },
): Glyph {
  return GLYPHS[sportOf(workout)];
}

/**
 * A figura, sozinha, onde não há uma linha à volta dela.
 *
 * O emoji é texto, e texto herda o tamanho de quem o contém — daí o tamanho ir
 * no estilo, para ficar do mesmo tamanho visual que a arte da casa ao lado.
 */
export function GlyphMark({
  glyph, size = 26, className,
}: {
  glyph: Glyph;
  size?: number;
  className?: string;
}): ReactElement {
  if (glyph.brand) return <BrandIcon name={glyph.brand} size={size} className={className} />;
  return (
    <span
      className={['emoji-mark', className ?? ''].filter(Boolean).join(' ')}
      style={{ fontSize: size * 0.82, width: size, height: size }}
      aria-hidden="true"
    >
      {glyph.emoji}
    </span>
  );
}
