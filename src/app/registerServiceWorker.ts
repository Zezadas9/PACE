/**
 * Regista o service worker, e trata de o manter atualizado.
 *
 * Registar não chega. Uma aplicação instalada no telemóvel não volta a disparar
 * `load` durante dias — fica suspensa e volta ao mesmo sítio — e sem uma
 * verificação explícita o utilizador pode ficar semanas com a versão antiga,
 * a ver ícones e ecrãs que já foram corrigidos. Foi exatamente o que aconteceu.
 *
 * Por isso são três coisas, e não uma:
 *
 * 1. **Registar**, em produção e em origem segura.
 * 2. **Procurar versão nova** sempre que a aplicação volta ao ecrã, com um
 *    intervalo mínimo para não pedir a mesma coisa a cada troca de separador.
 * 3. **Recarregar** quando uma versão nova toma conta da página. O service
 *    worker novo passa a servir ficheiros novos, mas o JavaScript em memória
 *    continua a ser o velho: sem o recarregamento fica-se com metade de cada.
 *
 * Saltado em desenvolvimento, onde uma cache esconderia a alteração que se
 * acabou de fazer, e em origens inseguras, onde o browser recusa de qualquer
 * maneira — o que inclui chegar ao servidor de desenvolvimento por IP da rede.
 */

/** Menos do que isto e a verificacao e ruido: o ficheiro tem 3 KB, mas a rede nao. */
const MIN_CHECK_INTERVAL_MS = 60_000;

export function registerServiceWorker(): void {
  if (!import.meta.env.PROD) return;
  if (!('serviceWorker' in navigator)) return;
  if (!window.isSecureContext) return;

  let lastCheck = 0;
  let reloading = false;

  /*
   * Uma versão nova assumiu o controlo. Recarregar é o que a torna visível.
   *
   * A guarda existe porque `controllerchange` também dispara no primeiro
   * registo de todos, e recarregar aí seria recarregar sem motivo — e um ciclo,
   * se algo corresse mal.
   */
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading || !navigator.serviceWorker.controller) return;
    reloading = true;
    window.location.reload();
  });

  window.addEventListener('load', () => {
    void navigator.serviceWorker
      // Relativo, para funcionar a partir de um subcaminho no GitHub Pages.
      // `updateViaCache: 'none'` impede o browser de servir um sw.js em cache,
      // que era outra forma de ficar preso na versão antiga.
      .register('./sw.js', { scope: './', updateViaCache: 'none' })
      .then((registration) => {
        lastCheck = Date.now();

        const check = (): void => {
          if (document.visibilityState !== 'visible') return;
          if (Date.now() - lastCheck < MIN_CHECK_INTERVAL_MS) return;
          lastCheck = Date.now();
          void registration.update().catch(() => {
            // Sem rede não há versão nova. Não é um erro da aplicação.
          });
        };

        document.addEventListener('visibilitychange', check);
        window.addEventListener('focus', check);
      })
      .catch(() => {
        // Funcionar offline é um bónus; falhar o registo não é um erro da app.
      });
  });
}
