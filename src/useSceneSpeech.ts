import { useEffect, useRef } from 'react';
import { isPrioritySpeaking, speak, cancelGuidance } from './speech';
import { foundRecordingId } from './recordedSpeech';

export function useSceneSpeech(target: { id: number; label: string } | undefined, guidance: string, listening: boolean) {
  const latest = useRef({ target, guidance, listening });
  const candidate = useRef<{ id: number | undefined; since: number }>({ id: undefined, since: 0 });
  latest.current = { target, guidance, listening };
  // Reset on every actual selection/loss, including gaps shorter than the speech timer.
  useEffect(() => {
    candidate.current = { id: target?.id, since: performance.now() };
    cancelGuidance();
  }, [target?.id]);
  useEffect(() => {
    let announced: number | undefined;
    let announcing: number | undefined;
    let lastSpokenAt = -Infinity;
    const timer = window.setInterval(() => {
      const { target: current, guidance: text, listening: recording } = latest.current;
      const now = performance.now();
      if (document.hidden || recording || !current) {
        candidate.current = { id: undefined, since: now };
        cancelGuidance();
        return;
      }
      if (candidate.current.id !== current.id) candidate.current = { id: current.id, since: now };
      const isNew = announced !== current.id;
      if (now - candidate.current.since < 1000 || announcing === current.id) return;
      if (!isNew && (isPrioritySpeaking() || window.speechSynthesis?.speaking || window.speechSynthesis?.pending || now - lastSpokenAt < (text ? 1500 : 5000))) return;
      if (!isNew && !text) return;
      const lastCharacter = current.label.charCodeAt(current.label.length - 1);
      const particle = lastCharacter >= 0xAC00 && lastCharacter <= 0xD7A3 && (lastCharacter - 0xAC00) % 28 !== 0 ? '을' : '를';
      lastSpokenAt = now;
      if (isNew) announcing = current.id;
      speak(isNew ? `${current.label}${particle} 찾았어요.` : text, reason => {
        if (isNew) announcing = undefined;
        if(reason==='ended' && latest.current.target?.id===current.id) announced=current.id;
      },{priority:isNew?'found':'guidance',clipId:isNew?foundRecordingId(current.label):undefined});
    }, 100);
    return () => { clearInterval(timer); cancelGuidance(); };
  }, []);
}
