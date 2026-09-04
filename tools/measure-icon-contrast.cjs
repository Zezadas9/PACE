/**
 * Quais os icones que desaparecem contra cada tema.
 *
 * Conta a fracao de pixeis opacos muito escuros e muito claros de cada asset.
 * Quem passar de 40% de um dos lados precisa de contorno nesse tema — e e daqui
 * que saem as listas do BrandIcon.tsx, para nao serem escritas de olhometro.
 *
 * Correr:
 *
 *   npm install --no-save pngjs
 *   node tools/measure-icon-contrast.cjs
 */
const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');

const dir = path.resolve('public/icons');
const rows = [];
for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.png'))) {
  const png = PNG.sync.read(fs.readFileSync(path.join(dir, file)));
  let opaque = 0, dark = 0, light = 0;
  for (let i = 0; i < png.data.length; i += 4) {
    if (png.data[i + 3] < 128) continue;
    const L = (0.2126 * png.data[i] + 0.7152 * png.data[i + 1] + 0.0722 * png.data[i + 2]) / 255;
    opaque += 1;
    if (L < 0.22) dark += 1;
    if (L > 0.86) light += 1;
  }
  rows.push({ name: file.slice(0, -4), dark: dark / opaque, light: light / opaque });
}
const escuros = rows.filter((r) => r.dark >= 0.4).sort((a, b) => b.dark - a.dark);
const claros = rows.filter((r) => r.light >= 0.38).sort((a, b) => b.light - a.light);
console.log('escuros sobre escuro:', escuros.map((r) => `${r.name} ${r.dark.toFixed(2)}`).join(', '));
console.log('claros sobre claro  :', claros.map((r) => `${r.name} ${r.light.toFixed(2)}`).join(', '));
