export type VoiceResultEvent = {resultIndex?:number;results:ArrayLike<ArrayLike<{transcript:string}> & {isFinal:boolean}>};
export type ContinuousRecognizer = {
  lang:string;continuous:boolean;interimResults:boolean;
  maxAlternatives?:number;
  onresult:((event:VoiceResultEvent)=>void)|null;
  onerror:((event:{error:string})=>void)|null;
  onend:(()=>void)|null;
  onstart?:((...args:unknown[])=>void)|null;
  start():void;abort():void;
};

const stopCommand = /(?:그만(?:좀)?(?:해|해요|해줘|해주세요|하자|하라고|하라|할래|할게|할게요|해라|둘래|둘게|둘게요)?|멈춰(?:줘|주세요|요)?|중지(?:해|해줘|해주세요)?|정지(?:해|해줘|해주세요)?|스톱|스탑|stop|그만그만)[.!?\s]*$/i;
export function handsFreeCommand(text:string, final:boolean):string|undefined {
  const trimmed = text.trim();
  // Stop immediately, including an interim result, without calling the server.
  const compact = trimmed.replace(/[\s,.!?，。！？]/g,'');
  if (stopCommand.test(compact)) return '그만';
  if (!final) return undefined;
  if (/찾아|어디|어떻게|잡는|잡아|잡았/.test(trimmed)
    || /^(왼쪽|오른쪽|첫\s*번째|두\s*번째)/.test(trimmed)) return trimmed;
  return undefined;
}

export function createContinuousVoice(options:{
  create:()=>ContinuousRecognizer;
  isSpeaking:()=>boolean;
  canStartDuringSpeech?:()=>boolean;
  isHidden:()=>boolean;
  onCommand:(text:string)=>void;
  onError:(message:string)=>void;
  onTranscript?:(text:string)=>void;
  onStatus?:(state:string)=>void;
  now?:()=>number;
}) {
  const now = options.now ?? (()=>performance.now());
  let current:ContinuousRecognizer|undefined, disposed=false, blocked=false, nextStartAt=0, failures=0;
  let lastSpeechAt = -Infinity;
  let lastResultAt = 0;
  function release(abort=true) {
    const previous=current;current=undefined;
    if (!previous) return;
    previous.onresult=previous.onerror=previous.onend=previous.onstart=null;
    if (abort) {try {previous.abort();} catch { /* Already stopped. */ }}
  }
  function fail(permission:boolean,reason:string) {
    release(); failures++; nextStartAt=now()+Math.min(10000,1500*failures);
    if (permission || failures===3) {
      blocked=permission;
      options.onError(permission
        ? '계속 듣기를 사용하려면 마이크 권한을 허용해 주세요. 화면의 그만 버튼으로 멈출 수 있어요.'
        : '계속 듣기를 다시 연결하고 있어요. 화면의 그만 버튼으로도 멈출 수 있어요.');
    }
    options.onStatus?.(`${blocked?'blocked':'retrying'}:${reason}`);
  }
  return {
    tick() {
      if (disposed || blocked) return;
      const speaking=options.isSpeaking();
      if (speaking) lastSpeechAt=now();
      if (options.isHidden()) {
        release(); nextStartAt=now()+350; options.onStatus?.('hidden'); return;
      }
      if (current && now()-lastResultAt>=15000) {release();nextStartAt=now()+500;options.onStatus?.('retrying');return;}
      if (current || now()<nextStartAt) return;
      // Android Chrome may take audio focus away from a playing guide when a
      // new recognition session starts. Keep an existing listener, but restart
      // a stopped one only after the guide and its echo tail have finished.
      if ((speaking || now()-lastSpeechAt<350) && !options.canStartDuringSpeech?.()) {options.onStatus?.('waiting-for-audio');return;}
      try {
        const recognition=options.create();current=recognition;
        lastResultAt=now();options.onStatus?.('starting');
        const outputResults = new Set<number>();
        recognition.lang='ko-KR';recognition.continuous=true;recognition.interimResults=true;
        recognition.maxAlternatives=3;
        recognition.onstart=()=>{if(current===recognition){lastResultAt=now();options.onStatus?.('listening');}};
        recognition.onresult=event=>{
          if (current!==recognition || options.isHidden()) return;
          const speaking=options.isSpeaking();
          if (speaking) lastSpeechAt=now();
          for(let i=event.resultIndex ?? 0;i<event.results.length;i++) {
            const result=event.results[i];
            lastResultAt=now();options.onTranscript?.(result[0]?.transcript || '');
            if (speaking || now()-lastSpeechAt<350) outputResults.add(i);
            const stop=Array.from(result).some(alternative=>handsFreeCommand(alternative.transcript,false)==='그만');
            const command=stop ? '그만' : handsFreeCommand(result[0]?.transcript || '',result.isFinal);
            if (!command) continue;
            // Stop remains interruptible during output; other commands must not
            // be inferred from the app's own guidance or its trailing audio.
            if (command!=='그만' && outputResults.has(i)) continue;
            failures=0;release();nextStartAt=now()+500;
            options.onCommand(command);return;
          }
        };
        recognition.onend=()=>{
          if(current!==recognition)return;
          release(false);nextStartAt=now()+500;
        };
        recognition.onerror=event=>{
          if(current!==recognition)return;
          if(event.error==='aborted' || event.error==='no-speech') {release();nextStartAt=now()+500;return;}
          fail(event.error==='not-allowed' || event.error==='service-not-allowed',event.error);
        };
        recognition.start();
      } catch(error) {
        const name=error instanceof Error ? error.name : '';
        fail(name==='NotAllowedError' || name==='SecurityError',name || 'start-failed');
      }
    },
    dispose() {disposed=true;release();},
  };
}
