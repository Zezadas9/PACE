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
 * - **ficou com franja?** pixeis quase transparentes **longe da arte** aparecem
 *   como sujidade sobre o tema oposto. Os que estao encostados a arte sao a
 *   sombra suave que lhe da profundidade, e esses ficam.
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

  /*
   * A sombra e a sujidade tem o mesmo alfa. O que as separa e a distancia a
   * arte: uma sombra assenta debaixo do desenho, a sujidade flutua longe dele.
   */
  const PERTO = 14;
  const forte = new Uint8Array(W * H);
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) if (alphaAt(x, y) > 128) forte[y * W + x] = 1;
  }
  const perto = (x, y) => {
    for (let dy = -PERTO; dy <= PERTO; dy += 1) {
      const ny = y + dy;
      if (ny < 0 || ny >= H) continue;
      for (let dx = -PERTO; dx <= PERTO; dx += 1) {
        const nx = x + dx;
        if (nx < 0 || nx >= W) continue;
        if (forte[ny * W + nx]) return true;
      }
    }
    return false;
  };

  const seen = new Uint8Array(W * H);
  const comps = [];
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      const k = y * W + x;
      if (seen[k] || alphaAt(x, y) <= 10) continue;
      let area = 0;
      let tocaForte = false;
      const queue = [x, y];
      seen[k] = 1;
      while (queue.length) {
        const cy = queue.pop();
        const cx = queue.pop();
        area += 1;
        if (alphaAt(cx, cy) > 128) tocaForte = true;
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
      comps.push({ area, forte: tocaForte, x, y });
    }
  }
  comps.sort((a, b) => b.area - a.area);

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
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      const a = alphaAt(x, y);
      if (a <= 10 || a >= 90) continue;
      if (!perto(x, y)) franja += 1;
    }
  }

  // Uma migalha e um pedaco pequeno longe de tudo. Um pedaco pequeno ao pe do
  // desenho e a ponta de uma sombra, e nao um resto de recorte.
  const migalhas = comps
    .slice(1)
    .filter((comp) => comp.area >= 4 && comp.area < 60 && !comp.forte && !perto(comp.x, comp.y))
    .length;
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
