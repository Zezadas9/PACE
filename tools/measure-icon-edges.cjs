/**
 * A orla de cada icone comparada com a arte que lhe fica ao lado.
 *
 * Correr depois de mexer no build-brand-icons.cjs:
 *
 *   node tools/measure-icon-edges.cjs
 *
 * Valores perto de zero e o que se quer. Positivo grande quer dizer branco da
 * folha preso na orla; negativo grande quer dizer preto.
 *
 * Um pixel de orla deve ter a cor do desenho, so com menos opacidade. Se for
 * sistematicamente mais claro do que o vizinho opaco, traz branco da folha
 * dentro dele — e esse branco aparece como halo sobre o tema escuro.
 */
const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');

const dir = path.resolve('public/icons');
const rows = [];

for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.png'))) {
  const png = PNG.sync.read(fs.readFileSync(path.join(dir, file)));
  const { width: W, height: H, data } = png;
  const at = (x, y) => (y * W + x) * 4;
  const lumOf = (i) => (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) / 255;

  let n = 0, diff = 0;
  for (let y = 2; y < H - 2; y += 1) {
    for (let x = 2; x < W - 2; x += 1) {
      const i = at(x, y);
      const a = data[i + 3] / 255;
      if (a < 0.25 || a > 0.75) continue;

      // O vizinho opaco mais proximo, num raio de dois pixeis.
      let best = -1;
      for (let dy = -2; dy <= 2 && best < 0; dy += 1) {
        for (let dx = -2; dx <= 2; dx += 1) {
          const j = at(x + dx, y + dy);
          if (data[j + 3] > 240) { best = j; break; }
        }
      }
      if (best < 0) continue;
      n += 1;
      diff += lumOf(i) - lumOf(best);
    }
  }
  if (n > 40) rows.push([file.slice(0, -4), n, diff / n]);
}

rows.sort((a, b) => b[2] - a[2]);
console.log('icone              px    orla mais clara que a arte ao lado');
for (const [name, n, d] of rows.slice(0, 12)) {
  console.log(name.padEnd(18), String(n).padStart(5), '  ', d >= 0 ? '+' : '', d.toFixed(3));
}
console.log('...');
for (const [name, n, d] of rows.slice(-4)) {
  console.log(name.padEnd(18), String(n).padStart(5), '  ', d >= 0 ? '+' : '', d.toFixed(3));
}
