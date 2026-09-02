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

  // Limiares: o do preenchimento e apertado para nao entrar pelo desenho
  // dentro; o da franja e largo para apanhar sombras suaves.
  const T_FILL = dark ? 4 : 10;
  const T_EDGE = dark ? 40 : 46;

  /* --- 1. Fundo --------------------------------------------------------- */
  const bg = new Uint8Array(W * H);
  {
    const stack = [];
    for (let x = 0; x < W; x += 1) stack.push(x, 0, x, H - 1);
    for (let y = 0; y < H; y += 1) stack.push(0, y, W - 1, y);
    while (stack.length) {
      const y = stack.pop();
      const x = stack.pop();
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const k = y * W + x;
      if (bg[k] || distance(x, y) > T_FILL) continue;
      bg[k] = 1;
      stack.push(x + 1, y, x - 1, y, x, y + 1, x, y - 1);
    }
  }

  /* --- 2. Componentes: arte ou ruido ------------------------------------ */
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
      if (bg[k] || !inArt(y)) continue;
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

  // Pixeis fracos e sozinhos: pontos soltos, nao arte.
  for (let y = 1; y < H - 1; y += 1) {
    for (let x = 1; x < W - 1; x += 1) {
      const k = y * W + x;
      if (!alpha[k] || alpha[k] > 90) continue;
      if (alpha[k - 1] + alpha[k + 1] + alpha[k - W] + alpha[k + W] < 60) alpha[k] = 0;
    }
  }

  return { W, H, data, alpha };
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

/** Media de area em cor pre-multiplicada: reduz sem franjas. */
function sample(image, box, sx0, sy0, sx1, sy1) {
  const { W, data, alpha } = image;
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
      r += data[i] * av;
      g += data[i + 1] * av;
      b += data[i + 2] * av;
      a += av;
      n += 1;
    }
  }
  if (n === 0 || a === 0) return [0, 0, 0, 0];
  return [r / a, g / a, b / a, (a / n) * 255];
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

for (const sheet of SHEETS) {
  const image = extract(sheet);
  sheet.bands.forEach((band, index) => {
    const names = sheet.names[index] ?? [];
    const boxes = boxesIn(sheet, image, band, names.length);
    boxes.forEach((box, position) => {
      const name = names[position];
      if (!name || sheet.skip.includes(name)) return;
      bytes += writeIcon(image, box, name);
      written += 1;
    });
  });
  console.log(`${sheet.file}: ok`);
}

console.log(`${written} icones em ${OUT_DIR}, ${(bytes / 1024).toFixed(0)} KB`);
