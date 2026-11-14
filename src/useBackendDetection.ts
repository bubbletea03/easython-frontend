import { setServerSpeechEnabled, speak } from './speech';
import { useEffect, useRef, useState, type RefObject } from 'react';
import { api, ApiError } from './api';
import { abortableDelay } from './apiCore';
import { captureFrame } from './capture';
import { updateTracks, type DetectionTrack } from './detectionTracks';
import { labels } from './useObjectDetection';
import { colorMismatchText, createColorNoticeGate } from './colorNotice';
import { isPersonLabel } from './objectFilter';

export function useBackendDetection(video: RefObject<HTMLVideoElement | null>, cameraReady: boolean, running: boolean, targets: string[], objectKo: string, revision: number) {
  const [ready, setReady] = useState(false);
  const [describeEnabled, setDescribeEnabled] = useState<boolean | undefined>();
  const [status, setStatus] = useState('백엔드 연결 확인 중');
  const [retry, setRetry] = useState(0);
  const [detections, setDetections] = useState<DetectionTrack[]>([]);
  const nextId = useRef(1000000);
  const autoReconnectBudget = useRef(2);
  const colorNotice = useRef(createColorNoticeGate());
  const targetKey = targets.join(',');

  useEffect(() => {
    const controller = new AbortController();
    setServerSpeechEnabled(false); setReady(false); setDescribeEnabled(undefined); setStatus('백엔드 연결 확인 중 · 로컬 인식 사용');
    async function check() {
      let failures = 0;
      for (let attempt = 0; attempt < 20 && !controller.signal.aborted; attempt++) {
        try {
          const health = await api.health(controller.signal);
          setDescribeEnabled(health.describe_enabled);
          setServerSpeechEnabled(health.tts_enabled === true);
          if (health.status === 'error') { setStatus('서버 모델 오류 · 로컬 인식 사용'); return; }
          if (health.model_loaded && health.status === 'ok') { setReady(true); setStatus(`백엔드 탐지 · ${health.device}`); return; }
          setStatus('서버 모델 준비 중 · 로컬 인식 사용');
        } catch (error) {
          if (controller.signal.aborted) return;
          setStatus(`${error instanceof Error ? error.message : '서버 연결 실패'} · 로컬 인식 사용`);
          if ((error instanceof ApiError && error.status === 401) || ++failures >= 3) return;
        }
        try { await abortableDelay(3000, controller.signal); } catch { return; }
      }
      if (!controller.signal.aborted) setStatus('서버 준비 대기 종료 · 로컬 인식 사용. 서버 재연결을 눌러 주세요.');
    }
    void check();
    return () => { controller.abort(); setServerSpeechEnabled(false); };
  }, [retry]);

  useEffect(() => {
    setDetections([]);
    colorNotice.current.reset();
    if (!ready || !cameraReady || !running) return;
    let disposed = false;
    let tracks: DetectionTrack[] = [];
    let frameController: AbortController | undefined;
    let timer: ReturnType<typeof setTimeout>;
    const loopController = new AbortController();
    async function loop() {
      if (disposed) return;
      const source = video.current;
      if (document.hidden || !source || source.readyState < 2 || source.paused) { timer = setTimeout(loop, 500); return; }
      const start = performance.now();
      frameController = new AbortController();
      try {
        const image = await captureFrame(source, frameController.signal);
        const response = await api.detect(image, targetKey ? targetKey.split(',') : [], frameController.signal);
        const results = response.detections.filter(d => !isPersonLabel(d.label) && !isPersonLabel(d.target));
        if (disposed || frameController.signal.aborted || document.hidden) return;
        const items = results.filter(d => d.score >= .35).map(d => ({
          label: objectKo || labels[d.target] || labels[d.label] || d.label,
          score: d.score, x: d.box.x, y: d.box.y, width: d.box.w, height: d.box.h,
        }));
        tracks = updateTracks(tracks, items, performance.now(), () => nextId.current++, 3000);
        setDetections(tracks);
        const notice = colorNotice.current.update(colorMismatchText(response, objectKo), performance.now());
        if (targetKey && notice) speak(notice);
        setStatus(`백엔드 탐지 · ${results.length ? '물체 인식 중' : '대상을 찾고 있어요'}`);
      } catch (error) {
        if (disposed || frameController.signal.aborted) return;
        setDetections([]); setReady(false);
        setStatus(`${error instanceof Error ? error.message : '서버 연결 실패'} · 로컬 인식 사용`);
        if (error instanceof ApiError && error.code === 'model_loading' && autoReconnectBudget.current > 0) {
          autoReconnectBudget.current--; setRetry(value => value + 1);
        }
        return;
      } finally {
        if (!disposed && !loopController.signal.aborted) timer = setTimeout(loop, Math.max(0, 750 - (performance.now() - start)));
      }
    }
    const expire = setInterval(() => {
      const active = tracks.filter(t => performance.now() - t.lastSeen < 3000);
      if (active.length !== tracks.length) { tracks = active; setDetections(tracks); }
    }, 250);
    const visibility = () => {
      if (document.hidden) { frameController?.abort(); tracks = []; setDetections([]); colorNotice.current.reset(); }
    };
    document.addEventListener('visibilitychange', visibility);
    void loop();
    return () => {
      disposed = true; loopController.abort(); frameController?.abort(); clearTimeout(timer); clearInterval(expire);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, [ready, cameraReady, running, targetKey, objectKo, revision, video]);

  return { active: ready && running, detections, status, describeEnabled,
    reconnect: () => { autoReconnectBudget.current = 2; setRetry(value => value + 1); } };
}
