import { designIcons } from './designIcons';
import type { SceneUI } from './sceneUI';

// This file is compiled on its own by tests/usabilityFlows.test.ts: keep it free of hooks and of
// imported components, and keep exactly one <button> in CameraHUD's returned tree.
type IconName = 'mic' | 'stop' | 'listening' | 'arrow' | 'check' | 'warning' | 'retry';

function Icon({ name, direction }: { name: IconName; direction?: SceneUI['direction'] }) {
  if (name === 'arrow') return <svg viewBox="0 0 24 24" className={`hud-icon arrow-${direction || 'left'}`} aria-hidden="true"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.42-1.41L7.83 13H20z" /></svg>;
  if (name === 'check') return <svg viewBox="0 0 24 24" className="hud-icon" aria-hidden="true"><path d="m9 16.2-4.2-4.2-1.4 1.4L9 19 21 7l-1.4-1.4z" /></svg>;
  if (name === 'warning') return <svg viewBox="0 0 24 24" className="hud-icon" aria-hidden="true"><path d="M1 21h22L12 2zm12-3h-2v-2h2zm0-4h-2v-4h2z" /></svg>;
  if (name === 'retry') return <svg viewBox="0 0 24 24" className="hud-icon" aria-hidden="true"><path d="M17.65 6.35A7.96 7.96 0 0 0 12 4a8 8 0 1 0 7.73 10h-2.08A6 6 0 1 1 12 6c1.66 0 3.14.69 4.22 1.78L13 11h7V4z" /></svg>;
  return <svg viewBox="0 -960 960 960" className="hud-icon" aria-hidden="true"><path d={designIcons[name]} /></svg>;
}

const stepLabels = ['찾기', '맞추기', '손 뻗기'];

export function CameraHUD({ scene, heard, active, pending = false, handsFree = false, choosing = false, onStop, onVoice }: {
  scene: SceneUI; heard: string; active: boolean; pending?: boolean;
  /** Continuous listening is on, so saying "그만" also stops. */
  handsFree?: boolean;
  /** The title is a question to the user, so no state icon is shown. */
  choosing?: boolean;
  onStop: () => void; onVoice: () => void;
}) {
  const working = active || ['listening','processing','searching','found','guiding','lost','warning'].includes(scene.state);
  const isListening = scene.state === 'listening';
  const canStop = !isListening && (active || pending);
  const danger = scene.state === 'warning';
  // With a camera error the same button retries the camera instead of listening.
  const canRetry = scene.state === 'error' && !canStop;
  const arrow = scene.direction ?? (scene.state === 'lost' ? scene.lostSide : undefined);
  const badge: IconName | undefined = choosing ? undefined
    : danger || scene.state === 'error' ? 'warning'
    : isListening ? 'listening'
    : arrow ? 'arrow'
    : ['found','guiding','done'].includes(scene.state) ? 'check' : undefined;
  const showHeard = !!heard && (isListening || scene.state === 'unknown');
  return <>
    <div className="camera-scrim top" aria-hidden="true" /><div className="camera-scrim bottom" aria-hidden="true" />
    {working && <div className="state-frame" aria-hidden="true" />}
    <header className="camera-toolbar">
      <p className={`status-chip${['idle','unknown'].includes(scene.state) ? ' off' : ''}`} aria-hidden="true"><i aria-hidden="true" />{scene.status}</p>
      {scene.step && <ol className="step-track" aria-hidden="true">
        {stepLabels.map((label, index) => <li key={label} className={index + 1 === scene.step ? 'is-current' : index + 1 < scene.step! ? 'is-done' : undefined}>{label}</li>)}
      </ol>}
    </header>
    <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">{['idle','processing','error','unknown'].includes(scene.state) ? `${scene.title}. ${scene.detail || ''}` : ''}</p>
    <div className="bottom-hud">
      <div className={`guide-panel${danger ? ' is-danger' : ''}`} aria-hidden="true">
        {badge && <span className="guide-badge"><Icon name={badge} direction={arrow} /></span>}
        <div className="guide-text">
          <b>{scene.title}</b>
          {scene.detail && <small>{scene.detail}</small>}
          {showHeard && <span className="heard-quote"><span>들은 말</span>“{heard}”</span>}
        </div>
      </div>
      <button type="button" className={`voice-orb ${canStop ? 'is-stop' : isListening ? 'is-listening' : 'is-idle'}`} onClick={canStop ? onStop : onVoice}
        aria-label={canStop ? '그만. 탐색과 안내를 멈춥니다' : isListening ? '음성 인식 중지' : canRetry ? '다시 시도. 카메라를 다시 켭니다' : '말하기. 찾을 물건이나 명령을 말씀해 주세요'} aria-pressed={isListening}>
        {isListening && <><span className="orb-ring ring-1" /><span className="orb-ring ring-2" /></>}
        {scene.state === 'processing' && <span className="orb-progress" />}
        <Icon name={canStop ? 'stop' : isListening ? 'listening' : canRetry ? 'retry' : 'mic'} />
      </button>
      <p className="orb-label" aria-hidden="true">{canStop ? '그만' : isListening ? '듣고 있어요' : canRetry ? '다시 시도' : '말하기'}</p>
      <p className="orb-hint" aria-hidden="true">{handsFree && canStop ? '‘그만’이라고 말해도 멈춰요' : ''}</p>
    </div>
  </>;
}

export function StartScreen({onStart}: {onStart:()=>void}) {
  return <main className="start-screen"><button type="button" className="start-button" onClick={onStart} aria-label="시작. 카메라와 음성 안내를 준비합니다">
    <span className="start-brand">손길<small>물건 찾기부터 손 안내까지</small></span>
    <span className="start-word">시작<small>누르면 카메라와<br />음성 안내가 켜져요</small></span>
    <span className="start-cta">화면 어디든 눌러 시작</span>
  </button></main>;
}
