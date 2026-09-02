/**
 * O conjunto de ícones ilustrados.
 *
 * Um ficheiro por ícone, em `public/icons/`, cada um com transparência
 * verdadeira e o conteúdo centrado numa tela quadrada com a mesma área de
 * segurança — por isso todos aparecem do mesmo tamanho visual, mesmo tendo
 * desenhos de proporções diferentes.
 *
 * Os assets são gerados por `tools/build-brand-icons.cjs` a partir da folha
 * original. Nada aqui recorta nada em runtime: o que chega ao ecrã já vem
 * limpo, sem fundo preto, sem halo e sem borda de recorte.
 */

import type { CSSProperties, ReactElement } from 'react';

export type BrandIconName =
  // Primeira folha
  | 'agenda' | 'treinos' | 'corrida' | 'bicicleta' | 'alimentacao'
  | 'progresso' | 'objetivos' | 'hidratacao' | 'ia' | 'lembretes'
  | 'sono' | 'perfil' | 'saude' | 'relaxamento' | 'estatisticas'
  // Segunda folha
  | 'sequencia' | 'melhor-sequencia' | 'dias-perfeitos' | 'consistencia'
  | 'planos' | 'refeicoes' | 'caminhada' | 'caminhada-rapida'
  | 'relogio' | 'vibracao' | 'frequencia' | 'som' | 'cadeado' | 'caixote'
  | 'imc-baixo' | 'imc-normal' | 'imc-alto'
  // A chama cresce com a sequência
  | 'streak-1' | 'streak-3' | 'streak-7' | 'streak-14'
  | 'streak-30' | 'streak-60' | 'streak-100' | 'streak-365';

/** Os degraus da chama, e a que sequência cada um pertence. */
export const STREAK_STEPS: ReadonlyArray<{ days: number; icon: BrandIconName }> = [
  { days: 1, icon: 'streak-1' },
  { days: 3, icon: 'streak-3' },
  { days: 7, icon: 'streak-7' },
  { days: 14, icon: 'streak-14' },
  { days: 30, icon: 'streak-30' },
  { days: 60, icon: 'streak-60' },
  { days: 100, icon: 'streak-100' },
  { days: 365, icon: 'streak-365' },
];

/** A chama que corresponde a uma sequência — a maior que já foi alcançada. */
export function streakIcon(days: number): BrandIconName {
  let icon: BrandIconName = 'streak-1';
  for (const step of STREAK_STEPS) if (days >= step.days) icon = step.icon;
  return icon;
}

/** Relativo de propósito: a app é servida de um subcaminho no GitHub Pages. */
function assetFor(name: BrandIconName): string {
  return `./icons/${name}.png`;
}

export function BrandIcon({
  name, size = 44, float, label, className,
}: {
  name: BrandIconName;
  size?: number;
  /** Uma deriva lenta, para os poucos sítios onde o ícone é o protagonista. */
  float?: boolean;
  label?: string;
  className?: string;
}): ReactElement {
  const style: CSSProperties = { width: size, height: size };

  return (
    <img
      className={[
        'brand-icon',
        float ? 'is-floating' : '',
        `brand-${name}`,
        className ?? '',
      ].filter(Boolean).join(' ')}
      src={assetFor(name)}
      width={size}
      height={size}
      style={style}
      alt={label ?? ''}
      aria-hidden={label ? undefined : true}
      draggable={false}
      decoding="async"
    />
  );
}

/**
 * O ícone sobre um disco discreto.
 *
 * A arte já não traz fundo nenhum, por isso o disco é opcional — existe onde o
 * ícone abre uma linha sozinho e precisa de presença.
 */
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
