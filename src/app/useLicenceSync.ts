/**
 * Mantem a assinatura em dia, sem dar nas vistas.
 *
 * Uma pergunta ao servidor quando a aplicacao abre e quando volta ao ecra, e
 * so quando vale a pena — o cartao vale dias, e perguntar a cada abertura era
 * ruido. Sem rede nao acontece nada: fica o cartao que ja estava, e a
 * aplicacao continua a abrir ate ele expirar.
 */

import { useEffect } from 'react';
import { shouldSync, syncLicence } from '../services/subscription';
import { useApp } from './providers/appContext';

export function useLicenceSync(): void {
  const { repos, platform } = useApp();

  useEffect(() => {
    const sync = (): void => {
      if (!shouldSync(repos.settings.get().licence)) return;
      void syncLicence(repos, platform).catch(() => {});
    };

    sync();
    return platform.device.onAppStateChange((state) => {
      if (state === 'active') sync();
    });
  }, [repos, platform]);
}
