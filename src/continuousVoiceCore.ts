export type VoiceResultEvent = {resultIndex?:number;results:ArrayLike<ArrayLike<{transcript:string}> & {isFinal:boolean}>};
export type ContinuousRecognizer = {
  lang:string;continuous:boolean;interimResults:boolean;
  onresult:((event:VoiceResultEvent)=>void)|null;
  onerror:((event:{error:string})=>void)|null;
  onend:(()=>void)|null;
  start():void;abort():void;
};

const stopCommand = /^(그만(?:해|해줘|해주세요|할래)?|멈춰(?:줘|주세요)?|중지(?:해|해줘|해주세요)?|정지|stop)[.!?\s]*$/i;
export function handsFreeCommand(text:string, final:boolean):string|undefined {
  const trimmed = text.trim();
  // Stop immediately, including an interim result, without calling the server.
  if (stopCommand.test(trimmed.replace(/\s+/g,''))) return '그만';
  if (!final) return undefined;
  if (/찾아|어디|어떻게|잡는|잡아|잡았/.test(trimmed)
    || /^(왼쪽|오른쪽|첫\s*번째|두\s*번째)/.test(trimmed)) return trimmed;
  return undefined;
}

export function createContinuousVoice(options:{
  create:()=>ContinuousRecognizer;
  isSpeaking:()=>boolean;
  isHidden:()=>boolean;
  onCommand:(text:string)=>void;
  onError:(message:string)=>void;
  now?:()=>number;
}) {
  const now = options.now ?? (()=>performance.now());
  let current:ContinuousRecognizer|undefined, disposed=false, blocked=false, nextStartAt=0, failures=0;
  let lastSpeechAt = -Infinity;
  function release(abort=true) {
    const previous=current;current=undefined;
    if (!previous) return;
    previous.onresult=previous.onerror=previous.onend=null;
    if (abort) {try {previous.abort();} catch { /* Already stopped. */ }}
  }
  function fail(permission:boolean) {
    release(); nextStartAt=now()+1500;
    if (permission || ++failures>=3) {
      blocked=true;
      options.onError(permission
        ? '계속 듣기를 사용하려면 마이크 권한을 허용해 주세요. 화면의 그만 버튼으로 멈출 수 있어요.'
        : '계속 듣기가 끊겼어요. 화면의 그만 버튼으로 멈춘 뒤 다시 말해 주세요.');
    }
  }
  return {
    tick() {
      if (disposed || blocked) return;
      if (options.isSpeaking()) lastSpeechAt=now();
      if (options.isHidden()) {
        release(); nextStartAt=now()+350; return;
      }
      if (current || now()<nextStartAt) return;
      try {
        const recognition=options.create();current=recognition;
        const outputResults = new Set<number>();
        recognition.lang='ko-KR';recognition.continuous=true;recognition.interimResults=true;
        recognition.onresult=event=>{
          if (current!==recognition || options.isHidden()) return;
          const speaking=options.isSpeaking();
          if (speaking) lastSpeechAt=now();
          for(let i=event.resultIndex ?? 0;i<event.results.length;i++) {
            const result=event.results[i];
            if (speaking || now()-lastSpeechAt<350) outputResults.add(i);
            const command=handsFreeCommand(result[0]?.transcript || '',result.isFinal);
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
          fail(event.error==='not-allowed' || event.error==='service-not-allowed');
        };
        recognition.start();
      } catch(error) {
        const name=error instanceof Error ? error.name : '';
        fail(name==='NotAllowedError' || name==='SecurityError');
      }
    },
    dispose() {disposed=true;release();},
  };
}
