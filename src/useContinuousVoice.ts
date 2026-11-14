import { useEffect, useRef } from 'react';
import { createContinuousVoice, type ContinuousRecognizer } from './continuousVoiceCore';
import { isPrioritySpeaking, isSpeechPaused, canListenDuringSpeech } from './speech';

export function useContinuousVoice(enabled:boolean,onCommand:(text:string)=>void,onError:(message:string)=>void,onListening?:()=>void) {
  const latest=useRef({onCommand,onError,onListening});latest.current={onCommand,onError,onListening};
  const diagnostics=useRef({state:'inactive',transcript:''});
  useEffect(()=>{
    if (!enabled) return;
    const voiceWindow=window as Window & {
      SpeechRecognition?:new()=>ContinuousRecognizer;
      webkitSpeechRecognition?:new()=>ContinuousRecognizer;
    };
    const Recognition=voiceWindow.SpeechRecognition ?? voiceWindow.webkitSpeechRecognition;
    if (!Recognition) {
      diagnostics.current.state='unsupported';
      latest.current.onError('이 브라우저는 계속 듣기를 지원하지 않아요. 화면의 그만 버튼으로 멈춰 주세요.');
      return;
    }
    const listener=createContinuousVoice({
      create:()=>new Recognition(),
      // Speech only filters non-stop commands; listening itself stays active.
      isSpeaking:()=>isPrioritySpeaking() && !isSpeechPaused(),
      canStartDuringSpeech:canListenDuringSpeech,
      isHidden:()=>document.hidden,
      onCommand:text=>latest.current.onCommand(text),
      onError:message=>latest.current.onError(message),
      onStatus:state=>{diagnostics.current.state=state;if(state==='listening')latest.current.onListening?.();},
      onTranscript:text=>{diagnostics.current.transcript=text;},
    });
    listener.tick();
    const timer=window.setInterval(()=>listener.tick(),100);
    const visibility=()=>listener.tick();
    document.addEventListener('visibilitychange',visibility);
    return ()=>{clearInterval(timer);document.removeEventListener('visibilitychange',visibility);listener.dispose();diagnostics.current.state='inactive';};
  },[enabled]);
  return diagnostics.current;
}
