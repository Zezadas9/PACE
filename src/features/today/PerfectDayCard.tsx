/**
 * A confirmação do dia perfeito.
 *
 * Não é um "100%": é a lista do que foi cumprido, a sequência que isso
 * alimenta, e o recorde que está por perto. O dia perfeito é a coisa mais
 * difícil de conseguir na PACE e devia dar essa sensação — sem confetes, sem
 * bloquear o ecrã, e sem nunca aparecer por carregar num botão. Chega aqui
 * porque as contas fecharam.
 */

import { useEffect, useState, type ReactElement } from 'react';
import type { EssentialItem } from '../../domain/progress';
import type { StreakDetail } from '../../domain/streak';
import { BrandIcon, streakIcon } from '../../ui/BrandIcon';
import { Icon } from '../../ui/Icon';

export function PerfectDayCard({
  essentials, streak, milestone,
}: {
  essentials: EssentialItem[];
  streak: StreakDetail;
  /** O marco alcançado hoje, quando é o caso. */
  milestone: number | null;
}): ReactElement {
  // Entra num quadro seguinte, para a animação começar depois de montar.
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <section className="perfect-card" data-shown={String(shown)} role="status">
      <div className="perfect-crown">
        <BrandIcon name="melhor-sequencia" size={54} float />
      </div>

      <p className="t-eyebrow">Dia perfeito</p>
      <h2 className="perfect-title">
        {milestone ? `${milestone} dias consecutivos.` : 'Cumpriste todos os teus essenciais.'}
      </h2>

      <ul className="perfect-list">
        {essentials.map((item, index) => (
          <li key={item.id} style={{ animationDelay: `${120 + index * 70}ms` }}>
            <span className="tick" aria-hidden="true"><Icon name="check" /></span>
            <span>{item.title}</span>
          </li>
        ))}
      </ul>

      <div className="perfect-streak">
        <span>
          <BrandIcon name={streakIcon(streak.current)} size={24} />
          Sequência: {streak.current} {streak.current === 1 ? 'dia' : 'dias'}
        </span>
        <span>
          <BrandIcon name="melhor-sequencia" size={24} />
          Melhor: {streak.best} {streak.best === 1 ? 'dia' : 'dias'}
        </span>
      </div>
    </section>
  );
}
