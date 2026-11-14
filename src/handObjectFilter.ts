import type { DetectionBox } from './detectionTracks';

type Point = { x: number; y: number };
// Only reject person boxes tightly matching a tracked hand. A full person may
// contain a hand too, so containment alone is insufficient.
export function isHandOnlyPerson(box: DetectionBox, hands: Point[][]) {
  if (box.label !== '사람' && box.label !== 'person') return false;
  return hands.some(hand => {
    if (hand.length < 21 || hand.some(p => !Number.isFinite(p.x) || !Number.isFinite(p.y))) return false;
    const left = Math.max(0, Math.min(...hand.map(p => p.x)) - .015);
    const top = Math.max(0, Math.min(...hand.map(p => p.y)) - .015);
    const right = Math.min(1, Math.max(...hand.map(p => p.x)) + .015);
    const bottom = Math.min(1, Math.max(...hand.map(p => p.y)) + .015);
    const handArea = (right - left) * (bottom - top);
    const boxArea = box.width * box.height;
    const intersection = Math.max(0, Math.min(right, box.x + box.width) - Math.max(left, box.x))
      * Math.max(0, Math.min(bottom, box.y + box.height) - Math.max(top, box.y));
    return handArea > 0 && boxArea > 0 && intersection / handArea >= .7 && intersection / boxArea >= .65;
  });
}
