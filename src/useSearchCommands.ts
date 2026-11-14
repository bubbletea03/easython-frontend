import { useEffect, useRef, useState, type RefObject } from 'react';
import { api, DEFAULT_TARGETS } from './api';
import { captureFrame } from './capture';
import { speak, cancelSpeech } from './speech';
import type { DetectionTrack } from './detectionTracks';

export function useSearchCommands(video: RefObject<HTMLVideoElement | null>, selected: RefObject<DetectionTrack | undefined>, describeEnabled: RefObject<boolean | undefined>) {
  const [session, setSession] = useState({ running: false, targets: DEFAULT_TARGETS, objectKo: '', revision: 0 });
  const [outcome, setOutcome] = useState<'idle' | 'searching' | 'unknown' | 'done'>('idle');
  const [safety, setSafety] = useState<string>();
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [handlePoint, setHandlePoint] = useState<{ x: number; y: number; targetId: number }>();
  const controller = useRef<AbortController | undefined>(undefined);
  const generation = useRef(0);
  const describeLock = useRef(false);
  const alive = useRef(true);
  const notify = (text: string) => { setMessage(text); speak(text); };
  function cancel() {
    generation.current++; controller.current?.abort(); controller.current = undefined;
    describeLock.current = false; setBusy(false); setHandlePoint(undefined); setSafety(undefined); cancelSpeech();
  }
  function stop() {
    cancel(); setOutcome('idle'); setSession(s => ({ ...s, running: false, revision: s.revision + 1 })); notify('탐색과 안내를 중지했습니다.');
  }
  function start() {
    cancel();
    setOutcome('searching');
    setMessage('주변 물체를 찾고 있어요. 찾을 물건은 말하기 버튼으로 말씀해 주세요.');
    setSession(s => ({ running: true, targets: DEFAULT_TARGETS, objectKo: '', revision: s.revision + 1 }));
  }
  function unknown(text: string) {
    cancel(); setOutcome('unknown'); setSession(s => ({ ...s, running: false, revision: s.revision + 1 })); notify(text);
  }
  function find(targets: string[], objectKo = '') {
    const cleaned = [...new Set(targets.map(t => t.trim().toLowerCase()).filter(Boolean))];
    if (!cleaned.length || cleaned.length > 10 || cleaned.some(t => !/^[a-z0-9][a-z0-9 '\-]{0,49}$/.test(t))) {
      notify('영어 물체 이름을 1개에서 10개까지 입력해 주세요.'); return;
    }
    cancel(); setSession(s => ({ running: true, targets: cleaned, objectKo, revision: s.revision + 1 }));
    setOutcome('searching'); notify(`${objectKo || cleaned.join(', ')} 찾을게요. 폰을 천천히 돌려주세요.`);
  }
  async function describe() {
    if (describeLock.current) return;
    const item = selected.current;
    if (!item || item.missing) { notify('먼저 물체를 카메라에 비춰 주세요.'); return; }
    if (describeEnabled.current === false) { notify('서버의 설명 기능이 비활성화되어 있습니다. 물체 탐지는 계속합니다.'); return; }
    cancel(); describeLock.current = true;
    const token = generation.current;
    const request = new AbortController(); controller.current = request;
    setBusy(true); setMessage('잡는 방법을 확인하고 있어요.');
    try {
      if (!video.current) throw new Error('카메라를 준비해 주세요.');
      const image = await captureFrame(video.current, request.signal);
      const prompt = `사진 속 ${item.label}의 잡는 방법을 한국어로 안내하세요. 대상 박스는 전체 이미지 기준 정규화 좌표 x=${item.x}, y=${item.y}, w=${item.width}, h=${item.height}입니다. 컵이라고 가정하지 마세요. JSON 객체로 object, direction, handle_point, safety, grasp, comment, confidence를 반환하세요. handle_point는 전체 이미지 기준 0~1의 x,y 좌표이며 잡을 부위를 확신하지 못하면 null로 하세요. safety는 주의 사항이 있을 때만 문장으로, 없으면 null로 하세요. 실제 접촉이나 잡기 성공을 단정하지 마세요.`;
      const result = await api.describe(image, prompt, request.signal);
      if (!alive.current || request.signal.aborted || generation.current !== token || selected.current?.id !== item.id || selected.current.missing) return;
      if (result.handlePoint) setHandlePoint({ ...result.handlePoint, targetId: item.id });
      setSafety(result.safety);
      notify(result.sentences.join(' ') || '이 사진에서는 잡는 방법을 확인할 수 없어요.');
    } catch (error) {
      if (!request.signal.aborted && generation.current === token && alive.current) notify(error instanceof Error ? error.message : '설명을 가져오지 못했습니다.');
    } finally {
      if (generation.current === token && alive.current) { describeLock.current = false; setBusy(false); }
    }
  }
  async function command(text: string) {
    const trimmed = text.trim();
    if (!trimmed) return;
    // An explicit stop must work even if the server is offline.
    if (/^(그만|그만해|멈춰|중지|정지|stop)[.!?\s]*$/i.test(trimmed)) { stop(); return; }
    if (/^(잡았어|잡았어요|잡았습니다)[.!?\s]*$/.test(trimmed)) {
      cancel(); setOutcome('done'); setSession(s => ({ ...s, running: false, revision: s.revision + 1 }));
      notify('잡았다고 말씀하셨어요. 탐색을 마칩니다.'); return;
    }
    cancel(); const token = generation.current;
    const request = new AbortController(); controller.current = request;
    setBusy(true); setMessage('명령을 이해하고 있어요.');
    try {
      const result = await api.parse(trimmed, request.signal);
      if (!alive.current || request.signal.aborted || token !== generation.current) return;
      if (result.intent === 'stop') stop();
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
    if (!handlePoint) return;
    const timer = setTimeout(() => setHandlePoint(undefined), 2500);
    return () => clearTimeout(timer);
  }, [handlePoint]);
  return { session, message, busy, handlePoint, safety, outcome, command, start, stop, find, describe };
}
