import test from 'node:test';
import assert from 'node:assert/strict';
import {createTargetLock,createTargetChoiceGate,type VisibleTarget} from '../src/targetLock.ts';
import {updateTracks} from '../src/detectionTracks.ts';
import {relativeHandlePoint,followHandlePoint} from '../src/gripGeometry.ts';
const viewport={width:1000,height:1000};
const target=(id:number,x:number,score=.8,exact=true,width=100,lastSeen=0):VisibleTarget=>({
  item:{id,label:'cup',name:exact?'cup':'tumbler',exact,score,x:x/1000,y:.4,width:width/1000,height:.2,lastSeen,missing:false},
  rect:{x,y:400,width,height:200},
});

test('focus ranks exact name, score, then area and remains locked through size changes',()=>{
  const lock=createTargetLock();const mug=target(1,100,.7,true),can=target(2,700,.99,false,300);
  assert.equal(lock.update([can,mug],0,viewport,1)?.item.id,1);
  assert.equal(lock.update([target(2,700,1,true,400,500),target(1,100,.6,true,80,500)],500,viewport,1)?.item.id,1);
  assert.equal(lock.update([can,mug],600,viewport,2)?.item.id,1);
});

test('short occlusion retains focus; a distant alternative is used only after one second',()=>{
  const lock=createTargetLock();const mug=target(1,100),can=target(2,700,.95,false,300);
  lock.update([mug,can],0,viewport,1);
  const missing={...mug,item:{...mug.item,missing:true}};
  assert.equal(lock.update([missing,can],500,viewport,1)?.item.id,1);
  assert.equal(lock.update([missing,can],1000,viewport,1)?.item.id,1);
  assert.equal(lock.update([missing,can],1501,viewport,1)?.item.id,2);
});

test('nearby replacement track continues the same physical target without choosing a larger can',()=>{
  const lock=createTargetLock();lock.update([target(1,100)],0,viewport,1);
  assert.equal(lock.update([target(3,120,.65,true,100,500),target(2,700,.99,true,300,500)],500,viewport,1)?.item.id,3);
});

test('explicit target choice overrides an existing lock and session changes clear it',()=>{
  const lock=createTargetLock();const objects=[target(1,100,.9),target(2,700,.8)];
  lock.update(objects,0,viewport,1);lock.choose(2);
  assert.equal(lock.update(objects,100,viewport,1)?.item.id,2);
  assert.equal(lock.update(objects,200,viewport,2)?.item.id,1);
});

test('two similar exact candidates ask once after one second and accept local side answers',()=>{
  const gate=createTargetChoiceGate();const objects=[target(1,100,.9),target(2,700,.85)];
  assert.equal(gate.update(objects,0,1,true),undefined);
  assert.equal(gate.update(objects,999,1,true),undefined);
  assert.equal(gate.update(objects,1000,1,true)?.type,'ask');
  gate.startDeadline(2000);
  assert.equal(gate.answer('두 번째',objects)?.target.item.id,2);
  assert.equal(gate.update(objects,10000,1,true),undefined);
});

test('unanswered choice waits five seconds after playback and selects the larger visible target',()=>{
  const gate=createTargetChoiceGate();const objects=[target(1,100,.9),target(2,700,.85,true,200)];
  gate.update(objects,0,1,true);gate.update(objects,1000,1,true);
  assert.equal(gate.update(objects,20000,1,true),undefined);
  gate.startDeadline(20000);
  assert.equal(gate.update(objects,24999,1,true),undefined);
  const event=gate.update(objects,25000,1,true);
  assert.equal(event?.type,'choose');
  if(event?.type==='choose')assert.equal(event.target.item.id,2);
});

test('tracking retains real detection labels and padded handle coordinates stay relative to the object',()=>{
  const source=target(1,100,.9,false).item;
  const tracks=updateTracks([], [source],0,()=>99);
  assert.equal(tracks[0].name,'tumbler');assert.equal(tracks[0].exact,false);
  const box={x:.3,y:.3,width:.2,height:.2};
  assert.equal(relativeHandlePoint({x:.54,y:.4},box),undefined);
  const relative=relativeHandlePoint({x:.54,y:.4},box,.25)!;
  assert.ok(relative.u>1);
  const next=followHandlePoint(relative,{x:.4,y:.4,width:.4,height:.4});
  assert.ok(Math.abs(next.x-.88)<1e-8);
});
