import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSettings, createUser } from '../../core/factories';
import type { CoachContext } from '../../domain/coach/types';
import type { AssistantRequest } from '../types';
import { LocalAssistantPort } from './assistant';
import { RemoteAssistantPort, withLocalFallback } from './remoteAssistant';

function context(): CoachContext {
  return {
    today: '2026-09-02',
    settings: {
      ...createSettings().ai,
      enabled: true,
      categories: {
        profile: true, goals: true, training: true, activity: true,
        nutrition: true, habits: true, sleep: true, feedback: true,
      },
    },
    preferences: createUser().preferences,
    profile: null,
    goals: [], workouts: [], exercises: [], sessions: [], activities: [],
    habits: [], habitEntries: [], meals: [], foods: [], water: [],
    runPlan: null, sleep: null,
  };
}

function request(): AssistantRequest {
  return {
    message: 'Cria-me um treino de 45 minutos',
    context: context(),
    previousIntent: null,
    history: [{ role: 'user', text: 'olá' }],
  };
}

const turn = {
  blocks: [{ kind: 'text', text: 'Aqui está uma sugestão.' }],
  actions: [],
  followUps: ['E amanhã?'],
};

afterEach(() => vi.unstubAllGlobals());

describe('RemoteAssistantPort', () => {
  it('envia mensagem, contexto e histórico para o endpoint do Worker', async () => {
    const fetchMock = vi.fn(
      async (_url: string, _init: RequestInit) => new Response(JSON.stringify({ turn }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const reply = await new RemoteAssistantPort('https://worker.dev/').respond(request());

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://worker.dev/api/coach');
    const body = JSON.parse(init.body as string);
    expect(body.message).toBe('Cria-me um treino de 45 minutos');
    expect(body.history).toHaveLength(1);
    expect(body.context.today).toBe('2026-09-02');
    expect(reply.remote).toBe(true);
    expect(reply.turn.blocks[0]).toMatchObject({ kind: 'text' });
  });

  it('não envia chave nenhuma nos cabeçalhos', async () => {
    const fetchMock = vi.fn(
      async (_url: string, _init: RequestInit) => new Response(JSON.stringify({ turn }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await new RemoteAssistantPort('https://worker.dev').respond(request());

    const headers = fetchMock.mock.calls[0]![1].headers as Record<string, string>;
    expect(Object.keys(headers).map((key) => key.toLowerCase())).toEqual(['content-type']);
    expect(JSON.stringify(headers).toLowerCase()).not.toContain('api-key');
  });

  it('recusa uma resposta que traga ações', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify({ turn: { ...turn, actions: [{ kind: 'create_workout' }] } }),
      { status: 200 },
    )));

    await expect(new RemoteAssistantPort('https://worker.dev').respond(request()))
      .rejects.toThrow();
  });

  it('recusa uma resposta fora do formato', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify({ turn: { blocks: 'texto solto' } }),
      { status: 200 },
    )));

    await expect(new RemoteAssistantPort('https://worker.dev').respond(request()))
      .rejects.toThrow();
  });
});

describe('withLocalFallback', () => {
  const local = new LocalAssistantPort();

  it('usa o remoto quando ele responde', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ turn }), { status: 200 })));
    const port = withLocalFallback(new RemoteAssistantPort('https://worker.dev'), local);

    const reply = await port.respond(request());
    expect(reply.fallback).toBeUndefined();
    expect(reply.turn.blocks[0]).toMatchObject({ text: 'Aqui está uma sugestão.' });
  });

  it('cai no motor local quando o backend devolve um erro', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 500 })));
    const port = withLocalFallback(new RemoteAssistantPort('https://worker.dev'), local);

    const reply = await port.respond(request());
    expect(reply.fallback).toBe(true);
    // O motor local respondeu mesmo: propõe um treino, com ação e tudo.
    expect(reply.turn.actions.some((action) => action.kind === 'create_workout')).toBe(true);
  });

  it('cai no motor local quando a rede falha', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('sem rede'); }));
    const port = withLocalFallback(new RemoteAssistantPort('https://worker.dev'), local);

    expect((await port.respond(request())).fallback).toBe(true);
  });

  it('nem tenta a rede quando o dispositivo está offline', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('navigator', { onLine: false });
    const port = withLocalFallback(new RemoteAssistantPort('https://worker.dev'), local);

    expect((await port.respond(request())).fallback).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('cai no motor local quando a resposta demora demais', async () => {
    // A promessa nunca resolve: quem termina o pedido é o AbortController do
    // porto remoto, ao fim dos doze segundos.
    vi.stubGlobal('fetch', vi.fn((_url: string, init: RequestInit) => new Promise<Response>(
      (_resolve, reject) => {
        init.signal?.addEventListener('abort', () => reject(new Error('abortado')));
      },
    )));
    vi.useFakeTimers();

    const port = withLocalFallback(new RemoteAssistantPort('https://worker.dev'), local);
    const pending = port.respond(request());
    await vi.advanceTimersByTimeAsync(12_500);
    vi.useRealTimers();

    expect((await pending).fallback).toBe(true);
  });
});
