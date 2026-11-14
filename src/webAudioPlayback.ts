export type BlobPlayback = {start():Promise<void>;stop():void};
export type PrepareBlobPlayback = (blob:Blob,signal:AbortSignal,onEnded:()=>void,onError:()=>void)=>Promise<BlobPlayback>;

export function createWebAudioPlayback(getContext:()=>AudioContext|undefined):PrepareBlobPlayback {
  const cache=new Map<Blob,AudioBuffer>();
  let bytes=0;
  return async(blob,signal,onEnded,onError)=>{
    signal.throwIfAborted();
    const context=getContext();
    if (!context || context.state==='closed') throw new Error('Web Audio unavailable');
    let buffer=cache.get(blob);
    if (!buffer) {
      const encoded=await blob.arrayBuffer();signal.throwIfAborted();
      buffer=await context.decodeAudioData(encoded);signal.throwIfAborted();
      const size=buffer.length*buffer.numberOfChannels*4;
      if(size<=16*1024*1024){
        cache.set(blob,buffer);bytes+=size;
        while(cache.size>16 || bytes>16*1024*1024){
          const key=cache.keys().next().value!;
          const previous=cache.get(key)!;bytes-=previous.length*previous.numberOfChannels*4;cache.delete(key);
        }
      }
    }
    signal.throwIfAborted();
    const source=context.createBufferSource();source.buffer=buffer;
    source.connect(context.destination);
    let disposed=false,started=false,resuming=false;
    function cleanup() {
      source.onended=null;source.disconnect();
      context!.removeEventListener('statechange',recover);
      signal.removeEventListener('abort',stop);
    }
    function stop() {
      if(disposed)return;disposed=true;cleanup();
      if(started){try{source.stop();}catch{/* Already ended. */}}
    }
    // If microphone activation suspends rendering, resume the same source so
    // the sentence continues at its existing position rather than restarting.
    function recover() {
      if(disposed || resuming || context!.state==='running' || context!.state==='closed')return;
      resuming=true;
      void context!.resume().catch(()=>{if(!disposed)onError();}).finally(()=>{resuming=false;});
    }
    source.onended=()=>{if(disposed)return;disposed=true;cleanup();onEnded();};
    context.addEventListener('statechange',recover);
    signal.addEventListener('abort',stop,{once:true});
    return {
      async start(){
        signal.throwIfAborted();
        if(context.state!=='running')await context.resume();
        signal.throwIfAborted();
        if(disposed)throw new Error('Playback stopped');
        source.start();started=true;
      },
      stop,
    };
  };
}
