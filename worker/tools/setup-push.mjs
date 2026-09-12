/**
 * PACE — preparar o lembrete da sequência no Cloudflare. Corre-se uma vez:
 *
 *   npm run worker:push-setup
 *
 * Faz duas coisas, e só as que ainda não estiverem feitas:
 *
 * 1. Gera o par de chaves VAPID. A pública vai para o wrangler.toml — é
 *    pública, o browser recebe-a de qualquer maneira. A privada vai direta para
 *    os secrets do Worker pelo stdin do wrangler: nunca é escrita num ficheiro,
 *    nunca aparece no ecrã, nunca entra num commit.
 * 2. Cria o KV onde ficam as subscrições, e liga-o ao Worker.
 *
 * Gerar chaves novas invalida todas as subscrições que já existam, por isso,
 * se a chave pública já estiver no wrangler.toml, esse passo é saltado.
 */

import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';

const CONFIG = new URL('../wrangler.toml', import.meta.url);
const toml = () => readFileSync(CONFIG, 'utf8');
const base64url = (bytes) => Buffer.from(bytes).toString('base64url');

/** Corre o wrangler e pára tudo se ele falhar. `input` vai pelo stdin. */
function wrangler(args, input) {
  const result = spawnSync('npx', ['wrangler', ...args], {
    input,
    stdio: [input === undefined ? 'inherit' : 'pipe', 'inherit', 'inherit'],
    // No Windows, o npx é um .cmd e só arranca através da shell.
    shell: process.platform === 'win32',
  });
  if (result.status !== 0) {
    console.error(`\nO wrangler falhou em: wrangler ${args.join(' ')}`);
    console.error('Se for a primeira vez, entra primeiro com: npm run worker:login');
    process.exit(result.status ?? 1);
  }
}

async function keys() {
  if (/^VAPID_PUBLIC_KEY\s*=/m.test(toml())) {
    console.log('Chaves VAPID: já existem, ficam as mesmas.');
    return;
  }

  const pair = await webcrypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify'],
  );
  const publicKey = base64url(new Uint8Array(await webcrypto.subtle.exportKey('raw', pair.publicKey)));
  const { d } = await webcrypto.subtle.exportKey('jwk', pair.privateKey);

  // Primeiro o secret: se falhar, o wrangler.toml fica como estava e da
  // próxima vez tenta-se de novo, em vez de ficar uma pública sem privada.
  wrangler(['secret', 'put', 'VAPID_PRIVATE_KEY'], d);

  const updated = toml().replace(
    /^\[vars\]\s*$/m,
    (line) => `${line}\n# Publica: o browser recebe-a. A privada e um secret — ver tools/setup-push.mjs.\nVAPID_PUBLIC_KEY = "${publicKey}"`,
  );
  writeFileSync(CONFIG, updated);
  console.log('Chaves VAPID: criadas. A pública ficou no wrangler.toml; a privada, nos secrets do Worker.');
}

const NAMESPACE = 'pace-push';

function hasBinding() {
  return /binding\s*=\s*"PUSH"/.test(toml());
}

/** Corre o wrangler e fica com o que ele escreveu, em vez de o deixar passar. */
function capture(args) {
  const result = spawnSync('npx', ['wrangler', ...args], {
    encoding: 'utf8',
    stdio: ['inherit', 'pipe', 'pipe'],
    shell: process.platform === 'win32',
  });
  return `${result.stdout ?? ''}${result.stderr ?? ''}`;
}

/**
 * O id do KV que ja exista com este nome.
 *
 * Procura-se o id ao lado do titulo, e nao o primeiro id que aparecer: a conta
 * pode ter outros KV, e ligar o Worker ao errado era pior do que falhar.
 */
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

function bind(id) {
  writeFileSync(CONFIG, `${toml().trimEnd()}

# Onde ficam as subscricoes do lembrete. Escrito por tools/setup-push.mjs.
[[kv_namespaces]]
binding = "PUSH"
id = "${id}"
`);
}

function store() {
  if (hasBinding()) {
    console.log('KV das subscrições: já ligado.');
    return;
  }

  /*
   * Voltar a correr isto nao pode criar um segundo KV.
   *
   * Da primeira vez o espaco foi criado mas a ligacao nunca chegou ao
   * wrangler.toml — o `--update-config` nao a escreveu. Sem esta procura, cada
   * tentativa seguinte criava outro espaco vazio e deixava o Worker ligado ao
   * ultimo, com as subscricoes no primeiro.
   */
  let id = existingId();
  if (id) {
    bind(id);
    console.log('KV das subscrições: já existia, e agora ficou ligado.');
    return;
  }

  wrangler(['kv', 'namespace', 'create', NAMESPACE, '--binding', 'PUSH', '--update-config']);
  if (hasBinding()) {
    console.log('KV das subscrições: criado e ligado.');
    return;
  }

  id = existingId();
  if (!id) {
    console.error('Criei o KV mas nao consegui descobrir o id dele.');
    console.error('Corre `npx wrangler kv namespace list` e acrescenta ao wrangler.toml:');
    console.error('');
    console.error('[[kv_namespaces]]');
    console.error('binding = "PUSH"');
    console.error('id = "<o id>"');
    process.exit(1);
  }
  bind(id);
  console.log('KV das subscrições: criado e ligado.');
}

await keys();
store();
console.log('\nFalta publicar o Worker:\n\n  npm run worker:deploy\n');
