/**
 * Procura de alimentos, com os valores a virem de rotulos.
 *
 * A PACE precisa disto porque escrever cada alimento a mao e a razao por que as
 * pessoas desistem de registar refeicoes. A estimativa da IA e uma ponte; um
 * rotulo lido de uma base de dados e o destino.
 *
 * Passa pelo Worker e nao pelo browser por duas razoes, e nenhuma delas e
 * arquitetura por arquitetura:
 *
 * 1. O endpoint do Open Food Facts que sabe procurar texto livre nao devolve
 *    cabecalhos de CORS, e o que os devolve responde 503 a pesquisa. Do browser
 *    nao ha maneira de la chegar.
 * 2. Assim o Open Food Facts nunca ve o IP de quem procura. O que sai daqui e
 *    um termo de pesquisa vindo de um servidor, sem nada que identifique a
 *    pessoa.
 */

import { z } from 'zod';

const SEARCH_URL = 'https://search.openfoodfacts.org/search';
const PRODUCT_URL = 'https://world.openfoodfacts.org/api/v2/product';

/** O Open Food Facts pede que quem usa a API se identifique. */
const USER_AGENT = 'PACE - Web - https://github.com/Zezadas9/PACE';

export const MAX_QUERY_CHARS = 60;
export const MAX_RESULTS = 20;

/** Um alimento como a PACE o guarda: por 100 g, e com nulos onde nao se sabe. */
export const foodResultSchema = z.object({
  barcode: z.string().max(30).nullable(),
  name: z.string().min(1).max(80),
  brand: z.string().max(60).nullable(),
  kcalPer100g: z.number().min(0).max(1000).nullable(),
  proteinPer100g: z.number().min(0).max(100).nullable(),
  carbsPer100g: z.number().min(0).max(100).nullable(),
  fatPer100g: z.number().min(0).max(100).nullable(),
  fiberPer100g: z.number().min(0).max(100).nullable(),
});

export type FoodResult = z.infer<typeof foodResultSchema>;

/** Um numero do OFF, ou null. Zeros vindos de campos vazios nao contam. */
function value(raw: unknown): number | null {
  if (typeof raw !== 'number' || !Number.isFinite(raw) || raw < 0) return null;
  return Math.round(raw * 10) / 10;
}

/** O nome pode vir em varios campos e em varias linguas. Vale o primeiro. */
function nameOf(product: Record<string, unknown>): string | null {
  for (const key of ['product_name_pt', 'product_name', 'generic_name_pt', 'generic_name']) {
    const raw = product[key];
    if (typeof raw === 'string' && raw.trim().length > 0) return raw.trim().slice(0, 80);
  }
  return null;
}

/** As marcas chegam como texto separado por virgulas, ou como lista. */
function brandOf(product: Record<string, unknown>): string | null {
  const raw = product.brands;
  const first = Array.isArray(raw) ? raw[0] : raw;
  if (typeof first !== 'string' || first.trim() === '') return null;
  return first.split(',')[0]!.trim().slice(0, 60) || null;
}

export function toFood(product: Record<string, unknown>): FoodResult | null {
  const name = nameOf(product);
  if (!name) return null;

  const n = (product.nutriments ?? {}) as Record<string, unknown>;
  const food: FoodResult = {
    barcode: typeof product.code === 'string' ? product.code.slice(0, 30) : null,
    name,
    brand: brandOf(product),
    kcalPer100g: value(n['energy-kcal_100g']),
    proteinPer100g: value(n.proteins_100g),
    carbsPer100g: value(n.carbohydrates_100g),
    fatPer100g: value(n.fat_100g),
    fiberPer100g: value(n.fiber_100g),
  };

  // Um alimento sem um unico valor nutricional nao serve para nada aqui: seria
  // um nome a ocupar um lugar na lista.
  const temValores = food.kcalPer100g != null || food.proteinPer100g != null;
  if (!temValores) return null;

  return plausible(food) ? food : null;
}

/**
 * Os numeros batem certo uns com os outros?
 *
 * O Open Food Facts e preenchido por pessoas, e ha registos com os campos
 * trocados: uma procura por "nutella" trazia uma linha com 5,4 kcal por 100 g,
 * que e o valor da proteina no sitio errado. Um alimento assim entra na
 * aplicacao e estraga as contas do dia inteiro.
 *
 * A verificacao nao e um palpite sobre o alimento: e a coerencia interna do
 * proprio registo. Quatro calorias por grama de proteina e de hidratos, nove
 * por grama de gordura — se o total declarado ficar longe da soma, o registo
 * contradiz-se, e um registo que se contradiz nao entra.
 */
function plausible(food: FoodResult): boolean {
  const { kcalPer100g, proteinPer100g, carbsPer100g, fatPer100g } = food;

  // Cem gramas de comida nao tem mais de cem gramas de macronutrientes.
  const soma = (proteinPer100g ?? 0) + (carbsPer100g ?? 0) + (fatPer100g ?? 0);
  if (soma > 100) return false;

  if (kcalPer100g == null) return true;
  if (proteinPer100g == null || carbsPer100g == null || fatPer100g == null) return true;

  const calculado = proteinPer100g * 4 + carbsPer100g * 4 + fatPer100g * 9;
  // Alcool, fibra e poliois fazem a conta desviar-se um pouco por natureza; a
  // margem e larga de proposito, para so apanhar o que esta mesmo trocado.
  const margem = Math.max(60, calculado * 0.45);
  return Math.abs(kcalPer100g - calculado) <= margem;
}

/**
 * O mesmo produto, uma vez so.
 *
 * O Open Food Facts tem um registo por codigo de barras, e o mesmo produto tem
 * codigos diferentes por pais e por embalagem. Uma procura por "nutella"
 * devolvia cinco linhas iguais — e cinco linhas iguais nao sao uma escolha,
 * sao ruido a esconder o que vinha a seguir.
 */
function dedupe(foods: FoodResult[]): FoodResult[] {
  const seen = new Set<string>();
  return foods.filter((food) => {
    const key = [
      food.name.toLowerCase().trim(),
      (food.brand ?? '').toLowerCase().trim(),
      food.kcalPer100g ?? '',
    ].join('|');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export type FoodFailure = 'unavailable' | 'upstream_error';

export interface FoodSuccess {
  ok: true;
  foods: FoodResult[];
}

export interface FoodError {
  ok: false;
  failure: FoodFailure;
}

/** Os campos que interessam. Pedir tudo trazia megabytes por pesquisa. */
const FIELDS = [
  'code', 'product_name', 'product_name_pt', 'generic_name', 'generic_name_pt',
  'brands', 'nutriments',
].join(',');

/**
 * Folga para a base de dados responder.
 *
 * Do lado de fora o Open Food Facts responde em decimas de segundo, mas o
 * caminho ate la nao e sempre o mesmo. Desistir cedo de mais transforma uma
 * procura lenta numa procura falhada, e uma procura falhada manda a pessoa
 * escrever a mao — que era o que isto vinha evitar.
 */
const TIMEOUT_MS = 10_000;

/**
 * Um pedido a base de dados.
 *
 * Devolve null quando o produto nao existe, e lanca quando a base de dados
 * esta em baixo. A diferenca importa: "nao encontrei esse codigo de barras" e
 * uma resposta, "nao consegui chegar la" e uma falha, e o ecra diz coisas
 * diferentes para cada uma.
 */
async function fetchJson(url: string): Promise<unknown | null> {
  /*
   * A cache do proprio Worker, antes de sair para a rede.
   *
   * Um rotulo nao muda de dia para dia, e duas pessoas a procurar "arroz" nao
   * precisam de duas viagens. Guardar aqui poupa a base de dados aberta, que e
   * mantida por voluntarios, e torna a segunda procura instantanea.
   */
  const cache = caches.default;
  const key = new Request(url, { method: 'GET' });
  const hit = await cache.match(key);
  if (hit) return hit.json();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: { 'user-agent': USER_AGENT, accept: 'application/json' },
      signal: controller.signal,
    });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`estado ${response.status}`);

    const body = await response.text();
    await cache.put(key, new Response(body, {
      headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=86400' },
    }));
    return JSON.parse(body);
  } finally {
    clearTimeout(timer);
  }
}

export async function searchFoods(query: string): Promise<FoodSuccess | FoodError> {
  const term = query.trim().slice(0, MAX_QUERY_CHARS);
  if (term.length < 2) return { ok: true, foods: [] };

  try {
    const url = `${SEARCH_URL}?q=${encodeURIComponent(term)}`
      + `&page_size=${MAX_RESULTS}&fields=${encodeURIComponent(FIELDS)}`;
    const payload = await fetchJson(url) as { hits?: unknown[] } | null;

    const hits = Array.isArray(payload?.hits) ? payload.hits : [];
    const foods = hits
      .filter((hit): hit is Record<string, unknown> => !!hit && typeof hit === 'object')
      .map(toFood)
      .filter((food): food is FoodResult => food != null);

    return { ok: true, foods: dedupe(foods).slice(0, MAX_RESULTS) };
  } catch {
    // Sem rede ou com a base de dados em baixo, a aplicacao continua a
    // funcionar: escrever a mao nunca deixou de ser possivel.
    return { ok: false, failure: 'unavailable' };
  }
}

export async function foodByBarcode(barcode: string): Promise<FoodSuccess | FoodError> {
  const code = barcode.replace(/[^0-9]/g, '').slice(0, 20);
  if (code.length < 8) return { ok: true, foods: [] };

  try {
    const payload = await fetchJson(
      `${PRODUCT_URL}/${code}?fields=${encodeURIComponent(FIELDS)}`,
    ) as { product?: Record<string, unknown>; status?: number } | null;

    // Um codigo que nao existe nao e uma falha: e uma resposta vazia.
    if (!payload?.product) return { ok: true, foods: [] };
    const food = toFood(payload.product);
    return { ok: true, foods: food ? [food] : [] };
  } catch {
    return { ok: false, failure: 'unavailable' };
  }
}
