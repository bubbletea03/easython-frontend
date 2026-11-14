export type SpeechEndReason = 'ended' | 'cancelled' | 'error' | 'timeout';

export function createSpeechPlayer(tts: (text: string, signal: AbortSignal) => Promise<Blob>) {
  let priorityUntil = 0;
  let generation = 0;
  let controller: AbortController | undefined;
  let audio: HTMLAudioElement | undefined;
  let audioUrl: string | undefined;
  let serverEnabled = false;
  let completion: ((reason: SpeechEndReason) => void) | undefined;
  let watchdog: ReturnType<typeof setTimeout> | undefined;

  function cancelSpeech(reason: SpeechEndReason = 'cancelled') {
    generation++;
    const done = completion; completion = undefined;
    clearTimeout(watchdog); watchdog = undefined;
    controller?.abort(); controller = undefined;
    if (audio) {
      audio.onended = audio.onerror = null;
      audio.pause(); audio.removeAttribute('src'); audio.load(); audio = undefined;
    }
    if (audioUrl) { URL.revokeObjectURL(audioUrl); audioUrl = undefined; }
    window.speechSynthesis?.cancel(); priorityUntil = 0;
    done?.(reason);
  }
  function speak(text: string, onFinish?: (reason: SpeechEndReason) => void) {
    if (!text.trim()) { onFinish?.('ended'); return; }
    cancelSpeech();
    const token = generation;
    completion = onFinish;
    priorityUntil = performance.now() + 60000;
    const finish = (reason: SpeechEndReason) => { if (token === generation) cancelSpeech(reason); };
    watchdog = setTimeout(() => finish('timeout'), 60000);
    let usingFallback = false;
    const fallback = () => {
      if (token !== generation) return;
      if (document.hidden) { finish('cancelled'); return; }
      if (usingFallback) return;
      usingFallback = true;
      if (!window.speechSynthesis) { finish('error'); return; }
      try {
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'ko-KR'; utterance.rate = 1;
        utterance.onend = () => finish('ended');
        utterance.onerror = () => finish('error');
        window.speechSynthesis.speak(utterance);
      } catch { finish('error'); }
    };
    if (!serverEnabled) { fallback(); return; }
    const request = new AbortController(); controller = request;
    void tts(text, request.signal).then(async blob => {
      if (token !== generation || request.signal.aborted) return;
      if (document.hidden) { finish('cancelled'); return; }
      audioUrl = URL.createObjectURL(blob); audio = new Audio(audioUrl);
      audio.onended = () => finish('ended'); audio.onerror = fallback;
      await audio.play();
    }).catch(() => { if (!request.signal.aborted) fallback(); });
  }
  return {
    setServerSpeechEnabled(enabled: boolean) { serverEnabled = enabled; },
    isPrioritySpeaking() { return performance.now() < priorityUntil; },
    cancelSpeech, speak,
  };
}
