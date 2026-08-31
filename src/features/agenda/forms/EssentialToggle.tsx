/**
 * The switch that decides whether an item can break a streak.
 *
 * Given its own component because the wording matters more than the control:
 * users need to understand that this is a promise, not a priority.
 */

import type { ReactElement } from 'react';
import { Switch } from '../../../ui/Switch';

export function EssentialToggle({
  value, onChange,
}: {
  value: boolean;
  onChange: (value: boolean) => void;
}): ReactElement {
  return (
    <div className="essential-box">
      <Switch
        checked={value}
        onChange={onChange}
        title="Essencial para o dia perfeito"
        subtitle="Só os itens essenciais contam para a sequência. Os restantes continuam a ser registados."
      />
    </div>
  );
}
