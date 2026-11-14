import { StrictMode, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './style.css';
import { useObjectDetection } from './useObjectDetection';
import { HandOverlay } from './HandOverlay';
import { fingerGuidance, projectBox, projectPoint } from './sceneGeometry';
import { useSceneSpeech } from './useSceneSpeech';
import { useBackendDetection } from './useBackendDetection';
import { useSearchCommands } from './useSearchCommands';
import type { DetectionTrack } from './detectionTracks';
import { CameraHUD, StartScreen } from './CameraHUD';
import { deriveScene, screenDirection } from './sceneUI';
import { unlockFeedback, guideCue, phoneCue, stopFeedback, vibrate } from './audioFeedback';
import { speak, cancelSpeech, isPrioritySpeaking, getSpeechLog, getPlaybackMode } from './speech';
import { followHandlePoint, bladeZone, createBladeWarningGate, SHARP_LABELS } from './gripGeometry';
import { createPhoneLossNoticeGate, handOccludesTarget, lostDirection, createPhoneAlignmentGate, createGuidancePhase } from './phoneGuidance';
import { useWakeLock } from './useWakeLock';
import { foundRecordingId, findRecordingId, preloadRecordings } from './recordedSpeech';
import { createTargetLock, createTargetChoiceGate } from './targetLock';
import { createPushToTalk, type PushRecognizer } from './pushToTalkCore';

function App() {
  const [started, setStarted] = useState(false);
  const [cameraAttempt, setCameraAttempt] = useState(0);
  const cameraFailure = useRef<{text:string;clipId:string} | undefined>(undefined);
  const [cameraError, setCameraError] = useState(false);
  const [dev, setDev] = useState(() => location.hash === '#dev');
  const [now, setNow] = useState(() => performance.now());
  const lastSeen = useRef<{ at: number; x: number; item: DetectionTrack } | undefined>(undefined);
  const lossNotices = useRef(createPhoneLossNoticeGate());
  const searchStarted = useRef(performance.now());
  const lastSearchHint = useRef(performance.now());
  const video = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState('카메라를 준비하고 있습니다.');
  const recognition = useRef<PushRecognizer | null>(null);
  const voiceSession=useRef<ReturnType<typeof createPushToTalk>|undefined>(undefined);
  const phaseGate=useRef(createGuidancePhase());
  const alignmentGate=useRef(createPhoneAlignmentGate());
  const bladeGate=useRef(createBladeWarningGate());
  const [bladeWarning,setBladeWarning]=useState<string>();
  const bladeSpeaking=useRef(false);
  const handleHold=useRef<number|undefined>(undefined);
  const [listening, setListening] = useState(false);
  const [voiceMessage, setVoiceMessage] = useState('');
  const [voiceError, setVoiceError] = useState<string>();
  const [cameraReady, setCameraReady] = useState(false);
  useWakeLock(cameraReady);
  const [viewport, setViewport] = useState({ width: 1, height: 1 });
  const selected = useRef<DetectionTrack | undefined>(undefined);
  const targetLock = useRef(createTargetLock());
  const targetChoices = useRef(createTargetChoiceGate());
  const [choicePrompt,setChoicePrompt] = useState<string>();
  const [,refreshChoice] = useState(0);
  const chooseTarget = useRef<((text:string)=>boolean) | undefined>(undefined);
  const descriptionCapability = useRef<boolean | undefined>(undefined);
  const autoDescribeEnabled = useRef(false);
  const position = useRef<{text:string;clipId?:string} | undefined>(undefined);
  const search = useSearchCommands(video, selected, descriptionCapability, autoDescribeEnabled, position, chooseTarget,()=>vibrate([80,60,80]));
  const { session } = search;
  const backend = useBackendDetection(video, cameraReady, session.running, session.targets, session.objectKo, session.revision,search.paused);
  descriptionCapability.current = backend.describeEnabled;
  const targeted = session.targets.length > 0;
  autoDescribeEnabled.current = cameraReady && session.running && targeted && backend.active && !listening && !search.paused && !search.busy && !search.safety;
  const local = useObjectDetection(video, cameraReady, { enabled: session.running, objects: session.running && !backend.active,
    targets: targeted ? session.targets : null });
  const detections = session.running ? (backend.active ? backend.detections : local.detections) : [];
  const { detectionMessage, hands, handMessage } = local;
  const source = { x: 0, y: 0, width: video.current?.videoWidth || 1, height: video.current?.videoHeight || 1 };
  const screen = { x: 0, y: 0, ...viewport };
  const visible = detections.map(item => ({ item, rect: projectBox(item, source, screen) }))
    .filter(({ rect }) => rect.width > 0 && rect.height > 0);
  const current = visible.filter(({ item }) => !item.missing);
  const primary = targetLock.current.update(visible, now, viewport, session.revision);
  chooseTarget.current = text => {
    const choice = targetChoices.current.answer(text,current);
    if (!choice) return false;
    targetLock.current.choose(choice.target.item.id);phaseGate.current.reset(); setChoicePrompt(undefined); refreshChoice(value=>value+1);
    speak(`${choice.side} 물건으로 안내할게요.`); return true;
  };
  selected.current = primary?.item;
  const guideRect = primary?.rect ?? (lastSeen.current ? projectBox(lastSeen.current.item, source, screen) : undefined);
  const nearestHand = guideRect ? hands.map(hand => {
    const thumb = projectPoint(hand[4], source, screen);
    const index = projectPoint(hand[8], source, screen);
    return { thumb, index, distance: fingerGuidance({ x: (thumb.x + index.x) / 2, y: (thumb.y + index.y) / 2 }, guideRect, screen).fraction };
  }).filter(({thumb,index}) => [thumb,index].every(p => p.x >= 0 && p.x <= viewport.width && p.y >= 0 && p.y <= viewport.height))
    .sort((a,b) => a.distance - b.distance)[0] : undefined;
  const guidance = primary && nearestHand
    ? `엄지: ${fingerGuidance(nearestHand.thumb, primary.rect, screen).text}. 검지: ${fingerGuidance(nearestHand.index, primary.rect, screen).text}.`
    : '';
  const handlePoint = search.handlePoint && primary && (!primary.item.missing || now-primary.item.lastSeen < 2000) && search.handlePoint.targetId === primary.item.id
    ? followHandlePoint(search.handlePoint,primary.item) : undefined;
  const handPoint = nearestHand?.index;
  const cx=guideRect?(guideRect.x+guideRect.width/2)/viewport.width:.5;
  const alignmentDirection = guideRect ? alignmentGate.current.update(cx,session.revision) : undefined;
  const centered = !!guideRect && !alignmentDirection;
  const sharp=!!primary&&(SHARP_LABELS.has((primary.item.name||'').toLowerCase())||SHARP_LABELS.has(primary.item.label)||search.hazard?.targetId===primary.item.id&&search.hazard.kind==='sharp');
  const waitingHandle=sharp&&!handlePoint;
  const destination = handlePoint ? projectPoint(handlePoint, source, screen) : !sharp && guideRect ? { x: guideRect.x + guideRect.width / 2, y: guideRect.y + guideRect.height / 2 } : undefined;
  const foundVisible = !!primary && (!primary.item.missing || now-primary.item.lastSeen < 2000);
  const occluded = !foundVisible && handOccludesTarget(handPoint, destination, viewport);
  const missingFor = !foundVisible && lastSeen.current ? now-lastSeen.current.at : 0;
  const lost = targeted && session.running && !occluded && missingFor > 2000;
  const researching = lost && missingFor >= 10000;
  const lostSide = lostDirection(lastSeen.current?.x ?? .5);
  const phase=phaseGate.current.update({now,revision:session.revision,visible:foundVisible||occluded,lost,centered,handVisible:!!handPoint,cx,
    enabled:session.running&&!search.paused&&!listening&&!search.busy&&!waitingHandle});
  const handPhase=phase.phase==='hand'&&!waitingHandle;
  const direction=handPhase&&handPoint&&destination?screenDirection(destination.x-handPoint.x,destination.y-handPoint.y):alignmentDirection;
  const effectiveSafety=bladeWarning||search.safety;
  const scene = deriveScene({ listening, busy: search.busy, running: session.running && targeted && !search.paused, cameraReady,
    cameraError, message: cameraError ? status : voiceError || search.message, safety: effectiveSafety, outcome: voiceError ? 'unknown' : search.outcome,
    targetLabel: primary?.item.label || session.objectKo, found: foundVisible || occluded, lost: lost && !researching,
    lostSide, guiding: handPhase && !!handPoint, centered,handPhase,waitingHandle,
    direction, timedOut: now - searchStarted.current > 30000 });
  const phoneText = !handPhase&&alignmentDirection ? `폰을 조금 ${alignmentDirection==='left'?'왼쪽':'오른쪽'}으로 돌려주세요.` : '';
  position.current = foundVisible && primary ? {
    text: `화면 ${alignmentDirection ? {left:'왼쪽',right:'오른쪽',up:'위쪽',down:'아래쪽'}[alignmentDirection] : '가운데'}에 있어요.`,
    clipId: alignmentDirection === 'left' ? 'pos_left' : alignmentDirection === 'right' ? 'pos_right' : !alignmentDirection ? 'pos_center' : undefined,
  } : undefined;
  useSceneSpeech(targeted ? foundVisible ? primary!.item : occluded ? lastSeen.current?.item : undefined : undefined,
    scene.state === 'guiding' ? `${scene.title}. ${scene.detail || ''}` : scene.state === 'found' ? phoneText : '', listening || search.paused || search.busy || !!effectiveSafety || !!choicePrompt || waitingHandle,
    session.revision, lost, undefined, !handPhase, handPhase, scene.state === 'guiding' && !scene.direction,
    scene.state === 'guiding' && scene.direction ? {left:'move_left',right:'move_right',up:'move_forward',down:'move_back'}[scene.direction]
      : scene.state === 'found' && alignmentDirection && ['left','right'].includes(alignmentDirection) ? `align_${alignmentDirection}` : undefined,
    scene.state === 'guiding' && search.graspTip?.targetId === primary?.item.id ? search.graspTip?.text : undefined,phase.notice);

  useEffect(()=>{
    if(!session.running||search.paused||listening||search.busy||!foundVisible||!waitingHandle||document.hidden){
      if(!waitingHandle)handleHold.current=undefined;return;
    }
    search.requestHandle();
    if(handleHold.current!==primary?.item.id){
      handleHold.current=primary?.item.id;
      cancelSpeech();stopFeedback();
      speak(backend.describeEnabled===false?'손잡이를 확인할 수 없어 손 안내를 멈췄어요. 손을 잠시 멈춰 주세요.':'손잡이를 확인하고 있어요. 손을 잠시 멈춰 주세요.',undefined,{priority:'safety',maxDurationMs:6000});
    }
  },[now,session.running,search.paused,listening,search.busy,foundVisible,waitingHandle,primary?.item.id,backend.describeEnabled]);
  useEffect(()=>{
    const zone=sharp&&guideRect&&destination&&handlePoint?bladeZone(guideRect,destination):undefined;
    const fingers=hands.flatMap(hand=>[projectPoint(hand[4],source,screen),projectPoint(hand[8],source,screen)]);
    const warning=bladeGate.current.update(primary?.item.id,zone,fingers,now,
      session.running&&sharp&&foundVisible&&!search.paused&&!listening&&!document.hidden);
    if(!warning.danger){
      setBladeWarning(undefined);
      if(bladeSpeaking.current){cancelSpeech();bladeSpeaking.current=false;}
      return;
    }
    const finger=zone&&fingers.find(p=>p.x>=zone.x-zone.width*.1&&p.x<=zone.x+zone.width*1.1&&p.y>=zone.y-zone.height*.1&&p.y<=zone.y+zone.height*1.1);
    const side=finger&&destination?screenDirection(destination.x-finger.x,destination.y-finger.y):undefined;
    const text=`멈추세요. 칼날 쪽이에요. ${side?`손잡이는 ${{left:'왼쪽',right:'오른쪽',up:'앞쪽',down:'몸 쪽'}[side]}이에요.`:'손잡이 쪽으로 손을 옮겨 주세요.'}`;
    setBladeWarning(previous=>previous===text?previous:text);
    if(warning.announce&&!bladeSpeaking.current){
      cancelSpeech();stopFeedback();bladeSpeaking.current=true;vibrate([400,150,400]);
      speak(text,()=>{bladeSpeaking.current=false;},{priority:'safety',maxDurationMs:6000});
    }
  },[now,primary?.item.id,sharp,foundVisible,session.running,search.paused,listening]);


  useEffect(() => {
    const timer = setInterval(() => setNow(performance.now()), 250);
    const hash = () => setDev(location.hash === '#dev'); window.addEventListener('hashchange', hash);
    return () => { clearInterval(timer); window.removeEventListener('hashchange', hash); };
  }, []);
  useEffect(() => { lastSeen.current = undefined; lossNotices.current.reset(); searchStarted.current = performance.now(); lastSearchHint.current = performance.now(); setChoicePrompt(undefined);setBladeWarning(undefined); }, [session.revision]);
  useEffect(() => {
    const event = targetChoices.current.update(current,now,session.revision,
      session.running && targeted && !search.paused && !listening && !search.busy && !effectiveSafety && !document.hidden && !isPrioritySpeaking());
    if (event?.type === 'ask') {
      const text = '같은 물건이 두 개 보여요. 왼쪽과 오른쪽 중 어느 쪽인가요?';
      setChoicePrompt(text);
      speak(text,()=>targetChoices.current.startDeadline(performance.now()));
    } else if (event?.type === 'choose') {
      targetLock.current.choose(event.target.item.id);phaseGate.current.reset(); setChoicePrompt(undefined); refreshChoice(value=>value+1);
      speak(`${event.side} 물건으로 안내할게요.`);
    } else if (event?.type === 'dismiss') setChoicePrompt(undefined);
  }, [now,session.revision,session.running,search.paused,listening,search.busy,effectiveSafety,targeted]);
  useEffect(() => {
    if (primary && !primary.item.missing) lastSeen.current = { at: primary.item.lastSeen, x: (primary.rect.x + primary.rect.width / 2) / viewport.width, item: primary.item };
  }, [primary?.item.lastSeen, primary?.item.id]);
  useEffect(() => {
    if (!targeted || search.paused || listening || choicePrompt || scene.state !== 'guiding' || !direction || !nearestHand) return;
    let last = 0;
    const timer = setInterval(() => {
      if (document.hidden || isPrioritySpeaking() || window.speechSynthesis?.speaking || window.speechSynthesis?.pending) return;
      const timestamp = performance.now();
      const interval = Math.max(100, Math.min(800, nearestHand.distance * 2000));
      if (timestamp - last >= interval) { guideCue(direction === 'left' ? -1 : direction === 'right' ? 1 : 0); last = timestamp; }
    }, 100);
    return () => clearInterval(timer);
  }, [scene.state, direction, search.paused,listening, choicePrompt, Math.round((nearestHand?.distance ?? 0) * 10)]);
  useEffect(() => {
    const notice = lossNotices.current.update(missingFor, lostSide, now,
      lost && !search.paused && !listening && !search.busy && !effectiveSafety && !document.hidden && !isPrioritySpeaking(), foundVisible);
    if (notice) {phoneCue();speak(notice, undefined, {priority:'guidance',clipId:researching ? 'lost_research' : lostSide ? `lost_turn_${lostSide}` : 'turn_phone'});}
  }, [now, missingFor, lost, lostSide, foundVisible, search.paused,listening, search.busy,effectiveSafety]);
  useEffect(() => {
    if (!session.running || !targeted || search.paused || listening || search.busy || effectiveSafety || document.hidden || isPrioritySpeaking()) return;
    if (!occluded && now-(lastSeen.current?.at ?? searchStarted.current) >= 120000) { search.timeout(); return; }
    if (scene.state === 'searching' && !lastSeen.current && now-lastSearchHint.current >= 10000) {
      lastSearchHint.current = now;
      speak('아직 못 찾았어요. 계속 천천히 돌려 주세요.',undefined,{priority:'guidance',clipId:'search_hint'});
    }
  }, [now,session.running,scene.state,search.paused,listening,search.busy,effectiveSafety,targeted,occluded]);
  useEffect(()=>{if(voiceError)speak(voiceError);},[voiceError]);
  useEffect(() => {
    if (started && handMessage.includes('없어요')) speak('손 추적을 사용할 수 없어요. 페이지를 새로고침해 주세요.',undefined,{clipId:'fatal_hand'});
  }, [started,handMessage]);
  useEffect(() => {
    if (!started) return;
    const controller = new AbortController();
    void preloadRecordings(controller.signal);
    return () => controller.abort();
  }, [started]);
  useEffect(() => {
    const controller = new AbortController();
    const ids = [findRecordingId(session.objectKo),foundRecordingId(session.objectKo)].filter((id): id is string => !!id);
    if (ids.length) void preloadRecordings(controller.signal,ids);
    return () => controller.abort();
  }, [session.objectKo]);

  useEffect(() => {
    const element = video.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      setViewport({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [started]);

  useEffect(()=>()=>voiceSession.current?.dispose(),[]);
  useEffect(()=>{
    const hide=()=>{if(document.hidden)voiceSession.current?.dispose();};
    document.addEventListener('visibilitychange',hide);
    return ()=>document.removeEventListener('visibilitychange',hide);
  },[]);
  useEffect(()=>{voiceSession.current?.dispose();},[session.revision]);
  function toggleVoice() {
    if (voiceSession.current) { voiceSession.current.stop(); return; }
    unlockFeedback();
    const afterStop=session.running || search.busy || search.paused;
    if(afterStop)search.pause();
    cancelSpeech(); stopFeedback();
    if (!cameraReady) {
      if (cameraError) setCameraAttempt(value=>value+1);
      const failure=cameraFailure.current;
      speak(failure?.text || '아직 카메라를 준비하고 있어요. 잠시 기다려 주세요.',undefined,{clipId:failure?.clipId || 'not_ready'});
      return;
    }
    setVoiceError(undefined);
    const voiceWindow=window as Window & {SpeechRecognition?:new()=>PushRecognizer;webkitSpeechRecognition?:new()=>PushRecognizer};
    const Recognition=voiceWindow.SpeechRecognition ?? voiceWindow.webkitSpeechRecognition;
    if(!Recognition){if(afterStop)stop();else setVoiceError('이 브라우저에서는 음성 인식을 지원하지 않습니다.');return;}
    const current=new Recognition();recognition.current=current;
    const controller=createPushToTalk(current,{
      afterStop,
      onText:text=>setVoiceMessage(text),
      onCommand:text=>{if(text==='그만')stop();else void search.command(text);},
      onStopped:()=>stop(),
      onError:code=>setVoiceError(code==='not-allowed'||code==='service-not-allowed'
        ? '마이크 권한을 허용한 뒤 다시 눌러 주세요.'
        : code==='no-speech' ? '음성이 들리지 않았어요. 다시 눌러 말씀해 주세요.'
        : '음성 인식을 사용할 수 없습니다. 마이크와 네트워크를 확인해 주세요.'),
      onEnd:()=>{
        if(recognition.current===current){recognition.current=null;voiceSession.current=undefined;setListening(false);if(!document.hidden)vibrate(20);}
      },
    });
    voiceSession.current=controller;setListening(true);setVoiceMessage('');
    controller.start();
  }
  useEffect(() => {
    if (!started) return;
    setCameraReady(false); setCameraError(false);
    cameraFailure.current = undefined;
    let disposed = false;
    let stream: MediaStream | null = null;
    const element = video.current;

    async function startCamera() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraError(true); setStatus('카메라를 사용할 수 없습니다. HTTPS로 접속해 주세요.');
        cameraFailure.current = {text:'카메라를 사용할 수 없습니다. HTTPS로 접속해 주세요.',clipId:'start_camera_missing'};
        speak(cameraFailure.current.text,undefined,{clipId:cameraFailure.current.clipId});
        return;
      }
      try {
        const next = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
            frameRate: { ideal: 30, max: 30 },
          },
          audio: false,
        });
        if (disposed) {
          next.getTracks().forEach(track => track.stop());
          return;
        }
        stream = next;
        if (element) {
          element.srcObject = next;
          await element.play();
        }
        if (!disposed) {
          setStatus('카메라가 켜졌습니다.'); setCameraReady(true);
          speak('준비됐어요. 말하기 버튼을 누르고 찾을 물건을 말씀해 주세요.',undefined,{clipId:'ready'});
        }
      } catch (error) {
        stream?.getTracks().forEach(track => track.stop());
        if (!disposed) {
          if (element) element.srcObject = null;
          setStatus('카메라를 켤 수 없습니다. 브라우저의 카메라 권한과 연결 상태를 확인한 뒤 새로고침해 주세요.');
          setCameraError(true);
          const name = error instanceof DOMException ? error.name : '';
          cameraFailure.current = name === 'NotAllowedError' || name === 'SecurityError'
            ? {text:'카메라 권한을 허용한 뒤 다시 시작해 주세요.',clipId:'start_camera_denied'}
            : name === 'NotFoundError' || name === 'OverconstrainedError'
              ? {text:'카메라를 찾을 수 없어요. 연결을 확인해 주세요.',clipId:'start_camera_missing'}
              : {text:'카메라를 사용할 수 없어요. 다른 앱에서 사용 중인지 확인해 주세요.',clipId:'start_camera_busy'};
          setStatus(cameraFailure.current.text);
          speak(cameraFailure.current.text,undefined,{clipId:cameraFailure.current.clipId});
        }
      }
    }

    void startCamera();
    return () => {
      disposed = true;
      stream?.getTracks().forEach(track => track.stop());
      if (element && element.srcObject === stream) element.srcObject = null;
    };
  }, [started,cameraAttempt]);



  function stop() {
    voiceSession.current?.dispose();voiceSession.current=undefined;recognition.current=null;stopFeedback();
    setListening(false); search.stop(); setVoiceMessage(''); setVoiceError(undefined);
  }
  if (!started) return <StartScreen onStart={()=>{unlockFeedback();search.start();setStarted(true);}} />;
  return <main className={`camera-screen scene-${scene.state}`}>
    <video ref={video} autoPlay muted playsInline aria-label="카메라 미리보기" />
    <div className="detection-overlay" aria-hidden="true">
      {current.filter(({ item }) => item.id !== primary?.item.id).map(({ item, rect }) => <div key={item.id} className="detection-box detection-secondary" style={{ left: rect.x, top: rect.y, width: rect.width, height: rect.height }} />)}
      {primary && !lost && <div key={primary.item.id} className={`detection-box${primary.item.missing ? ' is-missing' : ''}`} style={{ left: primary.rect.x, top: primary.rect.y, width: primary.rect.width, height: primary.rect.height }}>
        <i className="box-corner top-left" /><i className="box-corner top-right" /><i className="box-corner bottom-left" /><i className="box-corner bottom-right" />
      </div>}
    </div>
    {handlePoint && (() => {
      const point = projectPoint(handlePoint, source, screen);
      if (point.x < 0 || point.y < 0 || point.x > screen.width || point.y > screen.height) return null;
      return <div className={`handle-point${scene.state === 'guiding' ? ' guiding' : ''}`} style={{ left: point.x, top: point.y }} aria-label="서버가 추정한 잡을 위치">
        {scene.state === 'guiding' && <><i className="target-halo" /><i className="target-ring" /></>}
        <span>{primary?.item.label === '컵' ? '손잡이' : '잡을 위치'}</span>
      </div>;
    })()}
    {targeted && !lost && <HandOverlay hands={hands} source={source} viewport={screen} />}
    <CameraHUD scene={choicePrompt && !effectiveSafety ? {...scene,title:choicePrompt,detail:'버튼을 누르고 왼쪽 또는 오른쪽이라고 말씀해 주세요.',direction:undefined} : scene} heard={voiceMessage} active={session.running&&!search.paused} pending={search.busy} onVoice={toggleVoice} />
    {dev && <aside className="dev-panel" aria-label="개발 정보">
      <b>개발 정보</b>
      <p>{backend.status}</p><p>{handMessage}</p><p>{detectionMessage}</p>
      <p>음성 입력: {listening?'한 번 듣는 중':'꺼짐'} · 인식: {voiceMessage || '없음'}</p>
      <p>안내 재생: {getPlaybackMode()}</p>
      <p>{primary ? `${primary.item.label} · 신뢰도 ${Math.round(primary.item.score * 100)}%` : '탐지 없음'}</p>
      {primary && <p>실제 이름: {primary.item.name || '로컬 탐지'} · 정확 일치: {primary.item.exact ? '예' : '아니요'}</p>}
      <b>최근 음성 종료 기록</b>
      <ol>{getSpeechLog().map((entry,index)=><li key={`${entry.at}-${index}`}>{entry.reason} · {entry.text}<small>{entry.caller}</small></li>)}</ol>
      <p>{guidance}</p><p>{search.message}</p>
      <button type="button" onClick={backend.reconnect}>서버 재연결</button>
      <button type="button" disabled={!primary || search.busy || backend.describeEnabled === false} onClick={() => { void search.describe(); }}>잡는 방법 확인</button>
    </aside>}
  </main>;
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
