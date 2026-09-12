import { describe, expect, it } from 'vitest';
import { expiryFor, readLicence, sameSecret, signLicence } from '../src/token';

const SECRET = 'um-segredo-de-teste-que-ninguem-adivinha';
const AGORA = new Date('2026-09-12T10:00:00Z');

describe('cartao de licenca', () => {
  it('vai e volta com o que la foi posto', async () => {
    const token = await signLicence(
      { device: 'aparelho-de-teste-1234', kind: 'paid', exp: expiryFor('paid', AGORA), renews: '2026-10-12' },
      SECRET,
    );
    const licence = await readLicence(token, SECRET, AGORA);
    expect(licence).toMatchObject({ device: 'aparelho-de-teste-1234', kind: 'paid', renews: '2026-10-12' });
  });

  it('nao aceita um cartao assinado com outro segredo', async () => {
    const token = await signLicence(
      { device: 'aparelho-de-teste-1234', kind: 'paid', exp: expiryFor('paid', AGORA) },
      'outro-segredo-qualquer-que-nao-e-o-nosso',
    );
    expect(await readLicence(token, SECRET, AGORA)).toBeNull();
  });

  it('nao aceita um cartao a que mexeram', async () => {
    const token = await signLicence(
      { device: 'aparelho-de-teste-1234', kind: 'trial', exp: expiryFor('trial', AGORA) },
      SECRET,
    );
    const [header = '', , signature = ''] = token.split('.');
    // O mesmo cartao, mas a dizer que e vitalicio.
    const forjado = btoa(JSON.stringify({
      sub: 'aparelho-de-teste-1234', kind: 'lifetime', exp: expiryFor('lifetime', AGORA),
    })).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    expect(await readLicence(`${header}.${forjado}.${signature}`, SECRET, AGORA)).toBeNull();
  });

  it('deixa de valer quando o prazo passa', async () => {
    const token = await signLicence(
      { device: 'aparelho-de-teste-1234', kind: 'trial', exp: expiryFor('trial', AGORA) },
      SECRET,
    );
    const passados = new Date(AGORA.getTime() + 8 * 24 * 3600 * 1000);
    expect(await readLicence(token, SECRET, passados)).toBeNull();
    // Um dia antes ainda vale.
    const antes = new Date(AGORA.getTime() + 6 * 24 * 3600 * 1000);
    expect(await readLicence(token, SECRET, antes)).not.toBeNull();
  });

  it('recusa o que nem sequer tem a forma de um cartao', async () => {
    expect(await readLicence('', SECRET)).toBeNull();
    expect(await readLicence('nao.e.um-jwt', SECRET)).toBeNull();
    expect(await readLicence('so-uma-parte', SECRET)).toBeNull();
  });
});

describe('comparacao de segredos', () => {
  it('diz sim ao igual e nao ao resto', () => {
    expect(sameSecret('CR7desconto100', 'CR7desconto100')).toBe(true);
    expect(sameSecret('CR7desconto100', 'CR7desconto101')).toBe(false);
    expect(sameSecret('CR7desconto100', 'CR7')).toBe(false);
    expect(sameSecret('', '')).toBe(true);
  });
});
