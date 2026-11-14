let context: AudioContext | undefined;

export function getAudioContext() { return context; }

// Called from the user's Start/voice tap. Reuse this context for tones and speech.
export function unlockAudioContext() {
  try {
    if (!context || context.state==='closed') context=new AudioContext();
    void context.resume().catch(()=>{});
  } catch { /* Media-element/browser speech remain available without Web Audio. */ }
}
