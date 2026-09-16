/**
 * O ecrã não adormece enquanto uma sessão decorre.
 *
 * Com o ecrã apagado, o telemóvel suspende a página — e a voz, o relógio e o
 * GPS param com ela. Uma corrida guiada que fica muda ao fim de trinta
 * segundos não guia ninguém.
 *
 * O sistema larga o pedido sempre que a página deixa de estar à vista, por
 * isso volta-se a pedir quando ela regressa. Onde a API não existe, não se faz
 * nada: o resto da sessão continua a funcionar.
 */

import { useEffect } from 'react';

export function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active || typeof navigator === 'undefined' || !('wakeLock' in navigator)) return;

    let lock: WakeLockSentinel | null = null;
    let stopped = false;

    const request = async (): Promise<void> => {
      if (document.visibilityState !== 'visible') return;
      try {
        const next = await navigator.wakeLock.request('screen');
        if (stopped) {
          void next.release();
          return;
        }
        lock = next;
      } catch {
        // Bateria fraca ou poupança de energia: o sistema pode recusar.
      }
    };

    const onVisibility = (): void => { void request(); };

    void request();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      stopped = true;
      document.removeEventListener('visibilitychange', onVisibility);
      void lock?.release().catch(() => {});
    };
  }, [active]);
}
