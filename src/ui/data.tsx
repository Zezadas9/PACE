/** Components that present a value: metrics, progress, list rows, empty states. */

import { useEffect, useState, type ReactElement, type ReactNode } from 'react';
import { Icon, type IconName } from './Icon';
import { Button } from './primitives';

export function Metric({
  label, value, suffix,
}: {
  label: string;
  value: string;
  suffix?: string;
}): ReactElement {
  return (
    <div className="metric">
      <div className="value">
        <span>{value}</span>
        {suffix ? <span className="suffix">{suffix}</span> : null}
      </div>
      <div className="label">{label}</div>
    </div>
  );
}

export function ProgressBar({
  ratio, variant,
}: {
  ratio: number;
  variant?: 'ember';
}): ReactElement {
  const percent = Math.round(Math.min(1, Math.max(0, ratio)) * 100);
  return (
    <div
      className={`bar${variant ? ` ${variant}` : ''}`}
      role="progressbar"
      aria-valuenow={percent}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <i style={{ width: `${percent}%` }} />
    </div>
  );
}

/**
 * Progress ring. The arc is drawn with a dash offset so the stylesheet
 * animates it — no per-frame JavaScript.
 */
export function Ring({
  progress, size = 84, stroke = 7, label, sublabel, ariaLabel,
}: {
  progress: number;
  size?: number;
  stroke?: number;
  label?: string;
  sublabel?: string;
  ariaLabel?: string;
}): ReactElement {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const value = Math.min(1, Math.max(0, progress));

  // Start empty and fill on the next frame, so the arc sweeps in rather than
  // being there already. The CSS transition on stroke-dashoffset does the work.
  const [drawn, setDrawn] = useState(0);
  useEffect(() => {
    const id = requestAnimationFrame(() => setDrawn(value));
    return () => cancelAnimationFrame(id);
  }, [value]);

  return (
    <div className="ring-wrap">
      <svg
        className="ring"
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label={ariaLabel ?? `${Math.round(value * 100)}%`}
      >
        <circle className="track" cx={size / 2} cy={size / 2} r={radius} strokeWidth={stroke} />
        <circle
          className="value"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={stroke}
          strokeDasharray={circumference.toFixed(2)}
          strokeDashoffset={(circumference * (1 - drawn)).toFixed(2)}
        />
      </svg>
      {label ? (
        <div className="ring-label">
          <div>{label}</div>
          {sublabel ? <div className="ring-sublabel">{sublabel}</div> : null}
        </div>
      ) : null}
    </div>
  );
}

export function Row({
  title, sub, trail, icon, tick, done, chevron, hue, onClick,
}: {
  title: string;
  sub?: string | null;
  trail?: string | null;
  icon?: IconName;
  tick?: boolean;
  done?: boolean;
  chevron?: boolean;
  /** Category name from styles/hues.css; tints the leading glyph. */
  hue?: string;
  onClick?: () => void;
}): ReactElement {
  const content = (
    <>
      {tick ? (
        <span className="tick" aria-hidden="true">
          <Icon name="check" />
        </span>
      ) : null}
      {!tick && icon ? (
        <span className="lead">
          <Icon name={icon} />
        </span>
      ) : null}
      <span className="grow">
        <span className="title">{title}</span>
        {sub ? <span className="sub">{sub}</span> : null}
      </span>
      {trail ? <span className="trail">{trail}</span> : null}
      {chevron ? (
        <span className="trail">
          <Icon name="chevron" />
        </span>
      ) : null}
    </>
  );

  if (!onClick) {
    return (
      <div className="row-item" data-done={String(!!done)} data-hue={hue}>
        {content}
      </div>
    );
  }
  return (
    <button
      type="button"
      className="row-item"
      data-done={String(!!done)}
      data-hue={hue}
      aria-pressed={tick ? !!done : undefined}
      onClick={onClick}
    >
      {content}
    </button>
  );
}

export function Rows({ children }: { children: ReactNode }): ReactElement {
  return <div className="rows">{children}</div>;
}

export function EmptyState({
  icon, title, body, actionLabel, onAction,
}: {
  icon?: IconName;
  title: string;
  body?: string;
  actionLabel?: string;
  onAction?: () => void;
}): ReactElement {
  return (
    <div className="empty">
      {icon ? (
        <div className="glyph">
          <Icon name={icon} />
        </div>
      ) : null}
      <div className="title">{title}</div>
      {body ? <p className="body">{body}</p> : null}
      {actionLabel && onAction ? (
        <Button variant="ghost" label={actionLabel} onClick={onAction} />
      ) : null}
    </div>
  );
}
