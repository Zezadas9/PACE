/**
 * PACE — preparar os pagamentos no Cloudflare. Corre-se uma vez:
 *
 *   npm run worker:pagamentos-setup
 *
 * Pede o que só tu podes saber (as chaves do Lemon Squeezy), gera o que tem de
 * ser secreto, e cria o armazenamento das licenças. Os segredos vão direitos
 * para os secrets do Worker pelo stdin do wrangler — nenhum fica em ficheiro.
 *
 * Só o que é público é escrito no wrangler.toml: o número da loja e o número do
 * produto. Enquanto esses dois estiverem vazios, a aplicação não cobra nada a
 * ninguém — é o estado em que o repositório vive.
 *
 * Antes de correres isto, no painel do Lemon Squeezy:
 *   1. Cria a loja e um produto de subscrição a 5 €/mês.
 *   2. Nesse produto, liga as chaves de licença ("License keys"), com um limite
 *      de activações à tua escolha (3 chega para telemóvel, tablet e portátil).
 *   3. Cria os descontos que quiseres divulgar (por exemplo 50% durante 3 meses).
 *   4. Settings » API: cria uma chave de API.
 *   5. Settings » Webhooks: cria um webhook para
 *      https://<o-teu-worker>.workers.dev/api/pagamento/webhook
 *      com os eventos de subscription_*, e guarda o "signing secret".
 */

import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';
import { createInterface } from 'node:readline/promises';

const CONFIG = new URL('../wrangler.toml', import.meta.url);
const toml = () => readFileSync(CONFIG, 'utf8');
const rl = createInterface({ input: process.stdin, output: process.stdout });

function wrangler(args, input) {
  const result = spawnSync('npx', ['wrangler', ...args], {
    input,
    stdio: [input === undefined ? 'inherit' : 'pipe', 'inherit', 'inherit'],
    shell: process.platform === 'win32',
  });
  if (result.status !== 0) {
    console.error(`\nO wrangler falhou em: wrangler ${args.join(' ')}`);
    process.exit(result.status ?? 1);
  }
}

function capture(args) {
  const result = spawnSync('npx', ['wrangler', ...args], {
    encoding: 'utf8',
    stdio: ['inherit', 'pipe', 'pipe'],
    shell: process.platform === 'win32',
  });
  return `${result.stdout ?? ''}${result.stderr ?? ''}`;
}

/** Escreve (ou substitui) uma variável pública no bloco [vars]. */
function setVar(name, value) {
  const linha = `${name} = "${value}"`;
  const texto = toml();
  writeFileSync(CONFIG, new RegExp(`^${name}\\s*=.*$`, 'm').test(texto)
    ? texto.replace(new RegExp(`^${name}\\s*=.*$`, 'm'), linha)
    : texto.replace(/^\[vars\]\s*$/m, (bloco) => `${bloco}\n${linha}`));
}

/*
 * O que ficou por preencher.
 *
 * Uma resposta em branco salta o passo em vez de abortar tudo. O painel do
 * Lemon Squeezy nem sempre esta disponivel — tem limites de pedidos, e uma
 * loja nova demora a ficar pronta — e ficar preso num prompt por causa disso
 * era um mau desenho. Volta-se a correr, e so falta o que falta.
 */
const pendentes = [];

/** Um segredo pedido e guardado, sem passar por ficheiro nenhum. */
async function secret(name, pergunta) {
  if (capture(['secret', 'list']).includes(`"${name}"`)) {
    const resposta = (await rl.question(`${name} já existe. Substituir? (s/N) `)).trim().toLowerCase();
    if (resposta !== 's') return;
  }
  const valor = (await rl.question(`${pergunta}\n(Enter para deixar para depois)\n> `)).trim();
  if (!valor) {
    pendentes.push(name);
    return;
  }
  wrangler(['secret', 'put', name], valor);
}

/* --- O armazenamento das licenças ------------------------------------------ */

const NAMESPACE = 'pace-licencas';

function hasBinding() {
  return /binding\s*=\s*"LICENCAS"/.test(toml());
}

function existingId() {
  const output = capture(['kv', 'namespace', 'list']);
  const pares = [
    ...output.matchAll(/"id"\s*:\s*"([0-9a-f]{32})"[^}]*?"title"\s*:\s*"([^"]+)"/g),
    ...output.matchAll(/"title"\s*:\s*"([^"]+)"[^}]*?"id"\s*:\s*"([0-9a-f]{32})"/g),
  ];
  for (const [, primeiro, segundo] of pares) {
    const id = /^[0-9a-f]{32}$/.test(primeiro) ? primeiro : segundo;
    const titulo = id === primeiro ? segundo : primeiro;
    if (titulo.includes(NAMESPACE)) return id;
  }
  return null;
}

function store() {
  if (hasBinding()) {
    console.log('Armazenamento das licenças: já ligado.');
    return;
  }
  let id = existingId();
  if (!id) {
    wrangler(['kv', 'namespace', 'create', NAMESPACE, '--binding', 'LICENCAS', '--update-config']);
    if (hasBinding()) {
      console.log('Armazenamento das licenças: criado e ligado.');
      return;
    }
    id = existingId();
  }
  if (!id) {
    console.error('Criei o armazenamento mas nao consegui descobrir o id dele.');
    console.error('Corre `npx wrangler kv namespace list` e acrescenta ao wrangler.toml:');
    console.error('');
    console.error('[[kv_namespaces]]');
    console.error('binding = "LICENCAS"');
    console.error('id = "<o id>"');
    process.exit(1);
  }
  writeFileSync(CONFIG, `${toml().trimEnd()}

# Onde ficam as licencas. Escrito por tools/setup-pagamentos.mjs.
[[kv_namespaces]]
binding = "LICENCAS"
id = "${id}"
`);
  console.log('Armazenamento das licenças: ligado.');
}

/* --- A volta toda ----------------------------------------------------------- */

// Assina os cartoes de licenca. Gerado aqui, nunca escrito em lado nenhum: se
// se perder, os cartoes que andam por ai deixam de valer e a aplicacao pede
// outro — o que acontece sozinho na abertura seguinte.
if (!capture(['secret', 'list']).includes('"LICENCE_SECRET"')) {
  const bytes = webcrypto.getRandomValues(new Uint8Array(32));
  wrangler(['secret', 'put', 'LICENCE_SECRET'], Buffer.from(bytes).toString('base64url'));
  console.log('Chave de assinatura das licenças: criada.');
} else {
  console.log('Chave de assinatura das licenças: já existe.');
}

await secret('LS_API_KEY', 'Cola a chave de API do Lemon Squeezy (Settings » API):');
await secret('LS_WEBHOOK_SECRET', 'Cola o "signing secret" do webhook (Settings » Webhooks):');
await secret('ACCESS_CODE', 'Escolhe o código de acesso permanente (o que dá 100% de desconto para sempre):');

const loja = (await rl.question(
  'Número da loja (store id), em Settings » Stores:\n(Enter para deixar para depois)\n> ',
)).trim();
const produto = (await rl.question(
  'Número do produto (variant id) da subscrição de 5 €/mês:\n(Enter para deixar para depois)\n> ',
)).trim();

if (loja && produto) {
  if (!/^[0-9]+$/.test(loja) || !/^[0-9]+$/.test(produto)) {
    console.error('A loja e o produto são números. Volta a correr quando os tiveres à mão.');
    process.exit(1);
  }
  setVar('LS_STORE_ID', loja);
  setVar('LS_VARIANT_ID', produto);
  console.log('Loja e produto: escritos no wrangler.toml.');
} else {
  pendentes.push('a loja e o produto');
}

store();
rl.close();
if (pendentes.length > 0) {
  console.log(`\nFicou por preencher: ${pendentes.join(', ')}.`);
  console.log('Volta a correr `npm run worker:pagamentos-setup` quando tiveres isso.');
  console.log('O que já está feito fica como está, e até lá não se cobra nada a ninguém.');
} else {
  console.log('\nFalta publicar o Worker:\n\n  npm run worker:deploy\n');
}
