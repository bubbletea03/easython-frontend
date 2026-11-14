import { useEffect, useState, type RefObject } from 'react';
import type { Detection } from '@mediapipe/tasks-vision';
import { updateTracks, TRACK_HOLD_MS, type DetectionBox, type DetectionTrack } from './detectionTracks';
import type { NormalizedLandmark } from '@mediapipe/tasks-vision';

export const labels: Record<string, string> = {
  person: '사람', bicycle: '자전거', car: '자동차', motorcycle: '오토바이', airplane: '비행기', bus: '버스',
  train: '기차', truck: '트럭', boat: '배', 'traffic light': '신호등', 'fire hydrant': '소화전',
  'stop sign': '정지 표지판', 'parking meter': '주차 요금기', bench: '벤치', bird: '새', cat: '고양이',
  dog: '개', horse: '말', sheep: '양', cow: '소', elephant: '코끼리', bear: '곰', zebra: '얼룩말',
  giraffe: '기린', backpack: '배낭', umbrella: '우산', handbag: '핸드백', tie: '넥타이', suitcase: '여행 가방',
  frisbee: '프리스비', skis: '스키', snowboard: '스노보드', 'sports ball': '공', kite: '연',
  'baseball bat': '야구 방망이', 'baseball glove': '야구 글러브', skateboard: '스케이트보드',
  surfboard: '서핑보드', 'tennis racket': '테니스 라켓', bottle: '병', 'wine glass': '와인 잔',
  cup: '컵', fork: '포크', knife: '칼', spoon: '숟가락', bowl: '그릇', banana: '바나나', apple: '사과',
  sandwich: '샌드위치', orange: '오렌지', broccoli: '브로콜리', carrot: '당근', 'hot dog': '핫도그',
  pizza: '피자', donut: '도넛', cake: '케이크', chair: '의자', couch: '소파', 'potted plant': '화분',
  bed: '침대', 'dining table': '식탁', toilet: '변기', tv: 'TV', laptop: '노트북', mouse: '마우스',
  remote: '리모컨', keyboard: '키보드', 'cell phone': '휴대폰', microwave: '전자레인지', oven: '오븐',
  toaster: '토스터', sink: '싱크대', refrigerator: '냉장고', book: '책', clock: '시계', vase: '꽃병',
  scissors: '가위', 'teddy bear': '곰 인형', 'hair drier': '헤어드라이어', toothbrush: '칫솔',
};

export function useObjectDetection(video: RefObject<HTMLVideoElement | null>, cameraReady: boolean,
  options: { enabled: boolean; objects: boolean; targets: string[] | null }) {
  const [detections, setDetections] = useState<DetectionTrack[]>([]);
  const [message, setMessage] = useState('');
  const [hands, setHands] = useState<NormalizedLandmark[][]>([]);
  const [handMessage, setHandMessage] = useState('손 추적 준비 중');
  const targetKey = options.targets?.join(',') ?? '';

  useEffect(() => {
    setDetections([]); setHands([]);
    if (!cameraReady || !options.enabled) return;
    let disposed = false;
    let busy = false;
    let ready = false;
    let failed = false;
    let lastVideoTime = -1;
    let lastFrameAt = 0;
    let frameSize = { width: 1, height: 1 };
    let tracks: DetectionTrack[] = [];
    let nextTrackId = 0;
    let lastHandsAt = 0;
    let worker: Worker;
    setMessage('물체 인식 모델을 준비하고 있어요.');
    try {
      worker = new Worker(import.meta.env.BASE_URL + 'detection-worker.js');
    } catch {
      setMessage('이 브라우저에서 물체 인식을 시작할 수 없습니다.');
      return;
    }
    const fail = () => {
      failed = true;
      busy = false;
      setDetections([]);
      tracks = [];
      setHands([]);
      setMessage('물체 인식을 시작하지 못했어요. 페이지를 새로고침해 주세요.');
      worker.terminate();
    };
    const loadTimeout = window.setTimeout(fail, 60000);
    worker.onerror = fail;
    worker.onmessage = ({ data }) => {
      if (disposed) return;
      if (data.type === 'ready') {
        clearTimeout(loadTimeout);
        ready = true;
        setMessage('물체를 찾고 있어요.');
      } else if (data.type === 'hand-ready') {
        setHandMessage('손 추적 준비 완료');
      } else if (data.type === 'hand-error') {
        setHands([]);
        setHandMessage('손 추적을 사용할 수 없어요. 새로고침해 주세요.');
        console.error('Hand tracking:', data.message);
      } else if (data.type === 'result') {
        busy = false;
        if (document.hidden) { tracks = []; setDetections([]); setHands([]); return; }
        setHands(data.hands ?? []);
        lastHandsAt = performance.now();
        const items: DetectionBox[] = (data.detections as Detection[]).flatMap(item => {
          const box = item.boundingBox;
          const category = item.categories[0];
          if (!box || !category || category.score < 0.65) return [];
          const aliases: Record<string, string> = { mug: 'cup', tumbler: 'cup', 'remote control': 'remote', 'mobile phone': 'cell phone', phone: 'cell phone', 'water bottle': 'bottle' };
          if (targetKey && !targetKey.split(',').some(t => (aliases[t] ?? t) === category.categoryName)) return [];
          const label = category.categoryName === 'cup' || category.categoryName === 'bowl'
            ? (box.height >= box.width ? '컵' : '보울') : labels[category.categoryName] ?? category.categoryName;
          return [{ label, score: category.score,
            x: box.originX / frameSize.width, y: box.originY / frameSize.height,
            width: box.width / frameSize.width, height: box.height / frameSize.height }];
        });
        tracks = updateTracks(tracks, items, performance.now(), () => nextTrackId++);
        setDetections(tracks);
        setMessage(items.length ? `${items.length}개 물체 탐지 중` : targetKey ? '로컬 지원 물체 중 대상을 찾고 있어요. 일부 물체는 서버 연결이 필요합니다.' : '물체를 찾고 있어요.');
      } else if (data.type === 'error') {
        clearTimeout(loadTimeout);
        console.error('Object detection:', data.message);
        fail();
      }
    };
    worker.postMessage({ type: 'init', baseUrl: new URL(import.meta.env.BASE_URL, location.href).href, objects: options.objects });

    async function capture() {
      const source = video.current;
      const now = performance.now();
      if (disposed || failed || !ready || busy || document.hidden || !source || source.paused || source.readyState < 2
        || source.currentTime === lastVideoTime || now - lastFrameAt < 200) return;
      busy = true;
      lastVideoTime = source.currentTime;
      lastFrameAt = now;
      try {
        const scale = Math.min(1, 640 / Math.max(source.videoWidth, source.videoHeight));
        const bitmap = await createImageBitmap(source, { resizeWidth: Math.max(1, Math.round(source.videoWidth * scale)),
          resizeHeight: Math.max(1, Math.round(source.videoHeight * scale)) });
        if (disposed || failed) { bitmap.close(); return; }
        frameSize = { width: bitmap.width, height: bitmap.height };
        worker.postMessage({ type: 'frame', frame: bitmap, timestamp: now }, [bitmap]);
      } catch {
        if (!disposed) fail();
      }
    }
    const timer = window.setInterval(() => {
      const active = tracks.filter(track => performance.now() - track.lastSeen < TRACK_HOLD_MS);
      if (lastHandsAt && performance.now() - lastHandsAt > 600) { setHands([]); lastHandsAt = 0; }
      if (active.length !== tracks.length) { tracks = active; setDetections(tracks); }
      void capture();
    }, 100);
    const clearOnHide = () => { if (document.hidden) { tracks = []; setDetections([]); setHands([]); } };
    document.addEventListener('visibilitychange', clearOnHide);
    return () => {
      disposed = true;
      clearInterval(timer);
      clearTimeout(loadTimeout);
      document.removeEventListener('visibilitychange', clearOnHide);
      worker.terminate();
    };
  }, [video, cameraReady, options.enabled, options.objects, targetKey]);

  return { detections, detectionMessage: message, hands, handMessage };
}
