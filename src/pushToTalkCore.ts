export type PushRecognizer = {
  lang:string;continuous:boolean;interimResults:boolean;
  onresult:((event:{results:ArrayLike<ArrayLike<{transcript:string}>&{isFinal:boolean}>})=>void)|null;
  onerror:((event:{error:string})=>void)|null;onend:(()=>void)|null;
  start():void;stop():void;abort():void;
};
export function shortVoiceCommand(text:string) {
  const compact=text.replace(/[\s.!?,]/g,'');
  if (/^(그만(?:해|해요|해줘|해주세요|할래)?|멈춰(?:줘|주세요)?|중지|정지|stop)$/i.test(compact)) return '그만';
  if (!/안\s*잡|못\s*잡|잡지\s*않/.test(text)&&/^(?:.+\s+)?잡았(?:어|어요|습니다)[.!?\s]*$/.test(text.trim())) return text.trim();
  return undefined;
}

export function createPushToTalk(recognition:PushRecognizer,options:{
  afterStop:boolean;onText:(text:string)=>void;onCommand:(text:string)=>void;
  onStopped:()=>void;onError:(code:string)=>void;onEnd:()=>void;
}) {
  let ended=false,stopping=false,started=false,finalText='',lastText='';
  let maxTimer:ReturnType<typeof setTimeout>|undefined,silenceTimer:ReturnType<typeof setTimeout>|undefined,endTimer:ReturnType<typeof setTimeout>|undefined;
  function cleanup(){
    clearTimeout(maxTimer);clearTimeout(silenceTimer);clearTimeout(endTimer);
    recognition.onresult=recognition.onerror=recognition.onend=null;
  }
  function finish(error?:string,abort=false){
    if(ended)return;ended=true;cleanup();
    if(abort){try{recognition.abort();}catch{/* Already ended. */}}
    options.onEnd();
    if(error){if(options.afterStop)options.onStopped();else options.onError(error);return;}
    const text=finalText||lastText;
    if(text)options.onCommand(text);
    else if(options.afterStop)options.onStopped();
    else options.onError('no-speech');
  }
  function stop(){
    if(ended||stopping)return;stopping=true;
    try{recognition.stop();}catch{finish(undefined,true);return;}
    if(!ended)endTimer=setTimeout(()=>finish(undefined,true),300);
  }
  recognition.lang='ko-KR';recognition.continuous=false;recognition.interimResults=true;
  recognition.onresult=event=>{
    if(ended)return;
    lastText=Array.from(event.results,r=>r[0]?.transcript||'').join(' ').trim();
    finalText=Array.from(event.results).filter(r=>r.isFinal).map(r=>r[0]?.transcript||'').join(' ').trim();
    if(lastText){clearTimeout(silenceTimer);options.onText(lastText);}
    const short=shortVoiceCommand(lastText);
    if(short){finalText=short;stop();}
    else if(finalText)stop();
  };
  recognition.onend=()=>finish();
  recognition.onerror=event=>finish(event.error,true);
  return {
    start(){
      if(started||ended)return;started=true;
      try{
        recognition.start();
        if(ended)return;
        silenceTimer=setTimeout(()=>finish('no-speech',true),5000);
        maxTimer=setTimeout(()=>finish(undefined,true),6000);
      }catch{finish('start-failed',true);}
    },
    stop,
    dispose(){if(ended)return;ended=true;cleanup();try{recognition.abort();}catch{/* Already stopped. */}options.onEnd();},
  };
}
