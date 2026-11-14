export type SpeechEndReason = 'ended' | 'cancelled' | 'error' | 'timeout';
export type SpeechOptions = {priority?: 'guidance' | 'normal' | 'found' | 'safety'; clipId?:string; maxDurationMs?:number; quietAfterMs?:number};
type Job = {text:string; onFinish?: (reason:SpeechEndReason)=>void; options:SpeechOptions};
const speechPriority = (options: SpeechOptions) => options.priority === 'safety' ? 3 : options.priority === 'found' ? 2 : options.priority === 'guidance' ? 0 : 1;

export function createSpeechPlayer(tts: (text: string, signal: AbortSignal) => Promise<Blob>, recording?: (text:string, id:string|undefined, signal:AbortSignal)=>Promise<Blob|undefined>) {
  let priorityUntil = 0;
  let generation = 0;
  let controller: AbortController | undefined;
  let audio: HTMLAudioElement | undefined;
  let audioUrl: string | undefined;
  let serverEnabled = false;
  let completion: ((reason: SpeechEndReason) => void) | undefined;
  let watchdog: ReturnType<typeof setTimeout> | undefined;
  let activePriority = -1;
  let queue: Job[] = [];
  let quietUntil = 0;
  const ttsCache = new Map<string, Blob>();
  let cachedBytes = 0;
  const isSpeechPaused = () => performance.now() < quietUntil;

  function resumeQueue() {
    if (activePriority === -1 && queue.length) start(queue.shift()!);
  }

  function releaseCurrent(reason: SpeechEndReason) {
    generation++;
    const done = completion; completion = undefined;
    clearTimeout(watchdog); watchdog = undefined;
    controller?.abort(); controller = undefined;
    if (audio) {
      audio.onended = audio.onerror = null;
      audio.pause(); audio.removeAttribute('src'); audio.load(); audio = undefined;
    }
    if (audioUrl) { URL.revokeObjectURL(audioUrl); audioUrl = undefined; }
    window.speechSynthesis?.cancel(); priorityUntil = 0; activePriority = -1;
    done?.(reason);
  }
  function cancelSpeech(reason: SpeechEndReason = 'cancelled') {
    quietUntil = 0;
    const pending=queue; queue=[];
    releaseCurrent(reason); pending.forEach(job=>job.onFinish?.('cancelled'));
  }
  function start({text,onFinish,options}:Job) {
    if (!text.trim()) { onFinish?.('ended'); return; }
    const token = generation;
    completion = onFinish;
    activePriority = speechPriority(options);
    const duration = options.maxDurationMs ?? 60000;
    priorityUntil = performance.now() + duration;
    const finish = (reason: SpeechEndReason) => {
      if (token !== generation) return;
      if (reason === 'ended' && options.quietAfterMs) {
        quietUntil = performance.now() + options.quietAfterMs;
        const pending = queue; queue = [];
        pending.forEach(job => job.onFinish?.('cancelled'));
      }
      releaseCurrent(reason);
      resumeQueue();
    };
    watchdog = setTimeout(() => finish('timeout'), duration);
    let usingFallback = false;
    const fallback = () => {
      if (token !== generation) return;
      if (document.hidden) { finish('cancelled'); return; }
      if (usingFallback) return;
      usingFallback = true;
      if(audio) {audio.onended=audio.onerror=null;audio.pause();}
      if (!window.speechSynthesis) { finish('error'); return; }
      try {
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'ko-KR'; utterance.rate = 1;
        utterance.onend = () => finish('ended');
        utterance.onerror = () => finish('error');
        window.speechSynthesis.speak(utterance);
      } catch { finish('error'); }
    };
    const request = new AbortController(); controller = request;
    if (!recording && !serverEnabled) { fallback(); return; }
    void (async () => {
      const clip = await recording?.(text, options.clipId, request.signal).catch(() => undefined);
      if (request.signal.aborted || token !== generation) return;
      if (clip) return clip;
      if (!serverEnabled) { fallback(); return; }
      const cached = ttsCache.get(text);
      if (cached) return cached;
      const generated = await tts(text, request.signal);
      if (request.signal.aborted || token !== generation) return;
      if (generated.size <= 8 * 1024 * 1024) {
        ttsCache.set(text, generated); cachedBytes += generated.size;
        while (ttsCache.size > 32 || cachedBytes > 8 * 1024 * 1024) {
          const first = ttsCache.keys().next().value!;
          cachedBytes -= ttsCache.get(first)!.size; ttsCache.delete(first);
        }
      }
      return generated;
    })().then(async blob => {
      if (!blob) return;
      if (token !== generation || request.signal.aborted) return;
      if (document.hidden) { finish('cancelled'); return; }
      audioUrl = URL.createObjectURL(blob); audio = new Audio(audioUrl);
      audio.onended = () => finish('ended'); audio.onerror = fallback;
      await audio.play();
    }).catch(() => { if (!request.signal.aborted) fallback(); });
  }
  function speak(text:string,onFinish?: (reason:SpeechEndReason)=>void,options:SpeechOptions={}) {
    if (isSpeechPaused()) { onFinish?.('cancelled'); return; }
    if (!text.trim()) {onFinish?.('ended');return;}
    const priority=speechPriority(options);
    if(activePriority>=priority) {
      if(priority===0 || priority===2 || queue.some(job=>job.text===text)) {onFinish?.('cancelled');return;}
      if(queue.length>=3) queue.shift()?.onFinish?.('cancelled');
      queue.push({text,onFinish,options});return;
    }
    if(activePriority>=0) releaseCurrent('cancelled');
    start({text,onFinish,options});
  }
  return {
    setServerSpeechEnabled(enabled: boolean) { serverEnabled = enabled; },
    isPrioritySpeaking() { return isSpeechPaused() || performance.now() < priorityUntil; },
    isSpeechPaused,
    cancelSpeech, speak,
    cancelGuidance() { if(activePriority === 0 || activePriority === 2) {
      releaseCurrent('cancelled');
      resumeQueue();
    } },
  };
}
