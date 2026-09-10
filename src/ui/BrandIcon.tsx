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

import { BRAND_ICON_VERSION } from './brandIconVersion';

export type BrandIconName =
  // Primeira folha
  | 'agenda' | 'treinos' | 'corrida' | 'bicicleta' | 'alimentacao'
  | 'progresso' | 'objetivos' | 'hidratacao' | 'ia' | 'lembretes'
  | 'sono' | 'perfil' | 'saude' | 'relaxamento' | 'estatisticas'
  // Segunda folha
  | 'sequencia' | 'melhor-sequencia' | 'dias-perfeitos' | 'consistencia'
  | 'planos' | 'refeicoes' | 'caminhada' | 'caminhada-rapida'
  | 'relogio' | 'vibracao' | 'frequencia' | 'som' | 'cadeado' | 'caixote'
  // Desenhado por codigo: nenhuma folha trazia hiking
  | 'hiking'
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

/**
 * Ícones que desaparecem contra um dos temas.
 *
 * A arte é a mesma nos dois temas, mas nem toda ela se vê nos dois: a figura
 * da caminhada é uma silhueta preta, e sobre o fundo preto do tema escuro não
 * sobra nada dela. O contrário também acontece — o calendário branco e o
 * cronómetro sobre o branco do tema claro.
 *
 * As listas saem de uma medição, não de olhómetro. Para cada asset conta-se a
 * fração de píxeis opacos com luminância abaixo de 0,22 e acima de 0,80; quem
 * passar de 40% num dos lados entra na lista desse lado. `tools/_lum.cjs`
 * refaz a conta quando os assets mudarem.
 */
const DARK_ARTWORK: ReadonlySet<BrandIconName> = new Set([
  'caminhada', 'caminhada-rapida', 'som', 'treinos', 'perfil', 'cadeado', 'vibracao',
]);

const LIGHT_ARTWORK: ReadonlySet<BrandIconName> = new Set([
  'agenda', 'corrida', 'planos', 'dias-perfeitos', 'relogio',
]);

/**
 * Icones com uma copia propria para o tema escuro.
 *
 * Os tres da sequencia vem da folha branca, e sobre branco o que sobra do
 * recorte nao se ve. Sobre preto via-se tudo: poeira por baixo da chama e das
 * barras, buracos na estrela, um bloco branco pendurado por baixo do
 * calendario. A copia escura e gerada a parte por `tools/build-brand-icons.cjs`
 * — assim a versao clara, que esta boa, nao corre risco nenhum.
 */
const DARK_VARIANT: ReadonlySet<BrandIconName> = new Set([
  'sequencia', 'dias-perfeitos', 'consistencia',
]);

function contrastOf(name: BrandIconName): 'dark' | 'light' | undefined {
  if (DARK_ARTWORK.has(name)) return 'dark';
  if (LIGHT_ARTWORK.has(name)) return 'light';
  return undefined;
}

/**
 * O endereço de um ícone.
 *
 * Relativo de propósito — a app é servida de um subcaminho no GitHub Pages — e
 * com a versão da arte no fim. O nome do ficheiro nunca muda quando o desenho
 * muda, e sem o `?v=` a cópia antiga ficava no telemóvel a esconder a
 * correção. Com ele, arte nova é um endereço novo, e um endereço novo não
 * pode estar em cache. `tools/stamp-icons.cjs` mantém o valor.
 */
function assetFor(name: BrandIconName, variant: '' | '-escuro' = ''): string {
  return `./icons/${name}${variant}.png?v=${BRAND_ICON_VERSION}`;
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
  const classes = (theme?: 'theme-light-only' | 'theme-dark-only'): string => [
    'brand-icon',
    float ? 'is-floating' : '',
    `brand-${name}`,
    theme ?? '',
    className ?? '',
  ].filter(Boolean).join(' ');

  const common = {
    'data-contrast': contrastOf(name),
    width: size,
    height: size,
    style,
    alt: label ?? '',
    'aria-hidden': label ? undefined : true,
    draggable: false,
    decoding: 'async' as const,
  };

  /*
   * As duas copias ficam no DOM e o CSS mostra uma. Escolher em JavaScript
   * obrigava a seguir o tema do sistema em tempo real; o CSS ja o faz, com as
   * mesmas regras que o resto da aplicacao usa. A escondida tem
   * `display: none`, por isso nao ocupa espaco nem e anunciada.
   */
  if (DARK_VARIANT.has(name)) {
    return (
      <>
        <img {...common} className={classes('theme-light-only')} src={assetFor(name)} />
        <img {...common} className={classes('theme-dark-only')} src={assetFor(name, '-escuro')} />
      </>
    );
  }

  return <img {...common} className={classes()} src={assetFor(name)} />;
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
