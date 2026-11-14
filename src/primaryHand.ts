type Point = { x: number; y: number };

// Image-space size is a proximity heuristic, not proof of hand ownership.
// Keep all landmarks of the largest hand for both rendering and grip guidance.
export function selectLargestHand<T extends Point>(hands: T[][]): T[][] {
  let largest: T[] | undefined;
  let largestArea = 0;
  for (const hand of hands) {
    if (hand.length !== 21 || hand.some(p => !Number.isFinite(p.x) || !Number.isFinite(p.y))) continue;
    const width = Math.max(...hand.map(p => p.x)) - Math.min(...hand.map(p => p.x));
    const height = Math.max(...hand.map(p => p.y)) - Math.min(...hand.map(p => p.y));
    const area = width * height;
    if (area > largestArea) { largest = hand; largestArea = area; }
  }
  return largest ? [largest] : [];
}
