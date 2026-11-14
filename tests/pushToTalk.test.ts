import test from 'node:test';
import assert from 'node:assert/strict';
import {createPushToTalk,shortVoiceCommand,type PushRecognizer} from '../src/pushToTalkCore.ts';
class Recognition implements PushRecognizer {
  lang='';continuous=true;interimResults=false;starts=0;stops=0;aborts=0;
  onresult:PushRecognizer['onresult']=null;onerror:PushRecognizer['onerror']=null;onend:PushRecognizer['onend']=null;
  start(){this.starts++;}stop(){this.stops++;}abort(){this.aborts++;}
  result(text:string,final=false){this.onresult?.({results:[Object.assign([{transcript:text}],{isFinal:final})]});}
}
function fixture(afterStop:boolean){
  const engine=new Recognition(),commands:string[]=[],errors:string[]=[];let stopped=0,ended=0;
  const input=createPushToTalk(engine,{afterStop,onText(){},onCommand:text=>commands.push(text),onStopped:()=>stopped++,onError:code=>errors.push(code),onEnd:()=>ended++});
  return {engine,input,commands,errors,get stopped(){return stopped;},get ended(){return ended;}};
}

test('one tap starts only one non-continuous session and silence stops the prior task at five seconds',context=>{
  context.mock.timers.enable({apis:['setTimeout']});const f=fixture(true);f.input.start();
  assert.equal(f.engine.continuous,false);assert.equal(f.engine.starts,1);
  context.mock.timers.tick(4999);assert.equal(f.stopped,0);
  context.mock.timers.tick(1);assert.equal(f.stopped,1);assert.equal(f.engine.aborts,1);
  context.mock.timers.tick(30000);assert.equal(f.engine.starts,1);assert.deepEqual(f.errors,[]);
});

test('interim stop and grabbed commands close the microphone without waiting for final recognition',context=>{
  context.mock.timers.enable({apis:['setTimeout']});
  for(const text of ['그만','잡았어','컵 잡았어요']){
    const f=fixture(true);f.input.start();f.engine.result(text);
    assert.equal(f.engine.stops,1);context.mock.timers.tick(300);
    assert.equal(f.commands[0],text);assert.equal(f.ended,1);assert.equal(f.engine.starts,1);
  }
  assert.equal(shortVoiceCommand('안 잡았어'),undefined);
});

test('final speech stops automatically; a second tap stops without creating another session',context=>{
  context.mock.timers.enable({apis:['setTimeout']});
  const f=fixture(false);f.input.start();f.engine.result('컵 찾아줘',true);
  assert.equal(f.engine.stops,1);f.engine.onend?.();assert.deepEqual(f.commands,['컵 찾아줘']);
  const g=fixture(true);g.input.start();g.input.stop();g.engine.onend?.();
  assert.equal(g.stopped,1);assert.equal(g.engine.starts,1);
});

test('six-second hard limit releases a recognizer that never emits onend',context=>{
  context.mock.timers.enable({apis:['setTimeout']});const f=fixture(false);f.input.start();
  f.engine.result('다른 물건 찾아줘',false);context.mock.timers.tick(6000);
  assert.equal(f.engine.aborts,1);assert.equal(f.ended,1);assert.deepEqual(f.commands,['다른 물건 찾아줘']);
});

test('permission or network failure after tapping during guidance keeps the task stopped',()=>{
  for(const error of ['not-allowed','network']){
    const f=fixture(true);f.input.start();f.engine.onerror?.({error});
    assert.equal(f.stopped,1);assert.equal(f.ended,1);assert.deepEqual(f.errors,[]);assert.equal(f.engine.aborts,1);
  }
});
