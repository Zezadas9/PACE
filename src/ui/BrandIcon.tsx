/**
 * The illustrated icon set.
 *
 * One sheet, fifteen icons, drawn as a CSS sprite rather than fifteen files:
 * a single request, no slicing step, and it caches with the rest of the app.
 *
 * The crop boxes below were measured off the sheet by scanning for non-black
 * rows, which is why they are not an even grid — each row of artwork sits at a
 * different height above its caption, and the captions must not appear.
 *
 * These are full-colour renders on black. They earn their place at size, on a
 * dark tile: the tab bar and list rows keep the line icons, which follow the
 * theme and stay sharp at 20px.
 */

import type { CSSProperties, ReactElement } from 'react';

const SHEET = './brand-icons.jpg';
const SHEET_W = 1536;
const SHEET_H = 1024;

/** Every icon is cropped to the same square, centred on its artwork. */
const BOX = 260;

const COLUMNS = 5;
const COLUMN_W = SHEET_W / COLUMNS;
/** Vertical centre of each row's artwork, measured rather than assumed. */
// Row three sits closer to its caption than the others; 796 clears it by a
// few pixels where 805 caught the top of the type.
const ROW_CENTRES = [186, 510, 796];

export type BrandIconName =
  | 'agenda' | 'treinos' | 'corrida' | 'bicicleta' | 'alimentacao'
  | 'progresso' | 'objetivos' | 'hidratacao' | 'ia' | 'lembretes'
  | 'sono' | 'perfil' | 'saude' | 'relaxamento' | 'estatisticas';

const ORDER: BrandIconName[] = [
  'agenda', 'treinos', 'corrida', 'bicicleta', 'alimentacao',
  'progresso', 'objetivos', 'hidratacao', 'ia', 'lembretes',
  'sono', 'perfil', 'saude', 'relaxamento', 'estatisticas',
];

function spriteStyle(name: BrandIconName, size: number): CSSProperties {
  const index = Math.max(0, ORDER.indexOf(name));
  const column = index % COLUMNS;
  const row = Math.floor(index / COLUMNS);

  const centreX = COLUMN_W * column + COLUMN_W / 2;
  const centreY = ROW_CENTRES[row] ?? SHEET_H / 2;

  const scale = size / BOX;
  return {
    width: size,
    height: size,
    backgroundImage: `url(${SHEET})`,
    backgroundSize: `${SHEET_W * scale}px ${SHEET_H * scale}px`,
    backgroundPosition:
      `${-(centreX - BOX / 2) * scale}px ${-(centreY - BOX / 2) * scale}px`,
    backgroundRepeat: 'no-repeat',
  };
}

export function BrandIcon({
  name, size = 44, float, label,
}: {
  name: BrandIconName;
  size?: number;
  /** A slow idle drift, for the few places an icon is the hero. */
  float?: boolean;
  label?: string;
}): ReactElement {
  return (
    <span
      className={`brand-icon${float ? ' is-floating' : ''}`}
      style={spriteStyle(name, size)}
      role={label ? 'img' : 'presentation'}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    />
  );
}

/** The icon on the dark disc it was drawn for, so it works in either theme. */
export function BrandIconTile({
  name, size = 44, float, label,
}: {
  name: BrandIconName;
  size?: number;
  float?: boolean;
  label?: string;
}): ReactElement {
  return (
    <span className="brand-tile" style={{ width: size * 1.5, height: size * 1.5 }}>
      <BrandIcon name={name} size={size} float={float} label={label} />
    </span>
  );
}
