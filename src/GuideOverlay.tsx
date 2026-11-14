import type { Rect } from './sceneGeometry';
import type { SceneState } from './sceneUI';

type Point = { x: number; y: number };
const box = (rect: Rect) => ({ left: rect.x, top: rect.y, width: rect.width, height: rect.height });
const corners = <><i className="corner top-left" /><i className="corner top-right" /><i className="corner bottom-left" /><i className="corner bottom-right" /></>;

// The ring tightens in three steps as the on-screen gap shrinks. The gap is a 2D screen ratio,
// not a distance, so no number is shown and "aligned" never means the object was touched.
export function reachRadius(gap: number) {
  return gap > .2 ? 44 : gap > .08 ? 32 : 22;
}

/** Everything drawn over the camera to relate the phone, the target and the hand. Presentational only. */
export function GuideOverlay({ state, viewport, target, others, centered, lostSide, hand, destination, gap = 0, aligned = false, handle }: {
  state: SceneState; viewport: { width: number; height: number };
  target?: { rect: Rect; missing?: boolean }; others: Rect[];
  centered: boolean; lostSide?: 'left' | 'right';
  /** Index fingertip and the point it is guided to, both in viewport pixels. */
  hand?: Point; destination?: Point; gap?: number; aligned?: boolean;
  handle?: { point: Point; label: string };
}) {
  const lost = state === 'lost';
  const reaching = state === 'guiding' && !!hand && !!destination;
  const radius = aligned ? 22 : reachRadius(gap);
  // The line stops at the ring so the destination itself stays unobstructed.
  const span = reaching ? Math.hypot(destination.x - hand.x, destination.y - hand.y) : 0;
  const lineEnd = reaching && span > radius ? { x: destination.x - (destination.x - hand.x) * radius / span, y: destination.y - (destination.y - hand.y) * radius / span } : undefined;
  return <>
    <div className="guide-overlay" aria-hidden="true">
      {state === 'found' && !centered && <div className="center-zone">{corners}</div>}
      {others.map((rect, index) => <div key={index} className="other-box" style={box(rect)} />)}
      {target && !lost && <div className={`target-box${target.missing ? ' is-missing' : ''}`} style={box(target.rect)}>{corners}</div>}
      {lost && (['left', 'right'] as const).filter(side => !lostSide || side === lostSide).map(side => <div key={side} className={`lost-edge ${side}`}>
        <svg viewBox="0 0 24 24" className="hud-icon"><path d="M15.41 7.41 14 6l-6 6 6 6 1.41-1.41L10.83 12z" /></svg>
      </div>)}
    </div>
    {reaching && <svg className={`reach-link${aligned ? ' is-aligned' : ''}`} width={viewport.width} height={viewport.height} aria-hidden="true">
      {!aligned && lineEnd && <>
        <line className="reach-line-shadow" x1={hand.x} y1={hand.y} x2={lineEnd.x} y2={lineEnd.y} />
        <line className="reach-line" x1={hand.x} y1={hand.y} x2={lineEnd.x} y2={lineEnd.y} />
      </>}
      <circle className="reach-ring-shadow" cx={destination.x} cy={destination.y} r={radius} />
      <circle className="reach-ring" cx={destination.x} cy={destination.y} r={radius} />
      {aligned && <path className="reach-check" d={`M${destination.x - 9} ${destination.y + 1} l6 6 l12 -13`} />}
    </svg>}
    {handle && <div className={`handle-point${state === 'guiding' ? ' guiding' : ''}`} style={{ left: handle.point.x, top: handle.point.y }} aria-label="서버가 추정한 잡을 위치">
      <span>{handle.label}</span>
    </div>}
  </>;
}
