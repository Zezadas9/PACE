/**
 * A voz, com a preferência de quem a ouve.
 *
 * `say` lê a preferência no momento em que fala, e não no render: desligar a
 * voz a meio de uma frase longa não pode deixar a seguinte sair na mesma.
 * E é estável entre renders, para os efeitos que dependem dela não recomeçarem
 * a cada segundo do relógio da sessão.
 */

import { useCallback, useMemo } from 'react';
import { useApp, useStoreVersion } from '../../app/providers/appContext';

export interface Voice {
  on: boolean;
  supported: boolean;
  say: (text: string, interrupt?: boolean) => void;
  toggle: () => void;
}

export function useVoice(): Voice {
  const { repos, platform } = useApp();
  const version = useStoreVersion();
  const supported = platform.voice.supported();
  const preferred = useMemo(() => repos.settings.get().feedback.voice, [repos, version]);

  const say = useCallback((text: string, interrupt = false) => {
    if (!repos.settings.get().feedback.voice) return;
    platform.voice.speak(text, { interrupt });
  }, [repos, platform]);

  const toggle = useCallback(() => {
    const next = !repos.settings.get().feedback.voice;
    repos.settings.updateFeedback({ voice: next });
    if (next) {
      // O toque que liga a voz é também o que a desbloqueia no iPhone.
      platform.voice.unlock();
      platform.voice.speak('Voz ligada.', { interrupt: true });
    } else {
      platform.voice.cancel();
    }
  }, [repos, platform]);

  return { on: preferred && supported, supported, say, toggle };
}
