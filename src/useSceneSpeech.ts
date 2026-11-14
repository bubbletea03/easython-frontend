import { useEffect, useRef } from 'react';
import { isPrioritySpeaking, isSpeechPaused, speak, cancelGuidance } from './speech';
import { vibrate } from './audioFeedback';
import { foundRecordingId } from './recordedSpeech';

export function useSceneSpeech(target: { id: number; label: string } | undefined, guidance: string, listening: boolean, revision: number, lost: boolean, detail?: string, phone = false, reach = true, graspAligned = false, clipId?: string) {
  const latest = useRef({ target, guidance, listening, lost, detail, phone, reach, graspAligned, clipId });
  latest.current = { target, guidance, listening, lost, detail, phone, reach, graspAligned, clipId };
  useEffect(() => {
    let announced = false, announcing = false, felt = false;
    let visibleSince: number | undefined;
    let candidate = '', candidateSince = 0, lastText = '', lastSpokenAt = -Infinity;
    let lastPhoneAt = -Infinity;
    let reachAnnounced = false, reaching = false;
    let previousReach = latest.current.reach;
    let reachSince: number | undefined;
    const spokenAt = new Map<string, number>();
    const timer = window.setInterval(() => {
      const { target: current, guidance: text, listening: paused, lost: missing, detail: extra, phone: isPhone, reach: canReach } = latest.current;
      const now = performance.now();
      if (isSpeechPaused()) return;
      if (previousReach && !canReach) cancelGuidance();
      previousReach = canReach;
      if (missing) { announced = false; felt = false; reachAnnounced = false; lastText = ''; spokenAt.clear(); }
      if (!canReach || !current || paused) reachSince = undefined;
      else reachSince ??= now;
      if (!current || document.hidden || paused) {
        visibleSince = undefined; candidate = ''; cancelGuidance(); return;
      }
      visibleSince ??= now;
      if (candidate !== text) { candidate = text; candidateSince = now; }
      if (now - visibleSince < 1000 || announcing) return;
      if (!announced) {
        if (!felt) { vibrate(200); felt = true; }
        const code = current.label.charCodeAt(current.label.length - 1);
        const particle = code >= 0xAC00 && code <= 0xD7A3 && (code - 0xAC00) % 28 !== 0 ? '을' : '를';
        announcing = true;
        speak(`${canReach ? '멈추세요. ' : ''}${current.label}${particle} 찾았어요.`, reason => {
          announcing = false;
          if (reason === 'ended') {
            announced = true; lastSpokenAt = performance.now(); lastPhoneAt = lastSpokenAt;
          }
        }, {priority:'found',clipId:foundRecordingId(current.label)});
        return;
      }
      if (canReach && extra && !reachAnnounced && !reaching && reachSince !== undefined && now-reachSince >= 500 && now-lastSpokenAt >= 1500 && !isPrioritySpeaking()) {
        reaching = true; lastSpokenAt = now;
        speak(extra, reason => { reaching = false; if (reason === 'ended') reachAnnounced = true; }, {priority:'guidance',clipId:'reach_out'});
        return;
      }
      if (!text || (isPhone ? now-lastPhoneAt < 6000 : text === lastText) || now - candidateSince < 500 || now - lastSpokenAt < 1500 || now - (spokenAt.get(text) ?? -Infinity) < 3000 || isPrioritySpeaking()) return;
      lastText = text; lastSpokenAt = now; spokenAt.set(text, now);
      if (isPhone) lastPhoneAt = now;
      const pauseAfter = latest.current.graspAligned;
      speak(text, reason => {
        if (reason !== 'ended' || pauseAfter) lastText = '';
        if (reason === 'ended') lastSpokenAt = performance.now();
      }, {priority:'guidance', clipId:latest.current.clipId, quietAfterMs:pauseAfter ? 5000 : undefined});
    }, 100);
    return () => { clearInterval(timer); cancelGuidance(); };
  }, [revision]);
}
