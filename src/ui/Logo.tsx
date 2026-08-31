/**
 * The PACE mark.
 *
 * Drawn as strokes rather than filled outlines so it inherits `currentColor`,
 * stays crisp at any size, and can animate its own construction — the boot
 * screen draws it in with a dash offset, which a raster logo could never do.
 *
 * Geometry: the bowl of the P, a stem that falls to a point, and an arrow
 * rising back out through the counter. Progress, every day.
 */

import type { ReactElement } from 'react';

const STROKE = 21;
/** The arrow is drawn lighter than the letterform, as in the original mark. */
const ARROW_STROKE = 14;
const RATIO = 250 / 226;

export function PaceMark({
  size = 64, animated = false, title,
}: {
  size?: number;
  /** Draws itself in once, for the splash and the welcome screen. */
  animated?: boolean;
  title?: string;
}): ReactElement {
  return (
    <svg
      className={`pace-mark-svg${animated ? ' is-drawing' : ''}`}
      width={size}
      height={size * RATIO}
      viewBox="0 0 226 250"
      fill="none"
      stroke="currentColor"
      strokeWidth={STROKE}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={title ? 'img' : 'presentation'}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      {/* The bowl, open at the bottom-left so the arrow can pass through. */}
      <path className="mark-bowl" d="M25 72V39a16 16 0 0 1 16-16h85a75 75 0 0 1 0 150H96" />
      {/* Stem down to the point, then the diagonal back up. */}
      <path className="mark-stem" d="M25 115v104" />
      {/* The rising diagonal and its head, in the lighter weight. */}
      <path className="mark-arrow" d="M27 224 120 117" strokeWidth={ARROW_STROKE} />
      <path className="mark-head" d="M91 117h29v29" strokeWidth={ARROW_STROKE} />
    </svg>
  );
}

/** Mark, wordmark and tagline — the full lockup. */
export function PaceLogo({
  size = 72, tagline = true, animated = false,
}: {
  size?: number;
  tagline?: boolean;
  animated?: boolean;
}): ReactElement {
  return (
    <div className="pace-logo">
      <PaceMark size={size} animated={animated} title="PACE" />
      <div className="pace-wordmark" aria-hidden="true">PACE</div>
      {tagline ? (
        <div className="pace-tagline" aria-hidden="true">Progress, every day.</div>
      ) : null}
    </div>
  );
}
