import { beforeEach, describe, expect, it } from 'vitest';
import { corsHeaders, RATE_LIMIT, rateLimited, resetRateLimit } from '../src/http';
import worker from '../src/index';
import type { Env } from '../src/http';

const env: Env = {
  ANTHROPIC_API_KEY: 'chave-de-teste',
  ALLOWED_ORIGINS: 'https://zezadas9.github.io,http://localhost:5173',
};

function post(body: unknown, origin = 'https://zezadas9.github.io'): Request {
  return new Request('https://worker.dev/api/coach', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin },
    body: JSON.stringify(body),
  });
}

beforeEach(() => resetRateLimit());

describe('CORS', () => {
  it('devolve a origem quando ela está na lista', () => {
    const headers = corsHeaders('http://localhost:5173', env);
    expect(headers['Access-Control-Allow-Origin']).toBe('http://localhost:5173');
  });

  it('não devolve nada para uma origem desconhecida', () => {
    expect(corsHeaders('https://exemplo-mau.com', env)).toEqual({});
  });

  it('nunca usa asterisco', () => {
    const values = Object.values(corsHeaders('https://zezadas9.github.io', env));
    expect(values).not.toContain('*');
  });
});

describe('endpoint', () => {
  it('recusa uma origem fora da lista', async () => {
    const response = await worker.fetch(post({}, 'https://exemplo-mau.com'), env);
    expect(response.status).toBe(403);
  });

  it('recusa um método errado', async () => {
    const request = new Request('https://worker.dev/api/coach', { method: 'GET' });
    expect((await worker.fetch(request, env)).status).toBe(405);
  });

  it('recusa um caminho desconhecido', async () => {
    const request = new Request('https://worker.dev/outra-coisa', { method: 'POST' });
    expect((await worker.fetch(request, env)).status).toBe(404);
  });

  it('recusa um corpo que não é JSON', async () => {
    const request = new Request('https://worker.dev/api/coach', {
      method: 'POST',
      headers: { 'content-type': 'text/plain', origin: 'http://localhost:5173' },
      body: 'olá',
    });
    expect((await worker.fetch(request, env)).status).toBe(415);
  });

  it('recusa um pedido mal formado sem dizer porquê', async () => {
    const response = await worker.fetch(post({ message: '' }), env);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'invalid_request' });
  });

  it('diz que não está configurado quando falta a chave', async () => {
    const response = await worker.fetch(post({ message: 'olá' }), { ALLOWED_ORIGINS: env.ALLOWED_ORIGINS });
    expect(response.status).toBe(503);
  });

  it('responde ao preflight de uma origem conhecida', async () => {
    const request = new Request('https://worker.dev/api/coach', {
      method: 'OPTIONS',
      headers: { origin: 'http://localhost:5173' },
    });
    const response = await worker.fetch(request, env);
    expect(response.status).toBe(204);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:5173');
  });
});

describe('limite por IP', () => {
  it('deixa passar até ao limite e trava a seguir', () => {
    for (let i = 0; i < RATE_LIMIT.requests; i += 1) {
      expect(rateLimited('1.2.3.4')).toBe(false);
    }
    expect(rateLimited('1.2.3.4')).toBe(true);
  });

  it('conta cada IP por si', () => {
    for (let i = 0; i < RATE_LIMIT.requests; i += 1) rateLimited('1.2.3.4');
    expect(rateLimited('5.6.7.8')).toBe(false);
  });

  it('esquece o que saiu da janela', () => {
    const start = Date.now();
    for (let i = 0; i < RATE_LIMIT.requests; i += 1) rateLimited('9.9.9.9', start);
    expect(rateLimited('9.9.9.9', start + RATE_LIMIT.windowMs + 1)).toBe(false);
  });
});
