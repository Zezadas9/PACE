import { afterEach, describe, expect, it, vi } from 'vitest';
import { RemoteFoodDatabase, UnavailableFoodDatabase } from './foodDatabase';

afterEach(() => vi.unstubAllGlobals());

const arroz = {
  barcode: '5601234567890',
  name: 'Arroz agulha',
  brand: 'Cigala',
  kcalPer100g: 349,
  proteinPer100g: 7.2,
  carbsPer100g: 78,
  fatPer100g: 0.6,
  fiberPer100g: 1.4,
};

describe('procurar alimentos', () => {
  it('pergunta ao backend e devolve o que ele deu', async () => {
    const fetchMock = vi.fn(async (_url: string) => new Response(
      JSON.stringify({ foods: [arroz] }), { status: 200 },
    ));
    vi.stubGlobal('fetch', fetchMock);

    const foods = await new RemoteFoodDatabase('https://worker.dev/').search('arroz');
    expect(foods).toHaveLength(1);
    expect(foods[0]?.name).toBe('Arroz agulha');
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe('https://worker.dev/api/foods?q=arroz');
  });

  it('não pergunta por uma letra só', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    expect(await new RemoteFoodDatabase('https://worker.dev').search('a')).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  /**
   * Sem rede a aplicação continua a funcionar: escrever à mão nunca deixou de
   * ser possível, e uma procura falhada não pode ser um erro que pare o ecrã.
   */
  it('devolve uma lista vazia quando a rede falha', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    expect(await new RemoteFoodDatabase('https://worker.dev').search('arroz')).toEqual([]);
  });

  it('devolve uma lista vazia quando o backend recusa', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 502 })));
    expect(await new RemoteFoodDatabase('https://worker.dev').search('arroz')).toEqual([]);
  });

  it('deixa de fora o que vier sem nome', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify({ foods: [arroz, { name: '' }, { brand: 'X' }] }), { status: 200 },
    )));
    expect(await new RemoteFoodDatabase('https://worker.dev').search('arroz')).toHaveLength(1);
  });

  it('procura por código de barras', async () => {
    const fetchMock = vi.fn(async (_url: string) => new Response(
      JSON.stringify({ foods: [arroz] }), { status: 200 },
    ));
    vi.stubGlobal('fetch', fetchMock);

    const food = await new RemoteFoodDatabase('https://worker.dev').byBarcode('5601234567890');
    expect(food?.name).toBe('Arroz agulha');
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('barcode=5601234567890');
  });

  it('ignora um código de barras curto de mais para existir', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    expect(await new RemoteFoodDatabase('https://worker.dev').byBarcode('123')).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('sem backend configurado', () => {
  it('diz que não está disponível, e não procura nada', async () => {
    const port = new UnavailableFoodDatabase();
    expect(await port.isAvailable()).toBe(false);
    expect(await port.search()).toEqual([]);
    expect(await port.byBarcode()).toBeNull();
  });
});
