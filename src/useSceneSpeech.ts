import { useEffect, useRef } from 'react';
import { isPrioritySpeaking, speak, cancelGuidance } from './speech';
import { vibrate } from './audioFeedback';

export function useSceneSpeech(target: { id: number; label: string } | undefined, guidance: string, listening: boolean, revision: number, lost: boolean, detail?: string, phone = false) {
  const latest = useRef({ target, guidance, listening, lost, detail, phone });
  latest.current = { target, guidance, listening, lost, detail, phone };
  useEffect(() => {
    let announced = false, announcing = false, felt = false;
    let visibleSince: number | undefined;
    let candidate = '', candidateSince = 0, lastText = '', lastSpokenAt = -Infinity;
    let lastPhoneAt = -Infinity;
    const spokenAt = new Map<string, number>();
    const timer = window.setInterval(() => {
      const { target: current, guidance: text, listening: paused, lost: missing, detail: extra, phone: isPhone } = latest.current;
      const now = performance.now();
      if (missing) { announced = false; felt = false; lastText = ''; spokenAt.clear(); }
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
        speak(`멈추세요. ${current.label}${particle} 찾았어요.`, reason => {
          announcing = false;
          if (reason === 'ended') {
            announced = true; lastSpokenAt = performance.now(); lastPhoneAt = lastSpokenAt;
            if (extra && latest.current.target && !latest.current.lost) speak(extra, undefined, {priority:'guidance'});
          }
        }, {priority:'found'});
        return;
      }
      if (!text || (isPhone ? now-lastPhoneAt < 6000 : text === lastText) || now - candidateSince < 500 || now - lastSpokenAt < 1500 || now - (spokenAt.get(text) ?? -Infinity) < 3000 || isPrioritySpeaking()) return;
      lastText = text; lastSpokenAt = now; spokenAt.set(text, now);
      if (isPhone) lastPhoneAt = now;
      speak(text, reason => { if (reason !== 'ended') lastText = ''; }, {priority:'guidance'});
    }, 100);
    return () => { clearInterval(timer); cancelGuidance(); };
  }, [revision]);
}
