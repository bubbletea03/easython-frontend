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
import { unlockFeedback, listeningCue, guideCue, vibrate } from './audioFeedback';
import { speak, cancelSpeech, isPrioritySpeaking, getSpeechLog, getPlaybackMode } from './speech';
import { followHandlePoint } from './gripGeometry';
import { createPhoneLossNoticeGate, handOccludesTarget, lostDirection, gridAlignment } from './phoneGuidance';
import { useWakeLock } from './useWakeLock';
import { foundRecordingId, findRecordingId, preloadRecordings } from './recordedSpeech';
import { createTargetLock, createTargetChoiceGate } from './targetLock';
import { useContinuousVoice } from './useContinuousVoice';

type VoiceRecognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
};

function App() {
  const [started, setStarted] = useState(false);
  const [cameraAttempt, setCameraAttempt] = useState(0);
  const cameraFailure = useRef<{text:string;clipId:string} | undefined>(undefined);
  const voiceUnlocked = useRef(false);
  const preparingVoice = useRef(false);
  const [cameraError, setCameraError] = useState(false);
  const [dev, setDev] = useState(() => location.hash === '#dev');
  const [now, setNow] = useState(() => performance.now());
  const lastSeen = useRef<{ at: number; x: number; item: DetectionTrack } | undefined>(undefined);
  const lossNotices = useRef(createPhoneLossNoticeGate());
  const searchStarted = useRef(performance.now());
  const lastSearchHint = useRef(performance.now());
  const video = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState('카메라를 준비하고 있습니다.');
  const recognition = useRef<VoiceRecognition | null>(null);
  const voiceStartTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [listening, setListening] = useState(false);
  const [voiceMessage, setVoiceMessage] = useState('');
  const [voiceError, setVoiceError] = useState<string>();
  const [handsFreeError,setHandsFreeError] = useState<string>();
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
  const search = useSearchCommands(video, selected, descriptionCapability, autoDescribeEnabled, position, chooseTarget);
  const { session } = search;
  const voiceDiagnostics=useContinuousVoice(cameraReady && session.running && !listening,
    text=>{
      setVoiceMessage(text);
      if (text==='그만') stop();
      else void search.command(text);
    },message=>setHandsFreeError(message),()=>setHandsFreeError(undefined));
  const backend = useBackendDetection(video, cameraReady, session.running, session.targets, session.objectKo, session.revision);
  descriptionCapability.current = backend.describeEnabled;
  const targeted = session.targets.length > 0;
  autoDescribeEnabled.current = cameraReady && session.running && targeted && backend.active && !listening && !search.busy && !search.safety;
  const local = useObjectDetection(video, cameraReady, { enabled: session.running || search.outcome==='done', objects: session.running && !backend.active,
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
    targetLock.current.choose(choice.target.item.id); setChoicePrompt(undefined); refreshChoice(value=>value+1);
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
  const alignmentDirection = guideRect ? gridAlignment((guideRect.x+guideRect.width/2)/viewport.width, (guideRect.y+guideRect.height/2)/viewport.height) : undefined;
  const centered = !!guideRect && !alignmentDirection;
  const destination = handlePoint ? projectPoint(handlePoint, source, screen) : guideRect ? { x: guideRect.x + guideRect.width / 2, y: guideRect.y + guideRect.height / 2 } : undefined;
  const direction = centered && handPoint && destination ? screenDirection(destination.x - handPoint.x, destination.y - handPoint.y)
    : alignmentDirection;
  const foundVisible = !!primary && (!primary.item.missing || now-primary.item.lastSeen < 2000);
  const occluded = !foundVisible && handOccludesTarget(handPoint, destination, viewport);
  const missingFor = !foundVisible && lastSeen.current ? now-lastSeen.current.at : 0;
  const lost = targeted && session.running && !occluded && missingFor > 2000;
  const researching = lost && missingFor >= 10000;
  const lostSide = lostDirection(lastSeen.current?.x ?? .5);
  const scene = deriveScene({ listening, busy: search.busy, running: session.running && targeted, cameraReady,
    cameraError, message: cameraError ? status : voiceError || search.message, safety: search.safety, outcome: voiceError ? 'unknown' : search.outcome,
    targetLabel: primary?.item.label || session.objectKo, found: foundVisible || occluded, lost: lost && !researching,
    lostSide, guiding: centered && !!handPoint, centered,
    direction, timedOut: now - searchStarted.current > 30000 });
  const phoneText = alignmentDirection ? `폰을 조금 ${{left:'왼쪽',right:'오른쪽',up:'위쪽',down:'아래쪽'}[alignmentDirection]}으로 돌려주세요.` : '';
  position.current = foundVisible && primary ? {
    text: `화면 ${alignmentDirection ? {left:'왼쪽',right:'오른쪽',up:'위쪽',down:'아래쪽'}[alignmentDirection] : '가운데'}에 있어요.`,
    clipId: alignmentDirection === 'left' ? 'pos_left' : alignmentDirection === 'right' ? 'pos_right' : !alignmentDirection ? 'pos_center' : undefined,
  } : undefined;
  useSceneSpeech(targeted ? foundVisible ? primary!.item : occluded ? lastSeen.current?.item : undefined : undefined,
    scene.state === 'guiding' ? `${scene.title}. ${scene.detail || ''}` : scene.state === 'found' ? phoneText : '', listening || search.busy || !!search.safety || !!choicePrompt,
    session.revision, lost, centered ? '물건이 가운데에 있어요. 이제 손을 뻗어 주세요.' : undefined, scene.state === 'found', centered, scene.state === 'guiding' && !scene.direction,
    scene.state === 'guiding' && scene.direction ? {left:'move_left',right:'move_right',up:'move_forward',down:'move_back'}[scene.direction]
      : scene.state === 'found' && alignmentDirection && ['left','right'].includes(alignmentDirection) ? `align_${alignmentDirection}` : undefined,
    scene.state === 'guiding' && search.graspTip?.targetId === primary?.item.id ? search.graspTip?.text : undefined);


  useEffect(() => {
    const timer = setInterval(() => setNow(performance.now()), 250);
    const hash = () => setDev(location.hash === '#dev'); window.addEventListener('hashchange', hash);
    return () => { clearInterval(timer); window.removeEventListener('hashchange', hash); };
  }, []);
  useEffect(() => { lastSeen.current = undefined; lossNotices.current.reset(); searchStarted.current = performance.now(); lastSearchHint.current = performance.now(); setChoicePrompt(undefined); setHandsFreeError(undefined); }, [session.revision]);
  useEffect(() => {
    const event = targetChoices.current.update(current,now,session.revision,
      session.running && targeted && !listening && !search.busy && !search.safety && !document.hidden && !isPrioritySpeaking());
    if (event?.type === 'ask') {
      const text = '같은 물건이 두 개 보여요. 왼쪽과 오른쪽 중 어느 쪽인가요?';
      setChoicePrompt(text);
      speak(text,()=>targetChoices.current.startDeadline(performance.now()));
    } else if (event?.type === 'choose') {
      targetLock.current.choose(event.target.item.id); setChoicePrompt(undefined); refreshChoice(value=>value+1);
      speak(`${event.side} 물건으로 안내할게요.`);
    } else if (event?.type === 'dismiss') setChoicePrompt(undefined);
  }, [now,session.revision,session.running,listening,search.busy,search.safety,targeted]);
  useEffect(() => {
    if (primary && !primary.item.missing) lastSeen.current = { at: primary.item.lastSeen, x: (primary.rect.x + primary.rect.width / 2) / viewport.width, item: primary.item };
  }, [primary?.item.lastSeen, primary?.item.id]);
  useEffect(() => {
    if (!targeted || choicePrompt || scene.state !== 'guiding' || !nearestHand) return;
    let last = 0;
    const timer = setInterval(() => {
      if (document.hidden || isPrioritySpeaking() || window.speechSynthesis?.speaking || window.speechSynthesis?.pending) return;
      const timestamp = performance.now();
      const interval = Math.max(100, Math.min(800, nearestHand.distance * 2000));
      if (timestamp - last >= interval) { guideCue(direction === 'left' ? -1 : direction === 'right' ? 1 : 0); last = timestamp; }
    }, 100);
    return () => clearInterval(timer);
  }, [scene.state, direction, choicePrompt, Math.round((nearestHand?.distance ?? 0) * 10)]);
  useEffect(() => { if (scene.state === 'done') vibrate([80,60,80]); }, [scene.state]);
  useEffect(() => {
    const notice = lossNotices.current.update(missingFor, lostSide, now,
      lost && !listening && !search.busy && !search.safety && !document.hidden && !isPrioritySpeaking(), foundVisible);
    if (notice) speak(notice, undefined, {priority:'guidance',clipId:researching ? 'lost_research' : lostSide ? `lost_turn_${lostSide}` : 'turn_phone'});
  }, [now, missingFor, lost, lostSide, foundVisible, listening, search.busy, search.safety]);
  useEffect(() => {
    if (!session.running || !targeted || listening || search.busy || search.safety || document.hidden || isPrioritySpeaking()) return;
    if (!occluded && now-(lastSeen.current?.at ?? searchStarted.current) >= 120000) { search.timeout(); return; }
    if (scene.state === 'searching' && !lastSeen.current && now-lastSearchHint.current >= 10000) {
      lastSearchHint.current = now;
      speak('아직 못 찾았어요. 계속 천천히 돌려 주세요.',undefined,{priority:'guidance',clipId:'search_hint'});
    }
  }, [now,session.running,scene.state,listening,search.busy,search.safety,targeted,occluded]);
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

  useEffect(() => () => {
    clearTimeout(voiceStartTimer.current);
    const current = recognition.current;
    if (current) {
      current.onresult = null;
      current.onerror = null;
      current.onend = null;
      current.abort();
      recognition.current = null;
    }
  }, []);

  useEffect(()=>{
    const hide=()=>{
      if(!document.hidden)return;
      clearTimeout(voiceStartTimer.current);voiceStartTimer.current=undefined;
      const current=recognition.current;
      if(current) {current.onend=current.onerror=current.onresult=null;current.abort();recognition.current=null;}
      setListening(false);
    };
    document.addEventListener('visibilitychange',hide);
    return ()=>document.removeEventListener('visibilitychange',hide);
  },[]);

  useEffect(() => {
    clearTimeout(voiceStartTimer.current); voiceStartTimer.current=undefined;
    const current = recognition.current;
    if (current) {
      current.onresult = current.onerror = current.onend = null;
      current.abort(); recognition.current = null; setListening(false);
    }
  }, [session.revision]);

  function toggleVoice() {
    if (!listening && (session.running || search.busy)) { stop(); return; }
    unlockFeedback();
    if (!cameraReady) {
      if (cameraError) { setCameraAttempt(value=>value+1); }
      const failure = cameraFailure.current;
      speak(failure?.text || '아직 카메라를 준비하고 있어요. 잠시 기다려 주세요.',undefined,{clipId:failure?.clipId || 'not_ready'});
      return;
    }
    search.cancelPending();
    setVoiceError(undefined);
    cancelSpeech();
    if (recognition.current) {
      if(preparingVoice.current || voiceStartTimer.current!==undefined) {
        preparingVoice.current=false;
        clearTimeout(voiceStartTimer.current);voiceStartTimer.current=undefined;
        recognition.current=null;setListening(false);
      } else recognition.current.stop();
      return;
    }
    const speechWindow = window as Window & {
      SpeechRecognition?: new () => VoiceRecognition;
      webkitSpeechRecognition?: new () => VoiceRecognition;
    };
    const Recognition = speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
    if (!Recognition) {
      setVoiceError('이 브라우저에서는 음성 인식을 지원하지 않습니다.');
      return;
    }
    const current = new Recognition();
    current.lang = 'ko-KR';
    current.continuous = false;
    current.interimResults = true;
    let receivedResult = false;
    let finalText = '';
    let failed = false;
    current.onresult = event => {
      const text = Array.from(event.results, result => result[0].transcript).join(' ').trim();
      if (text) {
        receivedResult = true;
        setVoiceMessage(text);
      }
      finalText = Array.from(event.results).filter(result => result.isFinal).map(result => result[0].transcript).join(' ').trim();
    };
    current.onerror = event => {
      failed = true;
      setVoiceError(event.error === 'not-allowed' || event.error === 'service-not-allowed'
        ? '마이크 권한을 허용한 뒤 다시 눌러 주세요.'
        : event.error === 'no-speech'
          ? '음성이 들리지 않았어요. 다시 눌러 말씀해 주세요.'
          : '음성 인식을 사용할 수 없습니다. 마이크와 네트워크를 확인해 주세요.');
    };
    current.onend = () => {
      recognition.current = null;
      setListening(false);
      listeningCue(false);
      if (finalText && !failed && !document.hidden) void search.command(finalText);
      if (!receivedResult && !failed) setVoiceError('음성이 들리지 않았어요. 다시 말씀해 주세요.');
    };
    recognition.current = current;
    setListening(true); setVoiceMessage('');
    const beginListening = () => {
      preparingVoice.current = false;
      if (recognition.current !== current || document.hidden) return;
      listeningCue(true);
    // The two cue tones finish after 190ms. Start recording after they stop.
    voiceStartTimer.current=setTimeout(()=>{
      voiceStartTimer.current=undefined;
      if(recognition.current!==current)return;
      if(document.hidden) {recognition.current=null;setListening(false);return;}
      try {current.start();} catch {
        recognition.current=null;setListening(false);setVoiceError('음성 인식을 시작하지 못했습니다. 다시 눌러 주세요.');
      }
    },250);
    };
    if (!voiceUnlocked.current) {
      voiceUnlocked.current = true; preparingVoice.current = true;
      speak('준비됐어요. 말씀해 주세요.', reason => {
        if (reason !== 'cancelled') beginListening();
      });
    } else beginListening();
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
    clearTimeout(voiceStartTimer.current); voiceStartTimer.current = undefined; preparingVoice.current = false;
    const current = recognition.current;
    if (current) {current.onend=current.onerror=current.onresult=null;current.abort();recognition.current=null;}
    setListening(false); search.stop(); setVoiceMessage(''); setVoiceError(undefined);
  }
  if (!started) return <StartScreen onStart={()=>{unlockFeedback();voiceUnlocked.current=true;search.start();setStarted(true);}} />;
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
    <CameraHUD scene={choicePrompt && !search.safety ? {...scene,title:choicePrompt,detail:'왼쪽 또는 오른쪽이라고 말씀해 주세요.',direction:undefined} : scene} heard={voiceMessage} active={session.running} pending={search.busy} onVoice={toggleVoice} onStop={stop} />
    {handsFreeError && <p className="handsfree-error" role="status">{handsFreeError}</p>}
    {dev && <aside className="dev-panel" aria-label="개발 정보">
      <b>개발 정보</b>
      <p>{backend.status}</p><p>{handMessage}</p><p>{detectionMessage}</p>
      <p>계속 듣기: {voiceDiagnostics.state} · 인식: {voiceDiagnostics.transcript || '없음'}</p>
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
