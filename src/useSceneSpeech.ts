import { useEffect, useRef } from 'react';
import { isPrioritySpeaking } from './speech';

export function useSceneSpeech(target: { id: number; label: string } | undefined, guidance: string, listening: boolean) {
  const latest = useRef({ target, guidance, listening });
  const candidate = useRef<{ id: number | undefined; since: number }>({ id: undefined, since: 0 });
  latest.current = { target, guidance, listening };
  // Reset on every actual selection/loss, including gaps shorter than the speech timer.
  useEffect(() => {
    candidate.current = { id: target?.id, since: performance.now() };
  }, [target?.id]);
  useEffect(() => {
    if (!('speechSynthesis' in window)) return;
    let announced: number | undefined;
    let lastSpokenAt = -Infinity;
    const timer = window.setInterval(() => {
      const { target: current, guidance: text, listening: recording } = latest.current;
      const now = performance.now();
      if (!recording && !document.hidden && isPrioritySpeaking()) return;
      if (document.hidden || recording || !current) {
        candidate.current = { id: undefined, since: now };
        window.speechSynthesis.cancel();
        return;
      }
      if (candidate.current.id !== current.id) candidate.current = { id: current.id, since: now };
      if (now - candidate.current.since < 1000 || window.speechSynthesis.speaking || window.speechSynthesis.pending || now - lastSpokenAt < 5000) return;
      const isNew = announced !== current.id;
      if (!isNew && !text) return;
      const lastCharacter = current.label.charCodeAt(current.label.length - 1);
      const particle = lastCharacter >= 0xAC00 && lastCharacter <= 0xD7A3 && (lastCharacter - 0xAC00) % 28 !== 0 ? '을' : '를';
      const utterance = new SpeechSynthesisUtterance(`${isNew ? `${current.label}${particle} 찾았어요. ` : ''}${text}`);
      utterance.lang = 'ko-KR';
      utterance.rate = 1;
      // A blocked autoplay attempt is not a successful announcement. Retry after the cooldown.
      utterance.onstart = () => { announced = current.id; };
      lastSpokenAt = now;
      window.speechSynthesis.speak(utterance);
    }, 100);
    return () => { clearInterval(timer); window.speechSynthesis.cancel(); };
  }, []);
}
