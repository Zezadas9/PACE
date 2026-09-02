/**
 * Icon set. One stroke language: 24x24 grid, 1.6 weight, round caps. Colour
 * always comes from `currentColor`, so an icon inherits its context.
 */

import type { ReactElement, ReactNode } from 'react';

export type IconName =
  | 'sun' | 'calendar' | 'dumbbell' | 'run' | 'leaf' | 'user' | 'check'
  | 'chevron' | 'chevronLeft' | 'flame' | 'heart' | 'repeat' | 'trendDown'
  | 'scale' | 'sparkle' | 'plus' | 'clock' | 'utensils' | 'target'
  | 'activity' | 'trash' | 'lock' | 'close' | 'bell' | 'bellOff' | 'star'
  | 'trophy' | 'chart' | 'briefcase' | 'graduation' | 'stethoscope' | 'users'
  | 'home' | 'wallet' | 'edit' | 'today' | 'minus' | 'walk' | 'bike'
  | 'mountain' | 'pause' | 'play' | 'stop' | 'pin' | 'route' | 'flag'
  | 'camera' | 'image';

const PATHS: Record<IconName, ReactNode> = {
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </>
  ),
  calendar: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="3" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </>
  ),
  dumbbell: <path d="M4 9v6M7 7v10M17 7v10M20 9v6M7 12h10" />,
  run: (
    <>
      <circle cx="15.5" cy="4.5" r="1.8" />
      <path d="M13 21l1.6-5.2-3-2.6.9-4.7 3.3 3 3.2.8M11.4 8.5L8 9.7l-.9 3.1M12.2 15.8L8.6 17l-2.1 3.6" />
    </>
  ),
  leaf: (
    <>
      <path d="M4 20c0-8 5-13 16-14 0 10-5 15-13 15H4z" />
      <path d="M9 15c2-3 5-5 8-6" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="3.6" />
      <path d="M4.5 20a7.5 7.5 0 0 1 15 0" />
    </>
  ),
  check: <path d="M4.5 12.5l5 5 10-11" />,
  chevron: <path d="M9 5l7 7-7 7" />,
  chevronLeft: <path d="M15 5l-7 7 7 7" />,
  flame: <path d="M12 3c3.5 4 6 6.2 6 10a6 6 0 0 1-12 0c0-2 .8-3.4 2-4.8.4 1.2 1.2 2 2.2 2.3C10 8.4 10.6 5.6 12 3z" />,
  heart: <path d="M12 20s-7-4.4-7-9.2A4 4 0 0 1 12 8a4 4 0 0 1 7-.2c0 4.8-7 12.2-7 12.2z" />,
  repeat: (
    <>
      <path d="M4 9a5 5 0 0 1 5-5h11M20 15a5 5 0 0 1-5 5H4" />
      <path d="M17 1l3 3-3 3M7 17l-3 3 3 3" />
    </>
  ),
  trendDown: (
    <>
      <path d="M3 7l6 6 4-4 8 8" />
      <path d="M21 12v5h-5" />
    </>
  ),
  scale: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="4" />
      <path d="M12 8v3M9.5 12.5h5" />
    </>
  ),
  sparkle: (
    <>
      <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3z" />
      <path d="M18.5 16.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7.7-1.8z" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  utensils: (
    <>
      <path d="M6 3v8a2 2 0 0 0 4 0V3M8 11v10" />
      <path d="M17 3c-1.5 1.5-2 3-2 5.5V13h3V3zM16.5 13v8" />
    </>
  ),
  target: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="12" cy="12" r="0.8" />
    </>
  ),
  activity: <path d="M3 12h4l3 8 4-16 3 8h4" />,
  trash: (
    <>
      <path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
      <path d="M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13" />
    </>
  ),
  close: <path d="M6 6l12 12M18 6L6 18" />,
  camera: (
    <>
      <path d="M4 8.5h3l1.5-2h7L17 8.5h3a1 1 0 0 1 1 1V18a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5a1 1 0 0 1 1-1z" />
      <circle cx="12" cy="13" r="3.5" />
    </>
  ),
  image: (
    <>
      <path d="M5.5 5h13a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z" />
      <path d="M4 16l4.5-4.5 3.5 3.5 3-3L20 16" />
      <path d="M9 8.6a.9.9 0 1 0 0 1.8.9.9 0 0 0 0-1.8z" />
    </>
  ),
  bell: (
    <>
      <path d="M18 9a6 6 0 0 0-12 0c0 5-2 6-2 6h16s-2-1-2-6z" />
      <path d="M10.3 20a2 2 0 0 0 3.4 0" />
    </>
  ),
  bellOff: (
    <>
      <path d="M8.7 4.7A6 6 0 0 1 18 9c0 2.2.4 3.7.9 4.7M6.3 6.3A6 6 0 0 0 6 9c0 5-2 6-2 6h12" />
      <path d="M10.3 20a2 2 0 0 0 3.4 0M3 3l18 18" />
    </>
  ),
  star: <path d="M12 3.5l2.6 5.6 6 .8-4.4 4.2 1.1 6-5.3-3-5.3 3 1.1-6L3.4 9.9l6-.8L12 3.5z" />,
  trophy: (
    <>
      <path d="M8 4h8v5a4 4 0 0 1-8 0V4z" />
      <path d="M8 5.5H5.5A2.5 2.5 0 0 0 8 10M16 5.5h2.5A2.5 2.5 0 0 1 16 10" />
      <path d="M12 13v3M9 20h6M10 16h4l.5 4h-5l.5-4z" />
    </>
  ),
  chart: (
    <>
      <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
    </>
  ),
  briefcase: (
    <>
      <rect x="3" y="7" width="18" height="13" rx="2.5" />
      <path d="M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7M3 12h18" />
    </>
  ),
  graduation: (
    <>
      <path d="M12 4l10 5-10 5-10-5 10-5z" />
      <path d="M6 11.5V16c0 1.7 2.7 3 6 3s6-1.3 6-3v-4.5" />
    </>
  ),
  stethoscope: (
    <>
      <path d="M6 3v5a4 4 0 0 0 8 0V3" />
      <path d="M10 12v3a5 5 0 0 0 10 0v-1" />
      <circle cx="20" cy="12" r="2" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3 20a6 6 0 0 1 12 0M16 5.2a3.2 3.2 0 0 1 0 5.6M17 20a5.5 5.5 0 0 0-2-4.3" />
    </>
  ),
  home: <path d="M4 10.5L12 4l8 6.5V20a1 1 0 0 1-1 1h-4v-6h-6v6H5a1 1 0 0 1-1-1v-9.5z" />,
  wallet: (
    <>
      <rect x="3" y="6" width="18" height="14" rx="3" />
      <path d="M3 10h18M16.5 15h1.5" />
    </>
  ),
  edit: (
    <>
      <path d="M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17v3z" />
      <path d="M14.5 6.5l3 3" />
    </>
  ),
  today: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="3" />
      <path d="M3 10h18M8 3v4M16 3v4" />
      <circle cx="12" cy="15" r="2" />
    </>
  ),
  minus: <path d="M5 12h14" />,
  walk: (
    <>
      <circle cx="13" cy="4.2" r="1.8" />
      <path d="M11 21l1.4-5.6-2.4-2.3.8-4.4 3 2.2 2.6.7" />
      <path d="M10.8 8.7 8 10l-.8 2.8M12.4 15.4 9.8 16.6 8 21" />
    </>
  ),
  bike: (
    <>
      <circle cx="5.5" cy="17" r="3.5" />
      <circle cx="18.5" cy="17" r="3.5" />
      <circle cx="14.5" cy="4.5" r="1.5" />
      <path d="M5.5 17 10 9h4l4.5 8M8.5 9H13l2.5 4" />
    </>
  ),
  mountain: (
    <>
      <path d="M2.5 19 9 7.5l4 6.5 2-3 6.5 8z" />
      <path d="M7 13.5 9 12l1.5 2.5" />
    </>
  ),
  pause: <path d="M9 5v14M15 5v14" />,
  play: <path d="M7 4.5 19 12 7 19.5z" />,
  stop: <rect x="6" y="6" width="12" height="12" rx="2" />,
  pin: (
    <>
      <path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11z" />
      <circle cx="12" cy="10" r="2.6" />
    </>
  ),
  route: (
    <>
      <circle cx="5.5" cy="18.5" r="2.5" />
      <circle cx="18.5" cy="5.5" r="2.5" />
      <path d="M8 18.5h5a4 4 0 0 0 0-8H11a4 4 0 0 1 0-8h5" />
    </>
  ),
  flag: (
    <>
      <path d="M5 21V4" />
      <path d="M5 5h11l-2 3.5L16 12H5z" />
    </>
  ),
  lock: (
    <>
      <rect x="4.5" y="10" width="15" height="11" rx="3" />
      <path d="M8 10V7.5a4 4 0 0 1 8 0V10" />
    </>
  ),
};

export function Icon({ name, size }: { name: IconName; size?: number }): ReactElement {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[name]}
    </svg>
  );
}

