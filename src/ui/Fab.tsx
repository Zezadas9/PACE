/** The one primary action on a screen. Sits above the tab bar, thumb-reachable. */

import type { ReactElement } from 'react';
import { Icon, type IconName } from './Icon';

export function Fab({
  label, onClick, icon = 'plus',
}: {
  label: string;
  onClick: () => void;
  icon?: IconName;
}): ReactElement {
  return (
    <button type="button" className="fab" onClick={onClick} aria-label={label}>
      <Icon name={icon} />
    </button>
  );
}
