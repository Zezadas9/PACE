/**
 * PACE — a impressao digital dos icones.
 *
 * Os ficheiros em `public/icons/` tem nome fixo. Quando a arte muda, o URL
 * nao muda, e nem a cache do browser nem o service worker tem como saber que
 * o conteudo e outro. Foi assim que icones ja corrigidos continuaram semanas
 * por corrigir no telemovel: eu via o novo, quem tinha a app instalada via o
 * velho, e nenhum dos dois tinha maneira de provar quem tinha razao.
 *
 * A solucao e nao depender de caches: se o URL trouxer um resumo do conteudo,
 * arte nova e um URL novo, e um URL novo nunca esta em cache. Este ficheiro
 * calcula esse resumo a partir dos bytes de todos os PNG e escreve-o nos dois
 * sitios que o usam — o componente que gera o `src`, e a lista que o service
 * worker guarda para funcionar offline.
 *
 * Corre depois de gerar os icones:  npm run icons:build
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const ICON_DIR = 'public/icons';
const VERSION_FILE = 'src/ui/brandIconVersion.ts';
const SW_FILE = 'public/sw.js';

/**
 * Um resumo de todos os icones de uma vez, e nao um por icone.
 *
 * Um por icone seria mais preciso — so mudava o URL de quem mudou — mas
 * obrigava a manter um mapa de 41 entradas em duas linguagens. Todos de uma
 * vez custa uma revalidacao a mais quando um icone muda, e isso e barato:
 * sao 300 KB, uma vez, e so quando a arte muda mesmo.
 */
function fingerprint() {
  const files = fs.readdirSync(ICON_DIR).filter((name) => name.endsWith('.png')).sort();
  if (files.length === 0) throw new Error(`sem PNG em ${ICON_DIR}`);

  const hash = crypto.createHash('sha256');
  for (const name of files) {
    hash.update(name);
    hash.update(fs.readFileSync(path.join(ICON_DIR, name)));
  }
  return { version: hash.digest('hex').slice(0, 8), count: files.length };
}

const { version, count } = fingerprint();

fs.writeFileSync(VERSION_FILE, `/**
 * A versao da arte dos icones. GERADO — nao editar a mao.
 *
 * Sai de \`tools/stamp-icons.cjs\`, que resume os bytes de todos os PNG em
 * \`public/icons/\`. Entra no \`src\` de cada imagem como \`?v=\`, para que arte
 * nova seja sempre um URL novo e nenhuma cache a possa esconder.
 */
export const BRAND_ICON_VERSION = '${version}';
`);

const sw = fs.readFileSync(SW_FILE, 'utf8');
const stamped = sw.replace(
  /const ICONS_VERSION = '[^']*';/,
  `const ICONS_VERSION = '${version}';`,
);
if (stamped === sw && !sw.includes(`const ICONS_VERSION = '${version}';`)) {
  throw new Error(`nao encontrei a linha ICONS_VERSION em ${SW_FILE}`);
}
fs.writeFileSync(SW_FILE, stamped);

console.log(`${count} icones, versao ${version} — ${VERSION_FILE} e ${SW_FILE} atualizados`);
