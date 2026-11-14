export type Point = { x: number; y: number };
export type Rect = Point & { width: number; height: number };

export function projectPoint(point: Point, source: Rect, viewport: Rect): Point {
  const scale = Math.max(viewport.width / source.width, viewport.height / source.height);
  return { x: point.x * source.width * scale - (source.width * scale - viewport.width) / 2,
    y: point.y * source.height * scale - (source.height * scale - viewport.height) / 2 };
}

export function projectBox(box: Rect, source: Rect, viewport: Rect): Rect {
  const start = projectPoint(box, source, viewport);
  const end = projectPoint({ x: box.x + box.width, y: box.y + box.height }, source, viewport);
  const x = Math.max(0, start.x), y = Math.max(0, start.y);
  return { x, y, width: Math.max(0, Math.min(viewport.width, end.x) - x),
    height: Math.max(0, Math.min(viewport.height, end.y) - y) };
}

// Distance to the visible rectangle, in screen pixels. It is not physical distance or contact.
export function fingerGuidance(point: Point, target: Rect, viewport: Rect) {
  const dx = Math.max(target.x, Math.min(point.x, target.x + target.width)) - point.x;
  const dy = Math.max(target.y, Math.min(point.y, target.y + target.height)) - point.y;
  const fraction = Math.hypot(dx, dy) / Math.hypot(viewport.width, viewport.height);
  const direction = Math.abs(dx) < 12 && Math.abs(dy) < 12 ? '화면에서 겹쳐 있어요'
    : `${Math.abs(dy) >= 12 ? (dy > 0 ? '아래' : '위') : ''}${Math.abs(dy) >= 12 && Math.abs(dx) >= 12 ? ' ' : ''}${Math.abs(dx) >= 12 ? (dx > 0 ? '오른쪽' : '왼쪽') : ''}으로 이동하세요`;
  return { fraction, direction, text: fraction < .025 ? direction : `화면상 간격 ${Math.round(fraction * 100)}%. ${direction}` };
}
