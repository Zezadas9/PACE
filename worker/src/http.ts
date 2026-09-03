/**
 * As regras da porta de entrada: quem pode falar, com que frequência, e o que
 * é devolvido quando algo corre mal.
 *
 * Nada do que sai daqui inclui detalhes internos. Um erro é um código curto e
 * uma frase — sem stack traces, sem mensagens da Anthropic, sem pedaços do
 * pedido.
 */

export interface Env {
  ANTHROPIC_API_KEY?: string;
  ANTHROPIC_MODEL?: string;
  ALLOWED_ORIGINS?: string;
  /**
   * O espaço de trabalho da Anthropic, quando a chave está ligada a uma
   * identidade em vez de a um workspace. É um identificador, não um segredo.
   */
  ANTHROPIC_WORKSPACE_ID?: string;
  /** "1" faz os erros trazerem a mensagem de quem recusou. Só para diagnóstico. */
  DEBUG_UPSTREAM?: string;
}

const DEFAULT_ORIGINS = ['http://localhost:5173', 'http://localhost:4173'];

export function allowedOrigins(env: Env): string[] {
  const configured = (env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin !== '');
  return configured.length > 0 ? configured : DEFAULT_ORIGINS;
}

/**
 * CORS estrito: a origem tem de estar na lista.
 *
 * Sem `*`. Um backend que fala com qualquer página é um backend que qualquer
 * página pode usar à custa da nossa chave.
 */
export function corsHeaders(origin: string | null, env: Env): Record<string, string> {
  const allowed = allowedOrigins(env);
  if (!origin || !allowed.includes(origin)) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'content-type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

export function json(
  body: unknown,
  status: number,
  headers: Record<string, string>,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...headers },
  });
}

export function fail(
  code: string,
  status: number,
  headers: Record<string, string>,
): Response {
  return json({ error: code }, status, headers);
}

/* --- Limite de pedidos ------------------------------------------------------- */

export const RATE_LIMIT = { requests: 20, windowMs: 60_000 } as const;

/**
 * Um contador por IP, em memória.
 *
 * É proteção básica e convém dizer o que não é: cada isolate do Worker tem a
 * sua própria memória, portanto o limite real é por isolate, e um IP partilhado
 * conta como um só utilizador. Para controlo a sério — por conta, com um número
 * fiável — é preciso autenticação e um contador partilhado (Durable Object ou
 * KV). Isto trava um script distraído, não um atacante decidido.
 */
const hits = new Map<string, number[]>();

export function rateLimited(ip: string, now = Date.now()): boolean {
  const window = now - RATE_LIMIT.windowMs;
  const recent = (hits.get(ip) ?? []).filter((time) => time > window);
  recent.push(now);
  hits.set(ip, recent);

  // A tabela não pode crescer para sempre num isolate de vida longa.
  if (hits.size > 5000) {
    for (const [key, times] of hits) {
      if (times.every((time) => time <= window)) hits.delete(key);
    }
  }
  return recent.length > RATE_LIMIT.requests;
}

export function resetRateLimit(): void {
  hits.clear();
}

export function clientIp(request: Request): string {
  return request.headers.get('cf-connecting-ip')
    ?? request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    ?? 'desconhecido';
}
