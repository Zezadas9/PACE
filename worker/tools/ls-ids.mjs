/**
 * PACE — descobrir os números da loja e do produto sem abrir o painel.
 *
 *   npm run worker:ls-ids
 *
 * O painel do Lemon Squeezy limita os pedidos e às vezes responde 429 durante
 * um bom bocado. A API deles tem um limite muito mais largo — 300 pedidos por
 * minuto — e sabe responder às duas únicas perguntas que faltam: qual é o
 * número da loja, e qual é o número do produto de 5 €/mês.
 *
 * Pede a chave de API, faz duas perguntas à API, escreve os números no ecrã, e
 * não guarda nada em lado nenhum.
 */

import { createInterface } from 'node:readline/promises';

const API = 'https://api.lemonsqueezy.com/v1';
const rl = createInterface({ input: process.stdin, output: process.stdout });

async function ask(path, key) {
  const response = await fetch(`${API}${path}`, {
    headers: { Accept: 'application/vnd.api+json', Authorization: `Bearer ${key}` },
  });

  if (response.status === 429) {
    console.error('\nA API respondeu 429 — demasiados pedidos.');
    console.error('Espera uns minutos e tenta outra vez. Se a mensagem persistir durante');
    console.error('horas, é do lado deles: escreve-lhes pelo chat do site.');
    process.exit(1);
  }
  if (response.status === 401 || response.status === 403) {
    console.error('\nA chave de API não foi aceite. Confirma que a copiaste inteira,');
    console.error('e que é de Settings » API (não é a chave de uma loja nem um webhook).');
    process.exit(1);
  }
  if (!response.ok) {
    console.error(`\nA API respondeu ${response.status} em ${path}.`);
    process.exit(1);
  }
  return response.json();
}

const key = (await rl.question('Cola a chave de API do Lemon Squeezy:\n> ')).trim();
rl.close();
if (!key) {
  console.error('Sem chave não há nada a perguntar.');
  process.exit(1);
}

const lojas = await ask('/stores', key);
console.log('\nLOJAS');
for (const loja of lojas.data ?? []) {
  console.log(`  ${loja.id}  ${loja.attributes?.name ?? ''} (${loja.attributes?.domain ?? ''})`);
}

// Os produtos trazem as variantes incluidas: e a variante que o checkout leva,
// e nao o produto. Num produto com um so preco, ha uma variante so.
const produtos = await ask('/products?include=variants', key);
const variantes = new Map(
  (produtos.included ?? [])
    .filter((entrada) => entrada.type === 'variants')
    .map((entrada) => [entrada.id, entrada.attributes]),
);

console.log('\nPRODUTOS E VARIANTES');
for (const produto of produtos.data ?? []) {
  console.log(`  ${produto.attributes?.name ?? ''} — loja ${produto.attributes?.store_id ?? '?'}`);
  const ligadas = produto.relationships?.variants?.data ?? [];
  for (const { id } of ligadas) {
    const variante = variantes.get(id);
    if (!variante) continue;
    const preco = variante.price != null ? `${(variante.price / 100).toFixed(2)}` : '?';
    const assinatura = variante.is_subscription ? 'subscrição' : 'pagamento único';
    console.log(`      variante ${id}  ${variante.name ?? ''}  ${preco}  ${assinatura}`);
  }
}

console.log('\nO LS_STORE_ID é o número da loja; o LS_VARIANT_ID é o número da');
console.log('variante de subscrição de 5 €/mês. Depois:\n');
console.log('  npm run worker:pagamentos-setup\n');
