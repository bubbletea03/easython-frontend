import { isSpeechPaused } from './speech';
import { getAudioContext, unlockAudioContext } from './audioContext';

export function unlockFeedback() {
  unlockAudioContext();
}
function tone(frequency: number, at = 0, pan = 0) {
  const context=getAudioContext();
  if (isSpeechPaused() || !context || context.state !== 'running') return;
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  const panner = context.createStereoPanner(); panner.pan.value = pan;
  const start = context.currentTime + at;
  oscillator.frequency.value = frequency;
  gain.gain.setValueAtTime(0, start); gain.gain.linearRampToValueAtTime(.035, start + .01);
  gain.gain.exponentialRampToValueAtTime(.001, start + .08);
  oscillator.connect(gain).connect(panner).connect(context.destination);
  oscillator.start(start); oscillator.stop(start + .09);
  oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); panner.disconnect(); };
}
export function listeningCue(start: boolean) { tone(start ? 660 : 990); tone(start ? 990 : 590, .1); if (!start) vibrate([20,40,20]); }
export function guideCue(pan: number) { tone(880, 0, Math.max(-1, Math.min(1, pan))); }
export function vibrate(pattern: number | number[]) { if (isSpeechPaused()) return; try { navigator.vibrate?.(pattern); } catch { /* Optional on iOS and unsupported browsers. */ } }
