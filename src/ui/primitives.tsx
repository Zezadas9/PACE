/** Design-system primitives. No screen writes a class the stylesheet lacks. */

import type { ReactElement, ReactNode } from 'react';
import { Icon, type IconName } from './Icon';
import { initials } from '../core/utils/format';

/* --- Card ----------------------------------------------------------------- */

export function Card({
  children, variant, className, onClick,
}: {
  children: ReactNode;
  variant?: 'quiet' | 'accent-card' | 'flush';
  className?: string;
  onClick?: () => void;
}): ReactElement {
  const classes = ['card', variant, className].filter(Boolean).join(' ');
  if (onClick) {
    return (
      <button type="button" className={`${classes} card-tap`} onClick={onClick}>
        {children}
      </button>
    );
  }
  return <section className={classes}>{children}</section>;
}

/* --- Section header -------------------------------------------------------- */

export function SectionHeader({
  title, actionLabel, onAction,
}: {
  title: string;
  actionLabel?: string;
  onAction?: () => void;
}): ReactElement {
  return (
    <div className="section-head">
      <h2 className="t-h2">{title}</h2>
      {/* A count is not a control: only render a button when it does something. */}
      {actionLabel && onAction ? (
        <button type="button" className="action" onClick={onAction}>
          {actionLabel}
        </button>
      ) : null}
      {actionLabel && !onAction ? <span className="action">{actionLabel}</span> : null}
    </div>
  );
}

/* --- Buttons --------------------------------------------------------------- */

export function Button({
  label, onClick, variant = 'primary', block, disabled, icon, type = 'button',
}: {
  label: string;
  onClick?: () => void;
  variant?: 'primary' | 'accent' | 'ghost' | 'outline' | 'danger';
  block?: boolean;
  disabled?: boolean;
  icon?: IconName;
  type?: 'button' | 'submit';
}): ReactElement {
  return (
    <button
      type={type}
      className={`btn btn-${variant}${block ? ' btn-block' : ''}`}
      onClick={onClick}
      disabled={disabled}
    >
      {icon ? <Icon name={icon} /> : null}
      <span>{label}</span>
    </button>
  );
}

export function IconButton({
  icon, onClick, label, hidden,
}: {
  icon: IconName;
  onClick?: () => void;
  label: string;
  hidden?: boolean;
}): ReactElement {
  return (
    <button
      type="button"
      className="btn-icon"
      onClick={onClick}
      aria-label={label}
      style={hidden ? { visibility: 'hidden' } : undefined}
    >
      <Icon name={icon} />
    </button>
  );
}

/* --- Chips and tags --------------------------------------------------------- */

export function Chip({
  label, pressed, onClick,
}: {
  label: string;
  pressed: boolean;
  onClick?: () => void;
}): ReactElement {
  const content = (
    <>
      <span className="dot" />
      <span>{label}</span>
    </>
  );
  if (!onClick) {
    return (
      <span className="chip" aria-pressed={pressed}>
        {content}
      </span>
    );
  }
  return (
    <button type="button" className="chip" aria-pressed={pressed} onClick={onClick}>
      {content}
    </button>
  );
}

export function Tag({
  label, variant,
}: {
  label: string;
  variant?: 'on-accent' | 'on-ember';
}): ReactElement {
  return <span className={`tag${variant ? ` ${variant}` : ''}`}>{label}</span>;
}

/* --- Misc ------------------------------------------------------------------- */

export function Avatar({ name, large }: { name: string; large?: boolean }): ReactElement {
  return (
    <div className={`avatar${large ? ' avatar-lg' : ''}`} aria-hidden="true">
      {initials(name)}
    </div>
  );
}

export function Divider(): ReactElement {
  return <hr className="hr" />;
}
