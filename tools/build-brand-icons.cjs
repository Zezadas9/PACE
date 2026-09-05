/**
 * Recorta as folhas de icones ilustrados em assets individuais.
 *
 * Sao duas folhas com fundos opostos — a primeira sobre preto, a segunda sobre
 * branco — e o mesmo tratamento para as duas:
 *
 * - o fundo sai por preenchimento desde as margens, so onde a cor e a do fundo,
 *   para o disco escuro do "perfil" e os corpos brancos dos icones da segunda
 *   folha sobreviverem;
 * - as manchas minusculas a volta das arestas (ringing do JPEG) sao apagadas,
 *   senao aparecem como sujidade sobre o tema oposto;
 * - a franja de antialiasing e as sombras suaves sao reconstruidas com
 *   opacidade parcial, para nao ficar borda nem halo;
 * - cada icone e medido ao pixel, centrado numa tela quadrada e escalado para
 *   o mesmo tamanho visual, com a mesma area de seguranca a volta.
 *
 * Correr (jpeg-js e pngjs sao ferramenta, nao dependencias da app):
 *
 *   npm install --no-save jpeg-js pngjs
 *   node tools/build-brand-icons.cjs
 */
const fs = require('fs');
const path = require('path');
const jpeg = require('jpeg-js');
const { PNG } = require('pngjs');

const CANVAS = 192;      // tela de cada asset
const SAFE = 16;         // area de seguranca em cada lado
const MIN_AREA = 60;     // abaixo disto e ruido de compressao, nao arte
const OUT_DIR = 'public/icons';

/**
 * Icones com brilho a volta do desenho, que stripHalo tira.
 *
 * Sao os casos em que o desenho e escuro e o fundo original o envolveu com um
 * halo: a lua tem um brilho azul quase preto na folha preta; as figuras a
 * preto e o cronometro tem sombra suave na folha branca. Em qualquer um deles
 * a arte e nitidamente distinta do fundo, por isso a regra do stripHalo agarra
 * bem — ao contrario dos icones com grandes zonas planas (o disco do perfil,
 * o corpo branco do calendario), que ficam de fora desta lista de proposito.
 */
const HALO = {
  // A lua traz um brilho forte a volta: e preciso subir a fasquia do que conta
  // como desenho para o cortar todo. O corpo dela comeca acima de 150, por
  // isso 70 corta o brilho sem lhe tocar.
  sono: 120,

  // Folha preta, arte clara: o que fica a volta e ringing do JPEG.
  agenda: 34,
  alimentacao: 34,
  progresso: 34,
  objetivos: 34,
  hidratacao: 34,
  ia: 34,
  lembretes: 34,
  saude: 34,
  relaxamento: 34,
  estatisticas: 34,

  // Folha branca: sombras suaves por baixo dos desenhos.
  caminhada: 34,
  'caminhada-rapida': 34,
  relogio: 34,
  som: 34,
  cadeado: 34,
  caixote: 34,
  vibracao: 34,
  frequencia: 34,
  sequencia: 34,
  'melhor-sequencia': 34,
  consistencia: 34,
  refeicoes: 34,
  'imc-baixo': 34,
  'imc-normal': 34,
  'imc-alto': 34,
  'streak-1': 34,
  'streak-3': 34,
  'streak-7': 34,
  'streak-14': 34,
  'streak-30': 34,
  'streak-60': 34,
  'streak-100': 34,
  'streak-365': 34,
};

/**
 * Acertos de cor, icone a icone.
 *
 * A bicicleta tem pneus pretos que desaparecem no tema escuro: `lift` levanta
 * so os pixeis escuros, e o quadro azul fica como esta.
 */
const TWEAKS = {
  bicicleta: { lift: 0.42, threshold: 110 },
};

/**
 * As duas folhas.
 *
 * `skip` marca os icones que existem nas duas e ja estao bons na primeira: nao
 * se troca o que funciona so porque ha uma versao nova.
 */
const SHEETS = [
  {
    file: 'tools/brand-icons-source.jpg',
    background: 'black',
    bands: [[65, 302], [403, 613], [712, 897]],
    names: [
      ['agenda', 'treinos', 'corrida', 'bicicleta', 'alimentacao'],
      ['progresso', 'objetivos', 'hidratacao', 'ia', 'lembretes'],
      ['sono', 'perfil', 'saude', 'relaxamento', 'estatisticas'],
    ],
    skip: [],
  },
  {
    file: 'tools/brand-icons-source-2.jpg',
    background: 'white',
    bands: [[97, 237], [326, 468], [552, 673], [781, 898], [1095, 1191], [1329, 1430]],
    names: [
      ['progresso-2', 'objetivos-2', 'ia-2', 'lembretes-2', 'relaxamento-2', 'estatisticas-2'],
      ['sequencia', 'melhor-sequencia', 'dias-perfeitos', 'consistencia', 'planos', 'refeicoes'],
      ['caminhada-rapida', 'caminhada', 'relogio', 'vibracao', 'frequencia', 'saude-2'],
      ['hidratacao-2', 'som', 'agenda-alt', 'halter-alt', 'cadeado', 'caixote'],
      ['imc-baixo', 'imc-normal', 'imc-alto'],
      ['streak-1', 'streak-3', 'streak-7', 'streak-14', 'streak-30', 'streak-60',
        'streak-100', 'streak-365'],
    ],
    // A primeira folha ja tem estes, e sao os que estao em uso.
    skip: [
      'progresso-2', 'objetivos-2', 'ia-2', 'lembretes-2', 'relaxamento-2', 'estatisticas-2',
      'saude-2', 'hidratacao-2', 'agenda-alt', 'halter-alt',
    ],
  },
];

/** Celulas onde o preenchimento suave foi desfeito por comer o desenho. */
const reverted = [];

/** Recorta uma folha inteira e devolve os icones ja com opacidade. */
function extract(sheet) {
  const src = jpeg.decode(fs.readFileSync(sheet.file), { useTArray: true });
  const { width: W, height: H, data } = src;
  const dark = sheet.background === 'black';

  const lumAt = (x, y) => {
    const i = (y * W + x) * 4;
    return 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  };
  /** Quanto um pixel se afasta da cor do fundo. */
  const distance = (x, y) => (dark ? lumAt(x, y) : 255 - lumAt(x, y));

  const T_FILL = dark ? 4 : 10;
  const T_EDGE = dark ? 40 : 46;
  // Ate onde o fundo pode subir a caminho do desenho. Fica abaixo de T_EDGE de
  // proposito: assim o preenchimento nunca chega a tocar no que e claramente
  // desenho, com ou sem as regras a seguir.
  const T_SOFT = dark ? 34 : 42;
  // Folga para o ruido do JPEG, que faz uma rampa lisa parecer serrilhada.
  const SLACK = 4;
  // Quanto o fundo pode escurecer de um pixel para o vizinho. Uma sombra sobe
  // devagar, ao longo de dezenas de pixeis; uma aresta sobe de uma vez.
  const STEP = 3;

  /* --- 1. Fundo --------------------------------------------------------- */

  /*
   * A sombra e o papel tem a mesma luminancia. So a forma os distingue.
   *
   * Nesta folha os desenhos assentam sobre uma sombra suave, e o corpo de
   * alguns deles — a folha do "planos", o calendario — e quase tao branco como
   * o fundo. Medir so a cor nao os separa: os dois estao a 10 do branco.
   *
   * O que os separa e o percurso. De fora para dentro, a sombra **sobe** ate ao
   * objeto; ao entrar no corpo do objeto, o valor **desce** outra vez. Por isso
   * o preenchimento so anda enquanto nao descer: sobe a sombra toda e para na
   * aresta onde o objeto comeca, sem lhe entrar.
   *
   * Era isto que faltava. Antes, um pixel de sombra longe de qualquer pixel de
   * fundo ficava com opacidade total — e o que se via a volta dos icones era
   * uma caixa leitosa, que sobre o tema escuro parecia um mau recorte.
   */
  /*
   * A comparacao e feita sobre a media 3x3, nao sobre o pixel cru.
   *
   * O JPEG deixa ringing a volta das arestas com contraste: uma orla de pixeis
   * que saltam para cima e para baixo. Ao pixel, esses saltos parecem degraus e
   * travam o preenchimento — foi o que deixou a lua com uma franja preta
   * serrilhada. Na media, o ruido desaparece e a rampa da sombra continua a
   * ser uma rampa.
   */
  const smooth = new Float32Array(W * H);
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      let sum = 0;
      let n = 0;
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          sum += distance(nx, ny);
          n += 1;
        }
      }
      smooth[y * W + x] = sum / n;
    }
  }

  /** O preenchimento apertado: so o que e quase exatamente a cor do fundo. */
  function fillTight() {
    const mask = new Uint8Array(W * H);
    const stack = [];
    for (let x = 0; x < W; x += 1) stack.push(x, 0, x, H - 1);
    for (let y = 0; y < H; y += 1) stack.push(0, y, W - 1, y);
    while (stack.length) {
      const y = stack.pop();
      const x = stack.pop();
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const k = y * W + x;
      if (mask[k] || distance(x, y) > T_FILL) continue;
      mask[k] = 1;
      stack.push(x + 1, y, x - 1, y, x, y + 1, x, y - 1);
    }
    return mask;
  }

  /** O preenchimento que sobe a sombra, mas nao entra pelos objetos dentro. */
  function fillSoft() {
    const mask = new Uint8Array(W * H);
    const queue = [];
    const push = (x, y) => {
      if (x < 0 || y < 0 || x >= W || y >= H) return;
      const k = y * W + x;
      if (mask[k] || distance(x, y) > T_FILL) return;
      mask[k] = 1;
      queue.push(x, y);
    };
    for (let x = 0; x < W; x += 1) { push(x, 0); push(x, H - 1); }
    for (let y = 0; y < H; y += 1) { push(0, y); push(W - 1, y); }

    while (queue.length) {
      const y = queue.pop();
      const x = queue.pop();
      const here = smooth[y * W + x];
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const nk = ny * W + nx;
        if (mask[nk]) continue;
        const there = smooth[nk];
        if (there > T_SOFT || distance(nx, ny) > T_EDGE) continue;
        // Subir devagar e continuar a sombra. Descer, ou subir de repente, e
        // entrar num objeto.
        if (there < here - SLACK) continue;
        if (there > here + STEP) continue;
        mask[nk] = 1;
        queue.push(nx, ny);
      }
    }
    return mask;
  }

  /* --- 2 e 3. De um fundo para a opacidade ------------------------------ */

  /** Componentes e opacidade, para um dado fundo. */
  function alphaFrom(bg) {
    const label = new Int32Array(W * H).fill(-1);
    const areas = [];
    for (let y = 0; y < H; y += 1) {
      for (let x = 0; x < W; x += 1) {
        const k = y * W + x;
        if (bg[k] || label[k] !== -1) continue;
        const id = areas.length;
        let area = 0;
        const queue = [x, y];
        label[k] = id;
        while (queue.length) {
          const cy = queue.pop();
          const cx = queue.pop();
          area += 1;
          for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]) {
            const nx = cx + dx;
            const ny = cy + dy;
            if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
            const nk = ny * W + nx;
            if (bg[nk] || label[nk] !== -1) continue;
            label[nk] = id;
            queue.push(nx, ny);
          }
        }
        areas.push(area);
      }
    }

    /* --- 3. Opacidade ----------------------------------------------------- */
    const inArt = (y) => sheet.bands.some(([a, b]) => y >= a && y <= b);
    const alpha = new Uint8Array(W * H);

    for (let y = 0; y < H; y += 1) {
      for (let x = 0; x < W; x += 1) {
        const k = y * W + x;
        if (!inArt(y)) continue;

        /*
         * O fundo da folha branca nao e so fundo: e fundo mais a sombra suave
         * que assenta os desenhos. Apaga-la deixa os icones chapados, como
         * autocolantes recortados a tesoura — e foi o que aconteceu quando este
         * codigo comecou por lhe dar alfa zero.
         *
         * O erro original era o oposto: a sombra saia com alfa 255 e via-se uma
         * caixa leitosa a volta da arte. A resposta certa nao e nenhum dos
         * extremos — e dar-lhe a opacidade que ela tem mesmo. Uma sombra a 8%
         * de cinzento fica a 8% de alfa: da profundidade sobre o tema claro e
         * desaparece sobre o escuro, que e o que uma sombra deve fazer.
         *
         * Na folha preta nao ha sombra nenhuma a preservar — o que rodeia a
         * arte e brilho ou ringing do JPEG, e esse sai por inteiro.
         */
        if (bg[k]) {
          if (dark) continue;
          const shade = distance(x, y);
          if (shade <= T_FILL) continue;
          alpha[k] = Math.max(0, Math.min(255, Math.round(((shade - T_FILL) / T_EDGE) * 255)));
          continue;
        }

        const id = label[k];
        if (id === -1 || areas[id] < MIN_AREA) continue;

        // Distancia ao fundo, ate tres pixeis: e ai que vive o antialiasing e,
        // na folha branca, a sombra suave que sairia como halo.
        let near = 0;
        const reach = dark ? 2 : 3;
        for (let r = 1; r <= reach && !near; r += 1) {
          for (let dy = -r; dy <= r && !near; dy += 1) {
            for (let dx = -r; dx <= r; dx += 1) {
              if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
              const nx = x + dx;
              const ny = y + dy;
              if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
              if (bg[ny * W + nx]) { near = r; break; }
            }
          }
        }

        if (near === 0) { alpha[k] = 255; continue; }
        // A opacidade sobe com a distancia a cor do fundo: a aresta do desenho
        // fica nitida e o que era quase-fundo desaparece.
        const d = distance(x, y);
        const soft = Math.max(0, Math.min(255, Math.round(((d - T_FILL) / T_EDGE) * 255)));
        alpha[k] = near === 1 ? soft : Math.max(soft, d > T_EDGE ? 255 : 0);
      }
    }

    /* --- Cobertura verdadeira da orla ------------------------------------
     *
     * Ate aqui a opacidade de um pixel de orla vinha da distancia a cor do
     * fundo, a dividir por T_EDGE. Isso nao e cobertura: e contraste. Um pixel
     * meio tapado por arte escura sobre a folha branca fica com contraste que
     * chegue para passar dos 255 — sai opaco, mas com a cor cinzenta da
     * mistura. E esse cinzento que se ve como halo claro sobre o tema escuro,
     * e o preto correspondente que se ve nos icones da folha preta sobre o
     * tema claro.
     *
     * A conta certa precisa de saber a cor da arte. Cada pixel de orla vai
     * busca-la ao pixel opaco mais proximo e resolve a composicao ao contrario:
     *
     *   observado = a * arte + (1 - a) * fundo   =>   a = (observado - fundo)
     *                                                     / (arte - fundo)
     *
     * Usa-se o canal onde a arte mais se afasta do fundo, que e onde a divisao
     * e mais estavel. Onde a arte e quase da cor do fundo, nao ha nada a
     * inferir e fica o que estava.
     */
    const refined = new Uint8Array(alpha);
    const CORE = 250;
    const MIN_CONTRAST = 45;

    for (let y = 1; y < H - 1; y += 1) {
      for (let x = 1; x < W - 1; x += 1) {
        const k = y * W + x;
        if (bg[k] || alpha[k] === 0) continue;

        // So a orla: um pixel com fundo perto. O JPEG espalha a aresta por
        // mais do que dois pixeis, por isso a banda tem de a acompanhar.
        let naBorda = false;
        for (let dy = -3; dy <= 3 && !naBorda; dy += 1) {
          for (let dx = -3; dx <= 3; dx += 1) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
            if (bg[ny * W + nx]) { naBorda = true; break; }
          }
        }
        if (!naBorda) continue;

        // A cor da arte: o pixel opaco mais proximo, em aneis crescentes.
        let arte = -1;
        for (let r = 1; r <= 5 && arte < 0; r += 1) {
          for (let dy = -r; dy <= r && arte < 0; dy += 1) {
            for (let dx = -r; dx <= r; dx += 1) {
              if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
              const nx = x + dx;
              const ny = y + dy;
              if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
              const nk = ny * W + nx;
              if (bg[nk] || alpha[nk] < CORE) continue;
              arte = nk * 4;
              break;
            }
          }
        }
        if (arte < 0) continue;

        const fundo = dark ? 0 : 255;
        let canal = 0;
        let contraste = 0;
        for (let c = 0; c < 3; c += 1) {
          const d = Math.abs(data[arte + c] - fundo);
          if (d > contraste) { contraste = d; canal = c; }
        }
        if (contraste < MIN_CONTRAST) continue;

        const observado = data[k * 4 + canal];
        const cobertura = (observado - fundo) / (data[arte + canal] - fundo);
        refined[k] = Math.max(0, Math.min(255, Math.round(cobertura * 255)));
      }
    }
    alpha.set(refined);


    // Pixeis fracos e sozinhos: pontos soltos, nao arte.
    for (let y = 1; y < H - 1; y += 1) {
      for (let x = 1; x < W - 1; x += 1) {
        const k = y * W + x;
        if (!alpha[k] || alpha[k] > 90) continue;
        if (alpha[k - 1] + alpha[k + 1] + alpha[k - W] + alpha[k + W] < 60) alpha[k] = 0;
      }
    }

    return alpha;
  }

  /* --- 4. Qual dos dois, celula a celula --------------------------------- */

  const alphaTight = alphaFrom(fillTight());
  const alphaSoft = alphaFrom(fillSoft());

  /*
   * O preenchimento suave resolve a sombra e o ringing, mas ha um caso em que
   * se engana: um objeto escuro sobre a folha escura. O disco do "perfil" tem
   * a mesma luminancia que o ruido a volta da lua — nenhum limiar os separa.
   *
   * O que os separa e a forma. O que o preenchimento come a mais e, nos casos
   * bons, uma orla fina; no caso mau, um corpo inteiro. Uma erosao de seis
   * pixeis apaga a orla e deixa o corpo — e e por isso que a decisao se toma
   * assim, e nao por uma lista de nomes escrita a mao.
   */
  const alpha = new Uint8Array(alphaSoft);
  const ERODE = 6;
  const BODY = 2500;

  for (const [top, bottom] of sheet.bands) {
    const count = (sheet.names[sheet.bands.findIndex(([a]) => a === top)] ?? []).length || 1;
    const cellW = W / count;
    for (let cell = 0; cell < count; cell += 1) {
      const x0 = Math.floor(cell * cellW);
      const x1 = Math.min(W - 1, Math.floor((cell + 1) * cellW) - 1);

      const removed = new Uint8Array((x1 - x0 + 1) * (bottom - top + 1));
      const cw = x1 - x0 + 1;
      for (let y = top; y <= bottom; y += 1) {
        for (let x = x0; x <= x1; x += 1) {
          const k = y * W + x;
          if (alphaTight[k] > 128 && alphaSoft[k] <= 128) removed[(y - top) * cw + (x - x0)] = 1;
        }
      }

      let body = 0;
      for (let y = ERODE; y <= bottom - top - ERODE; y += 1) {
        for (let x = ERODE; x <= cw - 1 - ERODE; x += 1) {
          if (!removed[y * cw + x]) continue;
          let solid = true;
          for (let dy = -ERODE; dy <= ERODE && solid; dy += 1) {
            for (let dx = -ERODE; dx <= ERODE; dx += 1) {
              if (!removed[(y + dy) * cw + (x + dx)]) { solid = false; break; }
            }
          }
          if (solid) body += 1;
        }
      }

      if (body <= BODY) continue;
      // Comeu um corpo: nesta celula fica o preenchimento apertado, e o veu
      // que ele deixa e o preco de nao destruir o desenho.
      reverted.push(`${sheet.file}:${top}:${cell}`);
      for (let y = top; y <= bottom; y += 1) {
        for (let x = x0; x <= x1; x += 1) {
          const k = y * W + x;
          alpha[k] = alphaTight[k];
        }
      }
    }
  }

  return { W, H, data, alpha, background: dark ? 0 : 255 };
}

/** As caixas de cada icone dentro de uma banda, medidas ao pixel. */
function boxesIn(sheet, image, band, expected) {
  const { W, alpha } = image;
  const [top, bottom] = band;

  const cols = new Int32Array(W);
  for (let y = top; y <= bottom; y += 1) {
    for (let x = 0; x < W; x += 1) if (alpha[y * W + x] > 20) cols[x] += 1;
  }

  const runs = [];
  let start = -1;
  for (let x = 0; x <= W; x += 1) {
    const on = x < W && cols[x] > 0;
    if (on && start === -1) start = x;
    if (!on && start !== -1) { runs.push([start, x - 1]); start = -1; }
  }

  // Junta sempre pelo intervalo mais pequeno ate sobrar o numero esperado: e
  // assim que as riscas da corrida, as estrelas do sono, o circuito da IA e as
  // faiscas das chamas colam ao seu icone.
  const merged = runs.map((run) => [...run]);
  while (merged.length > expected) {
    let best = 0;
    let bestGap = Infinity;
    for (let i = 1; i < merged.length; i += 1) {
      const gap = merged[i][0] - merged[i - 1][1];
      if (gap < bestGap) { bestGap = gap; best = i; }
    }
    merged[best - 1][1] = merged[best][1];
    merged.splice(best, 1);
  }
  if (merged.length !== expected) {
    throw new Error(`${sheet.file} banda ${top}: ${merged.length} grupos, esperava ${expected}`);
  }

  return merged.map(([x0, x1]) => {
    let y0 = bottom;
    let y1 = top;
    for (let y = top; y <= bottom; y += 1) {
      for (let x = x0; x <= x1; x += 1) {
        if (alpha[y * W + x] > 20) { if (y < y0) y0 = y; if (y > y1) y1 = y; break; }
      }
    }
    return { x0, x1, y0, y1, w: x1 - x0 + 1, h: y1 - y0 + 1 };
  });
}

/**
 * A cor verdadeira de um pixel da orla.
 *
 * Um pixel meio transparente da folha original nao tem a cor do desenho: tem a
 * cor do desenho **misturada com o fundo** onde foi composto. Guardar essa
 * mistura deixa um rebordo escuro nos icones da folha preta e um rebordo claro
 * nos da folha branca — invisiveis sobre o fundo de origem, obvios sobre o
 * oposto. Era isto que fazia os icones aparecerem "com bocados".
 *
 * A conta e a da composicao, ao contrario: observado = a*cor + (1-a)*fundo,
 * logo cor = (observado - (1-a)*fundo) / a.
 */
function unmix(value, alpha, background) {
  if (alpha >= 0.98) return value;
  const recovered = (value - (1 - alpha) * background) / alpha;
  return Math.max(0, Math.min(255, recovered));
}

/** Media de area em cor ja limpa do fundo: reduz sem franjas. */
function sample(image, box, sx0, sy0, sx1, sy1) {
  const { W, data, alpha, background } = image;
  let r = 0, g = 0, b = 0, a = 0, n = 0;
  const x0 = Math.max(box.x0, Math.floor(sx0));
  const x1 = Math.min(box.x1, Math.max(x0, Math.ceil(sx1) - 1));
  const y0 = Math.max(box.y0, Math.floor(sy0));
  const y1 = Math.min(box.y1, Math.max(y0, Math.ceil(sy1) - 1));
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      const k = y * W + x;
      const av = alpha[k] / 255;
      const i = k * 4;
      n += 1;
      // Abaixo de 15% de cobertura a divisao amplifica ruido em vez de cor:
      // esses pixeis pesam quase nada e ficam de fora.
      if (av < 0.15) continue;
      r += unmix(data[i], av, background) * av;
      g += unmix(data[i + 1], av, background) * av;
      b += unmix(data[i + 2], av, background) * av;
      a += av;
    }
  }
  if (n === 0 || a === 0) return [0, 0, 0, 0];
  return [r / a, g / a, b / a, (a / n) * 255];
}

/**
 * Tira o halo de um icone, sem lhe tirar as formas escuras.
 *
 * Alguns desenhos trazem um brilho a volta — a lua tem dezoito pixeis de azul
 * quase preto — que o preenchimento apertado nao apanha. Ficava opaco: um
 * rebordo invisivel sobre o fundo de origem e obvio sobre o oposto. Era isto
 * que fazia os icones aparecerem com bocados.
 *
 * A regra que os separa: dentro da caixa do icone, olha-se so para os pixeis
 * que sao **claramente arte** (longe da cor do fundo). Tudo o que nao e arte e
 * consegue chegar a margem da caixa sem atravessar arte e halo — sai. O que
 * nao consegue esta fechado por arte, e fica: e assim que o disco escuro do
 * "perfil" e o corpo branco do calendario sobrevivem inteiros.
 */
function stripHalo(image, box, threshold) {
  const { W, data, alpha } = image;
  const dark = image.background === 0;
  // Folgado de proposito: a caixa e justa a arte, e o preenchimento precisa de
  // uma margem por onde dar a volta ao desenho todo.
  const pad = 10;
  const x0 = Math.max(0, box.x0 - pad);
  const x1 = Math.min(W - 1, box.x1 + pad);
  const y0 = Math.max(0, box.y0 - pad);
  const y1 = Math.min(image.H - 1, box.y1 + pad);
  const w = x1 - x0 + 1;
  const h = y1 - y0 + 1;

  // "Claramente arte": longe o suficiente da cor do fundo para nao ser halo.
  const T_ART = threshold;
  const isArt = (x, y) => {
    const i = (y * W + x) * 4;
    const l = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    return (dark ? l : 255 - l) >= T_ART;
  };

  const reachable = new Uint8Array(w * h);
  const stack = [];
  for (let x = x0; x <= x1; x += 1) { stack.push(x, y0, x, y1); }
  for (let y = y0; y <= y1; y += 1) { stack.push(x0, y, x1, y); }

  while (stack.length) {
    const y = stack.pop();
    const x = stack.pop();
    if (x < x0 || y < y0 || x > x1 || y > y1) continue;
    const k = (y - y0) * w + (x - x0);
    if (reachable[k] || isArt(x, y)) continue;
    reachable[k] = 1;
    stack.push(x + 1, y, x - 1, y, x, y + 1, x, y - 1);
  }

  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      if (reachable[(y - y0) * w + (x - x0)]) alpha[y * W + x] = 0;
    }
  }
}

/** Area e numero de pedacos de um icone, para saber se a limpeza o estragou. */
function measure(image, box) {
  const { W, alpha } = image;
  let area = 0;
  const seen = new Set();
  let pieces = 0;
  for (let y = box.y0; y <= box.y1; y += 1) {
    for (let x = box.x0; x <= box.x1; x += 1) {
      const k = y * W + x;
      if (alpha[k] <= 20) continue;
      area += 1;
      if (seen.has(k)) continue;
      // Um pedaco novo: conta-o e marca tudo o que lhe esta ligado.
      let size = 0;
      const stack = [k];
      seen.add(k);
      while (stack.length) {
        const current = stack.pop();
        size += 1;
        const cx = current % W;
        const cy = (current - cx) / W;
        for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]) {
          const nx = cx + dx;
          const ny = cy + dy;
          if (nx < box.x0 || ny < box.y0 || nx > box.x1 || ny > box.y1) continue;
          const nk = ny * W + nx;
          if (seen.has(nk) || alpha[nk] <= 20) continue;
          seen.add(nk);
          stack.push(nk);
        }
      }
      if (size >= 60) pieces += 1;
    }
  }
  return { area, pieces };
}

/**
 * Limpa o halo — mas so se a limpeza nao estragar o desenho.
 *
 * A regra do halo funciona bem quando a arte se distingue do fundo, e mal
 * quando o desenho tem partes proprias tao escuras (ou tao claras) como o
 * fundo: nesses casos parte-o em bocados. Em vez de manter uma lista afinada
 * a mao — que envelhece em silencio — mede-se o antes e o depois: se o icone
 * perdeu area a serio ou se partiu, a limpeza e desfeita.
 */
function stripHaloSafely(image, box, threshold) {
  const { W, alpha } = image;
  const before = measure(image, box);

  const backup = new Map();
  for (let y = box.y0; y <= box.y1; y += 1) {
    for (let x = box.x0; x <= box.x1; x += 1) {
      const k = y * W + x;
      if (alpha[k] > 0) backup.set(k, alpha[k]);
    }
  }

  stripHalo(image, box, threshold);
  const after = measure(image, box);

  // O sinal fiavel de estrago e o desenho partir-se: perder area e o que se
  // quer, quando o que se perde e sombra. O limite de area fica largo, so para
  // apanhar um corte catastrofico.
  const danificado = after.pieces > before.pieces || after.area < before.area * 0.55;
  if (danificado) {
    for (const [k, value] of backup) alpha[k] = value;
    return false;
  }
  return true;
}

/** Escreve um icone: centrado, do mesmo tamanho visual, com a mesma margem. */
function writeIcon(image, box, name) {
  const tweak = TWEAKS[name];
  const out = new PNG({ width: CANVAS, height: CANVAS });
  out.data.fill(0);

  const fit = CANVAS - SAFE * 2;
  const scale = Math.min(fit / box.w, fit / box.h);
  const dw = Math.round(box.w * scale);
  const dh = Math.round(box.h * scale);
  const ox = Math.round((CANVAS - dw) / 2);
  const oy = Math.round((CANVAS - dh) / 2);

  for (let y = 0; y < dh; y += 1) {
    for (let x = 0; x < dw; x += 1) {
      let [r, g, b, a] = sample(
        image, box,
        box.x0 + (x / dw) * box.w, box.y0 + (y / dh) * box.h,
        box.x0 + ((x + 1) / dw) * box.w, box.y0 + ((y + 1) / dh) * box.h,
      );
      if (tweak?.lift) {
        const l = 0.299 * r + 0.587 * g + 0.114 * b;
        if (l < tweak.threshold) {
          const k = tweak.lift * (1 - l / tweak.threshold);
          r += (235 - r) * k;
          g += (235 - g) * k;
          b += (235 - b) * k;
        }
      }
      const o = ((oy + y) * CANVAS + (ox + x)) * 4;
      out.data[o] = Math.round(r);
      out.data[o + 1] = Math.round(g);
      out.data[o + 2] = Math.round(b);
      out.data[o + 3] = Math.round(a);
    }
  }

  const file = path.join(OUT_DIR, `${name}.png`);
  fs.writeFileSync(file, PNG.sync.write(out, { deflateLevel: 9 }));
  return fs.statSync(file).size;
}

/* --- Correr ------------------------------------------------------------- */

fs.mkdirSync(OUT_DIR, { recursive: true });
let written = 0;
let bytes = 0;
/** Icones onde a limpeza do halo foi desfeita por estragar o desenho. */
const recusados = [];

for (const sheet of SHEETS) {
  const image = extract(sheet);
  sheet.bands.forEach((band, index) => {
    const names = sheet.names[index] ?? [];
    const boxes = boxesIn(sheet, image, band, names.length);
    boxes.forEach((box, position) => {
      const name = names[position];
      if (!name || sheet.skip.includes(name)) return;
      const halo = HALO[name];
      if (halo != null && !stripHaloSafely(image, box, halo)) {
        recusados.push(name);
      }
      bytes += writeIcon(image, box, name);
      written += 1;
    });
  });
  console.log(`${sheet.file}: ok`);
}

console.log(`${written} icones em ${OUT_DIR}, ${(bytes / 1024).toFixed(0)} KB`);
if (reverted.length > 0) {
  console.log(`preenchimento suave desfeito em: ${reverted.join(", ")}`);
}
if (recusados.length > 0) {
  console.log(`limpeza de halo desfeita (estragava o desenho): ${recusados.join(', ')}`);
}
