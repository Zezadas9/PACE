/**
 * A base de dados de alimentos, através do backend da PACE.
 *
 * O browser não fala com o Open Food Facts diretamente: o endpoint que sabe
 * procurar texto livre não devolve cabeçalhos de CORS, e o que os devolve
 * responde 503 à pesquisa. Passar pelo Worker resolve isso e tem um efeito
 * lateral que vale por si — o Open Food Facts nunca vê o IP de quem procura.
 *
 * Sem backend configurado, `isAvailable` é falso e os ecrãs escondem a procura.
 * A aplicação continua a funcionar com o que sempre teve: escrever à mão.
 */

import type { FoodDatabasePort, FoodResult } from '../types';

/** Mais do que o Worker espera pela base de dados, para ser ele a decidir. */
const TIMEOUT_MS = 14_000;

/** O que chega da rede é dados, não uma promessa: confirma-se a forma. */
function isFood(value: unknown): value is FoodResult {
  if (!value || typeof value !== 'object') return false;
  const food = value as Partial<FoodResult>;
  return typeof food.name === 'string' && food.name.trim().length > 0;
}

export class RemoteFoodDatabase implements FoodDatabasePort {
  constructor(private readonly baseUrl: string) {}

  async isAvailable(): Promise<boolean> {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return false;
    return this.baseUrl.trim() !== '';
  }

  private async ask(params: string): Promise<FoodResult[]> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const response = await fetch(
        `${this.baseUrl.replace(/\/+$/, '')}/api/foods?${params}`,
        { signal: controller.signal },
      );
      if (!response.ok) return [];
      const payload: unknown = await response.json();
      const foods = (payload as { foods?: unknown })?.foods;
      return Array.isArray(foods) ? foods.filter(isFood) : [];
    } catch {
      // Sem rede, sem resultados. Não é um erro do programa.
      return [];
    } finally {
      clearTimeout(timer);
    }
  }

  async search(query: string): Promise<FoodResult[]> {
    const term = query.trim();
    if (term.length < 2) return [];
    return this.ask(`q=${encodeURIComponent(term)}`);
  }

  async byBarcode(barcode: string): Promise<FoodResult | null> {
    const code = barcode.replace(/[^0-9]/g, '');
    if (code.length < 8) return null;
    return (await this.ask(`barcode=${code}`))[0] ?? null;
  }
}

/** Quando não há backend: uma porta que diz honestamente que está fechada. */
export class UnavailableFoodDatabase implements FoodDatabasePort {
  async isAvailable(): Promise<boolean> {
    return false;
  }

  async search(): Promise<FoodResult[]> {
    return [];
  }

  async byBarcode(): Promise<null> {
    return null;
  }
}
