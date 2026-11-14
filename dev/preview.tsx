// Development-only state gallery. It is not a Vite build input, so it never ships.
// Open /dev/preview.html?state=guiding (add &bg=bright to check legibility over a bright scene).
import { createRoot } from 'react-dom/client';
import '../src/tokens.css';
import '../src/style.css';
import { CameraHUD, StartScreen } from '../src/CameraHUD';
import { GuideOverlay } from '../src/GuideOverlay';
import { deriveScene, type SceneUI } from '../src/sceneUI';

const query = new URLSearchParams(location.search);
const name = query.get('state') || 'idle';
const width = innerWidth, height = innerHeight;
const base = { listening: false, busy: false, running: false, cameraReady: true, cameraError: false, message: '', outcome: 'idle' as const,
  targetLabel: '컵', found: false, lost: false, guiding: false, timedOut: false };
const run = { ...base, running: true };
const rect = (cx: number, cy: number, w = .26, h = .2) => ({ x: (cx - w / 2) * width, y: (cy - h / 2) * height, width: w * width, height: h * height });
const point = (x: number, y: number) => ({ x: x * width, y: y * height });
type Preview = { scene: SceneUI; heard?: string; active?: boolean; pending?: boolean; handsFree?: boolean; choosing?: boolean; toast?: string;
  overlay?: Partial<Parameters<typeof GuideOverlay>[0]> };
const center = rect(.5, .5);
const previews: Record<string, Preview> = {
  preparing: { scene: deriveScene({ ...base, cameraReady: false }) },
  idle: { scene: deriveScene(base) },
  listening: { scene: deriveScene({ ...base, listening: true }), heard: '빨간 컵 찾아 줘' },
  processing: { scene: deriveScene({ ...base, busy: true }), pending: true },
  searching: { scene: deriveScene(run), active: true, handsFree: true },
  timedout: { scene: deriveScene({ ...run, timedOut: true }), active: true, handsFree: true },
  'found-off': { scene: deriveScene({ ...run, found: true, centered: false, direction: 'left' }), active: true, handsFree: true,
    overlay: { target: { rect: rect(.2, .44) }, others: [rect(.78, .62, .2, .14)] } },
  found: { scene: deriveScene({ ...run, found: true, centered: true }), active: true, handsFree: true, overlay: { target: { rect: center }, centered: true } },
  guiding: { scene: deriveScene({ ...run, found: true, centered: true, guiding: true, direction: 'left' }), active: true, handsFree: true,
    overlay: { target: { rect: center }, centered: true, hand: point(.8, .64), destination: point(.5, .5), gap: .24 } },
  'guiding-near': { scene: deriveScene({ ...run, found: true, centered: true, guiding: true, direction: 'up' }), active: true, handsFree: true,
    overlay: { target: { rect: center }, centered: true, hand: point(.56, .64), destination: point(.56, .52), gap: .05, handle: { point: point(.56, .52), label: '손잡이' } } },
  aligned: { scene: deriveScene({ ...run, found: true, centered: true, guiding: true }), active: true, handsFree: true,
    overlay: { target: { rect: center }, centered: true, hand: point(.51, .51), destination: point(.5, .5), aligned: true } },
  lost: { scene: deriveScene({ ...run, lost: true, lostSide: 'right' }), active: true, handsFree: true, overlay: { lostSide: 'right' } },
  'lost-unknown': { scene: deriveScene({ ...run, lost: true }), active: true, handsFree: true },
  choice: { scene: { ...deriveScene({ ...run, found: true, centered: true }), title: '같은 물건이 두 개 보여요. 왼쪽과 오른쪽 중 어느 쪽인가요?', detail: '왼쪽 또는 오른쪽이라고 말씀해 주세요.' },
    active: true, handsFree: true, choosing: true, overlay: { target: { rect: rect(.3, .5) }, others: [rect(.72, .5)], centered: true } },
  warning: { scene: deriveScene({ ...run, found: true, safety: '뜨거울 수 있어요. 손잡이 쪽을 잡아 주세요.' }), active: true, overlay: { target: { rect: center }, centered: true } },
  unknown: { scene: deriveScene({ ...base, outcome: 'unknown', message: '음성이 들리지 않았어요. 다시 눌러 말씀해 주세요.' }), heard: '어 그게' },
  done: { scene: deriveScene({ ...base, outcome: 'done' }) },
  error: { scene: deriveScene({ ...base, cameraError: true, message: '카메라 권한을 허용한 뒤 다시 시작해 주세요.' }) },
  toast: { scene: deriveScene(run), active: true, toast: '이 브라우저는 계속 듣기를 지원하지 않아요. 화면의 그만 버튼으로 멈춰 주세요.' },
};
const backgrounds: Record<string, string> = {
  dark: 'radial-gradient(circle at 50% 50%, #7a6a55 0 12%, transparent 13%), linear-gradient(160deg, #3b3a36, #1d1c1a 60%, #4a4033)',
  bright: 'radial-gradient(circle at 50% 50%, #d94f3a 0 12%, transparent 13%), linear-gradient(160deg, #fdfdfb, #e9e4d8 55%, #ffffff)',
};
function App() {
  if (name === 'start') return <StartScreen onStart={() => {}} />;
  const preview = previews[name];
  if (!preview) return <ul style={{ color: '#fff', padding: 24, overflow: 'auto', height: '100%' }}>{['start', ...Object.keys(previews)].map(key => <li key={key}><a style={{ color: '#fff' }} href={`?state=${key}`}>{key}</a></li>)}</ul>;
  return <main className={`camera-screen scene-${preview.scene.state}`}>
    <div style={{ position: 'absolute', inset: 0, background: backgrounds[query.get('bg') || 'dark'] }} />
    <GuideOverlay state={preview.scene.state} viewport={{ width, height }} others={[]} centered={false} {...preview.overlay} />
    <CameraHUD scene={preview.scene} heard={preview.heard || ''} active={!!preview.active} pending={preview.pending} handsFree={preview.handsFree} choosing={preview.choosing} onStop={() => {}} onVoice={() => {}} />
    {preview.toast && <p className="hud-toast" role="status">{preview.toast}</p>}
  </main>;
}
createRoot(document.getElementById('root')!).render(<App />);
