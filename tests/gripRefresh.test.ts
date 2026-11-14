import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { createAutoGripGate } from '../src/autoGrip.ts';
import { relativeHandlePoint, followHandlePoint } from '../src/gripGeometry.ts';

// Exercise the hook's polling and request lifecycle without a camera or React DOM.
test('grip coordinates refresh repeatedly without hiding the point or repeating speech', async context => {
  const source = readFileSync(new URL('../src/useSearchCommands.ts', import.meta.url), 'utf8')
    .replace(/^import .*;\r?\n/gm, '').replace('export function useSearchCommands', 'function useSearchCommands');
  const code = ts.transpile(source, {target:ts.ScriptTarget.ES2022, module:ts.ModuleKind.None});
  const effects: (() => void | (() => void))[] = [], states: unknown[] = [], spoken: string[] = [];
  let now = 0, poll: () => void = () => {}, calls = 0;
  let resolveRefresh: ((value: unknown) => void) | undefined;
  const selected = {current:{id:1,lastSeen:0,missing:false,label:'cup',score:1,x:0,y:0,width:1,height:1}};
  const savedDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', {configurable:true,value:{hidden:false,addEventListener(){},removeEventListener(){}}});
  context.mock.method(performance, 'now', () => now);
  context.mock.method(globalThis, 'setInterval', ((callback: () => void) => {poll=callback;return 1;}) as typeof setInterval);
  context.mock.method(globalThis, 'clearInterval', () => {});
  const dependencies = {
    useRef:(current:unknown)=>({current}),
    useState:(initial:unknown)=>{const index=states.length;states.push(initial);return [initial,(value:unknown)=>{states[index]=value;}];},
    useEffect:(effect:()=>void)=>effects.push(effect),
    api:{describe:async()=>{calls++;if(calls===1)return {grasp:'Hold here',sentences:['Hold here'],handlePoint:{x:.2,y:.3}};return new Promise(resolve=>{resolveRefresh=resolve;});}},
    captureFrame:async()=>new Blob(),captureRegion:()=>({x:0,y:0,width:1,height:1}),
    speak:(text:string)=>spoken.push(text),cancelSpeech:()=>{},isPrioritySpeaking:()=>false,
    createAutoGripGate,relativeHandlePoint,followHandlePoint,findRecordingId:()=>undefined,
  };
  const hook = new Function(...Object.keys(dependencies), code+'; return useSearchCommands;')(...Object.values(dependencies));
  const cleanups: (()=>void)[] = [];
  try {
    hook({current:{}},selected,{current:true},{current:true});
    for(const effect of effects){const cleanup=effect();if(typeof cleanup==='function')cleanups.push(cleanup);}
    const tick=async(t:number)=>{now=t;selected.current.lastSeen=t;poll();await new Promise(resolve=>setImmediate(resolve));};
    await tick(0);await tick(1500);await tick(3000);
    assert.equal(calls,1);assert.deepEqual(states[5],{u:.2,v:.3,targetId:1});
    await tick(6000);
    assert.equal(calls,2);assert.deepEqual(states[5],{u:.2,v:.3,targetId:1});
    await tick(6500);assert.equal(calls,2);
    resolveRefresh?.({sentences:['Do not repeat'],handlePoint:{x:.7,y:.8}});
    await new Promise(resolve=>setImmediate(resolve));
    assert.deepEqual(states[5],{u:.7,v:.8,targetId:1});assert.deepEqual(spoken,['Hold here']);
    await tick(9500);assert.equal(calls,3);
    selected.current.missing=true;
    await tick(9600);
    resolveRefresh?.({sentences:[],handlePoint:{x:.1,y:.1}});
    await new Promise(resolve=>setImmediate(resolve));
    assert.equal(states[5],undefined);
  } finally {
    cleanups.forEach(cleanup=>cleanup());
    if(savedDocument)Object.defineProperty(globalThis,'document',savedDocument);else Reflect.deleteProperty(globalThis,'document');
  }
});

