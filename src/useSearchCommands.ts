import { useEffect, useRef, useState, type RefObject } from 'react';
import { api } from './api';
import { captureFrame, captureRegion } from './capture';
import { speak, cancelSpeech, isPrioritySpeaking } from './speech';
import type { DetectionTrack } from './detectionTracks';
import { createAutoGripGate } from './autoGrip';
import { relativeHandlePoint, followHandlePoint } from './gripGeometry';
import { findRecordingId } from './recordedSpeech';

export function useSearchCommands(video: RefObject<HTMLVideoElement | null>, selected: RefObject<DetectionTrack | undefined>, describeEnabled: RefObject<boolean | undefined>, autoDescribeEnabled: RefObject<boolean>, position?: RefObject<{text:string;clipId?:string} | undefined>, chooseTarget?: RefObject<((text:string)=>boolean) | undefined>,onComplete?:()=>void) {
  const [session, setSession] = useState({ running: false, targets: [] as string[], objectKo: '', revision: 0 });
  const latestSession = useRef(session); latestSession.current = session;
  const [outcome, setOutcome] = useState<'idle' | 'searching' | 'unknown' | 'done'>('idle');
  const [safety, setSafety] = useState<string>();
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [handlePoint, setHandlePoint] = useState<{ u: number; v: number; targetId: number }>();
  const [graspTip, setGraspTip] = useState<{text:string;targetId:number}>();
  const [paused,setPaused] = useState(false);
  const pausedRef=useRef(false);
  const [hazard,setHazard]=useState<{kind:string;targetId:number}>();
  const urgentHandle=useRef<{id:number;at:number}|undefined>(undefined);
  const handleTarget = useRef<number | undefined>(undefined);
  const controller = useRef<AbortController | undefined>(undefined);
  const generation = useRef(0);
  const describeLock = useRef(false);
  const describeTarget = useRef<number | undefined>(undefined);
  const autoGrip = useRef(createAutoGripGate());
  const refreshReady = useRef(false);
  const nextRefreshAt = useRef(Infinity);
  const warned = useRef(new Set<string>());
  const alive = useRef(true);
  const notify = (text: string, onFinish?: () => void) => { setMessage(text); speak(text, onFinish); };
  function cancelPending() {
    generation.current++; controller.current?.abort(); controller.current = undefined;
    describeLock.current = false; describeTarget.current = undefined; setBusy(false);
    nextRefreshAt.current = performance.now() + 10000;
  }
  function pause(){cancelPending();cancelSpeech();setSafety(undefined);pausedRef.current=true;setPaused(true);}
  function resume(){pausedRef.current=false;setPaused(false);}
  function where() {
    const reply = latestSession.current.running ? position?.current : undefined;
    const text = reply?.text || (latestSession.current.running ? '아직 찾고 있어요. 폰을 천천히 돌려 주세요.' : '먼저 찾을 물건을 말씀해 주세요.');
    setMessage(text); speak(text,()=>{if(pausedRef.current)resume();},{clipId:reply ? reply.clipId : latestSession.current.running ? 'where_searching' : 'no_task_where'});
  }
  function cancel(stopSpeech = true) {
    generation.current++; controller.current?.abort(); controller.current = undefined;
    describeLock.current = false; describeTarget.current = undefined; handleTarget.current = undefined; setBusy(false); setHandlePoint(undefined); setSafety(undefined);
    setGraspTip(undefined);
    if (stopSpeech) cancelSpeech();
  }
  function stop() {
    resume();
    cancel(); setOutcome('idle'); setSession(s => ({ ...s, running: false, revision: s.revision + 1 })); notify('안내를 멈췄어요.');
  }
  function start() {
    resume();
    cancel();
    setOutcome('idle');
    setMessage('');
    setSession(s => ({ running: false, targets: [], objectKo: '', revision: s.revision + 1 }));
  }
  function timeout() {
    resume();
    cancel(false); setOutcome('unknown');
    setSession(s=>({...s,running:false,revision:s.revision+1}));
    const text = '이 주변에서는 찾지 못했어요. 다시 찾으려면 말하기 버튼을 눌러 주세요.';
    setMessage(text); speak(text,undefined,{clipId:'search_timeout'});
  }
  function unknown(text: string) {
    resume();
    cancel(false); setOutcome('unknown'); setSession(s => ({ ...s, running: false, revision: s.revision + 1 })); notify(text);
  }
  function find(targets: string[], objectKo = '') {
    resume();
    const cleaned = [...new Set(targets.map(t => t.trim().toLowerCase()).filter(Boolean))];
    if (!cleaned.length || cleaned.length > 10 || cleaned.some(t => !/^[a-z0-9][a-z0-9 '\-]{0,49}$/.test(t))) {
      notify('영어 물체 이름을 1개에서 10개까지 입력해 주세요.'); return;
    }
    cancel(false); setSession(s => ({ running: true, targets: cleaned, objectKo, revision: s.revision + 1 }));
    setOutcome('searching');
    const text=`${objectKo || cleaned.join(', ')} 찾을게요. 폰을 천천히 돌려주세요.`;
    setMessage(text);speak(text,undefined,{clipId:findRecordingId(objectKo)});
  }
  async function describe(automatic = false) {
    if (describeLock.current) return;
    const item = selected.current;
    if (!item || item.missing) { if (!automatic) notify('먼저 물체를 카메라에 비춰 주세요.',resume); return; }
    if (describeEnabled.current === false) { if (!automatic) notify('서버의 설명 기능이 비활성화되어 있습니다. 물체 탐지는 계속합니다.',resume); return; }
    // Coordinate refreshes preserve the displayed point and ongoing guidance.
    if (!automatic) cancelPending();
    describeLock.current = true;
    describeTarget.current = item.id;
    autoGrip.current.mark();
    refreshReady.current = true;
    nextRefreshAt.current = Infinity;
    const token = generation.current;
    const resumeAfter= !automatic && pausedRef.current;
    const finishDescription=()=>{if(resumeAfter&&alive.current&&generation.current===token)resume();};
    const request = new AbortController(); controller.current = request;
    if (!automatic) { setBusy(true); notify('잡는 방법을 확인하고 있어요.'); }
    try {
      if (!video.current) throw new Error('카메라를 준비해 주세요.');
      const region=captureRegion(item);
      const image = await captureFrame(video.current, request.signal, region);
      const result = await api.describe(image, request.signal, latestSession.current.objectKo || item.label);
      if (!alive.current || document.hidden || request.signal.aborted || generation.current !== token || selected.current?.id !== item.id || (!pausedRef.current&&selected.current.missing && performance.now()-selected.current.lastSeen >= 2000)) return;
      const relative = result.handlePoint && relativeHandlePoint(followHandlePoint({u:result.handlePoint.x,v:result.handlePoint.y},region), item, .25);
      if (relative) { setHandlePoint({ ...relative, targetId: item.id }); handleTarget.current = item.id; }
      if(result.hazard)setHazard({kind:result.hazard,targetId:item.id});
      if (automatic && result.grasp) setGraspTip({text:result.grasp,targetId:item.id});
      const warningKey = result.hazard || result.safety;
      if (result.safety && warningKey && (!automatic || !warned.current.has(warningKey))) {
        warned.current.add(warningKey);
        setSafety(result.safety);
        setMessage(result.safety);
        speak(result.safety, reason => {
          if (reason === 'cancelled') warned.current.delete(warningKey);
          if (alive.current && generation.current === token) setSafety(undefined);
        }, {priority:'safety',maxDurationMs:5000});
      }
      if (automatic) return;
      const rest = result.grasp || result.sentences.find(sentence=>sentence!==result.safety) || '';
      if (rest) notify(rest,finishDescription);
      else if (!result.safety) notify('이 사진에서는 잡는 방법을 확인할 수 없어요.',finishDescription);
      else finishDescription();
    } catch (error) {
      if (!automatic && !request.signal.aborted && generation.current === token && alive.current) notify(error instanceof Error ? error.message : '설명을 가져오지 못했습니다.',finishDescription);
    } finally {
      if (generation.current === token && alive.current) {
        describeLock.current = false; describeTarget.current = undefined; controller.current = undefined;
        nextRefreshAt.current = performance.now() + 10000;
        if (!automatic) setBusy(false);
      }
    }
  }
  function requestHandle(){
    const item=selected.current,at=performance.now();
    if(!item||item.missing||describeLock.current||pausedRef.current||describeEnabled.current!==true)return;
    if(urgentHandle.current?.id===item.id&&at-urgentHandle.current.at<10000)return;
    urgentHandle.current={id:item.id,at};void describe(true);
  }
  useEffect(() => {
    autoGrip.current.reset(); refreshReady.current = false; nextRefreshAt.current = Infinity;
    warned.current.clear();
    urgentHandle.current=undefined;setHazard(undefined);
  }, [session.revision]);
  useEffect(() => {
    const timer = setInterval(() => {
      const item = selected.current;
      if (describeTarget.current !== undefined && (!item || item.id !== describeTarget.current || !pausedRef.current&&performance.now() - item.lastSeen >= 2000)) {
        cancelPending();
      }
      if (handleTarget.current !== undefined && (!item || !pausedRef.current&&performance.now()-item.lastSeen >= 2000 || item.id !== handleTarget.current)) {
        handleTarget.current = undefined; setHandlePoint(undefined); setSafety(undefined);
      }
      const enabled = !pausedRef.current && autoDescribeEnabled.current && describeEnabled.current === true && !document.hidden;
      if (enabled && refreshReady.current && !describeLock.current && item && !item.missing
        && performance.now() - item.lastSeen <= 2000 && performance.now() >= nextRefreshAt.current) {
        void describe(true);
        return;
      }
      // Automatic descriptions must not cancel the discovery announcement.
      if (!isPrioritySpeaking() && autoGrip.current.update(item, performance.now(), enabled) && !describeLock.current) void describe(true);
    }, 100);
    return () => clearInterval(timer);
  }, []);
  async function command(text: string) {
    const trimmed = text.trim();
    if (!trimmed) return;
    // An explicit stop must work even if the server is offline.
    if (/^(그만(?:해|해요|해줘|해주세요)?|멈춰(?:줘|주세요)?|중지|정지|stop)[.!?\s]*$/i.test(trimmed.replace(/\s+/g,''))) { stop(); return; }
    if (chooseTarget?.current?.(trimmed)) { cancelPending();resume(); return; }
    if (!/안\s*잡|못\s*잡|잡지\s*않/.test(trimmed)&&/^(?:.+\s+)?잡았(?:어|어요|습니다)[.!?\s]*$/.test(trimmed)) {
      resume();
      cancel(false); setOutcome('done'); setSession(s => ({ ...s, running: false, revision: s.revision + 1 }));
      const token=generation.current;onComplete?.();
      notify('잡으셨군요. 안내를 마칠게요.',()=>{if(generation.current===token&&alive.current)setOutcome('idle');}); return;
    }
    if (/^(?:지금\s*)?어디\s*(?:있어|있어요|있나요)?[.!?\s]*$/.test(trimmed)) { cancelPending(); where(); return; }
    if (/어떻게.*잡|잡는\s*방법/.test(trimmed)) {cancelPending();await describe();return;}
    cancelPending(); const token = generation.current;
    const request = new AbortController(); controller.current = request;
    setBusy(true); notify('명령을 이해하고 있어요.');
    try {
      const result = await api.parse(trimmed, request.signal);
      if (!alive.current || request.signal.aborted || token !== generation.current) return;
      if (result.intent === 'stop') stop();
      else if (result.intent === 'where' && latestSession.current.running && (!result.targets.length || result.targets.every(t => latestSession.current.targets.includes(t)))) where();
      else if (result.intent === 'find' || result.intent === 'where') {
        if (result.targets.length) find(result.targets, result.object_ko || '');
        else unknown('찾을 물체를 이해하지 못했어요. 다른 이름으로 말씀해 주세요.');
      } else if (result.intent === 'how') { await describe(); }
      else unknown('아직 이해하지 못했어요. 다른 이름으로 말씀해 주세요.');
    } catch (error) {
      if (!request.signal.aborted && token === generation.current && alive.current) unknown(`${error instanceof Error ? error.message : '명령 해석에 실패했습니다.'} 잠시 후 다시 말씀해 주세요.`);
    } finally { if (token === generation.current && alive.current) setBusy(false); }
  }
  useEffect(() => {
    alive.current = true;
    const hide = () => { if (document.hidden) cancel(); };
    document.addEventListener('visibilitychange', hide);
    return () => { alive.current = false; generation.current++; controller.current?.abort(); cancelSpeech(); document.removeEventListener('visibilitychange', hide); };
  }, []);
  useEffect(() => {
    if (!safety) return;
    const timer = setTimeout(() => setSafety(undefined), 5000);
    return () => clearTimeout(timer);
  }, [safety]);
  return { session, message, busy, handlePoint, graspTip, hazard, paused, safety, outcome, command, start, stop, pause, find, describe, requestHandle, cancelPending, timeout };
}
