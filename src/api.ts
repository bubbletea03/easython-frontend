export type Detection = {
  label: string;
  confidence: number;
  bbox: [number, number, number, number];
};
export type DetectResult = {
  mode: 'live' | 'demo';
  target: string;
  found: boolean | null;
  detections: Detection[];
  message: string;
};

function isDetectResult(value: unknown): value is DetectResult {
  if (!value || typeof value !== 'object') return false;
  const data = value as Record<string, unknown>;
  return (data.mode === 'demo' || data.mode === 'live') &&
    typeof data.target === 'string' && typeof data.message === 'string' &&
    (data.mode === 'demo' ? data.found === null : typeof data.found === 'boolean') &&
    Array.isArray(data.detections) && data.detections.every(item =>
      item && typeof item.label === 'string' && typeof item.confidence === 'number' &&
      item.confidence >= 0 && item.confidence <= 1 &&
      Array.isArray(item.bbox) && item.bbox.length === 4 &&
      item.bbox.every((coordinate: unknown) => typeof coordinate === 'number' && Number.isFinite(coordinate)));
}

export async function detect(image: Blob, target: string): Promise<DetectResult> {
  const body = new FormData();
  body.append('image', image, 'capture.jpg');
  body.append('target', target);
  const base = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '');
  let response: Response;
  try {
    response = await fetch(`${base}/api/detect`, {
      method: 'POST', body, signal: AbortSignal.timeout(20000),
    });
  } catch {
    throw new Error('서버에 연결할 수 없거나 응답 시간이 초과되었습니다. 연결 상태를 확인하고 다시 시도해 주세요.');
  }
  if (!response.ok) {
    const error = await response.json().catch(() => null);
    throw new Error(typeof error?.detail === 'string'
      ? error.detail : '사진 분석 요청에 실패했습니다. 다시 시도해 주세요.');
  }
  const result: unknown = await response.json().catch(() => null);
  if (!isDetectResult(result)) throw new Error('서버 응답 형식을 확인할 수 없습니다. 백엔드 연결 설정을 확인해 주세요.');
  return result;
}
