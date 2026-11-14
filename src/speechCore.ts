import type { BlobPlayback, PrepareBlobPlayback } from './webAudioPlayback';

export type SpeechEndReason = 'ended' | 'cancelled' | 'error' | 'timeout';
export type SpeechOptions = {priority?: 'guidance' | 'normal' | 'found' | 'safety'; clipId?:string; maxDurationMs?:number; quietAfterMs?:number;isRelevant?:()=>boolean};
type Job = {text:string; onFinish?: (reason:SpeechEndReason)=>void; options:SpeechOptions};
export type SpeechLogEntry = {at:number;text:string;reason:SpeechEndReason;priority:number;caller?:string};
export type SpeechAnnouncement={id:number;text:string;priority:'guidance'|'normal'|'found'|'safety';status?:'loading'|'playing'|'error'};
const speechPriority = (options: SpeechOptions) => options.priority === 'safety' ? 3 : options.priority === 'found' ? 2 : options.priority === 'guidance' ? 0 : 1;

export function createSpeechPlayer(tts: (text: string, signal: AbortSignal) => Promise<Blob>, recording?: (text:string, id:string|undefined, signal:AbortSignal)=>Promise<Blob|undefined>, preparePlayback?:PrepareBlobPlayback) {
  let priorityUntil = 0;
  let generation = 0;
  let controller: AbortController | undefined;
  let audio: HTMLAudioElement | undefined;
  let audioUrl: string | undefined;
  let bufferPlayback:BlobPlayback|undefined;
  let serverEnabled = false;
  let completion: ((reason: SpeechEndReason) => void) | undefined;
  let watchdog: ReturnType<typeof setTimeout> | undefined;
  let startWatchdog: ReturnType<typeof setTimeout> | undefined;
  let browserUtterance: SpeechSynthesisUtterance | undefined;
  let activePriority = -1;
  let queue: Job[] = [];
  let quietUntil = 0;
  let resumeTimer:ReturnType<typeof setTimeout>|undefined;
  let settling=false;
  let cancelling=false;
  const ttsCache = new Map<string, Blob>();
  let cachedBytes = 0;
  let currentText: string | undefined;
  const speechLog: SpeechLogEntry[] = [];
  const subscribers=new Set<()=>void>();
  let announcement:SpeechAnnouncement|undefined,announcementId=0;
  const publish=(value:SpeechAnnouncement|undefined)=>{announcement=value;subscribers.forEach(listener=>listener());};
  const isSpeechPaused = () => performance.now() < quietUntil;

  function resumeQueue() {
    if(activePriority!==-1||settling||!queue.length)return;
    clearTimeout(resumeTimer);resumeTimer=undefined;
    if(isSpeechPaused()){
      resumeTimer=setTimeout(resumeQueue,Math.max(0,quietUntil-performance.now()));return;
    }
    while(activePriority===-1&&queue.length){
      const job=queue.shift()!;
      if(job.options.isRelevant&&!job.options.isRelevant()){job.onFinish?.('cancelled');continue;}
      start(job);
    }
  }

  function releaseCurrent(reason: SpeechEndReason) {
    if (currentText) {
      const caller = new Error().stack?.split('\n')[2]?.trim();
      speechLog.push({at:performance.now(),text:currentText,reason,priority:activePriority,caller});
      if (speechLog.length > 5) speechLog.shift();
      if (window.location?.hash === '#dev') console.log('[speech] release',reason,currentText,caller);
      currentText = undefined;
    }
    generation++;
    const done = completion; completion = undefined;
    clearTimeout(watchdog); watchdog = undefined;
    clearTimeout(startWatchdog); startWatchdog = undefined;
    controller?.abort(); controller = undefined;
    bufferPlayback?.stop();bufferPlayback=undefined;
    if (audio) {
      audio.onended = audio.onerror = audio.onpause = audio.onplaying = null;
      audio.pause(); audio.removeAttribute('src'); audio.load(); audio = undefined;
    }
    if (audioUrl) { URL.revokeObjectURL(audioUrl); audioUrl = undefined; }
    if (browserUtterance) {
      browserUtterance.onstart=browserUtterance.onend=browserUtterance.onerror=null;browserUtterance=undefined;
      window.speechSynthesis?.cancel();
    }
    priorityUntil = 0; activePriority = -1;
    publish(undefined);
    settling=true;
    try{done?.(reason);}finally{settling=false;}
  }
  function cancelSpeech(reason: SpeechEndReason = 'cancelled') {
    quietUntil = 0;
    clearTimeout(resumeTimer);resumeTimer=undefined;
    const pending=queue; queue=[];cancelling=true;
    try{releaseCurrent(reason);pending.forEach(job=>job.onFinish?.('cancelled'));}finally{cancelling=false;}
  }
  function start({text,onFinish,options}:Job) {
    if (!text.trim()) { onFinish?.('ended'); return; }
    const token = generation;
    currentText = text;
    completion = onFinish;
    activePriority = speechPriority(options);
    publish({id:++announcementId,text,priority:options.priority||'normal',status:'loading'});
    const duration = options.maxDurationMs ?? 60000;
    priorityUntil = performance.now() + duration;
    let hasStarted=false,failed=false;
    const finish = (reason: SpeechEndReason) => {
      if (token !== generation || failed) return;
      if(hasStarted&&(reason==='error'||reason==='timeout')){
        // Never interpret an interrupted sentence as a completed instruction.
        // If recovery fails, retain its card and block later jobs until the
        // user explicitly stops/restarts rather than advancing silently.
        failed=true;clearTimeout(watchdog);clearTimeout(startWatchdog);
        if(announcement)publish({...announcement,status:'error'});
        return;
      }
      if (reason === 'ended' && options.quietAfterMs) {
        quietUntil = performance.now() + options.quietAfterMs;
      }
      releaseCurrent(reason);
      resumeQueue();
    };
    const actuallyPlaying=()=>!!(audio&&!audio.paused&&!audio.ended)||!!(browserUtterance&&window.speechSynthesis?.speaking);
    watchdog = setTimeout(() => {if(actuallyPlaying())playbackStarted();else finish('timeout');}, duration);
    const waitForPlayback = () => {
      clearTimeout(startWatchdog);
      startWatchdog = setTimeout(()=>{if(actuallyPlaying())playbackStarted();else finish('timeout');},4000);
    };
    const playbackStarted = () => {
      if(token!==generation)return;
      hasStarted=true;
      if(announcement?.status!=='playing'&&announcement)publish({...announcement,status:'playing'});
      clearTimeout(startWatchdog);startWatchdog=undefined;
      // Once playback begins, only its ended/error event advances the queue.
      // A short safety budget must never truncate a healthy spoken sentence.
      clearTimeout(watchdog);watchdog=undefined;
    };
    let usingFallback = false;
    let fallbackRetries=0;
    const fallback = () => {
      if (token !== generation) return;
      if (document.hidden) { finish('cancelled'); return; }
      if (usingFallback) return;
      usingFallback = true;
      bufferPlayback?.stop();bufferPlayback=undefined;
      if(audio) {audio.onended=audio.onerror=audio.onpause=audio.onplaying=null;audio.pause();}
      if (!window.speechSynthesis) { finish('error'); return; }
      try {
        const utterance = new SpeechSynthesisUtterance(text);
        browserUtterance = utterance;
        utterance.lang = 'ko-KR'; utterance.rate = 1;
        utterance.onend = () => finish('ended');
        utterance.onerror = event => {
          if(token!==generation)return;
          if((event?.error==='interrupted'||event?.error==='canceled')&&fallbackRetries<2){
            fallbackRetries++;utterance.onstart=utterance.onend=utterance.onerror=null;
            browserUtterance=undefined;usingFallback=false;
            void Promise.resolve().then(fallback);return;
          }
          finish('error');
        };
        utterance.onstart = playbackStarted;
        waitForPlayback();
        window.speechSynthesis.resume?.();
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
      if (preparePlayback) {
        waitForPlayback();
        try {
          const playback=await preparePlayback(blob,request.signal,()=>finish('ended'),fallback);
          if(token!==generation || request.signal.aborted){playback.stop();return;}
          bufferPlayback=playback;
          await playback.start();
          if(token===generation)playbackStarted();
          return;
        } catch {
          if(token!==generation || request.signal.aborted)return;
          bufferPlayback?.stop();bufferPlayback=undefined;
          // Decoding/support failures fall through to the existing media player.
        }
      }
      audioUrl = URL.createObjectURL(blob); audio = new Audio(audioUrl);
      audio.onended = () => finish('ended'); audio.onerror = fallback;
      audio.onplaying = playbackStarted;
      let resuming=false;
      audio.onpause = () => {
        if(token!==generation||!audio||audio.ended||resuming)return;
        resuming=true;
        // Losing browser audio focus does not complete this announcement.
        void audio.play().then(()=>{resuming=false;if(token===generation)playbackStarted();})
          .catch(()=>{resuming=false;fallback();});
      };
      waitForPlayback();
      await audio.play();
      if (token===generation) playbackStarted();
    }).catch(() => { if (!request.signal.aborted) fallback(); });
  }
  function speak(text:string,onFinish?: (reason:SpeechEndReason)=>void,options:SpeechOptions={}) {
    if(cancelling){onFinish?.('cancelled');return;}
    if (!text.trim()) {onFinish?.('ended');return;}
    if(options.isRelevant&&!options.isRelevant()){onFinish?.('cancelled');return;}
    queue.push({text,onFinish,options});resumeQueue();
  }
  return {
    setServerSpeechEnabled(enabled: boolean) { serverEnabled = enabled; },
    isPrioritySpeaking() { return isSpeechPaused() || activePriority>=0 || queue.length>0; },
    isSpeechPaused,
    canListenDuringSpeech() { return !!bufferPlayback; },
    getPlaybackMode() { return bufferPlayback ? 'web-audio' : audio ? 'media-element' : browserUtterance ? 'browser-tts' : activePriority>=0 ? 'loading' : 'idle'; },
    getSpeechLog() { return speechLog.slice(); },
    getAnnouncement(){return announcement;},
    subscribe(listener:()=>void){subscribers.add(listener);return()=>{subscribers.delete(listener);};},
    cancelSpeech, speak,
    cancelGuidance() {
      const pending=queue.filter(job=>job.options.priority==='guidance'||job.options.priority==='found');
      queue=queue.filter(job=>job.options.priority!=='guidance'&&job.options.priority!=='found');
      pending.forEach(job=>job.onFinish?.('cancelled'));
    },
  };
}
