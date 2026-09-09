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

/**
 * O identificador da build, substituido pelo Vite em tempo de compilacao.
 *
 * Aparece no ecra do perfil. Serve para saber que versao esta mesmo a correr
 * num telemovel, em vez de o adivinhar.
 */
declare const __BUILD_ID__: string;
