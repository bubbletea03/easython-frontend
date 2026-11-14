import { StrictMode, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './style.css';
import { useObjectDetection } from './useObjectDetection';
import { HandOverlay } from './HandOverlay';
import { fingerGuidance, projectBox, projectPoint } from './sceneGeometry';
import { useSceneSpeech } from './useSceneSpeech';
import { useBackendDetection } from './useBackendDetection';
import { useSearchCommands } from './useSearchCommands';
import { DEFAULT_TARGETS } from './api';
import type { DetectionTrack } from './detectionTracks';

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
  const video = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState('카메라를 준비하고 있습니다.');
  const recognition = useRef<VoiceRecognition | null>(null);
  const [listening, setListening] = useState(false);
  const [voiceMessage, setVoiceMessage] = useState('');
  const [cameraReady, setCameraReady] = useState(false);
  const [viewport, setViewport] = useState({ width: 1, height: 1 });
  const selected = useRef<DetectionTrack | undefined>(undefined);
  const descriptionCapability = useRef<boolean | undefined>(undefined);
  const search = useSearchCommands(video, selected, descriptionCapability);
  const { session } = search;
  const backend = useBackendDetection(video, cameraReady, session.running, session.targets, session.objectKo, session.revision);
  descriptionCapability.current = backend.describeEnabled;
  const local = useObjectDetection(video, cameraReady, { enabled: session.running, objects: !backend.active,
    targets: session.objectKo || session.targets !== DEFAULT_TARGETS ? session.targets : null,
    personSelected: selected.current?.label === '사람' });
  const detections = session.running ? (backend.active ? backend.detections : local.detections) : [];
  const { detectionMessage, hands, handMessage } = local;
  const source = { x: 0, y: 0, width: video.current?.videoWidth || 1, height: video.current?.videoHeight || 1 };
  const screen = { x: 0, y: 0, ...viewport };
  const visible = detections.map(item => ({ item, rect: projectBox(item, source, screen) }))
    .filter(({ rect }) => rect.width > 0 && rect.height > 0);
  const current = visible.filter(({ item }) => !item.missing);
  const primary = (current.length ? current : visible).sort((a,b) => b.rect.width * b.rect.height - a.rect.width * a.rect.height)[0];
  selected.current = primary?.item;
  const personSelected = primary?.item.label === '사람';
  const nearestHand = primary && !primary.item.missing && !personSelected ? hands.map(hand => {
    const thumb = projectPoint(hand[4], source, screen);
    const index = projectPoint(hand[8], source, screen);
    return { thumb, index, distance: fingerGuidance({ x: (thumb.x + index.x) / 2, y: (thumb.y + index.y) / 2 }, primary.rect, screen).fraction };
  }).filter(({thumb,index}) => [thumb,index].every(p => p.x >= 0 && p.x <= viewport.width && p.y >= 0 && p.y <= viewport.height))
    .sort((a,b) => a.distance - b.distance)[0] : undefined;
  const guidance = primary && nearestHand
    ? `엄지: ${fingerGuidance(nearestHand.thumb, primary.rect, screen).text}. 검지: ${fingerGuidance(nearestHand.index, primary.rect, screen).text}.`
    : '';
  useSceneSpeech(primary && !primary.item.missing ? primary.item : undefined, guidance, listening || search.busy);

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
    const current = recognition.current;
    if (current) {
      current.onresult = null;
      current.onerror = null;
      current.onend = null;
      current.abort();
      recognition.current = null;
    }
  }, []);

  useEffect(() => {
    const current = recognition.current;
    if (current) {
      current.onresult = current.onerror = current.onend = null;
      current.abort(); recognition.current = null; setListening(false);
    }
  }, [session.revision]);

  function toggleVoice() {
    window.speechSynthesis?.cancel();
    if (recognition.current) {
      recognition.current.stop();
      return;
    }
    const speechWindow = window as Window & {
      SpeechRecognition?: new () => VoiceRecognition;
      webkitSpeechRecognition?: new () => VoiceRecognition;
    };
    const Recognition = speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
    if (!Recognition) {
      setVoiceMessage('이 브라우저에서는 음성 인식을 지원하지 않습니다.');
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
      setVoiceMessage(event.error === 'not-allowed' || event.error === 'service-not-allowed'
        ? '마이크 권한을 허용한 뒤 다시 눌러 주세요.'
        : event.error === 'no-speech'
          ? '음성이 들리지 않았어요. 다시 눌러 말씀해 주세요.'
          : '음성 인식을 사용할 수 없습니다. 마이크와 네트워크를 확인해 주세요.');
    };
    current.onend = () => {
      recognition.current = null;
      setListening(false);
      if (finalText && !failed && !document.hidden) void search.command(finalText);
      if (!receivedResult && !failed) setVoiceMessage('음성 인식을 종료했습니다.');
    };
    recognition.current = current;
    try {
      current.start();
      setListening(true);
      setVoiceMessage('듣고 있어요. 말씀해 주세요.');
    } catch {
      recognition.current = null;
      setListening(false);
      setVoiceMessage('음성 인식을 시작하지 못했습니다. 다시 눌러 주세요.');
    }
  }

  useEffect(() => {
    let disposed = false;
    let stream: MediaStream | null = null;
    const element = video.current;

    async function startCamera() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setStatus('카메라를 사용할 수 없습니다. HTTPS 또는 localhost로 접속해 주세요.');
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

  return <main className="camera-screen">
    <video ref={video} autoPlay muted playsInline aria-label="카메라 미리보기" />
    <div className="detection-overlay" aria-hidden="true">
      {visible.map(({ item, rect }) => {
        const isPrimary = item.id === primary?.item.id;
        return <div key={item.id} className={`detection-box ${isPrimary ? 'is-primary' : 'is-secondary'}${item.missing ? ' is-missing' : ''}`} style={{ left: rect.x, top: rect.y, width: rect.width, height: rect.height }}>
          {isPrimary && <>
            <i className="frame-corner top-left" /><i className="frame-corner top-right" />
            <i className="frame-corner bottom-left" /><i className="frame-corner bottom-right" />
            <span className="detection-label">{item.label}</span>
          </>}
        </div>;
      })}
    </div>
    {search.handlePoint && primary && !primary.item.missing && search.handlePoint.targetId === primary.item.id && (() => {
      const point = projectPoint(search.handlePoint, source, screen);
      if (point.x < 0 || point.y < 0 || point.x > screen.width || point.y > screen.height) return null;
      return <div className="handle-point" style={{ left: point.x, top: point.y }} aria-label="서버가 추정한 잡을 위치" />;
    })()}
    {!personSelected && <HandOverlay hands={hands} source={source} viewport={screen} />}
    <p className="detection-status" role="status" aria-live="polite">
      {cameraReady ? (primary ? `${primary.item.label} ${primary.item.missing ? '다시 찾는 중' : '인식 중'}` : detectionMessage) : status}
      <span className="tracking-status">{personSelected ? '사람 인식 중 · 손 추적 일시 중지' : handMessage}</span>
      <span className="tracking-status">{session.running ? backend.status : '탐색 중지'}{session.objectKo && ` · ${session.objectKo}`}</span>
    </p>
    <div className="voice-controls">
      {search.message && <p className="voice-message" role="status">{search.message}</p>}
      <div className="search-actions">
        <button type="button" title={backend.describeEnabled === false ? '서버 설명 기능이 비활성화되어 있습니다.' : undefined} disabled={!session.running || !primary || search.busy || backend.describeEnabled === false} onClick={() => { void search.describe(); }}>{backend.describeEnabled === false ? '설명 비활성' : '잡는 방법'}</button>
        <button type="button" onClick={() => session.running ? search.stop() : search.find(session.targets, session.objectKo)}>{session.running ? '탐색 중지' : '다시 탐색'}</button>
        {!backend.active && <button type="button" onClick={backend.reconnect}>서버 재연결</button>}
      </div>
      {guidance && <p className="hand-guidance">{guidance}<small>화면 기준 상대 간격 · 실제 거리와 접촉 여부는 알 수 없어요</small></p>}
      {voiceMessage && <p className="voice-message" role="status" aria-live="polite">{voiceMessage}</p>}
      <button type="button" className={`voice-button${listening ? ' is-listening' : ''}`}
        aria-label={listening ? '음성 인식 중지' : '음성 인식 시작'}
        aria-pressed={listening} disabled={search.busy} onClick={toggleVoice}>
        {listening ? <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="3" fill="currentColor" /></svg>
          : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
            <rect x="9" y="3" width="6" height="12" rx="3" />
            <path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8" />
          </svg>}
      </button>
    </div>
  </main>;
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
