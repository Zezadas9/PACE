/**
 * PACE — a impressao digital dos icones tem de acompanhar a arte.
 *
 * Se ficar para tras, a app pede o URL antigo, o telemovel serve a copia que
 * tem em cache, e o icone corrigido nunca chega — sem nada falhar e sem
 * ninguem dar por isso. Ja aconteceu duas vezes; falhar aqui, alto e no
 * `build`, e o oposto disso.
 *
 * De proposito sem dependencias: corre em qualquer maquina e no CI, mesmo sem
 * as bibliotecas que geram os icones.
 *
 *   node tools/check-icon-stamp.cjs
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DIR = 'public/icons';
const names = fs.readdirSync(DIR).filter((name) => name.endsWith('.png')).sort();

const hash = crypto.createHash('sha256');
for (const name of names) {
  hash.update(name);
  hash.update(fs.readFileSync(path.join(DIR, name)));
}
const esperado = hash.digest('hex').slice(0, 8);

const gravado = fs
  .readFileSync('src/ui/brandIconVersion.ts', 'utf8')
  .match(/BRAND_ICON_VERSION = '([^']*)'/)?.[1];

const noWorker = fs
  .readFileSync('public/sw.js', 'utf8')
  .match(/ICONS_VERSION = '([^']*)'/)?.[1];

if (gravado !== esperado || noWorker !== esperado) {
  console.error(`A versao da arte esta desatualizada.`);
  console.error(`  ${names.length} icones dao ${esperado}`);
  console.error(`  brandIconVersion.ts diz ${gravado}`);
  console.error(`  sw.js diz ${noWorker}`);
  console.error('Corre `npm run icons:stamp`.');
  process.exit(1);
}

console.log(`${names.length} icones, versao ${esperado} — em dia.`);
