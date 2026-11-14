export type DetectionBox = { label: string; score: number; x: number; y: number; width: number; height: number };
export type DetectionTrack = DetectionBox & { id: number; lastSeen: number; missing: boolean };
export const TRACK_HOLD_MS = 650;

function overlap(a: DetectionBox, b: DetectionBox) {
  const intersection = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x))
    * Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  const union = a.width * a.height + b.width * b.height - intersection;
  return union > 0 ? intersection / union : 0;
}

// Keep DOM identity across reordered results and bridge short detection gaps.
export function updateTracks(previous: DetectionTrack[], boxes: DetectionBox[], now: number, nextId: () => number, holdMs = TRACK_HOLD_MS) {
  const active = previous.filter(track => now - track.lastSeen < holdMs);
  const candidates = active.flatMap((track, trackIndex) => boxes.flatMap((box, boxIndex) => {
    const score = track.label === box.label ? overlap(track, box) : 0;
    return score >= 0.15 ? [{ trackIndex, boxIndex, score }] : [];
  })).sort((a, b) => b.score - a.score);
  const matches = new Map<number, number>();
  const usedTracks = new Set<number>();
  for (const candidate of candidates) {
    if (matches.has(candidate.boxIndex) || usedTracks.has(candidate.trackIndex)) continue;
    matches.set(candidate.boxIndex, candidate.trackIndex);
    usedTracks.add(candidate.trackIndex);
  }
  return [
    ...boxes.map((box, index) => {
      const match = matches.get(index);
      return { ...box, id: match === undefined ? nextId() : active[match].id, lastSeen: now, missing: false };
    }),
    ...active.filter((_, index) => !usedTracks.has(index)).map(track => ({ ...track, missing: true })),
  ];
}
