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

  const T_FILL = dark ? 4 : 4;
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

  /* --- Sombra ou corpo ---------------------------------------------------
   *
   * Na folha branca ha duas coisas com a mesma luminancia, e so a forma as
   * separa.
   *
   * A **sombra** e a mancha suave debaixo do desenho. Vem de preto com pouca
   * opacidade: sobre o tema claro da profundidade, sobre o escuro devia
   * desaparecer. Tratada como arte, sai opaca e cinzenta, e ve-se uma caixa
   * leitosa a volta do icone.
   *
   * O **corpo claro** e o papel do "planos" ou o calendario dos dias perfeitos:
   * quase branco, mas desenho. Tratado como sombra, fica transparente, e o
   * icone aparece rasgado sobre o tema escuro.
   *
   * Nenhum limiar de cor as distingue — as duas vivem entre 5 e 20 de
   * distancia ao branco. O que as distingue e a espessura: uma sombra e uma
   * orla fina a volta do desenho, um corpo e uma mancha larga. Uma erosao de
   * cinco pixeis apaga a primeira e deixa a segunda.
   */
  function shadowMask(bg) {
    const AMBIGUO = 40;
    const ERODE = 5;
    const CORPO = 400;

    /*
     * A cor decide antes da forma.
     *
     * Uma sombra sobre papel branco e cinzenta: os tres canais andam juntos. O
     * miolo claro de uma chama nao e — e amarelo, com o vermelho muito acima
     * do azul. Sem esta condicao, o brilho no meio das chamas era lido como
     * sombra e saia transparente: cada chama ficava com um buraco preto no
     * centro sobre o tema escuro.
     */
    const NEUTRO = 20;
    const candidato = new Uint8Array(W * H);
    for (let y = 0; y < H; y += 1) {
      for (let x = 0; x < W; x += 1) {
        const k = y * W + x;
        if (bg[k]) continue;
        if (distance(x, y) >= AMBIGUO) continue;
        const i = k * 4;
        const croma = Math.max(data[i], data[i + 1], data[i + 2])
          - Math.min(data[i], data[i + 1], data[i + 2]);
        if (croma <= NEUTRO) candidato[k] = 1;
      }
    }

    const sombra = new Uint8Array(W * H);
    const visto = new Uint8Array(W * H);
    for (let y = 0; y < H; y += 1) {
      for (let x = 0; x < W; x += 1) {
        const inicio = y * W + x;
        if (!candidato[inicio] || visto[inicio]) continue;

        const grupo = [];
        const fila = [inicio];
        visto[inicio] = 1;
        while (fila.length) {
          const k = fila.pop();
          grupo.push(k);
          const cx = k % W;
          const cy = (k - cx) / W;
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nx = cx + dx;
            const ny = cy + dy;
            if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
            const nk = ny * W + nx;
            if (candidato[nk] && !visto[nk]) { visto[nk] = 1; fila.push(nk); }
          }
        }

        // Sobra alguma coisa depois de erodir? Entao e corpo, e fica.
        let miolo = 0;
        for (const k of grupo) {
          const cx = k % W;
          const cy = (k - cx) / W;
          let solido = true;
          for (let dy = -ERODE; dy <= ERODE && solido; dy += 1) {
            for (let dx = -ERODE; dx <= ERODE; dx += 1) {
              const nx = cx + dx;
              const ny = cy + dy;
              if (nx < 0 || ny < 0 || nx >= W || ny >= H || !candidato[ny * W + nx]) {
                solido = false;
                break;
              }
            }
          }
          if (solido) { miolo += 1; if (miolo > CORPO) break; }
        }

        if (miolo <= CORPO) for (const k of grupo) sombra[k] = 1;
      }
    }
    return sombra;
  }

  /* --- 2 e 3. De um fundo para a opacidade ------------------------------ */

  /** Componentes e opacidade, para um dado fundo. */
  function alphaFrom(bg) {
    // Na folha preta nao ha sombra a preservar: o que rodeia a arte e brilho
    // ou ringing do JPEG, e esse sai por inteiro.
    const sombra = dark ? null : shadowMask(bg);
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

        /*
         * A sombra sai com a opacidade que tem mesmo.
         *
         * E preto por baixo do branco da folha: observado = a*0 + (1-a)*255,
         * logo a = distancia/255. Uma sombra a 8% de cinzento fica a 8% de
         * alfa — da profundidade sobre o tema claro e desaparece sobre o
         * escuro, que e o que uma sombra deve fazer.
         */
        if (sombra && sombra[k]) {
          alpha[k] = Math.max(0, Math.min(255, Math.round(distance(x, y))));
          continue;
        }

        // Distancia ao fundo, ate tres pixeis: e ai que vive o antialiasing.
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

        /*
         * So se pode baixar a opacidade de um pixel quando ha certeza.
         *
         * A conta parte do principio de que este pixel e uma mistura do fundo
         * com a arte que tem ao lado. Isso e verdade numa aresta, e e falso no
         * meio de um corpo claro que por acaso tem arte escura por perto: o
         * pixel branco do papel do "planos" ficava com o lapis preto como
         * referencia, saia com 5% de cobertura, e o unmix a seguir
         * transformava-o em preto. O papel aparecia rasgado sobre o tema
         * escuro, e intacto sobre o claro — que e onde eu andava a olhar.
         *
         * A regra: se o pixel ja era opaco e esta longe do fundo, fica como
         * esta. Uma cobertura baixa so se aceita onde ela ja era baixa.
         */
        const nova = Math.max(0, Math.min(255, Math.round(cobertura * 255)));
        const anterior = alpha[k];
        if (nova < anterior - 40 && anterior > 200) continue;
        refined[k] = nova;
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

  /*
   * Cada folha tem o seu problema, e cada uma leva o seu preenchimento.
   *
   * Na folha **preta** o que rodeia a arte e brilho e ringing do JPEG: uma orla
   * fina e ruidosa que o preenchimento suave absorve, porque sobe devagar a
   * partir do preto. Sem ele, a lua fica com uma franja serrilhada e o icone da
   * IA com uma mancha escura no meio.
   *
   * Na folha **branca** o que rodeia a arte e sombra a serio, e ha corpos
   * quase brancos que sao desenho. Ai o preenchimento suave entrava pelos
   * corpos dentro e rasgava-os — o papel do "planos" e o calendario dos dias
   * perfeitos ficavam aos bocados sobre o tema escuro. Fica o apertado, e a
   * sombra e tratada por `shadowMask`, que a distingue do corpo pela forma e
   * pela cor.
   */
  const alphaTight = alphaFrom(fillTight());
  const alphaSoft = alphaFrom(dark ? fillSoft() : fillTight());

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

/**
 * Escreve um icone: centrado, do mesmo tamanho visual, com a mesma margem.
 *
 * `file` existe para as variantes: a do tema escuro usa os ajustes do icone de
 * que vem, mas grava-se com outro nome.
 */
function writeIcon(image, box, name, file = name) {
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

  const target = path.join(OUT_DIR, `${file}.png`);
  fs.writeFileSync(target, PNG.sync.write(out, { deflateLevel: 9 }));
  return fs.statSync(target).size;
}

/* --- Variantes para o tema escuro ---------------------------------------- */

/**
 * Os icones da folha branca que precisam de uma copia so para o tema escuro.
 *
 * Sobre branco, o que sobra do recorte e invisivel: a sombra do chao e branca
 * sobre branco, e um buraco na estrela mostra o branco da pagina, que e da cor
 * da estrela. Sobre preto, as duas coisas saltam a vista — uma mancha clara por
 * baixo da chama, poeira entre as barras, uma estrela com buracos pretos e um
 * bloco branco pendurado por baixo do calendario.
 *
 * Mexer no recorte comum para os corrigir punha em risco a versao clara, que
 * esta boa. Por isso estes tres ganham uma copia propria, `<nome>-escuro.png`,
 * e a app escolhe entre as duas conforme o tema.
 *
 * `neutralBody` diz se o desenho tem partes legitimas sem cor. A chama e as
 * barras nao tem — tudo o que e delas e laranja, amarelo ou azul, e o que e
 * branco ou cinzento e sujidade. O calendario tem: o proprio calendario e
 * branco, e ai a cor nao chega para separar o corpo do chao.
 */
const DARK_VARIANTS = {
  sequencia: { neutralBody: false },
  consistencia: { neutralBody: false },
  'dias-perfeitos': { neutralBody: true },
};

/** Acima disto um pixel tem cor; abaixo, e branco, cinzento ou preto. */
const CROMA_CORPO = 25;

function darkVariant(image, box, { neutralBody }) {
  const { W, data, alpha, background } = image;
  const bw = box.w;
  const bh = box.h;
  const n = bw * bh;
  const at = (p) => {
    const x = p % bw;
    return (box.y0 + (p - x) / bw) * W + (box.x0 + x);
  };

  // Opacidade e cor de cada pixel da caixa. A cor e a do desenho, com o branco
  // da folha retirado — sem isso, uma aresta laranja meio transparente parecia
  // rosa-claro e contava como neutra.
  const a = new Uint8Array(n);
  const colorido = new Uint8Array(n);
  for (let p = 0; p < n; p += 1) {
    const k = at(p);
    a[p] = alpha[k];
    const av = alpha[k] / 255;
    // Abaixo de 15% a divisao pelo alfa amplifica ruido em vez de cor.
    if (av < 0.15) continue;
    const i = k * 4;
    const r = unmix(data[i], av, background);
    const g = unmix(data[i + 1], av, background);
    const b = unmix(data[i + 2], av, background);
    const max = Math.max(r, g, b);
    const croma = max - Math.min(r, g, b);
    const luz = 0.299 * r + 0.587 * g + 0.114 * b;
    /*
     * Palido: claro e quase sem cor. E o reflexo rosado por baixo da chama —
     * tem cor que chegue para passar no croma, mas nao e a chama. O miolo
     * amarelo e tao claro como ele, e fica porque e saturado.
     */
    const palido = luz > 170 && max > 0 && croma / max < 0.3;
    if (croma > CROMA_CORPO && !palido) colorido[p] = 1;
  }

  /** O que se alcanca a partir da borda da caixa, andando so por `passa`. */
  const alcance = (passa) => {
    const visto = new Uint8Array(n);
    const pilha = [];
    const entra = (p) => {
      if (visto[p] || !passa(p)) return;
      visto[p] = 1;
      pilha.push(p);
    };
    for (let x = 0; x < bw; x += 1) { entra(x); entra((bh - 1) * bw + x); }
    for (let y = 0; y < bh; y += 1) { entra(y * bw); entra(y * bw + bw - 1); }
    while (pilha.length) {
      const p = pilha.pop();
      const x = p % bw;
      if (x > 0) entra(p - 1);
      if (x < bw - 1) entra(p + 1);
      if (p >= bw) entra(p - bw);
      if (p < n - bw) entra(p + bw);
    }
    return visto;
  };

  const corpo = new Uint8Array(n);

  if (!neutralBody) {
    // O corpo e o que tem cor, e o que a cor fecha por dentro — o brilho
    // quase branco no meio de uma chama e dela, a poeira ao lado nao e.
    const fora = alcance((p) => !colorido[p]);
    for (let p = 0; p < n; p += 1) if (a[p] >= 128 && !fora[p]) corpo[p] = 1;
  } else {
    // O chao fica abaixo da ultima linha com cor. Tres pixeis coloridos
    // chegam para contar: o fundo do emblema e uma curva, nao uma recta.
    let ultima = bh - 1;
    for (let y = bh - 1; y >= 0; y -= 1) {
      let conta = 0;
      for (let x = 0; x < bw; x += 1) {
        if (colorido[y * bw + x] && a[y * bw + x] >= 128) conta += 1;
      }
      if (conta >= 3) { ultima = y; break; }
    }
    const chao = ultima + 2;

    // Depois, as pecas solidas acima do chao. As pequenas sao migalhas.
    const solido = (p) => a[p] >= 96 && Math.floor(p / bw) <= chao;
    const peca = new Int32Array(n).fill(-1);
    const areas = [];
    for (let inicio = 0; inicio < n; inicio += 1) {
      if (peca[inicio] >= 0 || !solido(inicio)) continue;
      const id = areas.length;
      let area = 0;
      const pilha = [inicio];
      peca[inicio] = id;
      while (pilha.length) {
        const p = pilha.pop();
        area += 1;
        const x = p % bw;
        for (const q of [x > 0 ? p - 1 : -1, x < bw - 1 ? p + 1 : -1, p - bw, p + bw]) {
          if (q < 0 || q >= n || peca[q] >= 0 || !solido(q)) continue;
          peca[q] = id;
          pilha.push(q);
        }
      }
      areas.push(area);
    }
    const maior = Math.max(0, ...areas);
    for (let p = 0; p < n; p += 1) {
      if (peca[p] >= 0 && areas[peca[p]] >= maior * 0.05) corpo[p] = 1;
    }
  }

  /*
   * Para achar os buracos, o corpo e fechado um pixel primeiro.
   *
   * O JPEG deixa falhas de um pixel nos aros finos; com uma falha, o miolo do
   * aro comunica com o exterior e nunca e visto como buraco. O fecho so serve
   * para esta procura: os pixeis que acrescenta nao ficam opacos, senao cada
   * canto concavo do desenho ganhava um ponto branco.
   */
  const fechado = new Uint8Array(n);
  for (let p = 0; p < n; p += 1) {
    if (corpo[p]) { fechado[p] = 1; continue; }
    const x = p % bw;
    const y = (p - x) / bw;
    let lados = 0;
    if (x > 0 && corpo[p - 1]) lados += 1;
    if (x < bw - 1 && corpo[p + 1]) lados += 1;
    if (y > 0 && corpo[p - bw]) lados += 1;
    if (y < bh - 1 && corpo[p + bw]) lados += 1;
    if (lados >= 2) fechado[p] = 1;
  }

  // Buracos: o que o corpo fecha e dele. Ficam opacos e com a cor da folha —
  // a da estrela, a do aro — em vez de mostrarem o fundo do tema.
  const aberto = alcance((p) => !fechado[p]);
  const tapado = new Uint8Array(n);
  for (let p = 0; p < n; p += 1) {
    if (!corpo[p] && !aberto[p]) { corpo[p] = 1; tapado[p] = 1; }
  }

  // A linha mais baixa do corpo em cada coluna. Abaixo dela, no calendario, o
  // que ha e a sombra do chao — e sobre preto essa sombra e uma prateleira
  // clara colada ao fundo do desenho.
  const fundo = new Int32Array(bw).fill(-1);
  for (let x = 0; x < bw; x += 1) {
    for (let y = bh - 1; y >= 0; y -= 1) {
      if (corpo[y * bw + x]) { fundo[x] = y; break; }
    }
  }

  // A orla: um pixel meio transparente so fica se estiver encostado ao corpo.
  // E o antisserrilhado da aresta; mais longe do que isso e poeira.
  const out = new Uint8Array(alpha);
  for (let p = 0; p < n; p += 1) {
    const k = at(p);
    if (tapado[p]) { out[k] = 255; continue; }
    if (corpo[p]) continue;
    const x = p % bw;
    const y = (p - x) / bw;
    let encostado = false;
    for (let dy = -1; dy <= 1 && !encostado; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= bw || ny >= bh) continue;
        if (corpo[ny * bw + nx]) { encostado = true; break; }
      }
    }
    if (!encostado) { out[k] = 0; continue; }
    // Encostado, mas so fica se for aresta do desenho e nao a sombra dele: na
    // chama e nas barras a aresta tem cor; no calendario, a sombra e a que
    // fica por baixo.
    if (!neutralBody && !colorido[p]) { out[k] = 0; continue; }
    if (neutralBody && y > fundo[x]) out[k] = 0;
  }

  return { ...image, alpha: out };
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
      const variante = DARK_VARIANTS[name];
      if (variante) {
        bytes += writeIcon(darkVariant(image, box, variante), box, name, `${name}-escuro`);
        written += 1;
      }
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
