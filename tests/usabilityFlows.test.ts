import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ApiError } from '../src/apiCore.ts';

const compile = (path:string, name:string, dependencies: Record<string,unknown>) => {
  const source=readFileSync(new URL(path,import.meta.url),'utf8').replace(/^\uFEFF/,'').replace(/^import .*;\r?\n/gm,'').replace(/export function /g,'function ');
  const code=ts.transpile(source,{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None,jsx:ts.JsxEmit.React});
  return new Function(...Object.keys(dependencies),code+`; return ${name};`)(...Object.values(dependencies));
};
const flush=()=>new Promise(resolve=>setImmediate(resolve));

test('the voice button stops an active search or pending request and becomes a microphone again in idle', () => {
  const CameraHUD=compile('../src/CameraHUD.tsx','CameraHUD',{React,designIcons:{mic:'',stop:'',listening:''}});
  const buttons=(node:any):any[]=>Array.isArray(node)?node.flatMap(buttons):React.isValidElement(node)?[(node.type==='button'?node:undefined),...buttons((node.props as any).children)].filter(Boolean):[];
  for(const state of ['found','guiding','processing','warning']) {
    let stopped=0,heard=0;
    const props={scene:{state,title:'Test',status:'Test'},heard:'',active:state!=='processing',pending:state==='processing',onStop(){stopped++;},onVoice(){heard++;}};
    const html=renderToStaticMarkup(React.createElement(CameraHUD,props));
    assert.match(html,/aria-label="그만/);
    assert.doesNotMatch(html,/stop-button/);
    assert.doesNotMatch(html,/disabled/);
    const controls=buttons(CameraHUD(props));assert.equal(controls.length,1);
    controls[0].props.onClick();assert.equal(stopped,1);assert.equal(heard,0);
    const idle={...props,active:false,pending:false,scene:{state:'idle',title:'Ready',status:'Ready'}};
    buttons(CameraHUD(idle))[0].props.onClick();assert.equal(heard,1);
    assert.match(renderToStaticMarkup(React.createElement(CameraHUD,idle)),/aria-label="말하기/);
  }
});

test('three detection failures trigger fallback, and health polling recovers automatically', async context => {
  const states: unknown[]=[],effects:(()=>void|(()=>void))[]=[],waits:{ms:number;resolve:()=>void}[]=[];
  let detects=0,checks=0;
  const doc=Object.getOwnPropertyDescriptor(globalThis,'document');
  Object.defineProperty(globalThis,'document',{configurable:true,value:{hidden:false,addEventListener(){},removeEventListener(){}}});
  context.mock.method(globalThis,'setInterval',(()=>1) as typeof setInterval);
  context.mock.method(globalThis,'clearInterval',()=>{});
  const dependencies={
    useRef:(current:unknown)=>({current}),
    useState:(value:unknown)=>{const i=states.length;const initial=i===0?true:value;states.push(initial);return [initial,(next:unknown)=>{states[i]=next;}];},
    useEffect:(effect:()=>void)=>effects.push(effect),
    api:{health:async()=>{checks++;return {status:'ok',model_loaded:true,describe_enabled:true,tts_enabled:false,device:'cpu'};},detect:async()=>{detects++;throw new ApiError('Busy',503,'queue_full');}},
    abortableDelay:(ms:number,signal:AbortSignal)=>new Promise<void>(resolve=>{waits.push({ms,resolve});signal.addEventListener('abort',()=>resolve(),{once:true});}),
    captureFrame:async()=>new Blob(),setServerSpeechEnabled(){},speak(){},ApiError,
    labels:{cup:'cup'},colorMismatchText(){},createColorNoticeGate:()=>({reset(){},update(){}}),
    isPersonLabel:()=>false,updateTracks:()=>[],
  };
  const hook=compile('../src/useBackendDetection.ts','useBackendDetection',dependencies);
  const cleanups:(()=>void)[]=[];
  try {
    hook({current:{readyState:2,paused:false}},true,true,['cup'],'cup',1);
    for(const effect of effects){const cleanup=effect();if(typeof cleanup==='function')cleanups.push(cleanup);}
    await flush();
    assert.equal(detects,1);assert.equal(states[0],true);
    const nextDetect=async()=>{const i=waits.findIndex(w=>w.ms!==5000);assert.ok(i>=0);waits.splice(i,1)[0].resolve();await flush();};
    await nextDetect();assert.equal(detects,2);assert.equal(states[0],true);
    await nextDetect();assert.equal(detects,3);assert.equal(states[0],false);
    waits.splice(waits.findIndex(w=>w.ms===5000),1)[0].resolve();await flush();
    assert.equal(checks,2);assert.equal(states[0],true);
  } finally {
    cleanups.forEach(cleanup=>cleanup());
    if(doc)Object.defineProperty(globalThis,'document',doc);else Reflect.deleteProperty(globalThis,'document');
  }
});


test('current-location questions do not reset a search, and pending commands can be cancelled', async () => {
  const states: any[]=[],spoken:string[]=[];
  let parsed=0, pendingSignal:AbortSignal|undefined, finish:((value:unknown)=>void)|undefined;
  const dependencies={
    useRef:(current:unknown)=>({current}),
    useState:(value:any)=>{const i=states.length;const initial=i===0?{running:true,targets:['cup'],objectKo:'cup',revision:1}:value;states.push(initial);return [initial,(next:any)=>{states[i]=typeof next==='function'?next(states[i]):next;}];},
    useEffect(){},
    api:{parse:async(_text:string,signal:AbortSignal)=>{parsed++;pendingSignal=signal;return new Promise(resolve=>{finish=resolve;});}},
    createAutoGripGate:()=>({reset(){},mark(){},update(){return false;}}),
    speak:(text:string)=>spoken.push(text),cancelSpeech(){},isPrioritySpeaking:()=>false,
    findRecordingId:()=>undefined,
  };
  const hook=compile('../src/useSearchCommands.ts','useSearchCommands',dependencies);
  const commands=hook({current:{}},{current:undefined},{current:true},{current:true},{current:{text:'On the left',clipId:'pos_left'}});
  await commands.command('어디 있어?');
  assert.equal(parsed,0);assert.equal(spoken[0],'On the left');assert.equal(states[0].revision,1);
  const pending=commands.command('Find a different object');
  assert.equal(states[4],true);
  commands.cancelPending();
  assert.equal(pendingSignal?.aborted,true);assert.equal(states[4],false);
  finish?.({intent:'find',targets:['bottle'],object_ko:'bottle'});await pending;
  assert.deepEqual(states[0].targets,['cup']);
  await commands.command('컵 잡았어');
  assert.equal(states[1],'done');assert.equal(states[0].running,false);
});

test('wake lock reacquires after visibility returns and releases on cleanup', async () => {
  let effect:(()=>void|(()=>void))|undefined, visibility:(()=>void)|undefined, requested=0,released=0;
  const locks:{released:boolean;release:()=>Promise<void>}[]=[];
  const originals=Object.fromEntries(['navigator','document'].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
  Object.defineProperty(globalThis,'navigator',{configurable:true,value:{wakeLock:{request:async()=>{requested++;const lock={released:false,release:async()=>{released++;lock.released=true;}};locks.push(lock);return lock;}}}});
  Object.defineProperty(globalThis,'document',{configurable:true,value:{hidden:false,addEventListener:(_name:string,fn:()=>void)=>{visibility=fn;},removeEventListener(){}}});
  let cleanup:(()=>void)|void;
  try {
    const hook=compile('../src/useWakeLock.ts','useWakeLock',{useEffect:(fn:()=>void)=>{effect=fn;}});
    hook(true);cleanup=effect?.();await flush();assert.equal(requested,1);
    locks[0].released=true;visibility?.();await flush();assert.equal(requested,2);
    if(typeof cleanup==='function')cleanup();await flush();assert.equal(released,1);
  } finally {
    for(const [key,descriptor] of Object.entries(originals)) {
      if(descriptor)Object.defineProperty(globalThis,key,descriptor);else Reflect.deleteProperty(globalThis,key);
    }
  }
});

test('preloaded recordings are reused without fetching them again', async context => {
  const source=readFileSync(new URL('../src/recordedSpeech.ts',import.meta.url),'utf8')
    .replace(/\bexport\s+/g,'').replaceAll('import.meta.env.BASE_URL',"'/'");
  const code=ts.transpile(source,{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None});
  let requests=0;
  context.mock.method(globalThis,'fetch',async(url:unknown)=>{
    requests++;
    return String(url).endsWith('manifest.json')
      ? new Response(JSON.stringify({move_left:5}),{headers:{'Content-Type':'application/json'}})
      : new Response('recording',{headers:{'Content-Type':'audio/mpeg'}});
  });
  const {preloadRecordings,loadRecording}=new Function(code+'; return {preloadRecordings,loadRecording};')();
  const controller=new AbortController();
  await preloadRecordings(controller.signal,['move_left']);assert.equal(requests,2);
  const clip=await loadRecording('Unused text','move_left',controller.signal);
  assert.equal(clip.type,'audio/mpeg');assert.equal(requests,2);
  controller.abort();await assert.rejects(loadRecording('','move_left',controller.signal));
});

test('the hand worker survives search, target, and server/local switches', () => {
  const originals=Object.fromEntries(['window','document','location','Worker'].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
  let created=0,terminated=0;
  const refs:{current:unknown}[]=[],states:unknown[]=[],effects:{deps:unknown[];cleanup?:()=>void}[]=[];
  let refIndex=0,stateIndex=0,effectIndex=0;
  Object.assign(globalThis,{
    window:{setTimeout:()=>1,setInterval:()=>1},
    document:{hidden:false,addEventListener(){},removeEventListener(){}},location:{href:'https://example.test/'},
    Worker:class{constructor(){created++;}postMessage(){}terminate(){terminated++;}},
  });
  const dependencies={
    useRef:(value:unknown)=>{const i=refIndex++;return refs[i]??(refs[i]={current:value});},
    useState:(value:unknown)=>{const i=stateIndex++;if(i>=states.length)states[i]=value;return [states[i],(next:unknown)=>{states[i]=next;}];},
    useEffect:(effect:()=>void|(()=>void),deps:unknown[])=>{const i=effectIndex++;const old=effects[i];if(!old||deps.some((v,j)=>v!==old.deps[j])){old?.cleanup?.();const cleanup=effect();effects[i]={deps,cleanup:typeof cleanup==='function'?cleanup:undefined};}},
    isPersonLabel:()=>false,selectLargestHand:(hands:unknown)=>hands,updateTracks:()=>[],
  };
  const source=readFileSync(new URL('../src/useObjectDetection.ts',import.meta.url),'utf8')
    .replace(/^import .*;\r?\n/gm,'').replace(/\bexport\s+/g,'').replaceAll('import.meta.env.BASE_URL',"'/'");
  const hook=new Function(...Object.keys(dependencies),ts.transpile(source,{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None})+'; return useObjectDetection;')(...Object.values(dependencies));
  const video={current:null};
  const render=(enabled:boolean,objects:boolean,targets:string[])=>{refIndex=stateIndex=effectIndex=0;hook(video,true,{enabled,objects,targets});};
  try {
    render(false,false,[]);assert.equal(created,1);
    render(true,false,['cup']);render(true,true,['bottle']);render(false,false,[]);
    assert.equal(created,1);assert.equal(terminated,0);
  } finally {
    effects.forEach(effect=>effect.cleanup?.());assert.equal(terminated,1);
    for(const [key,descriptor] of Object.entries(originals)) {
      if(descriptor)Object.defineProperty(globalThis,key,descriptor);else Reflect.deleteProperty(globalThis,key);
    }
  }
});

test('automatic grasp tip waits for hand guidance and is spoken once after the reach prompt', async context => {
  const original=Object.fromEntries(['window','document'].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
  let now=0,poll:()=>void=()=>{},busy=false,active:((reason:string)=>void)|undefined;
  const spoken:string[]=[],refs:{current:unknown}[]=[];
  let refIndex=0,cleanup:(()=>void)|undefined;
  Object.assign(globalThis,{window:{setInterval:(callback:()=>void)=>{poll=callback;return 1;}},document:{hidden:false}});
  context.mock.method(performance,'now',()=>now);
  context.mock.method(globalThis,'clearInterval',()=>{});
  const hook=compile('../src/useSceneSpeech.ts','useSceneSpeech',{
    useRef:(value:unknown)=>{const i=refIndex++;return refs[i]??(refs[i]={current:value});},
    useEffect:(effect:()=>()=>void)=>{cleanup??=effect();},
    speak:(text:string,callback:(reason:string)=>void)=>{spoken.push(text);active=callback;busy=true;},
    cancelGuidance:()=>{},isPrioritySpeaking:()=>busy,isSpeechPaused:()=>false,vibrate:()=>{},foundRecordingId:()=>undefined,
  });
  const render=(phone:boolean,tip:string)=>{refIndex=0;hook({id:1,label:'cup'},phone?'':'Move left',false,1,false,'Reach out',phone,true,false,undefined,tip);};
  const tick=(t:number)=>{now=t;poll();};
  const finish=(t:number)=>{now=t;busy=false;active?.('ended');};
  try {
    render(true,'Hold the handle');tick(0);tick(1000);finish(1100);
    tick(2600);assert.equal(spoken.at(-1),'Reach out');finish(2700);
    tick(4200);assert.equal(spoken.includes('Hold the handle'),false);
    render(false,'Hold the handle');tick(4300);assert.equal(spoken.at(-1),'Hold the handle');finish(4400);
    render(false,'Hold the body');tick(6000);finish(6100);tick(8000);
    assert.equal(spoken.filter(text=>text==='Hold the handle').length,1);
    assert.equal(spoken.includes('Hold the body'),false);
  } finally {
    cleanup?.();
    for(const [key,descriptor] of Object.entries(original)) {
      if(descriptor)Object.defineProperty(globalThis,key,descriptor);else Reflect.deleteProperty(globalThis,key);
    }
  }
});

test('the first phone direction is spoken after the normal gap and interrupted directions can retry', context => {
  const original=Object.fromEntries(['window','document'].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
  let now=0,poll:()=>void=()=>{},busy=false,active:((reason:string)=>void)|undefined;
  const spoken:string[]=[],refs:{current:unknown}[]=[];
  let index=0,cleanup:(()=>void)|undefined;
  Object.assign(globalThis,{window:{setInterval:(callback:()=>void)=>{poll=callback;return 1;}},document:{hidden:false}});
  context.mock.method(performance,'now',()=>now);context.mock.method(globalThis,'clearInterval',()=>{});
  const hook=compile('../src/useSceneSpeech.ts','useSceneSpeech',{
    useRef:(value:unknown)=>{const i=index++;return refs[i]??(refs[i]={current:value});},useEffect:(effect:()=>()=>void)=>{cleanup??=effect();},
    speak:(text:string,callback:(reason:string)=>void)=>{spoken.push(text);active=callback;busy=true;},
    cancelGuidance:()=>{},isPrioritySpeaking:()=>busy,isSpeechPaused:()=>false,vibrate:()=>{},foundRecordingId:()=>undefined,
  });
  const tick=(t:number)=>{now=t;poll();};
  const finish=(t:number,reason='ended')=>{now=t;busy=false;active?.(reason);};
  try {
    hook({id:1,label:'cup'},'Move phone left',false,1,false,undefined,true,false,false,'align_left');
    tick(0);tick(1000);finish(1100);
    tick(2599);assert.equal(spoken.length,1);
    tick(2600);assert.equal(spoken[1],'Move phone left');
    finish(2800,'cancelled');tick(4100);assert.equal(spoken[2],'Move phone left');
  } finally {
    cleanup?.();for(const [key,descriptor] of Object.entries(original)) {
      if(descriptor)Object.defineProperty(globalThis,key,descriptor);else Reflect.deleteProperty(globalThis,key);
    }
  }
});
