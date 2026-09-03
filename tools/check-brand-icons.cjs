/**
 * Verifica os icones recortados.
 *
 * Corre depois de `build-brand-icons.cjs` e responde a tres perguntas que so se
 * veem quando ja e tarde:
 *
 * - **ficou cortado?** arte encostada a margem da tela quer dizer recorte a
 *   comer o desenho;
 * - **ficou partido?** muitos pedacos pequenos e sinal de que a limpeza do halo
 *   levou parte da arte com ela;
 * - **ficou com franja?** pixeis quase transparentes espalhados aparecem como
 *   sujidade sobre o tema oposto.
 *
 *   node tools/check-brand-icons.cjs
 */
const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');

const dir = 'public/icons';
const files = fs.readdirSync(dir).filter((file) => file.endsWith('.png')).sort();
let avisos = 0;

for (const file of files) {
  const png = PNG.sync.read(fs.readFileSync(path.join(dir, file)));
  const { width: W, height: H, data } = png;
  const alphaAt = (x, y) => data[(y * W + x) * 4 + 3];

  const seen = new Uint8Array(W * H);
  const comps = [];
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      const k = y * W + x;
      if (seen[k] || alphaAt(x, y) <= 10) continue;
      let area = 0;
      const queue = [x, y];
      seen[k] = 1;
      while (queue.length) {
        const cy = queue.pop();
        const cx = queue.pop();
        area += 1;
        for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]) {
          const nx = cx + dx;
          const ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          const nk = ny * W + nx;
          if (seen[nk] || alphaAt(nx, ny) <= 10) continue;
          seen[nk] = 1;
          queue.push(nx, ny);
        }
      }
      comps.push(area);
    }
  }
  comps.sort((a, b) => b - a);

  let margem = 0;
  for (let x = 0; x < W; x += 1) {
    if (alphaAt(x, 0) > 10) margem += 1;
    if (alphaAt(x, H - 1) > 10) margem += 1;
  }
  for (let y = 0; y < H; y += 1) {
    if (alphaAt(0, y) > 10) margem += 1;
    if (alphaAt(W - 1, y) > 10) margem += 1;
  }

  let franja = 0;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] > 10 && data[i] < 90) franja += 1;
  }

  const migalhas = comps.slice(1).filter((area) => area >= 4 && area < 60).length;
  const problemas = [];
  if (margem > 0) problemas.push(`cortado (${margem} px na margem)`);
  if (migalhas > 3) problemas.push(`${migalhas} migalhas soltas`);
  if (franja > 1500) problemas.push(`franja de ${franja} px`);

  if (problemas.length > 0) {
    avisos += 1;
    console.log(`${file.replace('.png', '').padEnd(18)} ${problemas.join(' · ')}`);
  }
}

console.log(avisos === 0
  ? `${files.length} icones verificados, nenhum problema.`
  : `${files.length} icones verificados, ${avisos} com avisos.`);
