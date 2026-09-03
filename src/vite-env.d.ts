/// <reference types="vite/client" />

/**
 * As variáveis de ambiente do frontend.
 *
 * Só entra aqui o que pode viver num bundle público. `VITE_PACE_API_URL` é o
 * endereço do Worker da PACE — um URL, não um segredo. A chave da Anthropic
 * vive no Worker, como secret, e nunca chega ao browser.
 */
interface ImportMetaEnv {
  readonly VITE_PACE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
