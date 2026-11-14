export type Health = { status: 'ok' | 'loading' | 'error'; model_loaded: boolean; describe_enabled: boolean; tts_enabled?: boolean; tts_today_chars?: number; tts_daily_limit?: number; device: string; error?: string | null };
export type ApiStats = { window_sec: number; queue_length: number } & Record<string, unknown>;
export type ServerDetection = { label: string; target: string; score: number; box: { x: number; y: number; w: number; h: number } };
export type DetectResult = { detections: ServerDetection[]; mode?: string; color_filter?: unknown; color_rejected?: unknown };
export type ParseResult = { intent: 'find' | 'where' | 'how' | 'stop' | 'unknown'; object_ko: string | null; targets: string[] };
export type Description = { sentences: string[]; grasp?: string; safety?: string; handlePoint?: { x: number; y: number } };
export const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const unit = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1;

export class ApiError extends Error {
  status: number; code: string; detail: unknown;
  constructor(message: string, status = 0, code = 'network_error', detail?: unknown) {
    super(message); this.name = 'ApiError'; this.status = status; this.code = code; this.detail = detail;
  }
}
export function getClientId(storage: Pick<Storage, 'getItem' | 'setItem'>, uuid: () => string = () => crypto.randomUUID()) {
  const stored = storage.getItem('songil-client-id');
  if (stored && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(stored)) return stored;
  const id = uuid(); storage.setItem('songil-client-id', id); return id;
}
export function abortableDelay(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) { reject(signal.reason); return; }
    const abort = () => { clearTimeout(timer); signal?.removeEventListener('abort', abort); reject(signal?.reason); };
    const timer = setTimeout(() => { signal?.removeEventListener('abort', abort); resolve(); }, ms);
    signal?.addEventListener('abort', abort, { once: true });
  });
}
export function retryAfterMs(header: string | null, now = Date.now()) {
  if (!header?.trim()) return 2000;
  const seconds = Number(header);
  const value = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(header) - now;
  return Number.isFinite(value) && value >= 0 ? value : 2000;
}
const messages: Record<string, string> = {
  model_loading: '서버 모델을 준비 중입니다.', model_error: '서버 모델을 불러오지 못했습니다.',
  queue_full: '서버가 혼잡합니다.', timeout: '서버 처리 대기 시간이 초과되었습니다.',
  describe_disabled: '서버 설명 기능이 비활성화되어 있습니다.', parse_disabled: '서버 명령 해석 기능이 비활성화되어 있습니다.',
};
export function createApiClient(config: { baseUrl: string; apiKey: string; requireApiKey?: boolean; clientId: () => string; fetcher?: typeof fetch }) {
  const fetcher = config.fetcher ?? fetch;
  async function request(path: string, options: RequestInit = {}, signal?: AbortSignal, timeout = 20000, audio = false): Promise<unknown> {
    if (config.requireApiKey !== false && !config.apiKey.trim()) throw new ApiError('API 키를 설정해 주세요. 로컬 인식을 사용합니다.', 401, 'unauthorized');
    let clientId: string;
    try { clientId = config.clientId(); }
    catch { throw new ApiError('브라우저 저장소를 사용할 수 없어 서버에 연결할 수 없습니다.', 0, 'storage_unavailable'); }
    for (let attempt = 0; attempt < 2; attempt++) {
      signal?.throwIfAborted();
      const controller = new AbortController();
      const abort = () => controller.abort(signal?.reason);
      signal?.addEventListener('abort', abort, { once: true });
      const timer = setTimeout(() => controller.abort(new DOMException('Timed out', 'TimeoutError')), timeout);
      let response: Response; let body: unknown;
      try {
        response = await fetcher(config.baseUrl.replace(/\/$/, '') + path, { ...options, signal: controller.signal,
          headers: { ...options.headers, 'X-API-Key': config.apiKey, 'X-Client-Id': clientId } });
        body = audio && response.ok ? await response.blob() : await response.json().catch(error => { if (controller.signal.aborted) throw error; return null; });
      } catch {
        if (signal?.aborted) throw signal.reason;
        throw new ApiError(controller.signal.aborted ? '서버 응답 시간이 초과되었습니다.' : '서버 연결을 확인해 주세요.', 0, controller.signal.aborted ? 'timeout' : 'network_error');
      } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
      signal?.throwIfAborted();
      if (response.ok) return body;
      if (response.status === 429 && attempt === 0 && !audio) { await abortableDelay(retryAfterMs(response.headers.get('Retry-After')), signal); continue; }
      const error = record(body) && record(body.error) ? body.error : {};
      const code = typeof error.code === 'string' ? error.code : `http_${response.status}`;
      const message = response.status === 401 ? 'API 키 설정을 확인해 주세요.'
        : response.status === 429 ? '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.'
        : messages[code] ?? (typeof error.message === 'string' ? error.message : '서버 요청에 실패했습니다.');
      throw new ApiError(message, response.status, code, error.detail);
    }
    throw new ApiError('재시도 횟수를 초과했습니다.');
  }
  const invalid = () => new ApiError('서버 응답 형식이 올바르지 않습니다.', 0, 'invalid_response');
  return {
    async stats(signal?: AbortSignal): Promise<ApiStats> {
      const b = await request('/stats', {}, signal, 5000);
      if (!record(b) || typeof b.window_sec !== 'number' || typeof b.queue_length !== 'number') throw invalid();
      return b as ApiStats;
    },
    async tts(text: string, signal?: AbortSignal): Promise<Blob> {
      const b = await request('/tts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) }, signal, 3000, true);
      if (!(b instanceof Blob) || !b.size || !b.type.startsWith('audio/')) throw invalid();
      return b;
    },
    async health(signal?: AbortSignal): Promise<Health> {
      const b = await request('/health', {}, signal, 5000);
      if (!record(b) || !['ok', 'loading', 'error'].includes(String(b.status)) || typeof b.model_loaded !== 'boolean'
        || typeof b.describe_enabled !== 'boolean' || typeof b.device !== 'string') throw invalid();
      return b as Health;
    },
    async detect(image: Blob, targets: string[] = [], signal?: AbortSignal): Promise<DetectResult> {
      if (targets.some(v => !v.trim())) throw new ApiError('찾을 물체가 올바르지 않습니다.', 400, 'invalid_targets');
      const form = new FormData(); form.append('image', image, 'capture.jpg');
      if (targets.length) form.append('targets', targets.join(','));
      form.append('conf', '0.25'); form.append('imgsz', '640');
      const b = await request('/detect', { method: 'POST', body: form }, signal);
      if (!record(b) || !Array.isArray(b.detections) || !b.detections.every(d => record(d) && typeof d.label === 'string'
        && typeof d.target === 'string' && unit(d.score) && record(d.box) && unit(d.box.x) && unit(d.box.y)
        && unit(d.box.w) && unit(d.box.h) && d.box.x + d.box.w <= 1.01 && d.box.y + d.box.h <= 1.01)) throw invalid();
      return b as DetectResult;
    },
    async parse(text: string, signal?: AbortSignal): Promise<ParseResult> {
      const b = await request('/parse', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) }, signal, 45000);
      if (!record(b) || !['find','where','how','stop','unknown'].includes(String(b.intent)) || !(b.object_ko === null || typeof b.object_ko === 'string')
        || !Array.isArray(b.targets) || b.targets.length > 3 || !b.targets.every(t => typeof t === 'string' && /^[a-z0-9][a-z0-9 '\-]{0,49}$/i.test(t))) throw invalid();
      return b as ParseResult;
    },
    async describe(image: Blob, signal?: AbortSignal): Promise<Description> {
      const form = new FormData(); form.append('image', image, 'capture.jpg');
      form.append('prompt', 'Return JSON with hazard, safety, grasp, comment, handle_point {x,y} normalized coordinates, and confidence (high or low). All sentences must be short, polite Korean. hazard must be hot (visible steam or boiling), spill (full drink), edge (table edge), broken (visible breakage), sharp (exposed blade), or null, based only on visible evidence. safety must be one short sentence only when hazard is present, otherwise null. Exclude generic cautions about screens, charging, or dropping. Never claim safe or not hot. grasp and comment must each be one short sentence.');
      const b = await request('/describe', { method: 'POST', body: form }, signal, 45000);
      if (!record(b) || !(record(b.result) || Array.isArray(b.result))) throw invalid();
      return readDescription(b.result);
    },
  };
}
export function readDescription(result: unknown): Description {
  if (Array.isArray(result)) {
    // A single selected object is requested. Never combine coordinates from different objects.
    if (result.length !== 1) return { sentences: ['대상이 여러 개이거나 불분명합니다. 물건 하나를 비추고 다시 시도해 주세요.'] };
    return readDescription(result[0]);
  }
  if (!record(result)) return { sentences: [] };
  if (result.confidence === 'low') return { sentences: ['물건을 확실하게 확인하지 못했어요. 카메라를 가까이 비추고 다시 시도해 주세요.'] };
  const hazard = typeof result.hazard === 'string' && ['hot', 'spill', 'edge', 'broken', 'sharp'].includes(result.hazard);
  const safety = hazard && typeof result.safety === 'string' ? result.safety.trim() : '';
  const grasp = typeof result.grasp === 'string' ? result.grasp.trim() : '';
  const comment = typeof result.comment === 'string' ? result.comment.trim() : '';
  const sentences = [safety, grasp, comment].filter(Boolean);
  const point = result.handle_point;
  return { sentences, ...(safety ? { safety } : {}), ...(grasp ? { grasp } : {}),
    ...(record(point) && unit(point.x) && unit(point.y) ? { handlePoint: { x: point.x, y: point.y } } : {}) };
}
