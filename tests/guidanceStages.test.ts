import test from 'node:test';
import assert from 'node:assert/strict';
import {createGuidancePhase,createPhoneAlignmentGate,phoneSide} from '../src/phoneGuidance.ts';
import {bladeZone,createBladeWarningGate} from '../src/gripGeometry.ts';
const input={now:0,revision:1,visible:true,lost:false,centered:true,handVisible:false,cx:.5,enabled:true};

test('hand guidance locks after half a second centered and does not return to phone alignment on small shakes',()=>{
  const gate=createGuidancePhase();
  assert.equal(gate.update(input).phase,'aim');
  assert.equal(gate.update({...input,now:500}).phase,'hand');
  const held=gate.update({...input,now:1000,centered:false,cx:.8,handVisible:true});
  assert.equal(held.phase,'hand');assert.match(held.notice!.text,/폰은 그대로/);
  assert.equal(gate.update({...input,now:1500,centered:false,cx:.2}).phase,'hand');
});

test('a visible hand can enter hand guidance off center; extreme edges require an explicit re-aim transition',()=>{
  const gate=createGuidancePhase();const off={...input,centered:false,handVisible:true,cx:.2};
  gate.update(off);assert.equal(gate.update({...off,now:500}).phase,'hand');
  const edge=gate.update({...off,now:1000,cx:.95});
  assert.equal(edge.phase,'reaim');assert.match(edge.notice!.text,/손은 그대로.*폰을 오른쪽/);
  assert.equal(gate.update({...off,now:1500,cx:.8}).phase,'reaim');
  const back=gate.update({...off,now:2000,cx:.6});
  assert.equal(back.phase,'hand');assert.equal(back.notice!.text,'다시 손을 안내할게요.');
  assert.equal(gate.update({...off,now:2500,lost:true}).phase,'aim');
});

test('phone alignment has hysteresis and no vertical direction',()=>{
  const gate=createPhoneAlignmentGate();assert.equal(gate.update(.2,1),'left');
  assert.equal(gate.update(.5,1),undefined);assert.equal(gate.update(.2,1),undefined);
  assert.equal(gate.update(.14,1),'left');assert.equal(gate.update(.8,2),'right');
  assert.equal(phoneSide(.5),undefined);
});

test('blade zone is the long-axis half opposite the handle',()=>{
  const horizontal={x:0,y:0,width:200,height:40};
  assert.deepEqual(bladeZone(horizontal,{x:20,y:20}),{x:100,y:0,width:100,height:40});
  assert.deepEqual(bladeZone(horizontal,{x:180,y:20}),{x:0,y:0,width:100,height:40});
  assert.deepEqual(bladeZone({x:0,y:0,width:40,height:200},{x:20,y:20}),{x:0,y:100,width:40,height:100});
});

test('blade warnings need 300ms, repeat no faster than four seconds, and clear immediately outside the zone',()=>{
  const gate=createBladeWarningGate(),zone={x:100,y:0,width:100,height:40},finger=[{x:150,y:20}];
  assert.deepEqual(gate.update(1,zone,finger,0,true),{danger:false,announce:false});
  assert.equal(gate.update(1,zone,finger,299,true).danger,false);
  assert.deepEqual(gate.update(1,zone,finger,300,true),{danger:true,announce:true});
  assert.equal(gate.update(1,zone,finger,4299,true).announce,false);
  assert.equal(gate.update(1,zone,finger,4300,true).announce,true);
  assert.deepEqual(gate.update(1,zone,[{x:20,y:20}],4400,true),{danger:false,announce:false});
  assert.equal(gate.update(1,undefined,finger,4500,true).danger,false);
  assert.equal(gate.update(1,zone,finger,4600,false).danger,false);
});
