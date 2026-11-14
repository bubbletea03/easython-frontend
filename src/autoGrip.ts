import type { DetectionTrack } from './detectionTracks';

// Detection timestamps must keep advancing: a frozen last frame is not continuity.
export function createAutoGripGate() {
  let candidate: { id: number; since: number; lastSeen: number } | undefined;
  let attempted = false;
  return {
    reset() { candidate = undefined; attempted = false; },
    mark() { attempted = true; },
    update(item: DetectionTrack | undefined, now: number, enabled: boolean) {
      if (!enabled || !item || item.missing || now - item.lastSeen > 2000) {
        candidate = undefined; return false;
      }
      if (!candidate || candidate.id !== item.id || item.lastSeen - candidate.lastSeen > 2000) {
        candidate = { id: item.id, since: now, lastSeen: item.lastSeen };
      }
      candidate.lastSeen = item.lastSeen;
      if (now - candidate.since < 3000 || attempted) return false;
      attempted = true;
      return true;
    },
  };
}
