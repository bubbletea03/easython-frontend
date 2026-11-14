import { api } from './api';
let priorityUntil = 0;
let generation = 0;
let controller: AbortController | undefined;
let audio: HTMLAudioElement | undefined;
let audioUrl: string | undefined;
let serverEnabled = false;
export function setServerSpeechEnabled(enabled: boolean) { serverEnabled = enabled; }
export function isPrioritySpeaking() { return performance.now() < priorityUntil; }
export function cancelSpeech() {
  generation++; controller?.abort(); controller = undefined;
  if (audio) { audio.pause(); audio.removeAttribute('src'); audio.load(); audio = undefined; }
  if (audioUrl) { URL.revokeObjectURL(audioUrl); audioUrl = undefined; }
  window.speechSynthesis?.cancel(); priorityUntil = 0;
}
export function speak(text: string) {
  if (!text.trim()) return;
  cancelSpeech();
  const token = generation;
  priorityUntil = performance.now() + 60000;
  const finish = () => { if (token === generation) cancelSpeech(); };
  const fallback = () => {
    if (token !== generation || document.hidden) return;
    if (!window.speechSynthesis) { finish(); return; }
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'ko-KR'; utterance.rate = 1;
    utterance.onend = utterance.onerror = finish;
    window.speechSynthesis.speak(utterance);
  };
  if (!serverEnabled) { fallback(); return; }
  const request = new AbortController(); controller = request;
  void api.tts(text, request.signal).then(async blob => {
    if (token !== generation || request.signal.aborted || document.hidden) return;
    audioUrl = URL.createObjectURL(blob); audio = new Audio(audioUrl);
    audio.onended = finish; audio.onerror = fallback;
    await audio.play();
  }).catch(() => { if (!request.signal.aborted) fallback(); });
}
