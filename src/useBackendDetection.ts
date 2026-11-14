import { setServerSpeechEnabled, speak } from './speech';
import { useEffect, useRef, useState, type RefObject } from 'react';
import { api, ApiError } from './api';
import { abortableDelay } from './apiCore';
import { captureFrame } from './capture';
import { updateTracks, type DetectionTrack } from './detectionTracks';
import { labels } from './useObjectDetection';
import { colorMismatchText, createColorNoticeGate } from './colorNotice';
import { isPersonLabel } from './objectFilter';

const aliases: Record<string,string> = {mug:'cup',tumbler:'cup','remote control':'remote','mobile phone':'cell phone',phone:'cell phone','water bottle':'bottle'};
export function useBackendDetection(video: RefObject<HTMLVideoElement | null>, cameraReady: boolean, running: boolean, targets: string[], objectKo: string, revision: number) {
  const [ready, setReady] = useState(false);
  const [describeEnabled, setDescribeEnabled] = useState<boolean | undefined>();
  const [status, setStatus] = useState('백엔드 연결 확인 중');
  const [checked, setChecked] = useState(false);
  const [retry, setRetry] = useState(0);
  const [detections, setDetections] = useState<DetectionTrack[]>([]);
  const nextId = useRef(1000000);
  const colorNotice = useRef(createColorNoticeGate());
  const fallbackAnnounced = useRef<string | undefined>(undefined);
  const targetKey = targets.join(',');

  // Health polling remains alive after startup failures and detection fallback.
  useEffect(() => {
    const controller = new AbortController();
    setReady(false); setChecked(false); setDescribeEnabled(undefined); setServerSpeechEnabled(false);
    void (async () => {
      let failures = 0;
      while (!controller.signal.aborted) {
        try {
          const health = await api.health(controller.signal);
          if (controller.signal.aborted) return;
          failures = 0; setChecked(true);
          setDescribeEnabled(health.describe_enabled);
          setServerSpeechEnabled(health.tts_enabled === true);
          const available = health.status === 'ok' && health.model_loaded;
          setReady(available);
          setStatus(available ? `백엔드 탐지 · ${health.device}` : '서버 준비 중 · 기기 내 인식 사용');
        } catch (error) {
          if (controller.signal.aborted) return;
          if (++failures >= 3) { setReady(false); setChecked(true); }
          setServerSpeechEnabled(false);
          setStatus(`${error instanceof Error ? error.message : '서버 연결 실패'} · 기기 내 인식 사용`);
        }
        try { await abortableDelay(5000,controller.signal); } catch { return; }
      }
    })();
    return () => { controller.abort(); setServerSpeechEnabled(false); };
  }, [retry]);

  useEffect(() => {
    if (ready) { fallbackAnnounced.current = undefined; return; }
    const key = `${revision}:${targetKey}`;
    if (!checked || !running || fallbackAnnounced.current === key) return;
    fallbackAnnounced.current = key;
    const supported = targets.some(t => Object.hasOwn(labels,aliases[t] ?? t));
    const text = supported
      ? '서버 연결이 원활하지 않아 기기 내 인식으로 찾고 있어요. 서버에 다시 연결하고 있어요.'
      : `${objectKo || '요청하신 물건'}은 기기 내 인식으로 찾기 어려워요. 서버에 다시 연결하고 있어요.`;
    speak(text,undefined,{clipId:supported ? 'server_degraded' : undefined});
  }, [ready,checked,running,targetKey,objectKo,revision]);

  useEffect(() => {
    setDetections([]); colorNotice.current.reset();
    if (!ready || !cameraReady || !running) return;
    const controller = new AbortController();
    let frameController: AbortController | undefined;
    let tracks: DetectionTrack[] = [];
    let failures = 0;
    void (async () => {
      while (!controller.signal.aborted) {
        const source = video.current;
        const start = performance.now();
        if (!document.hidden && source && source.readyState >= 2 && !source.paused) {
          frameController = new AbortController();
          try {
            const image = await captureFrame(source,frameController.signal);
            const response = await api.detect(image,targetKey ? targetKey.split(',') : [],frameController.signal);
            if (controller.signal.aborted || frameController.signal.aborted || document.hidden) continue;
            failures = 0;
            const results = response.detections.filter(d => !isPersonLabel(d.label) && !isPersonLabel(d.target));
            const items = results.filter(d => d.score >= .5).map(d => ({label:objectKo || labels[d.target] || labels[d.label] || d.label,
              name:d.label,exact:d.label===d.target,
              score:d.score,x:d.box.x,y:d.box.y,width:d.box.w,height:d.box.h}));
            tracks = updateTracks(tracks,items,performance.now(),()=>nextId.current++,3000);
            setDetections(tracks);
            const notice = colorNotice.current.update(colorMismatchText(response,objectKo),performance.now());
            if (targetKey && notice) speak(notice);
          } catch (error) {
            if (controller.signal.aborted) return;
            if (frameController.signal.aborted) continue;
            setStatus(`${error instanceof Error ? error.message : '서버 탐지 실패'} · 재시도 중`);
            if ((error instanceof ApiError && error.status === 401) || ++failures >= 3) {
              setReady(false); setDetections([]); return;
            }
          }
        }
        try { await abortableDelay(Math.max(250,750-(performance.now()-start)),controller.signal); } catch { return; }
      }
    })();
    const expire = setInterval(() => {
      const active = tracks.filter(t => performance.now()-t.lastSeen < 3000);
      if (active.length !== tracks.length) { tracks = active; setDetections(tracks); }
    },250);
    const visibility = () => {
      if (document.hidden) {frameController?.abort();tracks=[];setDetections([]);colorNotice.current.reset();}
    };
    document.addEventListener('visibilitychange',visibility);
    return () => {controller.abort();frameController?.abort();clearInterval(expire);document.removeEventListener('visibilitychange',visibility);};
  }, [ready,cameraReady,running,targetKey,objectKo,revision,video]);
  return {active:ready && running,detections,status,describeEnabled,reconnect:()=>setRetry(value=>value+1)};
}
