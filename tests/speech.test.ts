import test, { beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createSpeechPlayer } from '../src/speechCore.ts';
import { deriveScene } from '../src/sceneUI.ts';

let utterances: FakeUtterance[];
let audioInstances: FakeAudio[];
let players: ReturnType<typeof createSpeechPlayer>[];
class FakeUtterance {
  text: string; lang = ''; rate = 1;
  onend?: () => void; onerror?: () => void;
  constructor(text: string) { this.text = text; }
}
class FakeAudio {
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor() { audioInstances.push(this); }
  async play() {}
  pause() {} removeAttribute() {} load() {}
}
const original = Object.fromEntries(['window','document','Audio','SpeechSynthesisUtterance'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis,key)]));
beforeEach(() => {
  utterances = []; audioInstances = []; players = [];
  Object.assign(globalThis, {
    window: {speechSynthesis:{cancel() {},speak(u: FakeUtterance) { utterances.push(u); }}},
    document: {hidden:false}, Audio:FakeAudio, SpeechSynthesisUtterance:FakeUtterance,
  });
});
afterEach(() => {
  players.forEach(p => p.cancelSpeech());
  for (const [key, descriptor] of Object.entries(original)) {
    if (descriptor) Object.defineProperty(globalThis,key,descriptor);
    else Reflect.deleteProperty(globalThis,key);
  }
});
function player(tts = async () => new Blob(['audio'],{type:'audio/mpeg'})) {
  const p = createSpeechPlayer(tts); players.push(p); return p;
}
const flush = () => new Promise(resolve => setImmediate(resolve));
function warningScene(safety?: string) {
  return deriveScene({listening:false,busy:false,running:true,cameraReady:true,cameraError:false,message:'',
    outcome:'searching',targetLabel:'컵',found:true,lost:false,guiding:false,timedOut:false,safety});
}
test('server audio completion releases warning and restores object detection scene', async () => {
  const p = player(); p.setServerSpeechEnabled(true);
  let safety: string | undefined = '뜨거우니 조심하세요.';
  p.speak(safety, () => { safety = undefined; });
  assert.equal(warningScene(safety).state,'warning');
  await flush(); assert.equal(audioInstances.length,1);
  audioInstances[0].onended?.();
  assert.equal(safety,undefined); assert.equal(warningScene(safety).state,'found');
  assert.equal(p.isPrioritySpeaking(),false);
});
test('browser voice completion also releases warning', () => {
  const p = player(); let completed = 0;
  p.speak('조심하세요.', () => completed++);
  utterances[0].onend?.();
  assert.equal(completed,1); assert.equal(p.isPrioritySpeaking(),false);
});
test('server failure keeps warning until fallback voice finishes', async () => {
  const p = player(async () => { throw new Error('unavailable'); }); p.setServerSpeechEnabled(true);
  let completed = 0; p.speak('조심하세요.', () => completed++);
  await flush(); assert.equal(completed,0); assert.equal(utterances.length,1);
  utterances[0].onend?.(); assert.equal(completed,1);
});
test('cancellation settles once and old voice events cannot clear newer speech', () => {
  const p = player(); const results: string[] = [];
  p.speak('이전 경고', reason => results.push(reason));
  const oldEnd = utterances[0].onend;
  p.speak('새 안내', reason => results.push(reason));
  assert.deepEqual(results,['cancelled']);
  oldEnd?.(); assert.equal(p.isPrioritySpeaking(),true);
  utterances[1].onend?.();
  assert.deepEqual(results,['cancelled','ended']);
});
test('autoplay rejection and browser synthesis errors do not leave warning stuck', async () => {
  const p = player(); p.setServerSpeechEnabled(true);
  const previousPlay = FakeAudio.prototype.play;
  FakeAudio.prototype.play = async () => { throw new Error('autoplay denied'); };
  try {
    const results: string[] = []; p.speak('조심하세요.', reason => results.push(reason));
    await flush(); assert.equal(utterances.length,1);
    utterances[0].onerror?.(); assert.deepEqual(results,['error']);
    assert.equal(p.isPrioritySpeaking(),false);
  } finally { FakeAudio.prototype.play = previousPlay; }
});
test('missing browser speech support settles immediately', () => {
  Object.assign(globalThis,{window:{}});
  const p = player(); const results: string[] = [];
  p.speak('조심하세요.', reason => results.push(reason));
  assert.deepEqual(results,['error']); assert.equal(p.isPrioritySpeaking(),false);
});
test('missing completion events time out instead of retaining the warning forever', context => {
  context.mock.timers.enable({apis:['setTimeout']});
  const p = player(); const results: string[] = [];
  p.speak('조심하세요.', reason => results.push(reason));
  context.mock.timers.tick(60000);
  assert.deepEqual(results,['timeout']); assert.equal(p.isPrioritySpeaking(),false);
});
