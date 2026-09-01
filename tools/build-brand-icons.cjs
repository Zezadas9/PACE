/**
 * Recorta a folha de icones ilustrados.
 *
 * A folha original e um JPEG: quinze desenhos sobre preto, cada um com a sua
 * legenda por baixo. Este script tira o fundo, mede cada icone ao pixel e
 * escreve uma grelha regular em PNG com transparencia — sem legendas e sem
 * nada cortado.
 *
 * Correr (jpeg-js e pngjs nao sao dependencias da app, sao ferramenta):
 *
 *   npm install --no-save jpeg-js pngjs
 *   node tools/build-brand-icons.cjs
 *
 * Sai: public/brand-icons.png. As medidas das bandas de arte estao abaixo e so
 * mudam se a folha original mudar.
 */
const fs = require('fs');
const path = require('path');
const jpeg = require('jpeg-js');
const { PNG } = require('pngjs');

const T_BG = 4;          // fundo: preto puro, com o ruido do JPEG
const MIN_AREA = 60;     // abaixo disto e ringing, nao arte
const CELL = 144;
const PAD = 10;
const COLS = 5;
const ART_BANDS = [[65, 302], [403, 613], [712, 897]];

const src = jpeg.decode(fs.readFileSync('tools/brand-icons-source.jpg'), { useTArray: true });
const { width: W, height: H, data } = src;
const lumAt = (x, y) => { const i = (y*W+x)*4; return 0.299*data[i] + 0.587*data[i+1] + 0.114*data[i+2]; };

/* Fundo: preenchimento desde as margens. So chega onde e quase preto, por isso
   o disco escuro do "perfil" e o halter cinzento ficam de pe. */
const bg = new Uint8Array(W * H);
{
  const stack = [];
  for (let x = 0; x < W; x += 1) stack.push(x, 0, x, H - 1);
  for (let y = 0; y < H; y += 1) stack.push(0, y, W - 1, y);
  while (stack.length) {
    const y = stack.pop(); const x = stack.pop();
    if (x < 0 || y < 0 || x >= W || y >= H) continue;
    const k = y * W + x;
    if (bg[k] || lumAt(x, y) > T_BG) continue;
    bg[k] = 1;
    stack.push(x + 1, y, x - 1, y, x, y + 1, x, y - 1);
  }
}

/* Componentes: as manchas minusculas sao ruido de compressao a volta das
   arestas e nao devem aparecer como sujidade sobre fundo claro. */
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
      const cy = queue.pop(); const cx = queue.pop();
      area += 1;
      for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]) {
        const nx = cx + dx, ny = cy + dy;
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

const inArt = (y) => ART_BANDS.some(([a, b]) => y >= a && y <= b);
const alpha = new Uint8Array(W * H);
for (let y = 0; y < H; y += 1) {
  for (let x = 0; x < W; x += 1) {
    const k = y * W + x;
    if (bg[k] || !inArt(y)) continue;
    const id = label[k];
    if (id === -1 || areas[id] < MIN_AREA) continue;

    // Distancia ao fundo, ate dois pixeis: e ai que vive o antialiasing contra
    // o preto e o ringing do JPEG.
    let near = 0;
    for (let r = 1; r <= 2 && !near; r += 1) {
      for (let dy = -r; dy <= r && !near; dy += 1) {
        for (let dx = -r; dx <= r; dx += 1) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          if (bg[ny * W + nx]) { near = r; break; }
        }
      }
    }
    const l = lumAt(x, y);
    if (near === 0) alpha[k] = 255;
    else if (near === 1) {
      // A opacidade sobe com a luminancia: a aresta clara fica nitida e a
      // franja escura da compressao praticamente desaparece.
      alpha[k] = Math.max(0, Math.min(255, Math.round(((l - 12) / 40) * 255)));
    } else {
      alpha[k] = l < 26 ? Math.max(0, Math.min(255, Math.round(((l - 10) / 40) * 255))) : 255;
    }
  }
}
// Pixeis fracos e sozinhos: pontos soltos, nao arte.
for (let y = 1; y < H - 1; y += 1) {
  for (let x = 1; x < W - 1; x += 1) {
    const k = y * W + x;
    if (!alpha[k] || alpha[k] > 90) continue;
    const around = alpha[k-1] + alpha[k+1] + alpha[k-W] + alpha[k+W];
    if (around < 60) alpha[k] = 0;
  }
}

/* Caixas: cada icone medido no pixel, para nada ficar cortado. */
const boxes = [];
for (const [top, bottom] of ART_BANDS) {
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
  // Cinco icones por banda: junta sempre pelo intervalo mais pequeno ate
  // sobrarem cinco grupos. Assim as riscas da corrida, as estrelas do sono e o
  // circuito da IA colam-se ao seu icone sem depender de um numero magico.
  const merged = runs.map((run) => [...run]);
  while (merged.length > 5) {
    let best = 0;
    let bestGap = Infinity;
    for (let i = 1; i < merged.length; i += 1) {
      const gap = merged[i][0] - merged[i - 1][1];
      if (gap < bestGap) { bestGap = gap; best = i; }
    }
    merged[best - 1][1] = merged[best][1];
    merged.splice(best, 1);
  }
  if (merged.length !== 5) throw new Error(`banda ${top}: ${merged.length} grupos`);

  for (const [x0, x1] of merged) {
    let y0 = bottom, y1 = top;
    for (let y = top; y <= bottom; y += 1) {
      for (let x = x0; x <= x1; x += 1) {
        if (alpha[y * W + x] > 20) { if (y < y0) y0 = y; if (y > y1) y1 = y; break; }
      }
    }
    boxes.push({ x0, x1, y0, y1, w: x1 - x0 + 1, h: y1 - y0 + 1 });
  }
}

/* Grelha regular: mesma celula para todos, arte centrada com a mesma margem. */
const FIT = CELL - PAD * 2;
const out = new PNG({ width: CELL * COLS, height: CELL * (boxes.length / COLS) });
out.data.fill(0);

function sample(box, sx0, sy0, sx1, sy1) {
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
      r += data[i] * av; g += data[i+1] * av; b += data[i+2] * av; a += av;
      n += 1;
    }
  }
  if (n === 0 || a === 0) return [0, 0, 0, 0];
  return [r / a, g / a, b / a, (a / n) * 255];
}

boxes.forEach((box, index) => {
  const col = index % COLS;
  const row = Math.floor(index / COLS);
  const scale = Math.min(FIT / box.w, FIT / box.h);
  const dw = Math.round(box.w * scale);
  const dh = Math.round(box.h * scale);
  const ox = col * CELL + Math.round((CELL - dw) / 2);
  const oy = row * CELL + Math.round((CELL - dh) / 2);

  for (let y = 0; y < dh; y += 1) {
    for (let x = 0; x < dw; x += 1) {
      const [r, g, b, a] = sample(
        box,
        box.x0 + (x / dw) * box.w, box.y0 + (y / dh) * box.h,
        box.x0 + ((x + 1) / dw) * box.w, box.y0 + ((y + 1) / dh) * box.h,
      );
      const o = ((oy + y) * out.width + (ox + x)) * 4;
      out.data[o] = Math.round(r);
      out.data[o+1] = Math.round(g);
      out.data[o+2] = Math.round(b);
      out.data[o+3] = Math.round(a);
    }
  }
});

fs.writeFileSync('public/brand-icons.png', PNG.sync.write(out, { deflateLevel: 9 }));
console.log(`grelha ${out.width}x${out.height} · celula ${CELL} · ${(fs.statSync('public/brand-icons.png').size / 1024).toFixed(0)} KB`);
boxes.forEach((b, i) => console.log(i, `${b.w}x${b.h} em ${b.x0},${b.y0}`));
