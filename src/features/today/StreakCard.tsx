/** The four streak states: current, best, perfect days, consistency. */

import type { ReactElement } from 'react';
import { useCountUpInt } from '../../ui/useCountUp';
import { percent } from '../../core/utils/format';
import type { StreakStats } from '../../domain/streak';
import { Icon, type IconName } from '../../ui/Icon';

export function StreakCard({ stats }: { stats: StreakStats }): ReactElement {
  return (
    <div className="streak-grid">
      <CountStat icon="flame" hot label="Sequência" value={stats.current} />
      <CountStat icon="trophy" label="Melhor" value={stats.best} />
      <CountStat icon="today" label="Perfeitos" value={stats.perfectDays} />
      <Stat
        icon="chart"
        label="Consistência"
        value={stats.qualifyingDays === 0 ? '—' : percent(stats.consistency)}
      />
    </div>
  );
}

function CountStat({
  icon, label, value, hot,
}: {
  icon: IconName;
  label: string;
  value: number;
  hot?: boolean;
}): ReactElement {
  return <Stat icon={icon} label={label} value={String(useCountUpInt(value))} hot={hot} />;
}

function Stat({
  icon, label, value, hot,
}: {
  icon: IconName;
  label: string;
  value: string;
  hot?: boolean;
}): ReactElement {
  return (
    <div className={`streak-stat${hot ? ' hot' : ''}`}>
      <span className="glyph" aria-hidden="true">
        <Icon name={icon} />
      </span>
      <span>
        <span className="value">{value}</span>
        <span className="label" style={{ display: 'block' }}>{label}</span>
      </span>
    </div>
  );
}
