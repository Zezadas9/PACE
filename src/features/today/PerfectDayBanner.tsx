/**
 * The perfect-day celebration.
 *
 * Deliberately small: one card that fades up, one check that draws itself, and
 * then it just sits there. No confetti, no sound, no blocking overlay — the
 * reward for a good day should not be an interruption.
 */

import type { ReactElement } from 'react';
import { Icon } from '../../ui/Icon';

export function PerfectDayBanner({ streak }: { streak: number }): ReactElement {
  return (
    <div className="perfect-banner" role="status">
      <span className="glyph" aria-hidden="true">
        <Icon name="check" />
      </span>
      <div>
        <div className="title">Perfect day.</div>
        <div className="body">
          {streak > 1
            ? `${streak} dias seguidos. Tudo o que era essencial, feito.`
            : 'Tudo o que era essencial hoje, feito.'}
        </div>
      </div>
    </div>
  );
}
