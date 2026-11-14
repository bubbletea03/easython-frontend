import test from 'node:test';
import assert from 'node:assert/strict';
import {createWebAudioPlayback} from '../src/webAudioPlayback.ts';
class Source {
  buffer:unknown;onended:(()=>void)|null=null;starts=0;stops=0;disconnects=0;
  connect(){}start(){this.starts++;}stop(){this.stops++;this.onended?.();}disconnect(){this.disconnects++;}
  end(){this.onended?.();}
}
class Context {
  state='running';destination={};decoded=0;sources:Source[]=[];listeners=new Set<()=>void>();
  async decodeAudioData(_data:ArrayBuffer){this.decoded++;return {length:48000,numberOfChannels:1};}
  createBufferSource(){const source=new Source();this.sources.push(source);return source;}
  async resume(){this.state='running';this.listeners.forEach(listener=>listener());}
  addEventListener(_event:string,callback:()=>void){this.listeners.add(callback);}
  removeEventListener(_event:string,callback:()=>void){this.listeners.delete(callback);}
  interrupt(){this.state='suspended';this.listeners.forEach(listener=>listener());}
}
const flush=()=>new Promise(resolve=>setImmediate(resolve));

test('microphone interruptions resume the same decoded voice without restarting its source',async()=>{
  const context=new Context(),controller=new AbortController();let ended=0,errors=0;
  const prepare=createWebAudioPlayback(()=>context as unknown as AudioContext);
  const playback=await prepare(new Blob(['audio']),controller.signal,()=>ended++,()=>errors++);
  await playback.start();context.interrupt();await flush();
  assert.equal(context.sources.length,1);assert.equal(context.sources[0].starts,1);assert.equal(context.sources[0].stops,0);
  assert.equal(context.state,'running');assert.equal(errors,0);
  context.sources[0].end();assert.equal(ended,1);assert.equal(context.listeners.size,0);
  playback.stop();assert.equal(ended,1);
});

test('explicit stop aborts playback once and cached recordings do not decode again',async()=>{
  const context=new Context(),blob=new Blob(['audio']);let ended=0;
  const prepare=createWebAudioPlayback(()=>context as unknown as AudioContext);
  const controller=new AbortController();
  const first=await prepare(blob,controller.signal,()=>ended++,()=>{});await first.start();
  controller.abort();first.stop();assert.equal(context.sources[0].stops,1);assert.equal(ended,0);
  const second=await prepare(blob,new AbortController().signal,()=>ended++,()=>{});await second.start();
  assert.equal(context.decoded,1);assert.equal(context.sources.length,2);second.stop();
  assert.equal(context.listeners.size,0);
});

test('a late decode cannot start an old sentence after cancellation',async()=>{
  const context=new Context();let finish:((value:any)=>void)|undefined;
  context.decodeAudioData=()=>new Promise(resolve=>{finish=resolve;});
  const prepare=createWebAudioPlayback(()=>context as unknown as AudioContext),controller=new AbortController();
  const pending=prepare(new Blob(['audio']),controller.signal,()=>{},()=>{});await flush();
  controller.abort();finish?.({length:48000,numberOfChannels:1});
  await assert.rejects(pending);assert.equal(context.sources.length,0);
});
