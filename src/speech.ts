let priorityUntil = 0;
let requestedAt = 0;
let generation = 0;
export function isPrioritySpeaking() {
  const now = performance.now();
  return now < priorityUntil && (window.speechSynthesis?.speaking || window.speechSynthesis?.pending || now - requestedAt < 1000);
}
export function speak(text: string) {
  if (!text.trim() || !('speechSynthesis' in window)) return;
  const token = ++generation;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'ko-KR'; utterance.rate = 1;
  requestedAt = performance.now(); priorityUntil = requestedAt + 60000;
  utterance.onend = utterance.onerror = () => { if (token === generation) priorityUntil = 0; };
  window.speechSynthesis.speak(utterance);
}
