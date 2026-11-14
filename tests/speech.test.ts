import test, { beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createSpeechPlayer } from '../src/speechCore.ts';
import { deriveScene } from '../src/sceneUI.ts';
import { createContinuousVoice, type ContinuousRecognizer } from '../src/continuousVoiceCore.ts';
import {createAnnouncementPresenter} from '../src/announcementPresentation.ts';

let utterances: FakeUtterance[];
let audioInstances: FakeAudio[];
let players: ReturnType<typeof createSpeechPlayer>[];
class FakeUtterance {
  text: string; lang = ''; rate = 1;
  onstart?:()=>void;onend?: () => void; onerror?: () => void;
  constructor(text: string) { this.text = text; }
}
class FakeAudio {
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onpause: (() => void) | null = null;
  ended = false;
  constructor() { audioInstances.push(this); }
  plays=0;
  async play() {this.plays++;}
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

test('a warning cannot interrupt guidance and its duration budget cannot cut a started sentence',context=>{
  context.mock.timers.enable({apis:['setTimeout']});const p=player();
  p.speak('Full guide',undefined,{priority:'guidance'});utterances[0].onstart?.();
  p.speak('Warning',undefined,{priority:'safety',maxDurationMs:5000});
  context.mock.timers.tick(20000);assert.equal(utterances.length,1);
  utterances[0].onend?.();assert.equal(utterances[1].text,'Warning');utterances[1].onstart?.();
  p.speak('Next step');context.mock.timers.tick(10000);assert.equal(utterances.length,2);
  utterances[1].onend?.();assert.equal(utterances[2].text,'Next step');
});

test('an end callback cannot jump ahead of instructions already waiting',()=>{
  const p=player();p.speak('First',()=>p.speak('Third'));p.speak('Second');
  utterances[0].onend?.();assert.equal(utterances[1].text,'Second');
  utterances[1].onend?.();assert.equal(utterances[2].text,'Third');
});

test('recognition starts and restarts alongside buffered speech without cancelling the guide',async()=>{
  let starts=0,stops=0,recognitions=0,time=0;
  const p=createSpeechPlayer(async()=>new Blob(['audio'],{type:'audio/mpeg'}),undefined,async()=>({
    async start(){starts++;},stop(){stops++;},
  }));players.push(p);p.setServerSpeechEnabled(true);
  p.speak('Move left',undefined,{priority:'guidance'});await flush();
  assert.equal(p.canListenDuringSpeech(),true);
  const instances:ContinuousRecognizer[]=[];
  const listener=createContinuousVoice({
    create:()=>{const r:ContinuousRecognizer={lang:'',continuous:false,interimResults:false,onend:null,onerror:null,onresult:null,start(){recognitions++;},abort(){}};instances.push(r);return r;},
    isSpeaking:()=>p.isPrioritySpeaking(),canStartDuringSpeech:()=>p.canListenDuringSpeech(),isHidden:()=>false,now:()=>time,
    onCommand:()=>p.cancelSpeech(),onError:()=>{},
  });
  try {
    listener.tick();instances[0].onend?.();time=500;listener.tick();
    assert.equal(recognitions,2);assert.equal(starts,1);assert.equal(stops,0);assert.equal(p.isPrioritySpeaking(),true);
    instances[1].onresult?.({results:[Object.assign([{transcript:'그만'}],{isFinal:false})]});
    assert.equal(stops,1);assert.equal(p.isPrioritySpeaking(),false);
  } finally {listener.dispose();}
});

test('unavailable Web Audio falls back to media playback and completion still releases the guide',async()=>{
  const p=createSpeechPlayer(async()=>new Blob(['audio'],{type:'audio/mpeg'}),undefined,async()=>{throw new Error('unsupported');});
  players.push(p);p.setServerSpeechEnabled(true);let ended=0;
  p.speak('Guide',()=>ended++);await flush();
  assert.equal(audioInstances.length,1);assert.equal(p.canListenDuringSpeech(),false);
  audioInstances[0].onended?.();assert.equal(ended,1);assert.equal(p.isPrioritySpeaking(),false);
});

test('unexpected audio pause resumes the same sentence and never starts the queued next guide',async()=>{
  const p=player();p.setServerSpeechEnabled(true);
  const reasons:string[]=[];
  p.speak('Move left',reason=>reasons.push(reason),{priority:'guidance'});await flush();
  const id=p.getAnnouncement()?.id;p.speak('Move right');
  audioInstances[0].onpause?.();
  await flush();
  assert.equal(p.isPrioritySpeaking(),true);assert.deepEqual(reasons,[]);
  assert.equal(audioInstances.length,1);assert.equal(audioInstances[0].plays,2);assert.equal(p.getAnnouncement()?.id,id);
  audioInstances[0].onended?.();await flush();assert.deepEqual(reasons,['ended']);assert.equal(audioInstances.length,2);
});

test('the displayed message stays attached to the playing voice until its ended event',()=>{
  const p=player(),presenter=createAnnouncementPresenter();
  const first=deriveScene({listening:false,busy:false,running:true,cameraReady:true,cameraError:false,message:'',outcome:'searching',targetLabel:'cup',found:true,lost:false,guiding:true,direction:'left',timedOut:false});
  p.speak('Complete left instruction',undefined,{priority:'guidance'});
  const card=presenter.update(first,p.getAnnouncement());
  p.speak('Complete warning',undefined,{priority:'safety'});
  const latest={...first,state:'warning' as const,title:'New warning',detail:'New model output'};
  assert.equal(presenter.update(latest,p.getAnnouncement()),card);
  assert.equal(card.title,'Complete left instruction');assert.equal(card.state,'guiding');assert.equal(card.detail,undefined);
  utterances[0].onend?.();
  const next=presenter.update(latest,p.getAnnouncement());assert.equal(next.title,'Complete warning');assert.equal(next.state,'warning');
  p.cancelSpeech();assert.equal(presenter.update(first,p.getAnnouncement()),first);
});

test('missing synthesis start events do not time out speech that is actually speaking',context=>{
  context.mock.timers.enable({apis:['setTimeout']});const p=player();
  p.speak('Long sentence',undefined,{maxDurationMs:5000});p.speak('Next sentence');
  Object.assign(window.speechSynthesis,{speaking:true});
  context.mock.timers.tick(20000);assert.equal(utterances.length,1);assert.equal(p.getAnnouncement()?.text,'Long sentence');
  utterances[0].onend?.();assert.equal(utterances[1].text,'Next sentence');
});

test('an externally interrupted browser voice retries its current text instead of moving to the next',async()=>{
  const p=player();p.speak('First sentence');p.speak('Second sentence');const id=p.getAnnouncement()?.id;
  (utterances[0].onerror as ((event:unknown)=>void))?.({error:'interrupted'});await flush();
  assert.deepEqual(utterances.map(u=>u.text),['First sentence','First sentence']);assert.equal(p.getAnnouncement()?.id,id);
  utterances[1].onend?.();assert.equal(utterances[2].text,'Second sentence');
});

test('failure after speech has started retains the current announcement and blocks all later guides',()=>{
  const p=player();p.speak('Must finish first');utterances[0].onstart?.();p.speak('Must wait');
  utterances[0].onerror?.();
  assert.equal(utterances.length,1);assert.equal(p.getAnnouncement()?.text,'Must finish first');
  assert.equal(p.getAnnouncement()?.status,'error');assert.equal(p.isPrioritySpeaking(),true);
  p.cancelSpeech();assert.equal(p.getAnnouncement(),undefined);assert.equal(p.isPrioritySpeaking(),false);
});

test('browser TTS that never starts times out in four seconds instead of holding guidance for a minute',context=>{
  context.mock.timers.enable({apis:['setTimeout']});
  const p=player(),reasons:string[]=[];
  p.speak('Move left',reason=>reasons.push(reason),{priority:'guidance'});
  context.mock.timers.tick(3999);assert.equal(p.isPrioritySpeaking(),true);
  context.mock.timers.tick(1);assert.equal(p.isPrioritySpeaking(),false);assert.deepEqual(reasons,['timeout']);
});

test('speech diagnostics record the cancellation source and keep only five releases', () => {
  const p = player();
  p.speak('Old guidance',undefined,{priority:'guidance'});
  p.cancelSpeech();
  p.speak('Warning',undefined,{priority:'safety'});
  const cancelled=p.getSpeechLog()[0];
  assert.equal(cancelled.text,'Old guidance');assert.equal(cancelled.reason,'cancelled');assert.ok(cancelled.caller);
  utterances[1].onend?.();
  for(let i=0;i<5;i++){p.speak(`Message ${i}`);utterances.at(-1)?.onend?.();}
  assert.equal(p.getSpeechLog().length,5);assert.equal(p.getSpeechLog()[4].text,'Message 4');
});

test('alignment completion delays queued speech for five seconds and skips stale notices at playback time', context => {
  context.mock.timers.enable({apis:['setTimeout']});
  let now = 1000;
  context.mock.method(performance, 'now', () => now);
  const p = player(); const results: string[] = [];
  p.speak('Aligned', undefined, {quietAfterMs:5000});
  let relevant=true;
  p.speak('Stale notice', reason => results.push(reason),{isRelevant:()=>relevant});
  now = 4000;
  assert.equal(p.isSpeechPaused(),false);
  utterances[0].onend?.();
  assert.equal(p.isSpeechPaused(),true);
  assert.deepEqual(results,[]);relevant=false;
  now = 8999;
  assert.equal(p.isPrioritySpeaking(),true);
  p.speak('Current guidance',undefined,{priority:'guidance'});
  context.mock.timers.tick(4999);
  assert.equal(utterances.length,1);
  now = 9000;
  assert.equal(p.isSpeechPaused(),false);
  context.mock.timers.tick(1);
  assert.deepEqual(results,['cancelled']);
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

test('discovery and all later instructions wait for the entire current sentence in FIFO order', () => {
  const p = player(); const results: string[] = [];
  p.speak('Searching', reason => results.push('search:' + reason));
  p.speak('Found the cup', reason => results.push('found:' + reason), {priority:'found'});
  p.speak('Grasp instructions');
  p.speak('Move left', undefined, {priority:'guidance'});
  assert.deepEqual(results, []);
  assert.deepEqual(utterances.map(u => u.text), ['Searching']);
  utterances[0].onend?.();
  assert.deepEqual(results,['search:ended']);
  utterances[1].onend?.();
  assert.deepEqual(results, ['search:ended', 'found:ended']);
  assert.equal(utterances[2].text, 'Grasp instructions');
  utterances[2].onend?.();assert.equal(utterances[3].text,'Move left');
});

test('discovery queued after a warning waits until the warning actually ends', () => {
  const p = player(); const results: string[] = [];
  p.speak('Warning', undefined, {priority:'safety'});
  p.speak('Found the cup', reason => results.push(reason), {priority:'found'});
  assert.deepEqual(results, []);
  utterances[0].onend?.();
  assert.equal(utterances.length, 2);
  assert.equal(utterances[1].text, 'Found the cup');
  utterances[1].onend?.();assert.deepEqual(results,['ended']);
});

test('losing the target removes queued guidance but finishes the sentence already playing', () => {
  const p = player(); const results: string[] = [];
  p.speak('Found the cup', reason => results.push(reason), {priority:'found'});
  const staleEnd = utterances[0].onend;
  p.speak('Other notice');
  let cancelled=false;
  p.speak('Old direction',()=>{cancelled=true;},{priority:'guidance'});
  p.cancelGuidance();
  assert.equal(cancelled,true);assert.equal(utterances.length,1);assert.deepEqual(results,[]);
  staleEnd?.();
  assert.deepEqual(results, ['ended']);
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
  p.cancelSpeech();
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
  assert.equal(utterances.length,1);assert.deepEqual(finished,[]);
  utterances[0].onend?.();assert.equal(utterances[1].text,'일반 설명');
  utterances[1].onend?.();assert.deepEqual(finished,['safety:ended','normal:ended']);
  assert.equal(utterances[2].text,'지난 방향');utterances[2].onend?.();assert.deepEqual(finished,['safety:ended','normal:ended','guidance:ended']);
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
