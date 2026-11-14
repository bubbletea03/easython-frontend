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

test('alignment completion silences all speech for five seconds and discards stale queued notices', context => {
  let now = 1000;
  context.mock.method(performance, 'now', () => now);
  const p = player(); const results: string[] = [];
  p.speak('Aligned', undefined, {quietAfterMs:5000});
  p.speak('Stale notice', reason => results.push(reason));
  now = 4000;
  assert.equal(p.isSpeechPaused(),false);
  utterances[0].onend?.();
  assert.equal(p.isSpeechPaused(),true);
  assert.deepEqual(results,['cancelled']);
  for (const priority of ['guidance','normal','found','safety'] as const) {
    p.speak('Muted',undefined,{priority});
  }
  now = 8999;
  assert.equal(p.isPrioritySpeaking(),true);
  p.speak('Still muted');
  assert.equal(utterances.length,1);
  now = 9000;
  assert.equal(p.isSpeechPaused(),false);
  p.speak('Current guidance',undefined,{priority:'guidance'});
  assert.equal(utterances[1].text,'Current guidance');
});

test('recorded audio completion starts the pause; explicit cancellation resets it', async context => {
  let now = 0;
  context.mock.method(performance, 'now', () => now);
  const p = player(); p.setServerSpeechEnabled(true);
  p.speak('Aligned',undefined,{quietAfterMs:5000});
  await flush(); now = 2000;
  audioInstances[0].onended?.();
  assert.equal(p.isSpeechPaused(),true);
  p.cancelSpeech();
  assert.equal(p.isSpeechPaused(),false);
  p.speak('Stopped'); await flush();
  assert.equal(audioInstances.length,2);
});

test('repeated dynamic speech reuses generated audio without another TTS request', async () => {
  let generated = 0;
  const p = player(async () => {generated++; return new Blob(['audio'],{type:'audio/mpeg'});});
  p.setServerSpeechEnabled(true);
  p.speak('A dynamic warning'); await flush(); audioInstances[0].onended?.();
  p.speak('A dynamic warning'); await flush();
  assert.equal(generated,1);
  assert.equal(audioInstances.length,2);
});

test('discovery interrupts search speech and completes before queued descriptions', () => {
  const p = player(); const results: string[] = [];
  p.speak('Searching', reason => results.push('search:' + reason));
  p.speak('Found the cup', reason => results.push('found:' + reason), {priority:'found'});
  p.speak('Grasp instructions');
  p.speak('Move left', undefined, {priority:'guidance'});
  assert.deepEqual(results, ['search:cancelled']);
  assert.deepEqual(utterances.map(u => u.text), ['Searching', 'Found the cup']);
  utterances[1].onend?.();
  assert.deepEqual(results, ['search:cancelled', 'found:ended']);
  assert.equal(utterances[2].text, 'Grasp instructions');
});

test('discovery retries after safety rather than leaving a stale announcement queued', () => {
  const p = player(); const results: string[] = [];
  p.speak('Warning', undefined, {priority:'safety'});
  p.speak('Found the cup', reason => results.push(reason), {priority:'found'});
  assert.deepEqual(results, ['cancelled']);
  utterances[0].onend?.();
  assert.equal(utterances.length, 1);
  p.speak('Found the cup', undefined, {priority:'found'});
  assert.equal(utterances[1].text, 'Found the cup');
});

test('losing the target cancels discovery and resumes queued speech', () => {
  const p = player(); const results: string[] = [];
  p.speak('Found the cup', reason => results.push(reason), {priority:'found'});
  const staleEnd = utterances[0].onend;
  p.speak('Other notice');
  p.cancelGuidance();
  staleEnd?.();
  assert.deepEqual(results, ['cancelled']);
  assert.equal(utterances[1].text, 'Other notice');
  assert.equal(p.isPrioritySpeaking(), true);
});
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
  p.speak('새 안내', reason => results.push(reason),{priority:'safety'});
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
test('safety is not interrupted by ordinary guidance and normal speech waits its turn',()=>{
  const p=player();const finished:string[]=[];
  p.speak('위험 안내',r=>finished.push('safety:'+r),{priority:'safety'});
  p.speak('일반 설명',r=>finished.push('normal:'+r));
  p.speak('지난 방향',r=>finished.push('guidance:'+r),{priority:'guidance'});
  assert.equal(utterances.length,1);assert.deepEqual(finished,['guidance:cancelled']);
  utterances[0].onend?.();assert.equal(utterances[1].text,'일반 설명');
  utterances[1].onend?.();assert.deepEqual(finished,['guidance:cancelled','safety:ended','normal:ended']);
});
test('recordings play before dynamic TTS; missing recordings fall through to TTS',async()=>{
  let generated=0,recordings=0;
  const p=createSpeechPlayer(async()=>{generated++;return new Blob(['tts'],{type:'audio/mpeg'});},async(_text,id)=>{
    recordings++;return id==='ready'?new Blob(['recording'],{type:'audio/mpeg'}):undefined;
  });players.push(p);p.setServerSpeechEnabled(true);
  p.speak('준비',undefined,{clipId:'ready'});await flush();assert.equal(generated,0);assert.equal(recordings,1);
  audioInstances[0].onended?.();p.speak('동적 문장');await flush();assert.equal(generated,1);
  audioInstances[1].onended?.();
});
test('safety releases at five seconds and queued grasp guidance continues',context=>{
  context.mock.timers.enable({apis:['setTimeout']});const p=player();let safety=true;
  p.speak('경고',()=>{safety=false;},{priority:'safety',maxDurationMs:5000});p.speak('잡는 방법');
  context.mock.timers.tick(5000);assert.equal(safety,false);assert.equal(utterances[1].text,'잡는 방법');
});
