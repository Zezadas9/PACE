/**
 * The route, drawn from the recorded track.
 *
 * Not a street map: there is no tile provider, no API key and no network call,
 * which means it renders offline and inside a WebView with a strict policy. It
 * is the shape of where you went, which is the part a summary actually needs.
 *
 * Longitude is scaled by cos(latitude) so the trace keeps its proportions —
 * without it, a route in Lisbon comes out stretched sideways by about 20%.
 */

import { useMemo, type ReactElement } from 'react';
import type { ActivityTrackPoint } from '../../core/types';

const PAD = 8;

export function RouteMap({
  track, height = 180,
}: {
  track: ActivityTrackPoint[];
  height?: number;
}): ReactElement | null {
  const path = useMemo(() => buildPath(track), [track]);
  if (!path) return null;

  return (
    <div className="route-map" style={{ height }}>
      <svg
        viewBox={`0 0 ${path.width} ${path.height}`}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label="Percurso"
      >
        {/* A wider, dimmer stroke under the line reads as a shadow on the map. */}
        <polyline className="route-shadow" points={path.points} />
        <polyline className="route-line" points={path.points} />
        <circle className="route-start" cx={path.start[0]} cy={path.start[1]} r="4.5" />
        <circle className="route-end" cx={path.end[0]} cy={path.end[1]} r="4.5" />
      </svg>
    </div>
  );
}

interface Projected {
  points: string;
  width: number;
  height: number;
  start: [number, number];
  end: [number, number];
}

function buildPath(track: ActivityTrackPoint[]): Projected | null {
  if (track.length < 2) return null;

  const midLat = track.reduce((sum, p) => sum + p.lat, 0) / track.length;
  const lonScale = Math.cos((midLat * Math.PI) / 180);

  const xs = track.map((p) => p.lon * lonScale);
  // Latitude grows northward and SVG grows downward, so it is negated.
  const ys = track.map((p) => -p.lat);

  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  const spanX = maxX - minX;
  const spanY = maxY - minY;
  // An out-and-back on one street has almost no span in one axis; a floor keeps
  // it from being divided into infinity.
  const span = Math.max(spanX, spanY, 1e-9);

  const box = 200;
  const scale = (box - PAD * 2) / span;
  const width = spanX * scale + PAD * 2;
  const height = spanY * scale + PAD * 2;

  const project = (i: number): [number, number] => [
    (xs[i]! - minX) * scale + PAD,
    (ys[i]! - minY) * scale + PAD,
  ];

  const coords = track.map((_, i) => project(i));
  return {
    points: coords.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' '),
    width: Math.max(width, 1),
    height: Math.max(height, 1),
    start: coords[0]!,
    end: coords[coords.length - 1]!,
  };
}
