import { describe, expect, it } from 'vitest';
import { foodResultSchema, toFood } from '../src/foods';

describe('mapear um produto do Open Food Facts', () => {
  const base = {
    code: '5601234567890',
    product_name: 'Arroz agulha',
    brands: 'Cigala',
    nutriments: {
      'energy-kcal_100g': 349,
      proteins_100g: 7.2,
      carbohydrates_100g: 78,
      fat_100g: 0.6,
      fiber_100g: 1.4,
    },
  };

  it('traz os valores por 100 g', () => {
    const food = toFood(base);
    expect(food).not.toBeNull();
    expect(food?.name).toBe('Arroz agulha');
    expect(food?.brand).toBe('Cigala');
    expect(food?.kcalPer100g).toBe(349);
    expect(food?.proteinPer100g).toBe(7.2);
    expect(foodResultSchema.safeParse(food).success).toBe(true);
  });

  it('prefere o nome em português quando existe', () => {
    const food = toFood({ ...base, product_name: 'Long grain rice', product_name_pt: 'Arroz agulha' });
    expect(food?.name).toBe('Arroz agulha');
  });

  it('fica com a primeira marca quando vêm várias', () => {
    expect(toFood({ ...base, brands: 'Cigala, Continente' })?.brand).toBe('Cigala');
  });

  it('aceita as marcas em lista', () => {
    expect(toFood({ ...base, brands: ['Cigala'] })?.brand).toBe('Cigala');
  });

  /**
   * Um produto sem valores nutricionais nenhuns seria um nome a ocupar um
   * lugar na lista: quem o escolhesse ficava com um alimento vazio, que é
   * exatamente o que a procura vinha resolver.
   */
  it('deixa de fora um produto sem valores', () => {
    expect(toFood({ ...base, nutriments: {} })).toBeNull();
  });

  it('deixa de fora um produto sem nome', () => {
    expect(toFood({ ...base, product_name: '' })).toBeNull();
  });

  it('não deixa passar um valor absurdo', () => {
    const food = toFood({
      ...base,
      nutriments: { ...base.nutriments, proteins_100g: 900 },
    });
    // O mapeamento aceita, o schema é que recusa — e é ele que decide.
    expect(foodResultSchema.safeParse(food).success).toBe(false);
  });

  it('trata os campos em falta como desconhecidos, e não como zero', () => {
    const food = toFood({
      ...base,
      nutriments: { 'energy-kcal_100g': 349, proteins_100g: 7.2 },
    });
    expect(food?.fiberPer100g).toBeNull();
    expect(food?.carbsPer100g).toBeNull();
  });
});

describe('registos que se contradizem', () => {
  const nutriments = (over: Record<string, number>) => ({
    code: '1', product_name: 'X', brands: 'Y',
    nutriments: {
      'energy-kcal_100g': 539, proteins_100g: 6.3,
      carbohydrates_100g: 57.5, fat_100g: 30.9, ...over,
    },
  });

  it('aceita um registo coerente', () => {
    expect(toFood(nutriments({}))).not.toBeNull();
  });

  /**
   * O Open Food Facts é preenchido por pessoas, e há registos com os campos
   * trocados. Uma procura por "nutella" trazia uma linha com 5,4 kcal por
   * 100 g — o valor da proteína no sítio da energia.
   */
  it('recusa uma energia que não bate certo com os macronutrientes', () => {
    expect(toFood(nutriments({ 'energy-kcal_100g': 5.4 }))).toBeNull();
  });

  it('recusa mais de cem gramas de macronutrientes em cem gramas', () => {
    expect(toFood(nutriments({ proteins_100g: 60, carbohydrates_100g: 60 }))).toBeNull();
  });

  it('deixa passar quando faltam macronutrientes para comparar', () => {
    const parcial = {
      code: '1', product_name: 'X',
      nutriments: { 'energy-kcal_100g': 539, proteins_100g: 6.3 },
    };
    expect(toFood(parcial)).not.toBeNull();
  });

  it('dá margem à fibra e ao álcool, que desviam a conta por natureza', () => {
    // Uma cerveja: pouca proteina, poucos hidratos, e calorias do alcool.
    expect(toFood({
      code: '1', product_name: 'Cerveja',
      nutriments: {
        'energy-kcal_100g': 43, proteins_100g: 0.5,
        carbohydrates_100g: 3.6, fat_100g: 0,
      },
    })).not.toBeNull();
  });
});
