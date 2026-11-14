import type { Point, Rect } from './sceneGeometry';
export function relativeHandlePoint(point: Point, box: Rect, margin = 0) {
  if (box.width <= 0 || box.height <= 0) return undefined;
  const u = (point.x - box.x) / box.width, v = (point.y - box.y) / box.height;
  return [u,v].every(n => Number.isFinite(n) && n >= -margin && n <= 1+margin) ? {u,v} : undefined;
}
export function followHandlePoint(point: {u:number;v:number}, box: Rect): Point {
  return {x:box.x + point.u * box.width, y:box.y + point.v * box.height};
}
// A screen-overlap heuristic, not a measurement of real physical contact.
export function createGripSuccessGate() {
  let candidate: {id:number;since:number} | undefined;
  return {
    reset() { candidate = undefined; },
    update(id: number | undefined, box: Rect | undefined, fingers: {thumb:Point;index:Point} | undefined, now: number, enabled: boolean) {
      const inside = (p:Point) => !!box && p.x >= box.x - box.width*.1 && p.x <= box.x + box.width*1.1
        && p.y >= box.y-box.height*.1 && p.y <= box.y+box.height*1.1;
      if (!enabled || id === undefined || !fingers || !inside(fingers.thumb) || !inside(fingers.index)) { candidate = undefined; return false; }
      if (candidate?.id !== id) candidate = {id,since:now};
      return now-candidate.since >= 1000;
    },
  };
}
