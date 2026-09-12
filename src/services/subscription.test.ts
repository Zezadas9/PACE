import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createRepositories, type Repositories } from '../data/repositories';
import { Store } from '../data/store';
import { createUser } from '../core/factories';
import type { LicenceSettings } from '../core/types';
import type { LicenceInfo, LicencePort, Platform, StoragePort } from '../platform/types';
import {
  accessOf, cardExpiry, redeemCode, syncLicence, trialDaysLeft,
} from './subscription';

function memoryStorage(): StoragePort {
  const map = new Map<string, unknown>();
  return {
    name: 'memory',
    isAvailable: async () => true,
    get: async <T,>(key: string) => (map.get(key) as T) ?? null,
    set: async (key, value) => { map.set(key, value); },
    remove: async (key) => { map.delete(key); },
    keys: async () => [...map.keys()],
  };
}

/** Um cartao com a validade que se quiser. Nao e assinado: aqui so se le a data. */
function card(expires: Date): string {
  const claims = btoa(JSON.stringify({ sub: 'x', kind: 'trial', exp: Math.floor(expires.getTime() / 1000) }))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `cabecalho.${claims}.assinatura`;
}

const settings = (over: Partial<LicenceSettings> = {}): LicenceSettings => ({
  device: 'aparelho', card: null, state: null, validUntil: null, endsAt: null,
  renewsAt: null, portalUrl: null, canBuy: false, checkedAt: null, ...over,
});

const AGORA = new Date('2026-09-12T10:00:00Z');

let repos: Repositories;

beforeEach(async () => {
  const store = new Store(memoryStorage());
  await store.load();
  repos = createRepositories(store);
});

describe('a porta da aplicacao', () => {
  it('abre enquanto o cartao valer, com ou sem rede', () => {
    const licence = settings({
      state: 'trial',
      validUntil: '2026-09-19T00:00:00.000Z',
      checkedAt: '2026-09-12T09:00:00.000Z',
    });
    expect(accessOf(licence, '2026-09-12', AGORA)).toBe('open');
  });

  it('fecha quando o cartao expira e o servidor ja tinha falado', () => {
    const licence = settings({
      state: 'trial',
      validUntil: '2026-09-11T00:00:00.000Z',
      checkedAt: '2026-09-11T09:00:00.000Z',
    });
    expect(accessOf(licence, '2026-09-01', AGORA)).toBe('blocked');
  });

  it('nao fecha a porta a quem instalou agora e ainda nao chegou ao servidor', () => {
    expect(accessOf(settings(), '2026-09-12', AGORA)).toBe('unknown');
  });

  it('mas nao deixa ficar assim para sempre', () => {
    // Instalou ha duas semanas e nunca confirmou nada: fica fechada.
    expect(accessOf(settings(), '2026-08-29', AGORA)).toBe('blocked');
  });

  it('sem pagamentos configurados, abre sempre', () => {
    expect(accessOf(settings({ state: 'unmanaged' }), '2020-01-01', AGORA)).toBe('open');
  });
});

describe('a contagem da experiencia', () => {
  it('conta os dias que faltam, e nunca menos de zero', () => {
    expect(trialDaysLeft(settings({ state: 'trial', endsAt: '2026-09-15T00:00:00.000Z' }), AGORA)).toBe(3);
    expect(trialDaysLeft(settings({ state: 'trial', endsAt: '2026-09-01T00:00:00.000Z' }), AGORA)).toBe(0);
    expect(trialDaysLeft(settings({ state: 'paid' }), AGORA)).toBeNull();
  });
});

describe('o cartao', () => {
  it('diz a validade sem precisar do segredo', () => {
    expect(cardExpiry(card(new Date('2026-09-19T00:00:00Z')))).toBe('2026-09-19T00:00:00.000Z');
    expect(cardExpiry('lixo')).toBeNull();
  });
});

describe('falar com o servidor', () => {
  function platformWith(port: Partial<LicencePort>): Platform {
    return { licence: { status: async () => null, redeem: async () => ({ ok: false, error: 'invalid' }), checkout: async () => null, ...port } } as unknown as Platform;
  }

  it('guarda o que o servidor disser, e cria o aparelho a primeira vez', async () => {
    const info: LicenceInfo = {
      state: 'trial',
      card: card(new Date('2026-09-19T00:00:00Z')),
      endsAt: '2026-09-19T00:00:00.000Z',
      canBuy: true,
    };
    const status = vi.fn(async (_device: string) => info);
    await syncLicence(repos, platformWith({ status }));

    const licence = repos.settings.get().licence;
    expect(licence.state).toBe('trial');
    expect(licence.validUntil).toBe('2026-09-19T00:00:00.000Z');
    expect(licence.device).toMatch(/^[A-Za-z0-9_-]{24}$/);
    expect(status).toHaveBeenCalledWith(licence.device);
  });

  it('sem rede, fica o que ja estava — a aplicacao nao se fecha por isso', async () => {
    repos.settings.updateLicence({ state: 'paid', validUntil: '2026-09-30T00:00:00.000Z', checkedAt: 'antes' });
    await syncLicence(repos, platformWith({ status: async () => null }));
    expect(repos.settings.get().licence.state).toBe('paid');
    expect(accessOf(repos.settings.get().licence, '2026-09-01', AGORA)).toBe('open');
  });

  it('um codigo aceite abre a porta; um recusado diz porque', async () => {
    const info: LicenceInfo = { state: 'lifetime', card: card(new Date('2026-12-12T00:00:00Z')) };
    expect(await redeemCode(repos, platformWith({ redeem: async () => ({ ok: true, info }) }), 'x', '')).toBe('ok');
    expect(repos.settings.get().licence.state).toBe('lifetime');

    expect(await redeemCode(
      repos, platformWith({ redeem: async () => ({ ok: false, error: 'email' }) }), 'x', 'a@b.pt',
    )).toBe('email');
  });

  it('o aparelho e o mesmo entre chamadas', async () => {
    repos.user.set(createUser({ name: 'Demo' }));
    const status = vi.fn(async (_device: string) => ({ state: 'trial' }) as LicenceInfo);
    const platform = platformWith({ status });
    await syncLicence(repos, platform);
    await syncLicence(repos, platform);
    expect(status.mock.calls[0]?.[0]).toBe(status.mock.calls[1]?.[0]);
  });
});
