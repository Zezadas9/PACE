/**
 * Desenha o icone de hiking.
 *
 * Nenhuma das duas folhas originais trazia um, e nao ha arte para recortar.
 * Este e pintado por codigo, a tentar falar a mesma lingua dos outros: formas
 * cheias e sem bicos, cor saturada, uma face iluminada e outra na sombra, neve
 * com aresta curva, e a mesma area de seguranca dos restantes assets.
 *
 * Tres coisas fazem a diferenca entre isto e um triangulo chapado:
 *
 * - os cantos sao redondos, obtidos por distancia a um poligono encolhido, que
 *   e o que evita os bicos que nenhum outro icone do conjunto tem;
 * - a cor de cada encosta vem de um gradiente por direcao de luz, e nao de dois
 *   tons colados;
 * - cada pixel e amostrado 4x4, e sao os 16 que dao a aresta limpa.
 *
 * Correr:
 *
 *   npm install --no-save pngjs
 *   node tools/build-hiking-icon.cjs
 */
const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');

const SIZE = 192;
const SS = 4;
const OUT = path.join('public', 'icons', 'hiking.png');

/* --- Formas --------------------------------------------------------------------- */

const BACK = { points: [[14, 158], [76, 30], [138, 158]], radius: 10 };
const FRONT = { points: [[82, 158], [136, 68], [182, 158]], radius: 9 };
const SUN = { x: 152, y: 40, r: 17 };

/** A linha por onde acaba a neve: uma onda, nao um corte a direito. */
const snowLine = (x, base, amplitude) => base + Math.sin(x / 7) * amplitude;

function centroid(points) {
  const sx = points.reduce((sum, p) => sum + p[0], 0);
  const sy = points.reduce((sum, p) => sum + p[1], 0);
  return [sx / points.length, sy / points.length];
}

/** O poligono encolhido na direcao do centro — a alma da forma redonda. */
function shrink(points, by) {
  const [cx, cy] = centroid(points);
  return points.map(([x, y]) => {
    const dx = cx - x;
    const dy = cy - y;
    const len = Math.hypot(dx, dy) || 1;
    return [x + (dx / len) * by, y + (dy / len) * by];
  });
}

function distanceToSegment(px, py, [ax, ay], [bx, by]) {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSq = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSq));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function inPolygon(px, py, points) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
    const [xi, yi] = points[i];
    const [xj, yj] = points[j];
    if ((yi > py) !== (yj > py)
      && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Dentro da forma redonda: dentro do poligono encolhido, ou a menos de r dele. */
function inRounded(px, py, shape) {
  const inner = shape.inner ?? (shape.inner = shrink(shape.points, shape.radius));
  if (inPolygon(px, py, inner)) return true;
  for (let i = 0, j = inner.length - 1; i < inner.length; j = i, i += 1) {
    if (distanceToSegment(px, py, inner[j], inner[i]) <= shape.radius) return true;
  }
  return false;
}

/* --- Cor -------------------------------------------------------------------------- */

const mix = (a, b, t) => a.map((value, i) => value + (b[i] - value) * t);
const clamp = (v) => Math.max(0, Math.min(1, v));

const BACK_LIGHT = [110, 214, 198];
const BACK_MID = [58, 158, 152];
const BACK_SHADE = [30, 100, 104];
const FRONT_LIGHT = [142, 220, 178];
const FRONT_MID = [78, 172, 142];
const FRONT_SHADE = [42, 118, 104];
const SNOW_LIGHT = [252, 254, 255];
const SNOW_SHADE = [198, 226, 242];
const SUN_CORE = [255, 232, 150];
const SUN_EDGE = [252, 186, 60];

/**
 * A cor de uma encosta.
 *
 * A luz vem de cima e da esquerda, como em todo o conjunto. Duas variaveis
 * decidem o tom: de que lado do pico esta o ponto, e a que altura — a base
 * escurece sempre, que e o que impede uma montanha de flutuar.
 */
function slope(px, py, apexX, top, bottom, light, mid, shade) {
  const side = clamp((px - apexX) / 46 + 0.5); // 0 na esquerda, 1 na direita
  const depth = clamp((py - top) / (bottom - top));
  const face = side < 0.5
    ? mix(light, mid, side * 2)
    : mix(mid, shade, (side - 0.5) * 2);
  return mix(face, face.map((v) => v * 0.78), depth * 0.5);
}

function sample(px, py) {
  // O sol vai atras de tudo: e ceu, nao objeto.
  const sunHit = (px - SUN.x) ** 2 + (py - SUN.y) ** 2 <= SUN.r * SUN.r;

  if (inRounded(px, py, FRONT)) {
    if (py < snowLine(px, 104, 3.5) && py > 60) {
      return [...mix(SNOW_LIGHT, SNOW_SHADE, clamp((px - 118) / 40)), 255];
    }
    return [...slope(px, py, 136, 68, 158, FRONT_LIGHT, FRONT_MID, FRONT_SHADE), 255];
  }

  if (inRounded(px, py, BACK)) {
    if (py < snowLine(px, 70, 4) && py > 22) {
      return [...mix(SNOW_LIGHT, SNOW_SHADE, clamp((px - 58) / 40)), 255];
    }
    return [...slope(px, py, 76, 30, 158, BACK_LIGHT, BACK_MID, BACK_SHADE), 255];
  }

  if (sunHit) {
    const d = Math.hypot(px - SUN.x + 4, py - SUN.y + 4) / SUN.r;
    return [...mix(SUN_CORE, SUN_EDGE, clamp(d)), 255];
  }

  return null;
}

/* --- Rasterizacao ------------------------------------------------------------------ */

const png = new PNG({ width: SIZE, height: SIZE });

for (let y = 0; y < SIZE; y += 1) {
  for (let x = 0; x < SIZE; x += 1) {
    let r = 0, g = 0, b = 0, a = 0;
    for (let sy = 0; sy < SS; sy += 1) {
      for (let sx = 0; sx < SS; sx += 1) {
        const hit = sample(x + (sx + 0.5) / SS, y + (sy + 0.5) / SS);
        if (!hit) continue;
        const alpha = hit[3] / 255;
        r += hit[0] * alpha; g += hit[1] * alpha; b += hit[2] * alpha; a += alpha;
      }
    }
    const index = (y * SIZE + x) * 4;
    if (a === 0) {
      png.data.fill(0, index, index + 4);
      continue;
    }
    // A media e feita pre-multiplicada e desfeita no fim, senao a aresta leva
    // consigo a cor do vizinho transparente — o mesmo halo que estas ferramentas
    // passaram meses a tirar aos outros icones.
    png.data[index] = Math.round(r / a);
    png.data[index + 1] = Math.round(g / a);
    png.data[index + 2] = Math.round(b / a);
    png.data[index + 3] = Math.round((a / (SS * SS)) * 255);
  }
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, PNG.sync.write(png));
console.log('escrito', OUT);
