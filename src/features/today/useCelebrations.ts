/**
 * Quando é que uma conquista se festeja — e quando é que já se festejou.
 *
 * A regra é uma só: cada coisa celebra-se uma vez. O dia perfeito toca no
 * momento em que fecha, não a cada vez que o ecrã volta a aparecer; a sequência
 * toca quando sobe, não enquanto se mantém. O que já tocou fica guardado, e uma
 * sequência que se parte volta a poder ser celebrada do princípio.
 */

import { useEffect, useRef, useState } from 'react';
import { STREAK_MILESTONES } from '../../domain/streak';
import type { TodayModel } from '../../services/dashboard';
import { useApp, useFeedback } from '../../app/providers/appContext';

export interface Celebration {
  /** O cartão de dia perfeito deve ser mostrado. */
  perfectDay: boolean;
  /** O marco atingido agora, para o cartão o poder dizer. */
  milestone: number | null;
}

export function useCelebrations(model: TodayModel): Celebration {
  const { repos } = useApp();
  const feedback = useFeedback();
  const [milestone, setMilestone] = useState<number | null>(null);
  // Evita repetir dentro da mesma montagem, antes de o snapshot ser relido.
  const handled = useRef<string>('');

  const perfect = model.summary.isPerfectDay;
  const streak = model.streak.current;
  // Objetivos de atividade e de alimentação, contados juntos: o que interessa
  // é que um deles acabou de fechar.
  const goalsComplete = model.activityGoals.filter((goal) => goal.complete).length
    + model.nutritionGoals.filter((goal) => goal.complete).length;

  useEffect(() => {
    const settings = repos.settings.get().celebration;
    const signature = `${model.date}|${perfect}|${streak}|${goalsComplete}`;
    if (handled.current === signature) return;
    handled.current = signature;

    // A sequência caiu: o que tinha sido celebrado deixa de valer.
    if (streak < settings.streak) {
      repos.settings.updateCelebration({ streak });
      return;
    }

    if (streak > settings.streak && streak > 0) {
      const reached = STREAK_MILESTONES.includes(streak as never) ? streak : null;
      setMilestone(reached);
      // O dia fica marcado na mesma passagem: subir a sequência num dia
      // perfeito é uma celebração só, não duas — e sem isto o som do dia
      // perfeito voltava a tocar na abertura seguinte.
      repos.settings.updateCelebration({
        streak,
        ...(perfect ? { perfectDay: model.date } : {}),
      });
      feedback.play(reached ? 'perfect' : 'streak');
      return;
    }

    if (perfect && settings.perfectDay !== model.date) {
      repos.settings.updateCelebration({ perfectDay: model.date, goalsComplete });
      feedback.play('perfect');
      return;
    }

    if (goalsComplete !== settings.goalsComplete) {
      repos.settings.updateCelebration({ goalsComplete });
      // Só sobe é que se festeja; descer é apenas um dia novo a começar.
      if (goalsComplete > settings.goalsComplete) feedback.play('goal');
    }
  }, [repos, feedback, model.date, perfect, streak, goalsComplete]);

  return { perfectDay: perfect, milestone };
}
