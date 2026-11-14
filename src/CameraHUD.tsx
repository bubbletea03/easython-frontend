import { designIcons } from './designIcons';
import type { SceneUI } from './sceneUI';

function Icon({ name, direction }: { name: 'mic' | 'stop' | 'listening' | 'arrow' | 'check' | 'warning'; direction?: SceneUI['direction'] }) {
  if (name === 'arrow') return <svg viewBox="0 0 24 24" className={`hud-icon arrow-${direction || 'left'}`} aria-hidden="true"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.42-1.41L7.83 13H20z" /></svg>;
  if (name === 'check') return <svg viewBox="0 0 24 24" className="hud-icon" aria-hidden="true"><path d="m9 16.2-4.2-4.2-1.4 1.4L9 19 21 7l-1.4-1.4z" /></svg>;
  if (name === 'warning') return <svg viewBox="0 0 24 24" className="hud-icon" aria-hidden="true"><path d="M1 21h22L12 2zm12-3h-2v-2h2zm0-4h-2v-4h2z" /></svg>;
  return <svg viewBox="0 -960 960 960" className="hud-icon" aria-hidden="true"><path d={designIcons[name]} /></svg>;
}

export function StartScreen({ onStart }: { onStart: () => void }) {
  return <main className="start-screen"><button type="button" className="start-button" onClick={onStart} aria-label="시작. 카메라와 음성 안내를 켭니다">
    <span className="start-brand">손길<small>물건 찾기부터 손 안내까지</small></span>
    <span className="start-word">시작<small>누르면 카메라와<br />음성 안내가 켜져요</small></span>
    <span className="start-hint"><span aria-hidden="true">↗</span> 화면 어디를 눌러도 돼요</span>
  </button></main>;
}

export function CameraHUD({ scene, heard, active, onStop, onVoice }: { scene: SceneUI; heard: string; active: boolean; onStop: () => void; onVoice: () => void }) {
  const working = active || ['listening','processing','searching','found','guiding','lost','warning'].includes(scene.state);
  const isListening = scene.state === 'listening';
  return <>
    <div className="camera-scrim top" aria-hidden="true" /><div className="camera-scrim bottom" aria-hidden="true" />
    {working && <div className={`state-frame${scene.state === 'warning' ? ' danger' : ''}${scene.state === 'lost' ? ` lost-${scene.lostSide}` : ''}`} aria-hidden="true" />}
    <header className="camera-toolbar">
      {working && <button type="button" className="stop-button" onClick={onStop}><Icon name="stop" />그만</button>}
      <p className={`status-pill${working ? '' : ' off'}${scene.state === 'warning' ? ' danger' : ''}`} role="status" aria-live="polite"><i aria-hidden="true" />{scene.status}</p>
    </header>
    <div className="bottom-hud">
      {heard && (isListening || scene.state === 'unknown') && <div className="heard-bubble" role="status"><span>들은 말</span><b>“{heard}”</b></div>}
      {!isListening && <div className={scene.state === 'warning' ? 'safety-card' : 'instruction-card'} role={scene.state === 'warning' || scene.state === 'error' ? 'alert' : 'status'} aria-live={scene.state === 'warning' ? 'assertive' : 'polite'}>
        {scene.state === 'warning' ? <Icon name="warning" /> : scene.direction ? <Icon name="arrow" direction={scene.direction} /> : null}
        <div><b>{scene.title}</b>{scene.detail && <small>{scene.detail}</small>}</div>
      </div>}
      <button type="button" className={`voice-orb${isListening ? ' is-listening' : ''}${scene.state === 'processing' ? ' is-processing' : ''}`} onClick={onVoice}
        disabled={scene.state === 'processing'} aria-label={isListening ? '음성 인식 중지' : '말하기. 찾을 물건을 말씀해 주세요'} aria-pressed={isListening}>
        {isListening && <><span className="orb-ring ring-1" /><span className="orb-ring ring-2" /><span className="orb-ring ring-3" /></>}
        <Icon name={isListening ? 'listening' : scene.state === 'done' ? 'check' : 'mic'} />
      </button>
      <p className="orb-label">{isListening ? '듣고 있어요' : scene.state === 'processing' ? '확인하는 중' : '말하기'}</p>
    </div>
  </>;
}
