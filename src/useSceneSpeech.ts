import { useEffect, useRef, useState } from 'react';

export function useSceneSpeech(target: { id: number; label: string } | undefined, guidance: string, listening: boolean) {
  const [enabled, setEnabled] = useState(false);
  const latest = useRef({ target, guidance, listening });
  latest.current = { target, guidance, listening };
  useEffect(() => {
    const enable = () => setEnabled(true);
    document.addEventListener('pointerdown', enable, { once: true });
    return () => document.removeEventListener('pointerdown', enable);
  }, []);
  useEffect(() => {
    if (!enabled || !('speechSynthesis' in window)) return;
    let candidate: number | undefined;
    let candidateSince = 0;
    let announced: number | undefined;
    let lastSpokenAt = -Infinity;
    const timer = window.setInterval(() => {
      const { target: current, guidance: text, listening: recording } = latest.current;
      const now = performance.now();
      if (document.hidden || recording || !current) {
        candidate = undefined;
        window.speechSynthesis.cancel();
        return;
      }
      if (candidate !== current.id) { candidate = current.id; candidateSince = now; }
      if (now - candidateSince < 600 || window.speechSynthesis.speaking || now - lastSpokenAt < 5000) return;
      const isNew = announced !== current.id;
      if (!isNew && !text) return;
      const utterance = new SpeechSynthesisUtterance(`${isNew ? `${current.label} 물체를 찾았어요. ` : ''}${text}`);
      utterance.lang = 'ko-KR';
      utterance.rate = 1;
      window.speechSynthesis.speak(utterance);
      announced = current.id;
      lastSpokenAt = now;
    }, 250);
    return () => { clearInterval(timer); window.speechSynthesis.cancel(); };
  }, [enabled]);
  return enabled;
}
