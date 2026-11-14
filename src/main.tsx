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
import { CameraHUD } from './CameraHUD';
import { deriveScene, screenDirection } from './sceneUI';
import { unlockFeedback, listeningCue, guideCue, vibrate } from './audioFeedback';
import { speak, cancelSpeech, isPrioritySpeaking } from './speech';
import { followHandlePoint, createGripSuccessGate } from './gripGeometry';

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
  const voiceUnlocked = useRef(false);
  const preparingVoice = useRef(false);
  const [cameraError, setCameraError] = useState(false);
  const [dev, setDev] = useState(() => location.hash === '#dev');
  const [now, setNow] = useState(() => performance.now());
  const lastSeen = useRef<{ at: number; x: number } | undefined>(undefined);
  const searchStarted = useRef(performance.now());
  const video = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState('카메라를 준비하고 있습니다.');
  const recognition = useRef<VoiceRecognition | null>(null);
  const voiceStartTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const gripSuccess = useRef(createGripSuccessGate());
  const handsGoneAt = useRef<number | undefined>(undefined);
  const [listening, setListening] = useState(false);
  const [voiceMessage, setVoiceMessage] = useState('');
  const [voiceError, setVoiceError] = useState<string>();
  const [cameraReady, setCameraReady] = useState(false);
  const [viewport, setViewport] = useState({ width: 1, height: 1 });
  const selected = useRef<DetectionTrack | undefined>(undefined);
  const descriptionCapability = useRef<boolean | undefined>(undefined);
  const autoDescribeEnabled = useRef(false);
  const search = useSearchCommands(video, selected, descriptionCapability, autoDescribeEnabled);
  const { session } = search;
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
  const primary = (current.length ? current : visible).sort((a,b) => b.rect.width * b.rect.height - a.rect.width * a.rect.height)[0];
  selected.current = primary?.item;
  const nearestHand = primary && !primary.item.missing ? hands.map(hand => {
    const thumb = projectPoint(hand[4], source, screen);
    const index = projectPoint(hand[8], source, screen);
    return { thumb, index, distance: fingerGuidance({ x: (thumb.x + index.x) / 2, y: (thumb.y + index.y) / 2 }, primary.rect, screen).fraction };
  }).filter(({thumb,index}) => [thumb,index].every(p => p.x >= 0 && p.x <= viewport.width && p.y >= 0 && p.y <= viewport.height))
    .sort((a,b) => a.distance - b.distance)[0] : undefined;
  const guidance = primary && nearestHand
    ? `엄지: ${fingerGuidance(nearestHand.thumb, primary.rect, screen).text}. 검지: ${fingerGuidance(nearestHand.index, primary.rect, screen).text}.`
    : '';
  const handlePoint = search.handlePoint && primary && !primary.item.missing && search.handlePoint.targetId === primary.item.id
    ? followHandlePoint(search.handlePoint,primary.item) : undefined;
  const handPoint = nearestHand?.index;
  const destination = handlePoint ? projectPoint(handlePoint, source, screen) : primary ? { x: primary.rect.x + primary.rect.width / 2, y: primary.rect.y + primary.rect.height / 2 } : undefined;
  const aimOffset = primary ? primary.rect.x + primary.rect.width / 2 - viewport.width / 2 : 0;
  const direction = handPoint && destination ? screenDirection(destination.x - handPoint.x, destination.y - handPoint.y)
    : screenDirection(Math.abs(aimOffset) > viewport.width * .1 ? aimOffset : 0, 0);
  const lost = targeted && session.running && !!lastSeen.current && now - lastSeen.current.at > 2000 && (!primary || primary.item.missing);
  const scene = deriveScene({ listening, busy: search.busy, running: session.running && targeted, cameraReady,
    cameraError, message: cameraError ? status : voiceError || search.message, safety: search.safety, outcome: voiceError ? 'unknown' : search.outcome,
    targetLabel: primary?.item.label || session.objectKo, found: !!primary && !primary.item.missing, lost,
    lostSide: lastSeen.current && lastSeen.current.x < .5 ? 'left' : 'right', guiding: !!handPoint,
    direction, timedOut: now - searchStarted.current > 30000 });
  useSceneSpeech(targeted && primary && !primary.item.missing ? primary.item : undefined,
    scene.state === 'guiding' || scene.state === 'found' ? scene.title : '', listening || search.busy || !!search.safety, session.revision, lost, scene.state === 'found' ? scene.detail : undefined);

  useEffect(() => {
    if(gripSuccess.current.update(primary?.item.id, primary?.rect, nearestHand, now,
      session.running && targeted && !primary?.item.missing && !listening && !search.busy && !search.safety && !document.hidden)) search.completeGrip();
  }, [now,session.running,session.revision,listening,search.busy,search.safety]);
  useEffect(() => {gripSuccess.current.reset();handsGoneAt.current=undefined;},[session.revision]);
  useEffect(() => {
    if(search.outcome!=='done'||handMessage!=='손 추적 준비 완료'||document.hidden) {handsGoneAt.current=undefined;return;}
    if(hands.length) {handsGoneAt.current=undefined;return;}
    handsGoneAt.current ??= now;
    if(now-handsGoneAt.current>=600 && !isPrioritySpeaking()) search.start();
  },[now,hands.length,handMessage,search.outcome]);

  useEffect(() => {
    const timer = setInterval(() => setNow(performance.now()), 250);
    const hash = () => setDev(location.hash === '#dev'); window.addEventListener('hashchange', hash);
    return () => { clearInterval(timer); window.removeEventListener('hashchange', hash); };
  }, []);
  useEffect(() => { lastSeen.current = undefined; searchStarted.current = performance.now(); }, [session.revision]);
  useEffect(() => {
    if (primary && !primary.item.missing) lastSeen.current = { at: primary.item.lastSeen, x: (primary.rect.x + primary.rect.width / 2) / viewport.width };
  }, [primary?.item.lastSeen, primary?.item.id]);
  useEffect(() => {
    if (!targeted || scene.state !== 'guiding' || !nearestHand) return;
    let last = 0;
    const timer = setInterval(() => {
      if (document.hidden || isPrioritySpeaking() || window.speechSynthesis?.speaking || window.speechSynthesis?.pending) return;
      const timestamp = performance.now();
      const interval = Math.max(100, Math.min(800, nearestHand.distance * 2000));
      if (timestamp - last >= interval) { guideCue(direction === 'left' ? -1 : direction === 'right' ? 1 : 0); last = timestamp; }
    }, 100);
    return () => clearInterval(timer);
  }, [scene.state, direction, Math.round((nearestHand?.distance ?? 0) * 10)]);
  useEffect(() => { if (scene.state === 'done') vibrate([80,60,80]); }, [scene.state]);
  const searchTimedOut = scene.state === 'searching' && now - searchStarted.current > 30000;
  useEffect(() => {
    if (scene.state === 'lost' || searchTimedOut) {
      speak(`${scene.title}. ${scene.detail || ''}`,undefined,{clipId:scene.state==='lost' ? `lost_turn_${scene.lostSide}` : 'search_timeout'});
    }
  }, [scene.state, searchTimedOut]);
  useEffect(()=>{if(voiceError)speak(voiceError);},[voiceError]);

  useEffect(() => {
    const element = video.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      setViewport({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

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
      setListening(false);gripSuccess.current.reset();
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
    if (search.busy) return;
    unlockFeedback();
    if (!cameraReady) return;
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
    setCameraReady(false); setCameraError(false);
    let disposed = false;
    let stream: MediaStream | null = null;
    const element = video.current;

    async function startCamera() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraError(true); setStatus('카메라를 사용할 수 없습니다. HTTPS로 접속해 주세요.');
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
        if (!disposed) { setStatus('카메라가 켜졌습니다.'); setCameraReady(true); }
      } catch {
        stream?.getTracks().forEach(track => track.stop());
        if (!disposed) {
          if (element) element.srcObject = null;
          setStatus('카메라를 켤 수 없습니다. 브라우저의 카메라 권한과 연결 상태를 확인한 뒤 새로고침해 주세요.');
          setCameraError(true);
        }
      }
    }

    void startCamera();
    return () => {
      disposed = true;
      stream?.getTracks().forEach(track => track.stop());
      if (element && element.srcObject === stream) element.srcObject = null;
    };
  }, []);



  return <main className={`camera-screen scene-${scene.state}`}>
    <video ref={video} autoPlay muted playsInline aria-label="카메라 미리보기" />
    <button className="camera-tap-zone" type="button" tabIndex={-1} aria-hidden="true" disabled={search.busy && !session.running} onClick={()=>session.running ? search.stop() : toggleVoice()} />
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
    <CameraHUD scene={scene} heard={voiceMessage} active={session.running} onVoice={toggleVoice} onStop={() => { search.stop(); setVoiceMessage(''); setVoiceError(undefined); }} />
    {dev && <aside className="dev-panel" aria-label="개발 정보">
      <b>개발 정보</b>
      <p>{backend.status}</p><p>{handMessage}</p><p>{detectionMessage}</p>
      <p>{primary ? `${primary.item.label} · 신뢰도 ${Math.round(primary.item.score * 100)}%` : '탐지 없음'}</p>
      <p>{guidance}</p><p>{search.message}</p>
      <button type="button" onClick={backend.reconnect}>서버 재연결</button>
      <button type="button" disabled={!primary || search.busy || backend.describeEnabled === false} onClick={() => { void search.describe(); }}>잡는 방법 확인</button>
    </aside>}
  </main>;
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
