/**
 * PACE — o backend do assistente.
 *
 * Um endpoint, `POST /api/coach`. É o único sítio de todo o projeto que conhece
 * a chave da Anthropic: o frontend fala com isto, isto fala com o modelo, e a
 * chave nunca sai de `env.ANTHROPIC_API_KEY`.
 *
 * O que este ficheiro garante, por ordem de importância:
 *
 * 1. **A chave não viaja.** Não está no bundle, não está em `VITE_*`, não está
 *    em nenhum ficheiro versionado.
 * 2. **O pedido é validado antes de custar dinheiro.** Tamanho, forma, origem e
 *    frequência — tudo verificado antes de chamar o modelo.
 * 3. **A resposta é validada antes de chegar ao ecrã.** Um modelo que devolva
 *    algo fora do formato não passa; o cliente cai no motor local.
 * 4. **Nada do conteúdo é registado.** Nem mensagens, nem perfil, nem contexto,
 *    nem a chave. Os logs guardam códigos, não pessoas.
 */

import { askClaude, DEFAULT_MODEL } from './anthropic';
import {
  clientIp, corsHeaders, fail, json, rateLimited, type Env,
} from './http';
import { MAX_BODY_BYTES, requestSchema } from './schema';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get('origin');
    const cors = corsHeaders(origin, env);
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      // Sem cabeçalhos de CORS, o browser recusa por si: uma origem
      // desconhecida nem chega a poder perguntar.
      return new Response(null, { status: Object.keys(cors).length > 0 ? 204 : 403, headers: cors });
    }

    if (url.pathname === '/health') {
      return json({ ok: true, configured: Boolean(env.ANTHROPIC_API_KEY) }, 200, cors);
    }

    if (url.pathname !== '/api/coach') return fail('not_found', 404, cors);
    if (request.method !== 'POST') return fail('method_not_allowed', 405, cors);

    // Uma origem fora da lista não passa daqui, mesmo que o browser tenha
    // deixado o pedido sair (curl, por exemplo, ignora CORS).
    if (origin && Object.keys(cors).length === 0) return fail('forbidden_origin', 403, cors);

    if (!env.ANTHROPIC_API_KEY) return fail('not_configured', 503, cors);

    const contentType = request.headers.get('content-type') ?? '';
    if (!contentType.includes('application/json')) {
      return fail('unsupported_media_type', 415, cors);
    }

    const declared = Number(request.headers.get('content-length') ?? '0');
    if (declared > MAX_BODY_BYTES) return fail('payload_too_large', 413, cors);

    if (rateLimited(clientIp(request))) return fail('rate_limited', 429, cors);

    const raw = await request.text();
    if (raw.length > MAX_BODY_BYTES) return fail('payload_too_large', 413, cors);

    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      return fail('invalid_json', 400, cors);
    }

    const parsed = requestSchema.safeParse(body);
    // O detalhe do erro fica de fora de propósito: descreveria os dados que
    // vieram no pedido.
    if (!parsed.success) return fail('invalid_request', 400, cors);

    const result = await askClaude(
      parsed.data,
      env.ANTHROPIC_API_KEY,
      env.ANTHROPIC_MODEL?.trim() || DEFAULT_MODEL,
    );

    if (!result.ok) {
      const status = result.failure === 'rate_limited' ? 429 : 502;
      return fail(result.failure, status, cors);
    }

    return json({ turn: result.turn }, 200, cors);
  },
};
