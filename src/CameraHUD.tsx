import { designIcons } from './designIcons';
import type { SceneUI } from './sceneUI';

function Icon({ name, direction }: { name: 'mic' | 'stop' | 'listening' | 'arrow' | 'check' | 'warning'; direction?: SceneUI['direction'] }) {
  if (name === 'arrow') return <svg viewBox="0 0 24 24" className={`hud-icon arrow-${direction || 'left'}`} aria-hidden="true"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.42-1.41L7.83 13H20z" /></svg>;
  if (name === 'check') return <svg viewBox="0 0 24 24" className="hud-icon" aria-hidden="true"><path d="m9 16.2-4.2-4.2-1.4 1.4L9 19 21 7l-1.4-1.4z" /></svg>;
  if (name === 'warning') return <svg viewBox="0 0 24 24" className="hud-icon" aria-hidden="true"><path d="M1 21h22L12 2zm12-3h-2v-2h2zm0-4h-2v-4h2z" /></svg>;
  return <svg viewBox="0 -960 960 960" className="hud-icon" aria-hidden="true"><path d={designIcons[name]} /></svg>;
}

export function CameraHUD({ scene, heard, active, pending = false, onVoice,onStop }: { scene: SceneUI; heard: string; active: boolean; pending?: boolean; onVoice: () => void;onStop:()=>void }) {
  const working = active || ['listening','processing','searching','found','guiding','lost','warning'].includes(scene.state);
  const isListening = scene.state === 'listening';
  const canStop=!isListening&&(active||pending);
  return <>
    <div className="camera-scrim top" aria-hidden="true" /><div className="camera-scrim bottom" aria-hidden="true" />
    {working && <div className={`state-frame${scene.state === 'warning' ? ' danger' : ''}${scene.state === 'lost' ? ` lost-${scene.lostSide}` : ''}`} aria-hidden="true" />}
    <header className="camera-toolbar">
      <p className={`status-pill${working ? '' : ' off'}${scene.state === 'warning' ? ' danger' : ''}`} aria-hidden="true"><i aria-hidden="true" />{scene.status}</p>
    </header>
    <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">{['idle','processing','error','unknown'].includes(scene.state) ? `${scene.title}. ${scene.detail || ''}` : ''}</p>
    <div className="bottom-hud">
      {heard && (isListening || scene.state === 'unknown') && <div className="heard-bubble" aria-hidden="true"><span>들은 말</span><b>“{heard}”</b></div>}
      {!isListening && <div className={scene.state === 'warning' ? 'safety-card' : 'instruction-card'} aria-hidden="true">
        {scene.state === 'warning' ? <Icon name="warning" /> : scene.direction ? <Icon name="arrow" direction={scene.direction} /> : null}
        <div><b>{scene.title}</b>{scene.detail && <small>{scene.detail}</small>}</div>
      </div>}
      <button type="button" className={`voice-orb${isListening ? ' is-listening' : ''}`} onClick={canStop?onStop:onVoice}
        aria-label={canStop?'그만. 탐색과 안내를 멈춥니다':isListening ? '음성 입력 종료' : '말하기. 찾을 물건이나 명령을 말씀해 주세요'} aria-pressed={isListening}>
        {isListening && <><span className="orb-ring ring-1" /><span className="orb-ring ring-2" /><span className="orb-ring ring-3" /></>}
        <Icon name={canStop?'stop':isListening ? 'listening' : 'mic'} />
      </button>
      <p className="orb-label" aria-hidden="true">{canStop?'그만':isListening ? '듣고 있어요' : '말하기'}</p>
    </div>
  </>;
}

export function StartScreen({onStart}: {onStart:()=>void}) {
  return <main className="start-screen"><button type="button" className="start-button" onClick={onStart} aria-label="시작. 카메라와 음성 안내를 준비합니다">
    <span className="start-brand">손길<small>물건 찾기부터 손 안내까지</small></span>
    <span className="start-word">시작<small>누르면 카메라와<br />음성 안내가 켜져요</small></span>
    <span className="start-hint">화면을 눌러 시작하세요</span>
  </button></main>;
}
