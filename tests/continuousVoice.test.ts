import test from 'node:test';
import assert from 'node:assert/strict';
import {createContinuousVoice,handsFreeCommand,type ContinuousRecognizer,type VoiceResultEvent} from '../src/continuousVoiceCore.ts';
class Recognition implements ContinuousRecognizer {
  lang='';continuous=false;interimResults=false;starts=0;aborts=0;
  onresult:ContinuousRecognizer['onresult']=null;onerror:ContinuousRecognizer['onerror']=null;onend:ContinuousRecognizer['onend']=null;
  start(){this.starts++;}abort(){this.aborts++;}
  result(text:string,final=true) {
    const result=Object.assign([{transcript:text}],{isFinal:final});
    this.onresult?.({resultIndex:0,results:[result]} as VoiceResultEvent);
  }
}
function fixture() {
  let time=0,speaking=false,hidden=false;
  const instances:Recognition[]=[],commands:string[]=[],errors:string[]=[];
  const listener=createContinuousVoice({
    create:()=>{const instance=new Recognition();instances.push(instance);return instance;},
    now:()=>time,isSpeaking:()=>speaking,isHidden:()=>hidden,
    onCommand:text=>commands.push(text),onError:text=>errors.push(text),
  });
  return {listener,instances,commands,errors,tick:(t:number)=>{time=t;listener.tick();},speak:(value:boolean)=>{speaking=value;},hide:(value:boolean)=>{hidden=value;}};
}

test('hands-free stop is immediate on interim results and never requires the parse API',()=>{
  const f=fixture();f.tick(0);
  assert.equal(f.instances[0].continuous,true);assert.equal(f.instances[0].lang,'ko-KR');
  f.instances[0].result('그만해 주세요',false);
  assert.deepEqual(f.commands,['그만']);assert.equal(f.instances[0].aborts,1);
  assert.equal(f.errors.length,0);f.listener.dispose();
});

test('common Korean stop forms and a stop appended to earlier transcription are accepted',()=>{
  for(const text of ['그만해요','그만하라','그만 하라고','이제 그만','그만 좀 해','컵을 찾았어요. 그만','그만 그만','스톱']) {
    assert.equal(handsFreeCommand(text,false),'그만',text);
  }
  assert.equal(handsFreeCommand('그만하지 마',true),undefined);
});

test('a stop hypothesis is recognized when Chrome supplies it as a secondary alternative',()=>{
  const f=fixture();f.tick(0);
  f.instances[0].onresult?.({results:[Object.assign([{transcript:'금방'},{transcript:'그만해요'}],{isFinal:false})]});
  assert.deepEqual(f.commands,['그만']);f.listener.dispose();
});

test('recognition restart waits for Android audio to finish instead of stealing playback focus',()=>{
  const f=fixture();f.tick(0);f.instances[0].onend?.();
  f.speak(true);f.tick(500);f.tick(1000);assert.equal(f.instances.length,1);
  f.speak(false);f.tick(1349);assert.equal(f.instances.length,1);
  f.tick(1350);assert.equal(f.instances.length,2);f.listener.dispose();
});

test('a silent stalled recognizer is recycled and transient network failures do not disable listening forever',()=>{
  const f=fixture();f.tick(0);f.tick(15000);assert.equal(f.instances[0].aborts,1);
  f.tick(15500);assert.equal(f.instances.length,2);f.listener.dispose();
  const g=fixture();g.tick(0);g.instances[0].onerror?.({error:'network'});
  g.tick(1500);g.instances[1].onerror?.({error:'network'});
  g.tick(4500);g.instances[2].onerror?.({error:'network'});
  g.tick(9000);assert.equal(g.instances.length,4);assert.equal(g.errors.length,1);
  g.instances[3].result('그만');assert.deepEqual(g.commands,['그만']);g.listener.dispose();
});

test('ordinary silence and recognition end automatically restart listening without interrupting guidance state',()=>{
  const f=fixture();f.tick(0);f.instances[0].onend?.();
  f.tick(499);assert.equal(f.instances.length,1);
  f.tick(500);assert.equal(f.instances.length,2);
  f.instances[1].onerror?.({error:'no-speech'});
  f.tick(1000);assert.equal(f.instances.length,3);
  assert.deepEqual(f.errors,[]);assert.deepEqual(f.commands,[]);f.listener.dispose();
});

test('listening stays active during app speech, but only stop can interrupt output',()=>{
  const f=fixture();f.tick(0);
  f.speak(true);f.tick(100);f.instances[0].result('손잡이를 잡아 주세요');
  assert.deepEqual(f.commands,[]);assert.equal(f.instances[0].aborts,0);
  f.speak(false);f.tick(1000);f.instances[0].result('손잡이를 잡아 주세요');assert.deepEqual(f.commands,[]);
  f.speak(true);
  f.instances[0].result('그만',false);assert.deepEqual(f.commands,['그만']);
  f.listener.dispose();
});

test('hidden pages and disposal stop the microphone and discard old recognition events',()=>{
  const f=fixture();f.tick(0);const stale=f.instances[0].onresult;
  f.hide(true);f.tick(100);assert.equal(f.instances[0].aborts,1);
  f.hide(false);f.tick(449);assert.equal(f.instances.length,1);
  f.tick(450);assert.equal(f.instances.length,2);
  stale?.({results:[Object.assign([{transcript:'그만'}],{isFinal:true})]});assert.deepEqual(f.commands,[]);
  f.listener.dispose();f.tick(2000);assert.equal(f.instances.length,2);
});

test('permission denial stops retries and reports the manual stop fallback once',()=>{
  const f=fixture();f.tick(0);f.instances[0].onerror?.({error:'not-allowed'});
  f.tick(5000);f.tick(10000);
  assert.equal(f.instances.length,1);assert.equal(f.errors.length,1);assert.match(f.errors[0],/마이크 권한/);
  f.listener.dispose();
});

test('background chatter is ignored; explicit search, location, and grasp commands are accepted',()=>{
  assert.equal(handsFreeCommand('오늘 날씨가 좋다',true),undefined);
  assert.equal(handsFreeCommand('컵 찾아줘',false),undefined);
  assert.equal(handsFreeCommand('컵 찾아줘',true),'컵 찾아줘');
  assert.equal(handsFreeCommand('어디 있어?',true),'어디 있어?');
  assert.equal(handsFreeCommand('컵 잡았어',true),'컵 잡았어');
  const f=fixture();f.tick(0);f.instances[0].result('어디 있어?');
  assert.deepEqual(f.commands,['어디 있어?']);f.tick(500);assert.equal(f.instances.length,2);f.listener.dispose();
});
