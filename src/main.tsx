import { StrictMode, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { detect } from './api';
import './style.css';

const targets = [['cup', '컵'], ['bottle', '물병'], ['cell phone', '휴대폰'], ['book', '책'], ['remote', '리모컨']];
function App() {
  const [target, setTarget] = useState('cup');
  const [camera, setCamera] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('찾을 물건을 선택하고 카메라를 켜 주세요.');
  const [sound, setSound] = useState(true);
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const mounted = useRef(true);
  const starting = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; stream.current?.getTracks().forEach(t => t.stop()); window.speechSynthesis?.cancel(); };
  }, []);
  function announce(text: string) {
    if (!mounted.current) return;
    setMessage(text);
    if (sound && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const speech = new SpeechSynthesisUtterance(text); speech.lang = 'ko-KR';
      window.speechSynthesis.speak(speech);
    }
  }
  async function startCamera() {
    if (starting.current) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      announce('이 환경에서는 카메라를 사용할 수 없습니다. HTTPS로 접속하거나 사진 선택을 이용해 주세요.'); return;
    }
    starting.current = true;
    try {
      const next = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
      if (!mounted.current) { next.getTracks().forEach(t => t.stop()); return; }
      stream.current?.getTracks().forEach(t => t.stop()); stream.current = next;
      if (video.current) { video.current.srcObject = next; await video.current.play(); }
      setCamera(true); announce('카메라가 켜졌습니다. 휴대폰을 물건 쪽으로 향한 뒤 촬영해 주세요.');
    } catch {
      stream.current?.getTracks().forEach(t => t.stop()); stream.current = null;
      setCamera(false); announce('카메라를 켤 수 없습니다. 카메라 권한을 확인하거나 사진 선택을 이용해 주세요.');
    } finally { starting.current = false; }
  }
  function stopCamera() {
    stream.current?.getTracks().forEach(t => t.stop()); stream.current = null;
    if (video.current) video.current.srcObject = null;
    setCamera(false); announce('카메라를 껐습니다.');
  }
  async function submit(blob: Blob) {
    if (busy) return;
    if (blob.size > 8 * 1024 * 1024) { announce('사진 크기는 8MB 이하여야 합니다.'); return; }
    setBusy(true); announce('사진을 전송하고 있습니다.');
    try { const result = await detect(blob, target); announce(result.mode === 'demo' ? `연결 확인 모드입니다. 실제 탐지 결과가 아닙니다. ${result.message}` : result.message); }
    catch (error) { announce(error instanceof Error ? error.message : '서버에 연결할 수 없습니다.'); }
    finally { if (mounted.current) setBusy(false); }
  }
  async function capture() {
    const source = video.current;
    if (!source?.videoWidth) { announce('카메라를 준비하고 있습니다. 잠시 후 다시 촬영해 주세요.'); return; }
    const canvas = document.createElement('canvas');
    const scale = Math.min(1, 1280 / source.videoWidth);
    canvas.width = Math.round(source.videoWidth * scale); canvas.height = Math.round(source.videoHeight * scale);
    canvas.getContext('2d')!.drawImage(source, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', .85));
    if (blob) await submit(blob); else announce('사진을 촬영하지 못했습니다. 다시 시도해 주세요.');
  }
  return <><a className="skip" href="#main">본문으로 바로가기</a>
    <header><a className="brand" href="/">손길<span>물건 찾기 도우미</span></a><span className="badge">개발 버전</span></header>
    <main id="main"><section className="intro"><p className="eyebrow">일상 속 작은 도움</p><h1>찾고 싶은 물건,<br/>함께 찾아볼까요?</h1><p>물건을 선택하고 사진을 찍으면<br/>결과를 소리로 안내해 드려요.</p></section>
      <aside className="notice"><strong>백엔드 연결을 준비하고 있어요.</strong><p>카메라와 음성 안내를 사용할 수 있어요. 물건을 찾으려면 별도 탐지 서버 연결이 필요해요.</p></aside>
      <section className="panel" aria-labelledby="target-heading"><h2 id="target-heading"><span className="step">1</span> 무엇을 찾으세요?</h2><div className="targets" role="group" aria-label="찾을 물건">{targets.map(([value, label]) => <button key={value} aria-pressed={target === value} disabled={busy} onClick={() => { setTarget(value); announce(`${label}을 선택했습니다.`); }}>{label}</button>)}</div></section>
      <section className="panel" aria-labelledby="camera-heading"><h2 id="camera-heading"><span className="step">2</span> 주변을 비춰 주세요</h2><div className="viewfinder"><video ref={video} muted playsInline aria-label="후면 카메라 미리보기" hidden={!camera}/>{!camera && <div className="placeholder"><span aria-hidden="true">◎</span><strong>카메라가 꺼져 있어요</strong><p>아래 버튼으로 카메라를 켜 주세요</p></div>}</div>
        {!camera ? <button className="primary" onClick={startCamera} disabled={busy}>카메라 켜기</button> : <><button className="primary" disabled={busy} onClick={capture}>{busy ? '사진 전송 중…' : '촬영하고 결과 듣기'}</button><button className="secondary" onClick={stopCamera} disabled={busy}>카메라 끄기</button></>}
        <label className={`upload ${busy ? 'disabled' : ''}`}>사진 선택하기<input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={e => { const file = e.target.files?.[0]; if (file) void submit(file); e.target.value = ''; }}/></label><p className="hint">촬영한 사진은 연결된 분석 서버로 전송돼요.</p>
      </section>
      <section className="result" aria-labelledby="result-heading" aria-busy={busy}><h2 id="result-heading">음성 안내</h2><p role="status" aria-live="polite" aria-atomic="true">{message}</p><button className="secondary" onClick={() => announce(message)}>안내 다시 듣기</button><label className="sound"><input type="checkbox" checked={sound} onChange={e => { setSound(e.target.checked); if (!e.target.checked) window.speechSynthesis?.cancel(); }}/> 음성 안내 사용</label></section>
    </main><footer>손길 · 한 번에 하나씩, 천천히 찾아요.</footer></>;
}
createRoot(document.getElementById('root')!).render(<StrictMode><App/></StrictMode>);
