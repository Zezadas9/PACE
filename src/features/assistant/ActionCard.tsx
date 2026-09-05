/**
 * PACE — a ação que acompanha uma resposta.
 *
 * O assistente não é um chat com conselhos: cada resposta que pode virar
 * qualquer coisa traz um cartão com **o que exatamente** vai acontecer, e um
 * botão. Ver antes de aceitar é o ponto — sem isto seria uma coisa a mexer na
 * agenda de alguém com base num palpite.
 */

import type { ReactElement } from 'react';
import type { CoachAction } from '../../domain/coach/types';
import { WEEKDAY_NAMES } from '../../domain/coach/agenda-plan';

/** "seg, qua, sex" — os dias como se leem, não como estão guardados. */
function describeDays(weekdays: number[]): string {
  if (weekdays.length === 0) return 'sem dia marcado';
  if (weekdays.length === 7) return 'todos os dias';
  return weekdays
    .slice()
    .sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7))
    .map((day) => WEEKDAY_NAMES[day]?.slice(0, 3) ?? '')
    .join(', ');
}
import { Button } from '../../ui/primitives';

function summary(action: CoachAction): string[] {
  switch (action.kind) {
    case 'create_workout': {
      const main = action.draft.blocks.filter((block) => block.section === 'main');
      return [
        `${action.draft.estimatedMin} minutos · ${main.length} exercícios`,
        ...main.slice(0, 6).map((block) => `${block.exerciseName} — ${amount(block)}`),
        main.length > 6 ? `… e mais ${main.length - 6}` : '',
      ].filter(Boolean);
    }
    case 'create_habits':
      return action.drafts.map((draft) => {
        const when = draft.frequency === 'daily' ? 'todos os dias' : describeDays(draft.weekdays);
        return `${draft.title} — ${when}${draft.timeOfDay ? `, ${draft.timeOfDay}` : ''}`;
      });
    case 'create_run_plan':
      return [
        `${action.draft.weeks} semanas · ${action.draft.sessions.length} sessões`,
        `Começa a ${action.draft.startDate.split('-').reverse().join('/')}`,
        'Sobe no máximo 10% por semana.',
      ];
    case 'apply_schedule': {
      const linhas = action.draft.items.slice(0, 5).map((item) => (item.time == null
        ? `${item.label} — todos os dias`
        : `${WEEKDAY_NAMES[item.weekday]} ${item.time} — ${item.label}`));
      return [
        action.draft.summary.length > 0 ? `Vou adicionar: ${action.draft.summary.join(', ')}` : '',
        ...linhas,
        action.draft.items.length > 5 ? `… e mais ${action.draft.items.length - 5}` : '',
        action.draft.untouched.length > 0
          ? `${action.draft.untouched.length} compromissos ficam como estão`
          : '',
      ].filter(Boolean);
    }
    case 'move_workout':
      return [
        `De ${WEEKDAY_NAMES[action.from]} para ${WEEKDAY_NAMES[action.to]}`,
        'Os outros dias do plano não mudam.',
      ];
    default:
      return [];
  }
}

/**
 * Quantas séries, e de quê.
 *
 * Nem todos os exercícios se contam por repetições: um exercício de condução
 * de bola ou uma prancha contam-se por tempo, e mostrar "4×—" a esses era
 * mostrar um traço onde havia um número.
 */
function amount(block: { sets: number; reps: number | null; durationSec: number | null }): string {
  if (block.reps != null) return `${block.sets}×${block.reps}`;
  if (block.durationSec != null) {
    const minutos = Math.round(block.durationSec / 60);
    return minutos >= 1 ? `${block.sets}× ${minutos} min` : `${block.sets}× ${block.durationSec} s`;
  }
  return `${block.sets} séries`;
}

export function ActionCard({
  action, onRun, busy,
}: {
  action: CoachAction;
  onRun: (action: CoachAction) => void;
  busy: boolean;
}): ReactElement {
  const lines = summary(action);

  if (action.kind === 'open') {
    return (
      <div className="coach-action">
        <Button variant="outline" label={action.label} onClick={() => onRun(action)} />
      </div>
    );
  }

  return (
    <div className="coach-action coach-action-card">
      <p className="t-eyebrow">Proposta</p>
      <ul>
        {lines.map((line, index) => <li key={index}>{line}</li>)}
      </ul>
      <Button
        variant="primary"
        block
        label={action.label}
        disabled={busy}
        onClick={() => onRun(action)}
      />
      <p className="t-sm muted-2">Só acontece depois de confirmares.</p>
    </div>
  );
}
